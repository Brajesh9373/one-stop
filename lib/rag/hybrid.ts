import { randomUUID } from 'node:crypto'

import { hybridLectureRagConfig } from '@/lib/rag/config'
import { getRagRepository } from '@/lib/rag/repository'
import type {
  RagQuery,
  RagResult,
  RagRetrieveResult,
  RetrievedChunk,
  RetrievalScope,
  SentenceUnit,
} from '@/lib/rag/types'

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'before',
  'between',
  'by',
  'does',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'what',
  'when',
  'which',
  'why',
  'with',
  'you',
])

type QueryIntent = 'difference' | 'why' | 'how' | 'what' | 'generic'

type QueryProfile = {
  raw: string
  tokens: string[]
  tokenSet: Set<string>
  intent: QueryIntent
}

type ScoredUnit = {
  unit: SentenceUnit
  score: number
  scope: RetrievalScope
  lexicalScore: number
  metadataScore: number
  genericPenalty: number
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
}

function buildQueryProfile(prompt: string): QueryProfile {
  const lower = prompt.toLowerCase()
  const intent: QueryIntent = lower.includes('difference') || lower.includes('compare')
    ? 'difference'
    : lower.includes('why')
      ? 'why'
      : lower.includes('how')
        ? 'how'
        : lower.includes('what')
          ? 'what'
          : 'generic'

  const tokens = tokenize(prompt)
  return {
    raw: prompt,
    tokens,
    tokenSet: new Set(tokens),
    intent,
  }
}

function normalizeRetrievedChunk(entry: ScoredUnit): RetrievedChunk {
  return {
    chunkId: entry.unit.id,
    score: Number(entry.score.toFixed(3)),
    scope: entry.scope,
    sourceName: entry.unit.sourceName,
    section: entry.unit.section,
  }
}

function normalizeScoreMap(rawScores: Map<string, number>) {
  if (rawScores.size === 0) return new Map<string, number>()
  const maxScore = Math.max(...rawScores.values(), 0.000001)
  const normalized = new Map<string, number>()
  for (const [id, score] of rawScores.entries()) {
    normalized.set(id, score / maxScore)
  }
  return normalized
}

function lexicalCoverage(tokens: string[], unit: SentenceUnit) {
  if (tokens.length === 0) return 0
  const haystack = [
    unit.content,
    unit.section,
    unit.topic,
    unit.sourceName,
    unit.lectureTitle,
  ]
    .join(' ')
    .toLowerCase()

  let matches = 0
  for (const token of tokens) {
    if (haystack.includes(token)) matches += 1
  }

  return matches / tokens.length
}

function metadataAlignment(profile: QueryProfile, unit: SentenceUnit) {
  const label = [unit.section, unit.topic, unit.sourceName, unit.lectureTitle].join(' ').toLowerCase()
  let score = 0

  for (const token of profile.tokens) {
    if (label.includes(token)) score += 0.2
  }

  if (profile.intent === 'difference' && (label.includes('balanced') || label.includes('complete'))) score += 0.25
  if (profile.intent === 'why' && (label.includes('why') || label.includes('performance'))) score += 0.2
  if (profile.intent === 'how' && (label.includes('traversal') || label.includes('inorder') || label.includes('queue'))) score += 0.2
  if (profile.intent === 'what' && (label.includes('bfs') || label.includes('breadth'))) score += 0.2

  return Math.min(score, 1)
}

function unitLabel(unit: SentenceUnit) {
  return [unit.content, unit.section, unit.topic, unit.sourceName, unit.lectureTitle].join(' ').toLowerCase()
}

function genericPenalty(profile: QueryProfile, unit: SentenceUnit) {
  const label = [unit.section, unit.topic, unit.sourceName].join(' ').toLowerCase()
  const isGeneric =
    label.includes('review') ||
    label.includes('practice') ||
    label.includes('exam') ||
    label.includes('office hours')

  if (!isGeneric) return 0

  if (profile.intent === 'difference' || profile.intent === 'how' || profile.intent === 'what') {
    return hybridLectureRagConfig.genericSectionPenalty
  }

  if (profile.intent === 'why' && !label.includes('why')) {
    return hybridLectureRagConfig.genericSectionPenalty * 0.75
  }

  return hybridLectureRagConfig.genericSectionPenalty * 0.35
}

function strongIntentMatch(profile: QueryProfile, unit: SentenceUnit) {
  const label = unitLabel(unit)

  if (profile.intent === 'difference') {
    return label.includes('complete') && label.includes('balanced')
  }
  if (profile.intent === 'why') {
    return (
      label.includes('runtime') ||
      label.includes('search') ||
      label.includes('efficient') ||
      label.includes('skewed')
    )
  }
  if (profile.intent === 'how' && profile.tokenSet.has('inorder')) {
    return label.includes('inorder') || label.includes('sorted order') || label.includes('visits')
  }
  if (profile.intent === 'what' && profile.tokenSet.has('bfs')) {
    return label.includes('bfs') || label.includes('shortest path') || label.includes('queue')
  }

  return false
}

function hardRelevanceFilter(profile: QueryProfile, unit: SentenceUnit, lexicalScore: number, metadataScore: number) {
  if (strongIntentMatch(profile, unit)) return true

  if (profile.intent === 'how' && profile.tokenSet.has('inorder')) {
    return unitLabel(unit).includes('inorder') || lexicalScore >= 0.28
  }
  if (profile.intent === 'difference' && (profile.tokenSet.has('balanced') || profile.tokenSet.has('complete'))) {
    return unitLabel(unit).includes('balanced') || unitLabel(unit).includes('complete') || lexicalScore >= 0.28
  }
  if (profile.intent === 'what' && profile.tokenSet.has('bfs')) {
    return unitLabel(unit).includes('bfs') || unitLabel(unit).includes('breadth') || lexicalScore >= 0.22
  }

  return (
    lexicalScore >= hybridLectureRagConfig.chunkLexicalFloor ||
    metadataScore >= hybridLectureRagConfig.chunkMetadataFloor
  )
}

function scoreUnit(
  profile: QueryProfile,
  unit: SentenceUnit,
  scope: RetrievalScope,
  dense: number,
  sparse: number
): ScoredUnit {
  const lexicalScore = lexicalCoverage(profile.tokens, unit)
  const metadataScore = metadataAlignment(profile, unit)
  const penalty = genericPenalty(profile, unit)
  const scopeBoost =
    scope === 'lecture'
      ? hybridLectureRagConfig.lectureScopeBoost
      : hybridLectureRagConfig.courseScopeBoost
  const sourceTypeBoost = hybridLectureRagConfig.sourceTypeBoosts[unit.sourceType]

  const score =
    (
      dense * hybridLectureRagConfig.denseWeight +
      sparse * hybridLectureRagConfig.sparseWeight +
      lexicalScore * hybridLectureRagConfig.lexicalWeight +
      metadataScore * hybridLectureRagConfig.metadataWeight
    ) *
    scopeBoost *
    sourceTypeBoost -
    penalty

  return {
    unit,
    score,
    scope,
    lexicalScore,
    metadataScore,
    genericPenalty: penalty,
  }
}

async function scoreScope(
  profile: QueryProfile,
  courseId: string,
  lectureId: string,
  scope: RetrievalScope
) {
  const repository = getRagRepository()
  const [sparseHits, denseHits] = await Promise.all([
    repository.searchSparse(
      profile.raw,
      courseId,
      lectureId,
      scope,
      hybridLectureRagConfig.lectureTopK * 4
    ),
    repository.searchDense(profile.raw, hybridLectureRagConfig.lectureTopK * 10),
  ])

  const denseScores = normalizeScoreMap(new Map(denseHits.map((hit) => [hit.chunkId, hit.score])))
  const sparseScores = normalizeScoreMap(new Map(sparseHits.map((hit) => [hit.unitId, hit.score])))
  const candidateIds = Array.from(new Set([...denseScores.keys(), ...sparseScores.keys()]))
  const units = await repository.getSentenceUnitsByIds(candidateIds)

  const scopedUnits = units.filter((unit) =>
    scope === 'lecture'
      ? unit.courseId === courseId && unit.lectureId === lectureId
      : unit.courseId === courseId && unit.lectureId !== lectureId
  )

  const scored = scopedUnits
    .map((unit) =>
      scoreUnit(
        profile,
        unit,
        scope,
        denseScores.get(unit.id) ?? 0,
        sparseScores.get(unit.id) ?? 0
      )
    )
    .filter(
      (entry) =>
        entry.score >= hybridLectureRagConfig.minScoreThreshold &&
        hardRelevanceFilter(profile, entry.unit, entry.lexicalScore, entry.metadataScore)
    )
    .sort((left, right) => right.score - left.score)

  return { scored }
}

function diversifyUnits(scored: ScoredUnit[]) {
  const selected: ScoredUnit[] = []
  const seenSourceIds = new Map<string, number>()

  for (const entry of scored) {
    const prior = seenSourceIds.get(entry.unit.sourceId) ?? 0
    const adjusted = entry.score - prior * hybridLectureRagConfig.repeatedSourcePenalty
    if (adjusted < hybridLectureRagConfig.minScoreThreshold) continue

    selected.push({ ...entry, score: adjusted })
    seenSourceIds.set(entry.unit.sourceId, prior + 1)

    if (selected.length >= hybridLectureRagConfig.finalTopK) break
  }

  return selected
}

function synthesizeAnswer(profile: QueryProfile, units: ScoredUnit[], fallbackUsed: boolean) {
  if (units.length === 0) {
    return {
      answer:
        "I couldn't find grounded material for that question in the selected lecture context. Try asking about a concept that appears in this lecture or connect more lecture resources first.",
      citedIds: [] as string[],
    }
  }

  const ordered = units
    .filter((entry) => strongIntentMatch(profile, entry.unit) || entry.lexicalScore >= 0.2)
    .slice(0, hybridLectureRagConfig.maxAnswerSentences)

  if (ordered.length === 0) {
    return {
      answer:
        'I found lecture-grounded material, but none of the strongest evidence matched the question closely enough to answer safely.',
      citedIds: [] as string[],
    }
  }

  const prefix = fallbackUsed
    ? 'I expanded beyond the selected lecture into broader course material because the lecture itself did not provide a strong enough match. '
    : ''

  return {
    answer: `${prefix}${ordered.map((entry) => entry.unit.content).join(' ')}`,
    citedIds: ordered.map((entry) => entry.unit.id),
  }
}

export async function inspectHybridLectureRetrieval(query: RagQuery): Promise<RagRetrieveResult> {
  const requestId = randomUUID()
  const profile = buildQueryProfile(query.prompt)
  const [lectureScope, courseScope] = await Promise.all([
    scoreScope(profile, query.context.courseId, query.context.lectureId, 'lecture'),
    scoreScope(profile, query.context.courseId, query.context.lectureId, 'course'),
  ])

  return {
    requestId,
    lectureResults: lectureScope.scored
      .slice(0, hybridLectureRagConfig.lectureTopK)
      .map(normalizeRetrievedChunk),
    courseResults: courseScope.scored
      .slice(0, hybridLectureRagConfig.courseTopK)
      .map(normalizeRetrievedChunk),
  }
}

export async function runHybridLectureRag(query: RagQuery): Promise<RagResult> {
  const startedAt = performance.now()
  const requestId = randomUUID()
  const profile = buildQueryProfile(query.prompt)
  const [lectureScope, courseScope] = await Promise.all([
    scoreScope(profile, query.context.courseId, query.context.lectureId, 'lecture'),
    scoreScope(profile, query.context.courseId, query.context.lectureId, 'course'),
  ])

  const fallbackUsed = lectureScope.scored.length === 0
  const selected = diversifyUnits(fallbackUsed ? courseScope.scored : lectureScope.scored)
  const synthesized = synthesizeAnswer(profile, selected, fallbackUsed)
  const cited = selected.filter((entry) => synthesized.citedIds.includes(entry.unit.id))
  const durationMs = Math.round(performance.now() - startedAt)

  return {
    answer: synthesized.answer,
    citations: cited.map(({ unit }) => ({
      chunkId: unit.id,
      sourceType: unit.sourceType,
      sourceName: unit.sourceName,
      section: unit.section,
      lectureId: unit.lectureId,
      lectureTitle: unit.lectureTitle,
      page: unit.page,
      timestamp: unit.timestamp,
    })),
    retrievedChunks: cited.map(normalizeRetrievedChunk),
    fallbackUsed,
    diagnostics: {
      requestId,
      durationMs,
      lectureCandidates: lectureScope.scored.length,
      courseCandidates: courseScope.scored.length,
      lectureTopScore:
        lectureScope.scored.length > 0 ? Number(lectureScope.scored[0].score.toFixed(3)) : null,
      courseTopScore:
        courseScope.scored.length > 0 ? Number(courseScope.scored[0].score.toFixed(3)) : null,
    },
  }
}
