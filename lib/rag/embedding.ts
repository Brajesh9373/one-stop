import type { EmbeddingProvider } from '@/lib/rag/types'

const LOCAL_DIMENSION = 384

function configuredProvider(): EmbeddingProvider {
  return process.env.RAG_EMBEDDING_PROVIDER === 'openai-compatible'
    ? 'openai-compatible'
    : 'local'
}

export function getEmbeddingProvider() {
  return configuredProvider()
}

export function getEmbeddingDimension() {
  if (configuredProvider() === 'openai-compatible') {
    const dimension = Number(process.env.RAG_EMBEDDING_DIMENSION)
    return Number.isInteger(dimension) && dimension > 0 ? dimension : 1536
  }
  return LOCAL_DIMENSION
}

export function getEmbeddingFingerprint() {
  return `${configuredProvider()}:${process.env.RAG_EMBEDDING_MODEL ?? 'multilingual-local-v2'}:${getEmbeddingDimension()}`
}

function hashFeature(feature: string) {
  let hash = 2166136261
  for (const character of feature) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return norm > 0 ? vector.map((value) => value / norm) : vector
}

function localEmbedding(value: string) {
  const dimension = getEmbeddingDimension()
  const vector = new Array<number>(dimension).fill(0)
  const normalized = value.normalize('NFKC').toLocaleLowerCase()
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? []
  const features = [...words]

  for (const word of words) {
    const padded = `^${word}$`
    for (let index = 0; index <= padded.length - 3; index += 1) {
      features.push(padded.slice(index, index + 3))
    }
  }

  for (const feature of features) {
    const hash = hashFeature(feature)
    vector[hash % dimension] += (hash & 1) === 0 ? 1 : -1
  }
  return normalizeVector(vector)
}

async function remoteEmbeddings(values: string[]) {
  const apiKey = process.env.RAG_EMBEDDING_API_KEY
  const baseUrl = (process.env.RAG_EMBEDDING_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.RAG_EMBEDDING_MODEL
  if (!apiKey || !model) {
    throw new Error('RAG_EMBEDDING_API_KEY and RAG_EMBEDDING_MODEL are required for openai-compatible embeddings.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.RAG_PROVIDER_TIMEOUT_MS) || 30000)
  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: values, model, dimensions: getEmbeddingDimension() }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Embedding provider failed with HTTP ${response.status}.`)
    const payload = (await response.json()) as { data?: Array<{ index: number; embedding: number[] }> }
    const ordered = [...(payload.data ?? [])].sort((left, right) => left.index - right.index)
    if (ordered.length !== values.length || ordered.some((entry) => entry.embedding.length !== getEmbeddingDimension())) {
      throw new Error('Embedding provider returned an invalid vector batch.')
    }
    return ordered.map((entry) => normalizeVector(entry.embedding))
  } finally {
    clearTimeout(timeout)
  }
}

export async function embedTexts(values: string[]) {
  if (values.length === 0) return []
  return configuredProvider() === 'openai-compatible'
    ? remoteEmbeddings(values)
    : values.map(localEmbedding)
}

export async function embedText(value: string) {
  return (await embedTexts([value]))[0]
}
