import type {
  AcademicRole,
  AcademicStatus,
  AssignmentInput,
  CreateLectureInput,
  CreateSubjectInput,
  CreateUserInput,
  EndSessionInput,
  FacultyAssistantInput,
  StartLectureSessionInput,
  StartStudySessionInput,
  SyncConnectorNotesInput,
  UpdateLectureInput,
  UpdateSubjectInput,
  UpdateUserInput,
} from '@/lib/academic/types'

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isAcademicRole(value: unknown): value is AcademicRole {
  return value === 'super-admin' || value === 'teacher' || value === 'student'
}

export function isAcademicStatus(value: unknown): value is AcademicStatus {
  return value === 'active' || value === 'inactive'
}

function optionalNumber(value: unknown) {
  return value === undefined || typeof value === 'number'
}

function readObject(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function parseCreateUserInput(value: unknown): CreateUserInput | null {
  const payload = readObject(value)
  if (!payload || !isAcademicRole(payload.role) || !isNonEmptyString(payload.name) || !isNonEmptyString(payload.email)) {
    return null
  }

  if (!optionalNumber(payload.year) || !optionalNumber(payload.semester)) return null

  return {
    role: payload.role,
    name: payload.name.trim(),
    email: payload.email.trim(),
    department: isNonEmptyString(payload.department) ? payload.department.trim() : undefined,
    year: typeof payload.year === 'number' ? payload.year : undefined,
    semester: typeof payload.semester === 'number' ? payload.semester : undefined,
  }
}

export function parseUpdateUserInput(value: unknown): UpdateUserInput | null {
  const payload = readObject(value)
  if (!payload || !isNonEmptyString(payload.id)) return null
  if (payload.role !== undefined && !isAcademicRole(payload.role)) return null
  if (payload.status !== undefined && !isAcademicStatus(payload.status)) return null
  if (payload.year !== undefined && typeof payload.year !== 'number') return null
  if (payload.semester !== undefined && typeof payload.semester !== 'number') return null

  return {
    id: payload.id.trim(),
    role: payload.role,
    name: isNonEmptyString(payload.name) ? payload.name.trim() : undefined,
    email: isNonEmptyString(payload.email) ? payload.email.trim() : undefined,
    department: isNonEmptyString(payload.department) ? payload.department.trim() : undefined,
    year: typeof payload.year === 'number' ? payload.year : undefined,
    semester: typeof payload.semester === 'number' ? payload.semester : undefined,
    status: payload.status,
  }
}

export function parseCreateSubjectInput(value: unknown): CreateSubjectInput | null {
  const payload = readObject(value)
  if (
    !payload ||
    !isNonEmptyString(payload.code) ||
    !isNonEmptyString(payload.name) ||
    typeof payload.year !== 'number' ||
    typeof payload.semester !== 'number' ||
    !isNonEmptyString(payload.teacherId)
  ) {
    return null
  }

  return {
    code: payload.code.trim(),
    name: payload.name.trim(),
    description: isNonEmptyString(payload.description) ? payload.description.trim() : undefined,
    year: payload.year,
    semester: payload.semester,
    teacherId: payload.teacherId.trim(),
  }
}

export function parseUpdateSubjectInput(value: unknown): UpdateSubjectInput | null {
  const payload = readObject(value)
  if (!payload || !isNonEmptyString(payload.id)) return null
  if (payload.status !== undefined && !isAcademicStatus(payload.status)) return null

  return {
    id: payload.id.trim(),
    code: isNonEmptyString(payload.code) ? payload.code.trim() : undefined,
    name: isNonEmptyString(payload.name) ? payload.name.trim() : undefined,
    description: isNonEmptyString(payload.description) ? payload.description.trim() : undefined,
    year: typeof payload.year === 'number' ? payload.year : undefined,
    semester: typeof payload.semester === 'number' ? payload.semester : undefined,
    teacherId: isNonEmptyString(payload.teacherId) ? payload.teacherId.trim() : undefined,
    status: payload.status,
  }
}

export function parseAssignmentInput(value: unknown): AssignmentInput | null {
  const payload = readObject(value)
  if (
    !payload ||
    !isNonEmptyString(payload.subjectId) ||
    !isNonEmptyString(payload.userId) ||
    (payload.kind !== 'teacher' && payload.kind !== 'student')
  ) {
    return null
  }

  return {
    subjectId: payload.subjectId.trim(),
    userId: payload.userId.trim(),
    kind: payload.kind,
  }
}

export function parseCreateLectureInput(value: unknown): CreateLectureInput | null {
  const payload = readObject(value)
  if (
    !payload ||
    !isNonEmptyString(payload.subjectId) ||
    !isNonEmptyString(payload.moduleId) ||
    !isNonEmptyString(payload.title) ||
    !isNonEmptyString(payload.topic) ||
    !isNonEmptyString(payload.createdBy)
  ) {
    return null
  }

  return {
    subjectId: payload.subjectId.trim(),
    moduleId: payload.moduleId.trim(),
    title: payload.title.trim(),
    topic: payload.topic.trim(),
    notes: isNonEmptyString(payload.notes) ? payload.notes.trim() : undefined,
    plannedAt: isNonEmptyString(payload.plannedAt) ? payload.plannedAt.trim() : undefined,
    createdBy: payload.createdBy.trim(),
  }
}

export function parseUpdateLectureInput(value: unknown): UpdateLectureInput | null {
  const payload = readObject(value)
  if (!payload || !isNonEmptyString(payload.id)) return null
  if (payload.status !== undefined && payload.status !== 'draft' && payload.status !== 'ready' && payload.status !== 'live' && payload.status !== 'completed') return null

  return {
    id: payload.id.trim(),
    subjectId: isNonEmptyString(payload.subjectId) ? payload.subjectId.trim() : undefined,
    moduleId: isNonEmptyString(payload.moduleId) ? payload.moduleId.trim() : undefined,
    title: isNonEmptyString(payload.title) ? payload.title.trim() : undefined,
    topic: isNonEmptyString(payload.topic) ? payload.topic.trim() : undefined,
    notes: typeof payload.notes === 'string' ? payload.notes.trim() : undefined,
    plannedAt: isNonEmptyString(payload.plannedAt) ? payload.plannedAt.trim() : undefined,
    status: payload.status as UpdateLectureInput['status'],
  }
}

export function parseStartLectureSessionInput(value: unknown): StartLectureSessionInput | null {
  const payload = readObject(value)
  if (!payload || !isNonEmptyString(payload.lectureId) || !isNonEmptyString(payload.teacherId)) return null
  return {
    lectureId: payload.lectureId.trim(),
    teacherId: payload.teacherId.trim(),
  }
}

export function parseStartStudySessionInput(value: unknown): StartStudySessionInput | null {
  const payload = readObject(value)
  if (
    !payload ||
    !isNonEmptyString(payload.subjectId) ||
    !isNonEmptyString(payload.lectureId) ||
    !isNonEmptyString(payload.studentId) ||
    !isNonEmptyString(payload.focus)
  ) {
    return null
  }

  return {
    subjectId: payload.subjectId.trim(),
    lectureId: payload.lectureId.trim(),
    studentId: payload.studentId.trim(),
    focus: payload.focus.trim(),
  }
}

export function parseEndSessionInput(value: unknown): EndSessionInput | null {
  const payload = readObject(value)
  if (!payload || !isNonEmptyString(payload.sessionId)) return null
  return { sessionId: payload.sessionId.trim() }
}

export function parseSyncConnectorNotesInput(value: unknown): SyncConnectorNotesInput | null {
  const payload = readObject(value)
  if (
    !payload ||
    !isNonEmptyString(payload.connectorId) ||
    !isNonEmptyString(payload.lectureId) ||
    !isNonEmptyString(payload.teacherId)
  ) {
    return null
  }

  return {
    connectorId: payload.connectorId.trim(),
    lectureId: payload.lectureId.trim(),
    teacherId: payload.teacherId.trim(),
  }
}

export function parseFacultyAssistantInput(value: unknown): FacultyAssistantInput | null {
  const payload = readObject(value)
  if (!payload || !isNonEmptyString(payload.teacherId) || !isNonEmptyString(payload.command)) {
    return null
  }

  return {
    teacherId: payload.teacherId.trim(),
    subjectId: isNonEmptyString(payload.subjectId) ? payload.subjectId.trim() : undefined,
    connectorId: isNonEmptyString(payload.connectorId) ? payload.connectorId.trim() : undefined,
    command: payload.command.trim(),
    confirmationToken: isNonEmptyString(payload.confirmationToken) ? payload.confirmationToken.trim() : undefined,
  }
}
