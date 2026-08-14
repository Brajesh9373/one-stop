import { config } from 'dotenv'; config()
import { synthesizeSpeechWithSarvam, transcribeSpeechWithSarvam } from '../lib/call/sarvam'
import { getSarvamConfig } from '../lib/call/config'

async function main() {
  try {
    console.log("1. Synthesizing audio...")
    const tts = await synthesizeSpeechWithSarvam({
      text: "Hello, this is a test of the speech to text system.",
      languageCode: "en-IN"
    })
    console.log("Generated audio size:", tts.audioBuffer.length, "mime:", tts.mimeType)

    console.log("2. Transcribing with config model...")
    const stt = await transcribeSpeechWithSarvam({
      audio: tts.audioBuffer,
      filename: "test.wav",
      contentType: tts.mimeType,
      languageCode: "en-IN"
    })
    console.log("STT Result:", stt)

    console.log("3. Transcribing with 'unknown' language")
    const sttUnknown = await transcribeSpeechWithSarvam({
      audio: tts.audioBuffer,
      filename: "test.wav",
      contentType: tts.mimeType,
      languageCode: "unknown" // This is what the route does currently
    })
    console.log("STT Unknown Result:", sttUnknown)

  } catch (err) {
    console.error("Error:", err.message)
  }
}
main()
