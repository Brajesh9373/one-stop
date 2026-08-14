import { createHmac, timingSafeEqual } from 'node:crypto'

type ConfirmedAction = {
  teacherId: string
  subjectId: string
  connectorId?: string
  action: 'create-lecture' | 'sync-notes'
  topic?: string
  lectureId?: string
  expiresAt: number
}

function secret() {
  return process.env.FACULTY_ASSISTANT_SIGNING_SECRET ?? process.env.SARVAM_API_KEY ?? 'onestop-development-only-secret'
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createConfirmationToken(action: Omit<ConfirmedAction, 'expiresAt'>) {
  const payload = Buffer.from(JSON.stringify({ ...action, expiresAt: Date.now() + 5 * 60_000 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readConfirmationToken(token: string): ConfirmedAction | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ConfirmedAction
    return decoded.expiresAt > Date.now() ? decoded : null
  } catch { return null }
}
