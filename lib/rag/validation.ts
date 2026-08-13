import type {
  CallRequest,
  CallTurn,
  FacultySourceDocument,
  LectureContext,
  RagQuery,
  SourceType,
  StudentMode,
} from '@/lib/rag/types'

function isStudentMode(value: unknown): value is StudentMode {
  return value === 'chat' || value === 'call' || value === 'virtual-classroom'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSourceType(value: unknown): value is SourceType {
  return value === 'notes' || value === 'slides' || value === 'transcript' || value === 'reading'
}

function isLectureContext(value: unknown): value is LectureContext {
  if (!value || typeof value !== 'object') return false
  const context = value as Partial<LectureContext>

  return (
    isNonEmptyString(context.institutionId) &&
    isNonEmptyString(context.facultyId) &&
    isNonEmptyString(context.courseId) &&
    isNonEmptyString(context.courseName) &&
    isNonEmptyString(context.lectureId) &&
    isNonEmptyString(context.lectureTitle) &&
    typeof context.lectureSequence === 'number'
  )
}

function isCallTurn(value: unknown): value is CallTurn {
  if (!value || typeof value !== 'object') return false
  const turn = value as Partial<CallTurn>

  return (
    isNonEmptyString(turn.id) &&
    (turn.speaker === 'student' || turn.speaker === 'assistant') &&
    isNonEmptyString(turn.text) &&
    isNonEmptyString(turn.createdAt)
  )
}

function isFacultySourceDocument(value: unknown): value is FacultySourceDocument {
  if (!value || typeof value !== 'object') return false
  const document = value as Partial<FacultySourceDocument>

  return (
    isNonEmptyString(document.id) &&
    isNonEmptyString(document.institutionId) &&
    isNonEmptyString(document.facultyId) &&
    isNonEmptyString(document.courseId) &&
    isNonEmptyString(document.courseName) &&
    isNonEmptyString(document.lectureId) &&
    isNonEmptyString(document.lectureTitle) &&
    typeof document.lectureSequence === 'number' &&
    isNonEmptyString(document.topic) &&
    isSourceType(document.sourceType) &&
    isNonEmptyString(document.sourceName) &&
    isNonEmptyString(document.section) &&
    isNonEmptyString(document.content) &&
    isNonEmptyString(document.updatedAt)
  )
}

export function parseRagQuery(value: unknown): RagQuery | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Partial<RagQuery>

  if (
    !isStudentMode(payload.mode) ||
    !isNonEmptyString(payload.studentId) ||
    !isNonEmptyString(payload.prompt) ||
    !isLectureContext(payload.context)
  ) {
    return null
  }

  return {
    mode: payload.mode,
    studentId: payload.studentId.trim(),
    prompt: payload.prompt.trim(),
    context: payload.context,
  }
}

export function parseCallRequest(value: unknown): CallRequest | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Partial<CallRequest>

  if (
    !isNonEmptyString(payload.studentId) ||
    !isNonEmptyString(payload.prompt) ||
    !isLectureContext(payload.context)
  ) {
    return null
  }

  if (payload.turns && (!Array.isArray(payload.turns) || payload.turns.some((turn) => !isCallTurn(turn)))) {
    return null
  }

  if (payload.sessionId && !isNonEmptyString(payload.sessionId)) {
    return null
  }

  return {
    studentId: payload.studentId.trim(),
    prompt: payload.prompt.trim(),
    context: payload.context,
    sessionId: payload.sessionId?.trim(),
    turns: payload.turns?.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker,
      text: turn.text.trim(),
      createdAt: turn.createdAt,
    })),
  }
}

export function parseFacultySourceDocuments(value: unknown): FacultySourceDocument[] | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as { documents?: unknown }
  if (!Array.isArray(payload.documents)) return null

  const documents = payload.documents.filter(isFacultySourceDocument)
  if (documents.length !== payload.documents.length || documents.length === 0) {
    return null
  }

  return documents
}
