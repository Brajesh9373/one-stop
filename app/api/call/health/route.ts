import { NextResponse } from 'next/server'

import { getCallIntegrationReadiness, getDefaultLectureContext } from '@/lib/call/config'

export function GET() {
  const context = getDefaultLectureContext()
  const readiness = getCallIntegrationReadiness()

  return NextResponse.json({
    status: readiness.ready ? 'ok' : 'degraded',
    provider: {
      telephony: 'vapi + twilio',
      voice: 'sarvam via vapi custom-voice',
    },
    readiness,
    lecture: {
      id: context.lectureId,
      title: context.lectureTitle,
      sequence: context.lectureSequence,
    },
  })
}
