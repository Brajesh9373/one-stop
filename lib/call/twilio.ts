import { createHmac, timingSafeEqual } from 'node:crypto'

import { getDefaultLectureContext, getPublicAppUrl, getTwilioConfig } from '@/lib/call/config'
import { resolveSpeechLanguage } from '@/lib/call/sarvam'
import type { LectureContext } from '@/lib/rag/types'

type Customer = {
  number: string
  name?: string
}

function normalizePhoneNumber(value: string) {
  return value.replace(/[^\d+]/g, '')
}

export function isValidE164PhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhoneNumber(value))
}

export function verifyTwilioSignature({
  url,
  params,
  authToken,
  signature,
}: {
  url: string
  params: Record<string, string>
  authToken?: string
  signature: string | null
}) {
  if (!authToken || !signature) {
    return false
  }

  const data = Object.keys(params)
    .sort()
    .reduce((result, key) => result + key + params[key], url)
  const expected = createHmac('sha1', authToken).update(data).digest('base64')

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

function contextSearchParams(context: LectureContext) {
  return new URLSearchParams({
    institutionId: context.institutionId,
    facultyId: context.facultyId,
    courseId: context.courseId,
    courseName: context.courseName,
    lectureId: context.lectureId,
    lectureTitle: context.lectureTitle,
    lectureSequence: String(context.lectureSequence),
  })
}

export function readLectureContextFromSearchParams(searchParams: URLSearchParams): LectureContext {
  const fallback = getDefaultLectureContext()

  return {
    institutionId: searchParams.get('institutionId') ?? fallback.institutionId,
    facultyId: searchParams.get('facultyId') ?? fallback.facultyId,
    courseId: searchParams.get('courseId') ?? fallback.courseId,
    courseName: searchParams.get('courseName') ?? fallback.courseName,
    lectureId: searchParams.get('lectureId') ?? fallback.lectureId,
    lectureTitle: searchParams.get('lectureTitle') ?? fallback.lectureTitle,
    lectureSequence: Number(searchParams.get('lectureSequence') ?? fallback.lectureSequence),
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildTwilioLectureUrl(path: string, context: LectureContext) {
  const publicAppUrl = getPublicAppUrl()
  const url = new URL(path, publicAppUrl)
  const params = contextSearchParams(context)
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}

export function buildSarvamAudioUrl(text: string, languageCode?: string, sampleRate = 8000) {
  const publicAppUrl = getPublicAppUrl()
  const url = new URL('/api/call/sarvam/audio', publicAppUrl)
  url.searchParams.set('text', text.slice(0, 1400))
  url.searchParams.set('languageCode', languageCode ?? resolveSpeechLanguage(text))
  url.searchParams.set('sampleRate', String(sampleRate))
  return url.toString()
}

export function buildLecturePromptTwiml({
  context,
  prompt,
  languageCode = 'en-IN',
}: {
  context: LectureContext
  prompt: string
  languageCode?: string
}) {
  const action = buildTwilioLectureUrl('/api/call/twilio/respond', context)
  const audioUrl = buildSarvamAudioUrl(prompt, languageCode)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `<Play>${escapeXml(audioUrl)}</Play>`,
    `<Gather input="speech" action="${escapeXml(action)}" method="POST" speechTimeout="auto" language="${escapeXml(languageCode)}">`,
    '</Gather>',
    `<Play>${escapeXml(buildSarvamAudioUrl('I did not hear a question. Please ask again after the tone.', languageCode))}</Play>`,
    `<Redirect method="POST">${escapeXml(buildTwilioLectureUrl('/api/call/twilio/voice', context))}</Redirect>`,
    '</Response>',
  ].join('')
}

export function buildLectureAnswerTwiml({
  context,
  answer,
  languageCode,
}: {
  context: LectureContext
  answer: string
  languageCode: string
}) {
  const audioUrl = buildSarvamAudioUrl(answer, languageCode)
  const nextPrompt = buildSarvamAudioUrl('Ask your next question from this lecture, or you can disconnect the call.', languageCode)
  const action = buildTwilioLectureUrl('/api/call/twilio/respond', context)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `<Play>${escapeXml(audioUrl)}</Play>`,
    `<Gather input="speech" action="${escapeXml(action)}" method="POST" speechTimeout="auto" language="${escapeXml(languageCode)}">`,
    `<Play>${escapeXml(nextPrompt)}</Play>`,
    '</Gather>',
    '</Response>',
  ].join('')
}

export async function createTwilioOutboundLectureCall(customer: Customer, context: LectureContext) {
  const { accountSid, authToken, phoneNumber } = getTwilioConfig()
  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('Missing Twilio credentials. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.')
  }

  const params = new URLSearchParams({
    To: normalizePhoneNumber(customer.number),
    From: phoneNumber,
    Url: buildTwilioLectureUrl('/api/call/twilio/voice', context),
    Method: 'POST',
  })
  if (customer.name) params.set('MachineDetection', 'Disable')

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Twilio call creation failed (${response.status}): ${errorText}`)
  }

  return response.json() as Promise<{ sid?: string; status?: string }>
}
