<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# OneStop Agent Guide

## Product Intent

OneStop is an academic workspace for faculty and students.

- Faculty connect external academic tools such as Google Drive and Google Classroom.
- Faculty content is organized course by course and lecture by lecture.
- Students open a selected lecture and interact with lecture-grounded AI through three experiences:
  - `chat`
  - `call`
  - `virtual classroom`

The most important system rule is:

`All student-facing AI responses must be grounded in the selected lecture context first.`

## Current Frontend State

The current app is a frontend prototype.

- Main UI is in `app/page.tsx`.
- Styling/theme is in `app/globals.css`.
- Views such as login, dashboard, classroom, chat, call, analytics, and profile are currently local-state driven.
- `call` and `virtual classroom` are prototypes only and are not connected to a real backend yet.

Do not treat current UI text as a finalized backend contract.

## Core Architecture Direction

Agents working in this repo should assume the system will evolve in this order:

1. Faculty connectors
2. Content ingestion and normalization
3. Lecture-aware indexing
4. Shared RAG service
5. Student experiences built on top of that RAG layer

Do not build `chat`, `call`, and `virtual classroom` as three separate knowledge systems.

They should share one retrieval foundation and differ only in experience/orchestration.

## Source Systems

Expected faculty-connected systems include:

- Google Drive
- Google Classroom
- Lecture notes
- PDFs
- Slides
- Lecture transcripts
- Assignments or reference material

Assume content may arrive in inconsistent formats. Ingestion work should normalize this instead of pushing format complexity into the student-facing layer.

## Retrieval Boundary

The primary retrieval boundary is `lecture`.

When a student selects a lecture, the system should:

1. Filter and prioritize content from that exact lecture.
2. Optionally expand to broader course context only when needed.
3. Preserve source attribution.
4. Avoid answering from unrelated lectures unless the product explicitly allows it.

Any retrieval design that ignores lecture scoping is likely incorrect for this project.

## Recommended Knowledge Model

When creating schemas, chunk metadata, APIs, or storage models, prefer fields like:

- `institution_id`
- `faculty_id`
- `course_id`
- `course_name`
- `lecture_id`
- `lecture_title`
- `lecture_sequence`
- `week`
- `topic`
- `source_id`
- `source_type`
- `source_name`
- `chunk_id`
- `visibility`
- `version`
- `uploaded_at`

This metadata is not optional decoration. It is necessary for filtering, ranking, permissions, and traceability.

## RAG Expectations

When implementing the RAG system, optimize for:

- lecture-level grounding
- strong metadata filtering
- citation/source traceability
- low hallucination risk
- reusable retrieval across all three student modes

Do not describe this as a single “RAG model.” Treat it as a `RAG system` with:

- connectors
- ingestion
- parsing
- chunking
- embeddings
- indexing
- retrieval
- reranking
- answer generation

## Experience Layer Rules

All three student experiences should reuse the same academic context layer:

- `chat`
  - Returns grounded text responses with visible sources.
- `call`
  - Uses the same retrieval stack, but delivered through voice or realtime interaction.
- `virtual classroom`
  - Uses the same retrieval stack, potentially with collaborative or multi-agent orchestration.

If retrieval quality is weak in `chat`, do not proceed as if `call` or `virtual classroom` are production-ready.

## Priority Order For Implementation

Prefer this order unless the user explicitly asks otherwise:

1. Data model
2. Connector design
3. Ingestion pipeline
4. Chunking and metadata strategy
5. Retrieval and reranking
6. Chat backend
7. Call backend
8. Virtual classroom orchestration
9. UI integration

The `chat` path is the first serious proving ground for the knowledge system.

## Backend Design Principles

- Keep ingestion and retrieval separate.
- Keep lecture metadata explicit, not inferred ad hoc at query time.
- Build for source traceability from day one.
- Prefer composable services over hardcoded monolith flows.
- Keep permissions in mind: students should only retrieve content they are allowed to access.
- Treat lecture completion and lecture selection as important query inputs.

## Frontend Integration Principles

When wiring the frontend to the backend:

- The selected lecture should be passed explicitly to the AI layer.
- Do not let chat/call/classroom operate with ambiguous context.
- UI should make the active lecture context visible to the student.
- Responses should expose enough source information for trust and auditability.

## What Future Agents Should Avoid

- Do not implement AI features as generic course-wide chat without lecture filters.
- Do not tightly couple connector logic to UI components.
- Do not build separate duplicated retrieval logic for chat and call.
- Do not optimize visual polish ahead of knowledge correctness for these features.
- Do not assume the current prototype copy reflects final database or API names.

## Preferred Near-Term Deliverables

Good next deliverables in this repo include:

- a dedicated backend architecture document
- lecture/content data models
- connector interfaces
- ingestion pipeline skeletons
- chunking and metadata specs
- retrieval API contracts
- frontend-to-backend context contracts for selected lecture flows

## Working Rule For Agents

If a future task touches student AI interactions, always ask:

`What is the selected lecture, and how does the system guarantee lecture-grounded retrieval?`

If that question is not answered by the implementation, the implementation is incomplete.
