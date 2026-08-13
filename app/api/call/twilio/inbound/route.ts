import { NextResponse } from 'next/server'

import { getDefaultLectureContext, getTwilioConfig } from '@/lib/call/config'
import { verifyTwilioSignature } from '@/lib/call/twilio'
import { createTwilioBypassCall } from '@/lib/call/vapi'

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
    const call = await createTwilioBypassCall(caller, context)
    const twiml = call.phoneCallProviderDetails?.twiml

    if (!twiml || typeof twiml !== 'string') {
      throw new Error('Vapi did not return TwiML for the inbound Twilio call.')
    }

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
