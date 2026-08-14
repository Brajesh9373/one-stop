import { randomUUID } from 'node:crypto'

import { detectSarvamLanguageConfig } from '@/lib/call/language'
import { translateTextBetweenSarvam } from '@/lib/call/sarvam'
import { hybridLectureRagConfig } from '@/lib/rag/config'
import { getEmbeddingProvider } from '@/lib/rag/embedding'
import { getRagRepository } from '@/lib/rag/repository'
import { normalizeText, tokenize } from '@/lib/rag/text'
import type { RagQuery, RagResult, RagRetrieveResult, RetrievedChunk, RetrievalScope, SentenceUnit } from '@/lib/rag/types'

type QueryProfile = { raw: string; retrievalText: string; tokens: string[] }
type ScoredUnit = { unit: SentenceUnit; score: number; scope: RetrievalScope; lexicalScore: number }

function clamp(value: number) { return Math.max(0, Math.min(1, value)) }

async function buildQueryProfile(prompt: string): Promise<QueryProfile> {
  const language = detectSarvamLanguageConfig(prompt)?.languageCode ?? 'en-IN'
  let retrievalText = prompt
  if (language !== 'en-IN' && process.env.SARVAM_API_KEY) {
    try {
      retrievalText = `${prompt}\n${await translateTextBetweenSarvam(prompt, language, 'en-IN')}`
    } catch {
      retrievalText = prompt
    }
  }
  return { raw: prompt, retrievalText, tokens: Array.from(new Set(tokenize(retrievalText))) }
}

function lexicalCoverage(queryTokens: string[], unit: SentenceUnit) {
  if (queryTokens.length === 0) return 0
  const evidence = new Set(tokenize([unit.content, unit.section, unit.topic, unit.lectureTitle].join(' ')))
  return queryTokens.filter((token) => evidence.has(token)).length / queryTokens.length
}

function metadataCoverage(queryTokens: string[], unit: SentenceUnit) {
  if (queryTokens.length === 0) return 0
  const metadata = new Set(tokenize([unit.section, unit.topic, unit.sourceName, unit.lectureTitle].join(' ')))
  return queryTokens.filter((token) => metadata.has(token)).length / queryTokens.length
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(tokenize(left)); const rightTokens = new Set(tokenize(right))
  if (!leftTokens.size || !rightTokens.size) return 0
  let shared = 0
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1
  return shared / Math.min(leftTokens.size, rightTokens.size)
}

function normalizeRetrievedChunk(entry: ScoredUnit): RetrievedChunk {
  return { chunkId: entry.unit.id, score: Number(entry.score.toFixed(4)), scope: entry.scope, sourceName: entry.unit.sourceName, section: entry.unit.section }
}

async function scoreScope(profile: QueryProfile, query: RagQuery, scope: RetrievalScope) {
  const repository = getRagRepository()
  const boundary = {
    institutionId: query.context.institutionId,
    courseId: query.context.courseId,
    lectureId: query.context.lectureId,
    scope,
  }
  const candidateLimit = (scope === 'lecture' ? hybridLectureRagConfig.lectureTopK : hybridLectureRagConfig.courseTopK) * 5
  const [sparseHits, denseHits] = await Promise.all([
    repository.searchSparse(profile.retrievalText, boundary, candidateLimit),
    repository.searchDense(profile.retrievalText, boundary, candidateLimit),
  ])
  const sparse = new Map(sparseHits.map((hit, index) => [hit.unitId, 1 / (60 + index + 1)]))
  const dense = new Map(denseHits.map((hit, index) => [hit.chunkId, { similarity: clamp((hit.score + 1) / 2), rank: 1 / (60 + index + 1) }]))
  const ids = Array.from(new Set([...sparse.keys(), ...dense.keys()]))
  const units = await repository.getSentenceUnitsByIds(ids)
  const maxRrf = 1 / 61

  return units.map<ScoredUnit>((unit) => {
    const lexicalScore = lexicalCoverage(profile.tokens, unit)
    const metadataScore = metadataCoverage(profile.tokens, unit)
    const denseHit = dense.get(unit.id)
    const denseScore = denseHit ? (denseHit.similarity * 0.7 + denseHit.rank / maxRrf * 0.3) : 0
    const sparseScore = (sparse.get(unit.id) ?? 0) / maxRrf
    const scopeBoost = scope === 'lecture' ? hybridLectureRagConfig.lectureScopeBoost : hybridLectureRagConfig.courseScopeBoost
    const score = (
      denseScore * hybridLectureRagConfig.denseWeight +
      sparseScore * hybridLectureRagConfig.sparseWeight +
      lexicalScore * hybridLectureRagConfig.lexicalWeight +
      metadataScore * hybridLectureRagConfig.metadataWeight
    ) * scopeBoost * hybridLectureRagConfig.sourceTypeBoosts[unit.sourceType]
    return { unit, score, scope, lexicalScore }
  }).filter((entry) =>
    entry.score >= hybridLectureRagConfig.minScoreThreshold &&
    (entry.lexicalScore > 0 || dense.has(entry.unit.id) || sparse.has(entry.unit.id))
  ).sort((left, right) => right.score - left.score)
}

function diversify(scored: ScoredUnit[]) {
  const selected: ScoredUnit[] = []
  const sourceCounts = new Map<string, number>()
  for (const candidate of scored) {
    if (selected.some((entry) => tokenOverlap(entry.unit.content, candidate.unit.content) >= hybridLectureRagConfig.duplicateEvidenceThreshold)) continue
    const repeats = sourceCounts.get(candidate.unit.sourceId) ?? 0
    const adjusted = candidate.score - repeats * hybridLectureRagConfig.repeatedSourcePenalty
    if (adjusted < hybridLectureRagConfig.minScoreThreshold) continue
    selected.push({ ...candidate, score: adjusted })
    sourceCounts.set(candidate.unit.sourceId, repeats + 1)
    if (selected.length >= hybridLectureRagConfig.finalTopK) break
  }
  return selected
}

function answerFromEvidence(units: ScoredUnit[], fallbackUsed: boolean) {
  if (!units.length) return {
    answer: "I couldn't find enough evidence in the selected academic context to answer safely. Add or sync relevant notes, or ask a question covered by this lecture.",
    cited: [] as ScoredUnit[],
  }
  const cited = units.slice(0, hybridLectureRagConfig.maxAnswerSentences)
  const prefix = fallbackUsed ? 'The selected lecture did not contain enough evidence, so I used related material from this subject. ' : ''
  return { answer: `${prefix}${cited.map((entry) => normalizeText(entry.unit.content)).join(' ')}`, cited }
}

function confidenceFor(units: ScoredUnit[]) {
  const score = units[0]?.score ?? 0
  if (!units.length) return 'insufficient' as const
  if (score >= 0.7 && units.length >= 2) return 'high' as const
  if (score >= 0.45) return 'medium' as const
  return 'low' as const
}

async function localizeAnswer(answer: string, prompt: string) {
  const target = detectSarvamLanguageConfig(prompt)?.languageCode ?? 'en-IN'
  if (target === 'en-IN' || !process.env.SARVAM_API_KEY) return answer
  try { return await translateTextBetweenSarvam(answer, 'en-IN', target) } catch { return answer }
}

export async function inspectHybridLectureRetrieval(query: RagQuery): Promise<RagRetrieveResult> {
  const profile = await buildQueryProfile(query.prompt)
  const lectureResults = await scoreScope(profile, query, 'lecture')
  const canUseCourse = query.context.scope === 'subject' || query.context.allowCourseFallback === true
  const courseResults = canUseCourse ? await scoreScope(profile, query, 'course') : []
  return {
    requestId: randomUUID(),
    lectureResults: lectureResults.slice(0, hybridLectureRagConfig.lectureTopK).map(normalizeRetrievedChunk),
    courseResults: courseResults.slice(0, hybridLectureRagConfig.courseTopK).map(normalizeRetrievedChunk),
  }
}

export async function runHybridLectureRag(query: RagQuery): Promise<RagResult> {
  const startedAt = performance.now(); const requestId = randomUUID(); const warnings: string[] = []
  const profile = await buildQueryProfile(query.prompt)
  const isSubjectScope = query.context.scope === 'subject' || query.context.lectureSequence === 0
  const lecture = isSubjectScope ? [] : await scoreScope(profile, query, 'lecture')
  const canFallback = isSubjectScope || query.context.allowCourseFallback === true
  const fallbackUsed = isSubjectScope || (lecture.length === 0 && canFallback)
  const course = fallbackUsed ? await scoreScope(profile, query, 'course') : []
  const selected = diversify(fallbackUsed ? course : lecture)
  const generated = answerFromEvidence(selected, fallbackUsed && !isSubjectScope)
  const answer = await localizeAnswer(generated.answer, query.prompt)
  if (getEmbeddingProvider() === 'local') warnings.push('Local fallback embeddings are active; configure an embedding provider for semantic multilingual retrieval.')
  if (!process.env.RAG_GENERATION_API_KEY) warnings.push('Extractive grounded generation is active.')
  return {
    answer,
    citations: generated.cited.map(({ unit }) => ({
      chunkId: unit.chunkId, sourceType: unit.sourceType, sourceName: unit.sourceName, section: unit.section,
      lectureId: unit.lectureId, lectureTitle: unit.lectureTitle, page: unit.page, timestamp: unit.timestamp,
    })),
    retrievedChunks: generated.cited.map(normalizeRetrievedChunk), fallbackUsed,
    diagnostics: {
      requestId, durationMs: Math.round(performance.now() - startedAt), lectureCandidates: lecture.length,
      courseCandidates: course.length, lectureTopScore: lecture[0] ? Number(lecture[0].score.toFixed(4)) : null,
      courseTopScore: course[0] ? Number(course[0].score.toFixed(4)) : null,
      embeddingProvider: getEmbeddingProvider(), generationProvider: 'extractive', confidence: confidenceFor(selected), warnings,
    },
  }
}
