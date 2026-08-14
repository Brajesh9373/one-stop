type SarvamLanguageConfig = {
  languageCode: string
  speaker: string
}

const DEVANAGARI_RANGE = /[\u0900-\u097F]/
const BENGALI_RANGE = /[\u0980-\u09FF]/
const GURMUKHI_RANGE = /[\u0A00-\u0A7F]/
const GUJARATI_RANGE = /[\u0A80-\u0AFF]/
const ODIA_RANGE = /[\u0B00-\u0B7F]/
const TAMIL_RANGE = /[\u0B80-\u0BFF]/
const TELUGU_RANGE = /[\u0C00-\u0C7F]/
const KANNADA_RANGE = /[\u0C80-\u0CFF]/
const MALAYALAM_RANGE = /[\u0D00-\u0D7F]/

const MARATHI_HINTS = [
  'आहे',
  'आहेत',
  'मराठी',
  'तुम्ही',
  'तुला',
  'समजावून',
  'सांगतो',
  'सांगते',
  'कारण',
  'झाले',
  'काय',
]

const HINDI_HINTS = [
  'है',
  'हैं',
  'हिंदी',
  'आप',
  'समझ',
  'क्यों',
  'कृपया',
  'बताइए',
]

const SUPPORTED_CONFIGS: Record<string, SarvamLanguageConfig> = {
  'en-IN': { languageCode: 'en-IN', speaker: 'ratan' },
  'hi-IN': { languageCode: 'hi-IN', speaker: 'shubh' },
  'mr-IN': { languageCode: 'mr-IN', speaker: 'ratan' },
  'bn-IN': { languageCode: 'bn-IN', speaker: 'rehan' },
  'ta-IN': { languageCode: 'ta-IN', speaker: 'ratan' },
  'te-IN': { languageCode: 'te-IN', speaker: 'ratan' },
  'kn-IN': { languageCode: 'kn-IN', speaker: 'ratan' },
  'ml-IN': { languageCode: 'ml-IN', speaker: 'shubh' },
  'gu-IN': { languageCode: 'gu-IN', speaker: 'ratan' },
  'pa-IN': { languageCode: 'pa-IN', speaker: 'mani' },
  'od-IN': { languageCode: 'od-IN', speaker: 'shubh' },
}

function containsAny(text: string, hints: string[]) {
  return hints.some((hint) => text.includes(hint))
}

export function detectSarvamLanguageConfig(text: string): SarvamLanguageConfig | null {
  const normalized = text.trim()
  if (!normalized) return null
  const lower = normalized.toLowerCase()

  if (lower.includes('marathi') || lower.includes('मराठी')) return SUPPORTED_CONFIGS['mr-IN']
  if (lower.includes('hindi') || lower.includes('हिंदी')) return SUPPORTED_CONFIGS['hi-IN']
  if (lower.includes('bengali') || lower.includes('bangla')) return SUPPORTED_CONFIGS['bn-IN']
  if (lower.includes('tamil')) return SUPPORTED_CONFIGS['ta-IN']
  if (lower.includes('telugu')) return SUPPORTED_CONFIGS['te-IN']
  if (lower.includes('kannada')) return SUPPORTED_CONFIGS['kn-IN']
  if (lower.includes('malayalam')) return SUPPORTED_CONFIGS['ml-IN']
  if (lower.includes('gujarati')) return SUPPORTED_CONFIGS['gu-IN']
  if (lower.includes('punjabi')) return SUPPORTED_CONFIGS['pa-IN']
  if (lower.includes('odia') || lower.includes('oriya')) return SUPPORTED_CONFIGS['od-IN']

  if (TAMIL_RANGE.test(normalized)) return SUPPORTED_CONFIGS['ta-IN']
  if (TELUGU_RANGE.test(normalized)) return SUPPORTED_CONFIGS['te-IN']
  if (KANNADA_RANGE.test(normalized)) return SUPPORTED_CONFIGS['kn-IN']
  if (MALAYALAM_RANGE.test(normalized)) return SUPPORTED_CONFIGS['ml-IN']
  if (BENGALI_RANGE.test(normalized)) return SUPPORTED_CONFIGS['bn-IN']
  if (GUJARATI_RANGE.test(normalized)) return SUPPORTED_CONFIGS['gu-IN']
  if (GURMUKHI_RANGE.test(normalized)) return SUPPORTED_CONFIGS['pa-IN']
  if (ODIA_RANGE.test(normalized)) return SUPPORTED_CONFIGS['od-IN']

  if (DEVANAGARI_RANGE.test(normalized)) {
    if (containsAny(normalized, MARATHI_HINTS)) return SUPPORTED_CONFIGS['mr-IN']
    if (containsAny(normalized, HINDI_HINTS)) return SUPPORTED_CONFIGS['hi-IN']

    // Devanagari defaults to Marathi for this product because students explicitly asked for Marathi support.
    return SUPPORTED_CONFIGS['mr-IN']
  }

  if (/^[\p{Script=Latin}\p{Number}\p{Punctuation}\s]+$/u.test(normalized)) {
    return SUPPORTED_CONFIGS['en-IN']
  }

  return null
}
