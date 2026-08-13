const EMBEDDING_DIMENSION = 128

function hashToken(token: string) {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function getEmbeddingDimension() {
  return EMBEDDING_DIMENSION
}

export function embedText(value: string) {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0)
  const tokens = tokenize(value)

  for (const token of tokens) {
    const hashed = hashToken(token)
    const position = hashed % EMBEDDING_DIMENSION
    const sign = hashed % 2 === 0 ? 1 : -1
    vector[position] += sign
  }

  const norm = Math.sqrt(vector.reduce((sum, entry) => sum + entry * entry, 0))
  if (norm === 0) return vector

  return vector.map((entry) => entry / norm)
}
