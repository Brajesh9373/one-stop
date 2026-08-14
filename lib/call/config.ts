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

export function getOptionalPublicAppUrl() {
  return readEnv('PUBLIC_APP_URL')
}

export function getTwilioConfig() {
  return {
    accountSid: readEnv('TWILIO_ACCOUNT_SID'),
    authToken: readEnv('TWILIO_AUTH_TOKEN'),
    phoneNumber: readEnv('TWILIO_PHONE_NUMBER'),
  }
}

export function getSarvamConfig() {
  return {
    apiKey: requireEnv('SARVAM_API_KEY'),
    baseUrl: readEnv('SARVAM_BASE_URL') ?? 'https://api.sarvam.ai',
    model: readEnv('SARVAM_TTS_MODEL') ?? 'bulbul:v3',
    sttModel: readEnv('SARVAM_STT_MODEL') ?? 'saaras:v4',
    translateModel: readEnv('SARVAM_TRANSLATE_MODEL') ?? 'sarvam-translate:v1',
    speaker: readEnv('SARVAM_TTS_SPEAKER') ?? 'shubh',
    languageCode: readEnv('SARVAM_LANGUAGE_CODE') ?? 'en-IN',
    pace: Number(readEnv('SARVAM_TTS_PACE') ?? '1'),
    temperature: Number(readEnv('SARVAM_TTS_TEMPERATURE') ?? '0.4'),
    timeoutInSeconds: Number(readEnv('SARVAM_TIMEOUT_SECONDS') ?? '30'),
    maxRetries: Number(readEnv('SARVAM_MAX_RETRIES') ?? '2'),
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

export function getCallIntegrationReadiness() {
  const missing: string[] = []
  const phoneMissing: string[] = []

  if (!readEnv('SARVAM_API_KEY')) missing.push('SARVAM_API_KEY')
  if (!readEnv('PUBLIC_APP_URL')) phoneMissing.push('PUBLIC_APP_URL')
  if (!readEnv('TWILIO_ACCOUNT_SID')) phoneMissing.push('TWILIO_ACCOUNT_SID')
  if (!readEnv('TWILIO_AUTH_TOKEN')) phoneMissing.push('TWILIO_AUTH_TOKEN')
  if (!readEnv('TWILIO_PHONE_NUMBER')) phoneMissing.push('TWILIO_PHONE_NUMBER')

  return {
    ready: missing.length === 0,
    phoneReady: missing.length === 0 && phoneMissing.length === 0,
    missing,
    phoneMissing,
    configured: {
      sarvamSdk: Boolean(readEnv('SARVAM_API_KEY')),
      twilioAccountSid: Boolean(readEnv('TWILIO_ACCOUNT_SID')),
      twilioPhoneNumber: Boolean(readEnv('TWILIO_PHONE_NUMBER')),
    },
  }
}
