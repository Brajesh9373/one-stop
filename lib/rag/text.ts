const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'what', 'when', 'which', 'why', 'with', 'you',
  'का', 'की', 'के', 'है', 'और', 'में', 'से', 'को', 'क्या', 'क्यों', 'कैसे',
  'आहे', 'आणि', 'मध्ये', 'काय', 'का', 'कसे', 'चे', 'ची', 'चा',
])

export function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function tokenize(value: string) {
  return (normalizeText(value).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

export function splitSentences(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return []

  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    return Array.from(segmenter.segment(normalized), ({ segment }) => segment.trim()).filter(Boolean)
  } catch {
    return normalized.split(/(?<=[.!?।])\s+/u).map((entry) => entry.trim()).filter(Boolean)
  }
}
