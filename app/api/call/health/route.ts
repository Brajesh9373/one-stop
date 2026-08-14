import { NextResponse } from 'next/server'

import { getCallIntegrationReadiness, getDefaultLectureContext } from '@/lib/call/config'

export function GET() {
  const context = getDefaultLectureContext()
  const readiness = getCallIntegrationReadiness()

  return NextResponse.json({
    status: readiness.ready ? 'ok' : 'degraded',
    provider: {
      telephony: 'twilio programmable voice',
      speech: 'sarvam sdk speech-to-text + text-to-speech',
      orchestration: 'one-stop lecture RAG',
    },
    readiness,
    lecture: {
      id: context.lectureId,
      title: context.lectureTitle,
      sequence: context.lectureSequence,
    },
  })
}
