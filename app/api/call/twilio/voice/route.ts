import { NextResponse } from 'next/server'

import {
  buildLecturePromptTwiml,
  readLectureContextFromSearchParams,
} from '@/lib/call/twilio'

export async function POST(request: Request) {
  const context = readLectureContextFromSearchParams(new URL(request.url).searchParams)
  const twiml = buildLecturePromptTwiml({
    context,
    prompt: `Hello, this is OneStop. We are in ${context.courseName}, lecture ${context.lectureSequence}, ${context.lectureTitle}. Ask any question from this lecture.`,
    languageCode: 'en-IN',
  })

  return new Response(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  })
}

export function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/call/twilio/voice',
    provider: 'twilio + sarvam-sdk',
  })
}
