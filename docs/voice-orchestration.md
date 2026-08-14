# Voice & Telephony Orchestration (`lib/call`)

OneStop offers a highly localized, low-latency voice orchestration layer that seamlessly connects physical telephony and browser audio to the internal RAG Engine.

The system utilizes two distinct voice transports depending on the student's context:

---

## 1. The Twilio PSTN Transport

When a student initiates an outbound phone call, the system leverages Twilio to dial their physical phone number over PSTN.

### The Topology
- **Initiation (`/api/call/outbound`)**: The frontend dispatches a POST request with the student's `phoneNumber` and `lecture_id`. The backend invokes `createTwilioOutboundLectureCall` to trigger the Twilio Node SDK.
- **TwiML Generation**: Twilio connects the call and requests instructions from `/api/call/twilio/voice`.
- **Speech-to-Text (STT)**: Instead of raw WebSocket streaming, the system utilizes Twilio's native `<Gather input="speech">` TwiML verb. Twilio captures the student's speech and transcribes it, sending the resulting text payload to `/api/call/twilio/respond`.
- **RAG Invocation**: The webhook extracts the text and passes it to `runHybridLectureRag(query, lecture_id)`.
- **Sarvam TTS Synthesis**: The generated English text is translated into the target language using Sarvam and appended to a dynamic audio URL: `/api/call/sarvam/audio?text=...`
- **Playback**: Twilio executes a `<Play>` verb hitting the Sarvam audio endpoint, which dynamically synthesizes and streams the spoken audio (`bulbul:v3` TTS model, `shubh` speaker profile) back down the phone line.

---

## 2. The Browser Voice Transport

When a student or faculty member interacts via the web dashboard's microphone orb, the system completely bypasses Twilio, operating as a direct Sarvam integration.

### The Topology
- **Browser Audio Capture (`wav.ts`)**: The frontend utilizes the `MediaRecorder` API to capture `.webm` or `.wav` audio blobs directly from the user's browser.
- **Form Data Submission**: The blob is submitted to `/api/call/sarvam/turn` along with the `lecture_id` context.
- **Sarvam Speech-to-Text (`saaras:v4`)**: The backend calls `transcribeSpeechWithSarvam`, feeding the audio buffer directly to Sarvam AI. This ensures high-fidelity Indian-language transcription without relying on Twilio's STT engine.
- **RAG Invocation**: The transcribed text hits `runHybridLectureRag`.
- **Sarvam Text-to-Speech**: The generated text is passed to `synthesizeSpeechWithSarvam`, which returns raw Base64 audio bytes.
- **Browser Playback**: The Next.js API returns a JSON payload containing the Base64 audio string, which the frontend plays using the native HTML5 `Audio` constructor.

---

## 3. Localization Bridge

Both transport layers utilize the **Sarvam Localization Bridge** (`lib/call/language.ts` and `translateTextBetweenSarvam`).

Since the FAISS vector database and SQLite text chunks are fundamentally indexed in English, regional language queries (e.g., Hindi `hi-IN`) will result in poor semantic retrieval.
To fix this, the Voice Orchestration layer:
1. Detects the language of the transcribed prompt.
2. If non-English, seamlessly translates the query to `en-IN` before hitting the RAG engine.
3. Retrieves English text chunks and generates an English answer.
4. Translates the English answer back to the original regional language.
5. Passes the localized text to the Sarvam TTS engine.

---

## 4. The Faculty AI Voice Assistant

While students use these voice transports to ask academic questions, the **Faculty Voice Assistant** intercepts the transcription *before* hitting the Academic RAG Engine.

Instead, the transcript is routed to an administrative, tool-calling LLM. This LLM doesn't retrieve lecture notes—it executes system actions (e.g., calling `syncConnectorDocuments` in `lib/connectors/service.ts`, updating `subjects` rows in SQLite, or managing user enrollments). It operates as a comprehensive, voice-driven control plane for the OneStop database.
