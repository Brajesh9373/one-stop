import { NextResponse } from 'next/server'

import { getDefaultLectureContext } from '@/lib/call/config'
import {
  resolveSpeechLanguage,
  synthesizeSpeechWithSarvam,
  transcribeSpeechWithSarvam,
  translateTextWithSarvam,
} from '@/lib/call/sarvam'
import { runHybridLectureRag } from '@/lib/rag/hybrid'
import type { LectureContext } from '@/lib/rag/types'

function readLectureContext(value: FormDataEntryValue | null): LectureContext {
  const fallback = getDefaultLectureContext()
  if (typeof value !== 'string' || !value.trim()) return fallback

  try {
    const parsed = JSON.parse(value) as Partial<LectureContext>
    return {
      institutionId: typeof parsed.institutionId === 'string' ? parsed.institutionId : fallback.institutionId,
      facultyId: typeof parsed.facultyId === 'string' ? parsed.facultyId : fallback.facultyId,
      courseId: typeof parsed.courseId === 'string' ? parsed.courseId : fallback.courseId,
      courseName: typeof parsed.courseName === 'string' ? parsed.courseName : fallback.courseName,
      lectureId: typeof parsed.lectureId === 'string' ? parsed.lectureId : fallback.lectureId,
      lectureTitle: typeof parsed.lectureTitle === 'string' ? parsed.lectureTitle : fallback.lectureTitle,
      lectureSequence: typeof parsed.lectureSequence === 'number' ? parsed.lectureSequence : fallback.lectureSequence,
    }
  } catch {
    return fallback
  }
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Form data is required.' }, { status: 400 })
  }
  const audio = formData.get('audio')
  const context = readLectureContext(formData.get('context'))
  const studentId = typeof formData.get('studentId') === 'string' ? String(formData.get('studentId')) : 'sarvam-voice-student'

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 })
  }

  try {
    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    
    // Debug amplitude for WAV files (16-bit PCM, skipping 44 byte header)
    if (audio.name.endsWith('.wav') && audioBuffer.length > 44) {
      let maxAmp = 0
      for (let i = 44; i < audioBuffer.length - 1; i += 2) {
        const sample = Math.abs(audioBuffer.readInt16LE(i))
        if (sample > maxAmp) maxAmp = sample
      }
      console.log(`[DEBUG] Received WAV file size=${audioBuffer.length}, max_amplitude=${maxAmp}`)
    } else {
      console.log(`[DEBUG] Received non-WAV file size=${audioBuffer.length}`)
    }

    const requestedLanguage = typeof formData.get('languageCode') === 'string' ? String(formData.get('languageCode')) : undefined
    const ext = audio.name.split('.').pop()?.toLowerCase()
    const contentType = ext === 'wav' ? 'audio/wav' : ext === 'mp4' ? 'audio/mp4' : 'audio/webm'
    const transcription = await transcribeSpeechWithSarvam({
      audio: audioBuffer,
      filename: audio.name || 'voice-turn.wav',
      contentType,
      languageCode: requestedLanguage,
    })

    if (!transcription.transcript) {
      return NextResponse.json({ error: 'No speech detected. Please speak clearly into the microphone.' }, { status: 422 })
    }

    const rag = await runHybridLectureRag({
      mode: 'call',
      studentId,
      prompt: transcription.transcript,
      context,
    })
    const answerLanguage = resolveSpeechLanguage(transcription.transcript, transcription.languageCode === 'unknown' ? undefined : transcription.languageCode)
    const spokenAnswer = await translateTextWithSarvam(rag.answer, answerLanguage)
    const speech = await synthesizeSpeechWithSarvam({
      text: spokenAnswer,
      languageCode: answerLanguage,
      sampleRate: 24000,
    })

    return NextResponse.json({
      ok: true,
      transcript: transcription.transcript,
      transcriptLanguage: transcription.languageCode,
      languageProbability: transcription.languageProbability,
      answer: spokenAnswer,
      originalAnswer: rag.answer,
      audioBase64: speech.audioBase64,
      audioMimeType: speech.mimeType,
      languageCode: speech.languageCode,
      speaker: speech.speaker,
      citations: rag.citations,
      fallbackUsed: rag.fallbackUsed,
      diagnostics: rag.diagnostics,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to run Sarvam voice turn.' },
      { status: 500 }
    )
  }
}
