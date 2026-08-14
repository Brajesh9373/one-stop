import { NextResponse } from 'next/server'

import { getDefaultLectureContext } from '@/lib/call/config'
import { createTwilioOutboundLectureCall, isValidE164PhoneNumber } from '@/lib/call/twilio'
import type { LectureContext } from '@/lib/rag/types'

type OutboundCallRequest = {
  phoneNumber?: string
  studentName?: string
  context?: Partial<LectureContext>
}

function readLectureContext(value: OutboundCallRequest['context']) {
  const fallback = getDefaultLectureContext()
  if (!value || typeof value !== 'object') return fallback

  return {
    institutionId: typeof value.institutionId === 'string' ? value.institutionId : fallback.institutionId,
    facultyId: typeof value.facultyId === 'string' ? value.facultyId : fallback.facultyId,
    courseId: typeof value.courseId === 'string' ? value.courseId : fallback.courseId,
    courseName: typeof value.courseName === 'string' ? value.courseName : fallback.courseName,
    lectureId: typeof value.lectureId === 'string' ? value.lectureId : fallback.lectureId,
    lectureTitle: typeof value.lectureTitle === 'string' ? value.lectureTitle : fallback.lectureTitle,
    lectureSequence: typeof value.lectureSequence === 'number' ? value.lectureSequence : fallback.lectureSequence,
  } satisfies LectureContext
}

export async function POST(request: Request) {
  const body = (await request.json()) as OutboundCallRequest
  const phoneNumber = body.phoneNumber?.trim()

  if (!phoneNumber || !isValidE164PhoneNumber(phoneNumber)) {
    return NextResponse.json(
      { error: 'A valid E.164 phone number is required.' },
      { status: 400 }
    )
  }

  try {
    const context = readLectureContext(body.context)
    const call = await createTwilioOutboundLectureCall(
      {
        number: phoneNumber,
        name: body.studentName?.trim(),
      },
      context
    )

    return NextResponse.json({
      ok: true,
      callId: call.sid ?? null,
      status: call.status ?? 'queued',
      provider: 'twilio-sarvam',
      lectureId: context.lectureId,
      lectureTitle: context.lectureTitle,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to create the outbound lecture call.',
      },
      { status: 500 }
    )
  }
}
