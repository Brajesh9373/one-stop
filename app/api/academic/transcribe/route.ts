import { NextResponse } from 'next/server'
import { transcribeSpeechWithSarvam } from '@/lib/call/sarvam'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const audio = formData.get('audio')
    
    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 })
    }

    const buffer = Buffer.from(await audio.arrayBuffer())
    const filename = audio.name || 'recording.wav'
    const contentType = audio.type || 'audio/wav'

    const result = await transcribeSpeechWithSarvam({
      audio: buffer,
      filename,
      contentType,
    })

    return NextResponse.json({ transcript: result.transcript })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to transcribe audio.' },
      { status: 500 }
    )
  }
}
