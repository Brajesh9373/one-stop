export type SourceType = 'notes' | 'slides' | 'transcript' | 'reading'

export type StudentMode = 'chat' | 'call' | 'virtual-classroom'

export type RetrievalScope = 'lecture' | 'course'

export type ContentVisibility = 'students' | 'faculty' | 'private'

export type EmbeddingProvider = 'local' | 'openai-compatible'

export type CallSpeaker = 'student' | 'assistant'

export type FacultySourceDocument = {
  id: string
  institutionId: string
  facultyId: string
  courseId: string
  courseName: string
  lectureId: string
  lectureTitle: string
  lectureSequence: number
  topic: string
  sourceType: SourceType
  sourceName: string
  section: string
  page?: number
  timestamp?: string
  mimeType?: string
  sourceUrl?: string
  externalId?: string
  connectorType?: string
  visibility?: ContentVisibility
  version?: string
  contentHash?: string
  content: string
  updatedAt: string
}

export type LectureChunk = {
  id: string
  institutionId: string
  facultyId: string
  courseId: string
  courseName: string
  lectureId: string
  lectureTitle: string
  lectureSequence: number
  topic: string
  sourceId: string
  sourceType: SourceType
  sourceName: string
  section: string
  page?: number
  timestamp?: string
  chunkIndex: number
  content: string
  tokenCount: number
  updatedAt: string
}

export type SentenceUnit = {
  id: string
  chunkId: string
  sourceId: string
  institutionId: string
  facultyId: string
  courseId: string
  courseName: string
  lectureId: string
  lectureTitle: string
  lectureSequence: number
  topic: string
  sourceType: SourceType
  sourceName: string
  section: string
  page?: number
  timestamp?: string
  sentenceIndex: number
  content: string
  tokenCount: number
  updatedAt: string
}

export type LectureContext = {
  institutionId: string
  facultyId: string
  courseId: string
  courseName: string
  lectureId: string
  lectureTitle: string
  lectureSequence: number
  scope?: 'lecture' | 'subject'
  allowCourseFallback?: boolean
}

export type RagCitation = {
  chunkId: string
  sourceType: SourceType
  sourceName: string
  section: string
  lectureId: string
  lectureTitle: string
  page?: number
  timestamp?: string
}

export type RetrievedChunk = {
  chunkId: string
  score: number
  scope: RetrievalScope
  sourceName: string
  section: string
}

export type RagDiagnostics = {
  requestId: string
  durationMs: number
  lectureCandidates: number
  courseCandidates: number
  lectureTopScore: number | null
  courseTopScore: number | null
  embeddingProvider: EmbeddingProvider
  generationProvider: 'extractive' | 'openai-compatible'
  confidence: 'high' | 'medium' | 'low' | 'insufficient'
  warnings: string[]
}

export type RagResult = {
  answer: string
  citations: RagCitation[]
  retrievedChunks: RetrievedChunk[]
  fallbackUsed: boolean
  diagnostics: RagDiagnostics
}

export type RagQuery = {
  mode: StudentMode
  studentId: string
  prompt: string
  context: LectureContext
}

export type RagRetrieveResult = {
  requestId: string
  lectureResults: RetrievedChunk[]
  courseResults: RetrievedChunk[]
}

export type CallTurn = {
  id: string
  speaker: CallSpeaker
  text: string
  createdAt: string
}

export type CallRequest = {
  studentId: string
  prompt: string
  context: LectureContext
  sessionId?: string
  turns?: CallTurn[]
}

export type CallResponse = {
  sessionId: string
  turnId: string
  transcript: string
  answer: string
  citations: RagCitation[]
  fallbackUsed: boolean
  diagnostics: RagDiagnostics
}
