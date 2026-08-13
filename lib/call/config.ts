import type { LectureContext } from '@/lib/rag/types'

function readEnv(name: string) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function requireEnv(name: string) {
  const value = readEnv(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getPublicAppUrl() {
  return requireEnv('PUBLIC_APP_URL')
}

export function getVapiConfig() {
  return {
    apiKey: requireEnv('VAPI_API_KEY'),
    baseUrl: readEnv('VAPI_BASE_URL') ?? 'https://api.vapi.ai',
    phoneNumberId: requireEnv('VAPI_PHONE_NUMBER_ID'),
  }
}

export function getTwilioConfig() {
  return {
    authToken: readEnv('TWILIO_AUTH_TOKEN'),
  }
}

export function getSarvamConfig() {
  return {
    apiKey: requireEnv('SARVAM_API_KEY'),
    baseUrl: readEnv('SARVAM_BASE_URL') ?? 'https://api.sarvam.ai',
    model: readEnv('SARVAM_TTS_MODEL') ?? 'bulbul:v3',
    speaker: readEnv('SARVAM_TTS_SPEAKER') ?? 'shubh',
    languageCode: readEnv('SARVAM_LANGUAGE_CODE') ?? 'en-IN',
    pace: Number(readEnv('SARVAM_TTS_PACE') ?? '1'),
    temperature: Number(readEnv('SARVAM_TTS_TEMPERATURE') ?? '0.4'),
  }
}

export function getDefaultLectureContext(): LectureContext {
  return {
    institutionId: readEnv('LECTURE_INSTITUTION_ID') ?? 'onestop-demo',
    facultyId: readEnv('LECTURE_FACULTY_ID') ?? 'faculty-nk',
    courseId: readEnv('LECTURE_COURSE_ID') ?? 'cs-301',
    courseName: readEnv('LECTURE_COURSE_NAME') ?? 'Data Structures & Algorithms',
    lectureId: readEnv('LECTURE_ID') ?? 'cs-301-lecture-08',
    lectureTitle: readEnv('LECTURE_TITLE') ?? 'Trees, Graphs & Traversals',
    lectureSequence: Number(readEnv('LECTURE_SEQUENCE') ?? '8'),
  }
}
