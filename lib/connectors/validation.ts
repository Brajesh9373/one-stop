import type { FacultyConnectorSyncRequest, FacultyConnectorType } from '@/lib/connectors/types'

function isConnectorType(value: unknown): value is FacultyConnectorType {
  return value === 'google-drive' || value === 'google-classroom'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseConnectorSyncRequest(value: unknown): FacultyConnectorSyncRequest | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Partial<FacultyConnectorSyncRequest>

  if (
    !isConnectorType(payload.connector) ||
    !isNonEmptyString(payload.facultyId) ||
    !isNonEmptyString(payload.courseId)
  ) {
    return null
  }

  return {
    connector: payload.connector,
    facultyId: payload.facultyId.trim(),
    courseId: payload.courseId.trim(),
  }
}
