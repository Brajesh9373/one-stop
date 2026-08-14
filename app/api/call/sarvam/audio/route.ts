import { NextResponse } from 'next/server'

import { synthesizeSpeechWithSarvam } from '@/lib/call/sarvam'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const text = url.searchParams.get('text')?.trim()
  const languageCode = url.searchParams.get('languageCode')?.trim() || undefined
  const sampleRate = Number(url.searchParams.get('sampleRate') ?? '8000')

  if (!text) {
    return NextResponse.json({ error: 'Missing text.' }, { status: 400 })
  }

  try {
    const speech = await synthesizeSpeechWithSarvam({
      text,
      languageCode,
      sampleRate: Number.isFinite(sampleRate) ? sampleRate : 8000,
    })

    return new Response(speech.audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': speech.mimeType,
        'Cache-Control': 'private, max-age=300',
        'X-Sarvam-Language': speech.languageCode,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to synthesize audio.' },
      { status: 500 }
    )
  }
}
