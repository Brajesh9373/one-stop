import { SarvamAIClient, SarvamAIError, type SarvamAI } from 'sarvamai'

import { getSarvamConfig } from '@/lib/call/config'
import { detectSarvamLanguageConfig } from '@/lib/call/language'

type SynthesizeInput = {
  text: string
  languageCode?: string
  sampleRate?: number
  speaker?: string
}

type TranscribeInput = {
  audio: Buffer
  filename: string
  contentType: string
  languageCode?: string
}

let client: SarvamAIClient | null = null

const TTS_LANGUAGES = new Set([
  'bn-IN',
  'en-IN',
  'gu-IN',
  'hi-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'od-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
])

function getClient() {
  const config = getSarvamConfig()
  if (!client) {
    client = new SarvamAIClient({
      apiSubscriptionKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutInSeconds: config.timeoutInSeconds,
      maxRetries: config.maxRetries,
    })
  }
  return client
}

function normalizeSarvamError(error: unknown) {
  if (error instanceof SarvamAIError) {
    return `Sarvam SDK request failed (${error.statusCode ?? 'unknown'}): ${error.message}`
  }

  return error instanceof Error ? error.message : 'Sarvam SDK request failed.'
}

function asTtsLanguage(value: string) {
  return value as SarvamAI.TextToSpeechLanguage
}

function asTtsSpeaker(value: string) {
  return value as SarvamAI.TextToSpeechSpeaker
}

function asTtsModel(value: string) {
  return value as SarvamAI.TextToSpeechModel
}

function asSttLanguage(value: string) {
  return value as SarvamAI.SpeechToTextLanguage
}

function asSttModel(value: string) {
  return value as SarvamAI.SpeechToTextModel
}

function asTranslateSource(value: string) {
  return value as SarvamAI.TranslateSourceLanguage
}

function asTranslateTarget(value: string) {
  return value as SarvamAI.TranslateTargetLanguage
}

function asTranslateModel(value: string) {
  return value as SarvamAI.TranslateModel
}

export function resolveSpeechLanguage(text: string, fallback?: string) {
  const languageCode = detectSarvamLanguageConfig(text)?.languageCode ?? fallback ?? getSarvamConfig().languageCode
  return TTS_LANGUAGES.has(languageCode) ? languageCode : getSarvamConfig().languageCode
}

export async function synthesizeSpeechWithSarvam(input: SynthesizeInput) {
  const config = getSarvamConfig()
  const languageCode = input.languageCode ?? resolveSpeechLanguage(input.text, config.languageCode)
  const detected = detectSarvamLanguageConfig(input.text)
  const speaker = input.speaker ?? detected?.speaker ?? config.speaker

  try {
    const response = await getClient().textToSpeech.convert({
      text: input.text.slice(0, 2400),
      language_code: asTtsLanguage(languageCode),
      speaker: asTtsSpeaker(speaker),
      speech_sample_rate: input.sampleRate ?? 24000,
      model: asTtsModel(config.model),
      output_audio_codec: 'wav',
      pace: config.pace,
      temperature: config.temperature,
    })
    const audioBase64 = response.audios[0]
    if (!audioBase64) throw new Error('Sarvam TTS response did not include audio.')

    return {
      requestId: response.request_id ?? null,
      audioBase64,
      audioBuffer: Buffer.from(audioBase64, 'base64'),
      mimeType: 'audio/wav',
      languageCode,
      speaker,
    }
  } catch (error) {
    throw new Error(normalizeSarvamError(error))
  }
}

export async function transcribeSpeechWithSarvam(input: TranscribeInput) {
  const config = getSarvamConfig()

  try {
    const response = await getClient().speechToText.transcribe({
      file: {
        data: input.audio,
        filename: input.filename,
        contentType: input.contentType,
        contentLength: input.audio.length,
      },
      model: asSttModel(config.sttModel),
      language_code: asSttLanguage(input.languageCode ?? 'unknown'),
      with_timestamps: false,
    })

    return {
      requestId: response.request_id ?? null,
      transcript: response.transcript.trim(),
      languageCode: response.language_code ?? input.languageCode ?? 'unknown',
      languageProbability: response.language_probability ?? null,
    }
  } catch (error) {
    throw new Error(normalizeSarvamError(error))
  }
}

export async function translateTextWithSarvam(text: string, targetLanguageCode: string) {
  if (!text.trim() || targetLanguageCode === 'en-IN') return text
  const config = getSarvamConfig()

  try {
    const response = await getClient().text.translate({
      input: text.slice(0, 1900),
      source_language_code: asTranslateSource('en-IN'),
      target_language_code: asTranslateTarget(targetLanguageCode),
      model: asTranslateModel(config.translateModel),
      mode: 'formal',
    })

    return response.translated_text.trim() || text
  } catch (error) {
    throw new Error(normalizeSarvamError(error))
  }
}
