import { createHmac, timingSafeEqual } from 'node:crypto'

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
