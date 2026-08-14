function numberEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

export const hybridLectureRagConfig = {
  minScoreThreshold: numberEnv('RAG_MIN_SCORE', 0.18, 0, 1),
  lectureTopK: numberEnv('RAG_LECTURE_TOP_K', 8, 1, 30),
  courseTopK: numberEnv('RAG_COURSE_TOP_K', 6, 1, 30),
  finalTopK: numberEnv('RAG_FINAL_TOP_K', 5, 1, 12),
  maxAnswerSentences: numberEnv('RAG_MAX_ANSWER_SENTENCES', 5, 1, 10),
  chunkSizeWords: numberEnv('RAG_CHUNK_SIZE_WORDS', 180, 60, 600),
  chunkOverlapWords: numberEnv('RAG_CHUNK_OVERLAP_WORDS', 32, 0, 120),
  denseWeight: 0.46,
  sparseWeight: 0.34,
  lexicalWeight: 0.14,
  metadataWeight: 0.06,
  lectureScopeBoost: 1.12,
  courseScopeBoost: 0.88,
  repeatedSourcePenalty: 0.08,
  duplicateEvidenceThreshold: 0.78,
  maxPromptCharacters: numberEnv('RAG_MAX_PROMPT_CHARACTERS', 4000, 100, 12000),
  maxDocumentBytes: numberEnv('RAG_MAX_DOCUMENT_BYTES', 25 * 1024 * 1024, 1024, 100 * 1024 * 1024),
  requestTimeoutMs: numberEnv('RAG_PROVIDER_TIMEOUT_MS', 30000, 1000, 120000),
  sourceTypeBoosts: {
    transcript: 1.04,
    notes: 1.08,
    slides: 1,
    reading: 0.96,
  },
} as const
