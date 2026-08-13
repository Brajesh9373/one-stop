import { NextResponse } from 'next/server'

import { getDefaultLectureContext } from '@/lib/call/config'

export function GET() {
  const context = getDefaultLectureContext()

  return NextResponse.json({
    status: 'ok',
    provider: {
      telephony: 'vapi + twilio',
      voice: 'sarvam via vapi custom-voice',
    },
    lecture: {
      id: context.lectureId,
      title: context.lectureTitle,
      sequence: context.lectureSequence,
    },
  })
}
