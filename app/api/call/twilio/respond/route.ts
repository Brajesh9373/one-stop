import { NextResponse } from 'next/server'

import {
  buildLectureAnswerTwiml,
  buildLecturePromptTwiml,
  readLectureContextFromSearchParams,
} from '@/lib/call/twilio'
import { resolveSpeechLanguage, translateTextWithSarvam } from '@/lib/call/sarvam'
import { runHybridLectureRag } from '@/lib/rag/hybrid'

export async function POST(request: Request) {
  const context = readLectureContextFromSearchParams(new URL(request.url).searchParams)
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return new Response('Form data is required.', { status: 400 })
  }
  const speechResult = typeof formData.get('SpeechResult') === 'string' ? String(formData.get('SpeechResult')).trim() : ''
  const caller = typeof formData.get('From') === 'string' ? String(formData.get('From')) : 'phone-student'

  if (!speechResult) {
    const twiml = buildLecturePromptTwiml({
      context,
      prompt: 'I did not catch that. Please ask your lecture question again.',
      languageCode: 'en-IN',
    })
    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  }

  try {
    const rag = await runHybridLectureRag({
      mode: 'call',
      studentId: caller,
      prompt: speechResult,
      context,
    })
    const languageCode = resolveSpeechLanguage(speechResult)
    const answer = await translateTextWithSarvam(rag.answer, languageCode)
    const twiml = buildLectureAnswerTwiml({
      context,
      answer,
      languageCode,
    })

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  } catch (error) {
    const twiml = buildLecturePromptTwiml({
      context,
      prompt: error instanceof Error ? error.message : 'Unable to answer right now. Please ask again.',
      languageCode: 'en-IN',
    })
    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  }
}

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/call/twilio/respond',
    expects: 'Twilio speech Gather webhook',
  })
}
