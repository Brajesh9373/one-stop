import { NextResponse } from 'next/server'

import { getSarvamConfig } from '@/lib/call/config'

type VoiceRequestBody = {
  message?: {
    type?: string
    text?: string
    sampleRate?: number
  }
}

function extractPcmFromWave(waveBuffer: Buffer) {
  if (waveBuffer.length < 44 || waveBuffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Sarvam response was not a WAV file.')
  }

  let offset = 12
  while (offset + 8 <= waveBuffer.length) {
    const chunkId = waveBuffer.toString('ascii', offset, offset + 4)
    const chunkSize = waveBuffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkSize

    if (chunkId === 'data') {
      return waveBuffer.subarray(chunkStart, chunkEnd)
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  throw new Error('Sarvam WAV response did not contain a data chunk.')
}

export async function POST(request: Request) {
  const body = (await request.json()) as VoiceRequestBody
  const text = body.message?.text?.trim()
  const sampleRate = body.message?.sampleRate

  if (body.message?.type !== 'voice-request' || !text || !sampleRate) {
    return NextResponse.json(
      { error: 'Invalid voice request payload.' },
      { status: 400 }
    )
  }

  try {
    const sarvam = getSarvamConfig()
    const response = await fetch(`${sarvam.baseUrl}/text-to-speech`, {
      method: 'POST',
      headers: {
        'api-subscription-key': sarvam.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        language_code: sarvam.languageCode,
        speaker: sarvam.speaker,
        speech_sample_rate: sampleRate,
        model: sarvam.model,
        output_audio_codec: 'wav',
        pace: sarvam.pace,
        temperature: sarvam.temperature,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Sarvam TTS failed (${response.status}): ${errorText}`)
    }

    const payload = (await response.json()) as { audios?: string[] }
    const encodedAudio = payload.audios?.[0]
    if (!encodedAudio) {
      throw new Error('Sarvam TTS response did not include audio.')
    }

    const pcmAudio = extractPcmFromWave(Buffer.from(encodedAudio, 'base64'))

    return new Response(pcmAudio, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    })
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : 'Unable to synthesize Sarvam voice audio.',
      { status: 500 }
    )
  }
}
