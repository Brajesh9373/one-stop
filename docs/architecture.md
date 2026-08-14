# OneStop: Comprehensive System Architecture & Topologies

OneStop is an advanced academic knowledge orchestration prototype. It is fundamentally engineered around a single, highly constrained principle: **All generative responses must be bounded by explicit academic scopes (Subject, Module, or Lecture) and trace back to identifiable faculty source materials.**

This document provides a deep, technical breakdown of the system architectures, database topologies, integration layers, and RAG design.

---

## 1. Core Architectural Philosophy: The "RAG System" vs "RAG Model"

Most conventional AI wrappers use a "flat" RAG model. A student asks a question, and the system searches an entire organization's vector database, finding semantically similar text, sometimes hallucinating across multiple courses. 

OneStop rejects this. OneStop implements a **Strictly Bounded RAG System**.

Every chunk of knowledge ingested into the system is statically bound to an academic entity in the SQL schema:
- `subject_id`
- `module_id`
- `lecture_id`

When a student queries the system while viewing "Lecture 8: Trees & Graphs", the Hybrid Retriever (`lib/rag/hybrid.ts`) applies a hard SQL `WHERE lecture_id = '...'` filter. If the answer is not in Lecture 8, the system will explicitly alert the student, and only then (if authorized) expand the scope to the `subject_id`.

---

## 2. System Topologies & Layers

The codebase is split into four distinct layers mapped to specific directories:

### 2.1 The Academic Domain Model (`lib/academic`)
This layer handles the core relational logic of the university.
- **`lib/academic/repository.ts`**: The primary data access layer. It uses `better-sqlite3` running in WAL (Write-Ahead Logging) mode. 
- **Core Entities**:
  - `users` (Roles: `student`, `teacher`, `super-admin`)
  - `subjects` (Courses)
  - `subject_enrollments` (M2M mapping)
  - `modules` (Units within a subject)
  - `lectures` (The primary granular binding for RAG)
  - `lecture_sessions` (Live or asynchronous study sessions)
  - `student_doubts` (Tracked Q&A interactions)

### 2.2 Faculty Connectors & Ingestion (`lib/connectors`)
The ingestion pipeline is designed to eliminate friction for faculty.
- **Connectors**:
  - `Google Drive`: Scans target folders recursively for academic materials.
  - `Google Classroom`: Pulls announcements, rubrics, and stream posts.
- **Normalization Pipeline**: Unstructured data (PDFs, PPTs) are passed through `officeparser` to strip binary formatting. The text is chunked (overlapping semantic boundaries) and stamped with the exact academic metadata (`institution_id`, `faculty_id`, `course_id`, `lecture_id`) before being handed to the RAG service.

### 2.3 The RAG Engine Shared Service (`lib/rag`)
The RAG Engine operates entirely independently from the UI modalities. It utilizes a dual-store topology:
- **Relational Storage (SQLite)**: Stores the raw chunk text, token counts, and the critical hierarchical metadata. Enables lightning-fast exact-match filtering (BM25 sparse).
- **Vector Storage (FAISS)**: Stores the dense embeddings.
  - *Python Integration*: Since FAISS is natively C++/Python, OneStop wraps a local Python environment (`scripts/rag_faiss.py`). `lib/rag/faiss.ts` spawns `node:child_process` executions passing JSON payloads and fetching matches.
- **Hybrid Retrieval (`lib/rag/hybrid.ts`)**: Implements **Reciprocal Rank Fusion (RRF)**. It combines the FAISS vector similarity score with the SQLite FTS sparse score. It additionally applies custom weights:
  - `lexicalCoverage`: Exact token overlap.
  - `metadataCoverage`: Token overlap with structural metadata (titles/topics).
  - `repeatedSourcePenalty`: Iteratively penalizes chunks from the exact same source to force contextual diversity.

### 2.4 Modality Orchestration (`lib/call`, `app/page.tsx`)
Because the RAG engine is an independent service, OneStop exposes it through multiple modalities effortlessly.

#### A. The Chat Modality
A standard Next.js App Router implementation (`app/page.tsx`). The frontend dispatches a prompt to a server action, which invokes `runHybridLectureRag`. The UI parses the returning `citations` array into visual badges mapped directly to `chunk_id` and `source_name`.

#### B. The Voice & Telephony Modality (`lib/call`)
A complex, real-time telephony streaming integration.
- **Twilio Transport**: Initiates PSTN outbound calls. Twilio executes TwiML specifying a `<Stream>` instruction, which opens a bidirectional WebSocket to the Next.js backend (`/api/call/twilio/inbound`).
- **Sarvam AI Processing**: 
  - The backend buffers incoming 8kHz mulaw audio bytes and pipes them to Sarvam's Speech-to-Text (`saaras:v4`).
  - Sarvam handles mixed-language transcription (e.g., Hindi/English).
- **Localization Bridge**: 
  - If the prompt is non-English, `translateTextBetweenSarvam` converts it to `en-IN` to maximize embedding similarity within the English-indexed FAISS database.
- **RAG Invocation**: The translated prompt queries `runHybridLectureRag`.
- **Audio Synthesis**: The generated English answer is optionally translated back, then synthesized via Sarvam Text-to-Speech (`bulbul:v3`).
- **Playback**: The synthesized bytes are streamed down the Twilio WebSocket to the student's phone.

#### C. The Faculty Administrative Voice Assistant
While students use voice to retrieve academic knowledge, Faculty use voice to *control the system*.
The Faculty dashboard features a microphone orb. Tapping it invokes the Sarvam STT pipeline, but routes the transcribed prompt to a high-privileged Tool-Calling LLM. This LLM doesn't search lecture notes—it executes system actions (e.g., calling `syncConnectorDocuments` in `lib/connectors/service.ts`, updating `subjects` rows in SQLite, etc.).

---

## 3. Technology Stack Specifics

- **Core Framework**: Next.js 16.3 (React 19, App Router)
- **Database Engine**: `better-sqlite3` (WAL Mode enabled for high-concurrency read/writes).
- **Vector Engine**: FAISS (Facebook AI Similarity Search) via local Python interop.
- **Telephony & Realtime Media**: Twilio API & WebSockets.
- **Voice Intelligence**: Sarvam AI (`saaras:v4` STT, `bulbul:v3` TTS, `sarvam-translate:v1`).
- **Styling & UI**: Tailwind CSS v4, custom CSS-based orb animations (`tw-animate-css`).
