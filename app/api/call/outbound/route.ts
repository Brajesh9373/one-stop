import { NextResponse } from 'next/server'

import { createOutboundLectureCall } from '@/lib/call/vapi'
import { getDefaultLectureContext } from '@/lib/call/config'
import { isValidE164PhoneNumber } from '@/lib/call/twilio'

type OutboundCallRequest = {
  phoneNumber?: string
  studentName?: string
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
    const context = getDefaultLectureContext()
    const call = await createOutboundLectureCall(
      {
        number: phoneNumber,
        name: body.studentName?.trim(),
      },
      context
    )

    return NextResponse.json({
      ok: true,
      callId: call.id ?? null,
      status: call.status ?? 'queued',
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
