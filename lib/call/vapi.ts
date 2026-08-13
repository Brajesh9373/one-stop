import { randomUUID } from 'node:crypto'

import { buildLectureCallAssistant } from '@/lib/call/assistant'
import { getPublicAppUrl, getVapiConfig } from '@/lib/call/config'
import type { LectureContext } from '@/lib/rag/types'

type Customer = {
  number: string
  name?: string
}

async function postToVapi(path: string, body: unknown) {
  const { apiKey, baseUrl } = getVapiConfig()
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Vapi request failed (${response.status}): ${errorText}`)
  }

  return response.json()
}

async function createVapiCall(body: unknown) {
  try {
    return await postToVapi('/call', body)
  } catch (error) {
    if (error instanceof Error && error.message.includes('(404)')) {
      return postToVapi('/call/phone', body)
    }

    throw error
  }
}

export async function createOutboundLectureCall(customer: Customer, context: LectureContext) {
  const { phoneNumberId } = getVapiConfig()
  const publicAppUrl = getPublicAppUrl()

  return createVapiCall({
    phoneNumberId,
    customer,
    assistant: buildLectureCallAssistant(context, publicAppUrl),
    metadata: {
      requestId: randomUUID(),
      mode: 'lecture-call',
      institutionId: context.institutionId,
      facultyId: context.facultyId,
      courseId: context.courseId,
      lectureId: context.lectureId,
      lectureTitle: context.lectureTitle,
      lectureSequence: String(context.lectureSequence),
    },
  })
}

export async function createTwilioBypassCall(customerNumber: string, context: LectureContext) {
  const { phoneNumberId } = getVapiConfig()
  const publicAppUrl = getPublicAppUrl()

  return createVapiCall({
    phoneNumberId,
    phoneCallProviderBypassEnabled: true,
    customer: {
      number: customerNumber,
    },
    assistant: buildLectureCallAssistant(context, publicAppUrl),
    metadata: {
      mode: 'twilio-inbound-bypass',
      institutionId: context.institutionId,
      facultyId: context.facultyId,
      courseId: context.courseId,
      lectureId: context.lectureId,
      lectureTitle: context.lectureTitle,
      lectureSequence: String(context.lectureSequence),
    },
  })
}
