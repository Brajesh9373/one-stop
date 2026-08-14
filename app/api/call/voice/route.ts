import { NextResponse } from 'next/server'

import { synthesizeSpeechWithSarvam } from '@/lib/call/sarvam'

type VoiceRequestBody = {
  message?: {
    type?: string
    text?: string
    sampleRate?: number
  }
  text?: string
  languageCode?: string
  sampleRate?: number
}

export async function POST(request: Request) {
  const body = (await request.json()) as VoiceRequestBody
  const text = (body.text ?? body.message?.text)?.trim()
  const sampleRate = body.sampleRate ?? body.message?.sampleRate

  if (!text) {
    return NextResponse.json(
      { error: 'Invalid voice request payload.' },
      { status: 400 }
    )
  }

  try {
    const speech = await synthesizeSpeechWithSarvam({
      text,
      languageCode: body.languageCode,
      sampleRate,
    })

    return new Response(speech.audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': speech.mimeType,
        'X-Sarvam-Language': speech.languageCode,
        'X-Sarvam-Speaker': speech.speaker,
      },
    })
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : 'Unable to synthesize Sarvam voice audio.',
      { status: 500 }
    )
  }
}
