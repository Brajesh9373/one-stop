import type { FacultyConnectorSyncRequest, FacultyConnectorType } from '@/lib/connectors/types'

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const connectorType = (value: unknown): value is FacultyConnectorType => value === 'google-drive' || value === 'google-classroom'

export function parseConnectorSyncRequest(value: unknown): FacultyConnectorSyncRequest | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Partial<FacultyConnectorSyncRequest>
  if (!connectorType(payload.connector) || !nonEmpty(payload.institutionId) || !nonEmpty(payload.facultyId) ||
      !nonEmpty(payload.courseId) || !nonEmpty(payload.courseName) || !nonEmpty(payload.lectureId) ||
      !nonEmpty(payload.lectureTitle) || !Number.isInteger(payload.lectureSequence) || !nonEmpty(payload.topic)) return null
  return {
    connector: payload.connector, institutionId: payload.institutionId.trim(), facultyId: payload.facultyId.trim(),
    courseId: payload.courseId.trim(), courseName: payload.courseName.trim(), lectureId: payload.lectureId.trim(),
    lectureTitle: payload.lectureTitle.trim(), lectureSequence: payload.lectureSequence,
    topic: payload.topic.trim(), resourceId: nonEmpty(payload.resourceId) ? payload.resourceId.trim() : undefined,
  }
}
