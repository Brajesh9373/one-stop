import { NextResponse } from 'next/server'

import { getDefaultLectureContext, getTwilioConfig } from '@/lib/call/config'
import { buildLecturePromptTwiml, verifyTwilioSignature } from '@/lib/call/twilio'

function buildRequestUrl(request: Request) {
  return request.url
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const params = Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, String(value)])
  )
  const signature = request.headers.get('x-twilio-signature')
  const { authToken } = getTwilioConfig()

  if (authToken) {
    const verified = verifyTwilioSignature({
      url: buildRequestUrl(request),
      params,
      authToken,
      signature,
    })

    if (!verified) {
      return new Response('Invalid Twilio signature.', { status: 401 })
    }
  }

  const caller = params.Caller
  if (!caller) {
    return new Response('Missing caller number.', { status: 400 })
  }

  try {
    const context = getDefaultLectureContext()
    const twiml = buildLecturePromptTwiml({
      context,
      prompt: `Hello, this is OneStop. We are in ${context.courseName}, lecture ${context.lectureSequence}, ${context.lectureTitle}. Ask a question from this lecture.`,
      languageCode: 'en-IN',
    })

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : 'Unable to start the lecture call.',
      { status: 500 }
    )
  }
}

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/call/twilio/inbound',
    expects: 'Twilio Programmable Voice webhook',
  })
}
