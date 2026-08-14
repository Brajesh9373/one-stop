# The Hybrid RAG Engine Deep Dive (`lib/rag`)

The OneStop RAG engine (`runHybridLectureRag`) is a highly tuned, deterministically bounded retrieval system. Unlike generic vector stores that return answers based solely on semantic distance, OneStop leverages a strict Reciprocal Rank Fusion (RRF) algorithm to mathematically weigh semantics against relational hierarchy and lexical coverage.

---

## 1. Dual-Store Topology

The knowledge base avoids the pitfalls of monolithic vector databases by explicitly separating semantics from source-of-truth metadata.

### A. The Vector Index (`data/rag/faiss.index`)
- **Engine**: FAISS (Facebook AI Similarity Search) running via local Python interop.
- **Responsibility**: Purely dense vector similarities (`denseScore`).
- **Data**: A flat map of 768-dimensional embeddings to integer IDs.

### B. The Relational Store (`data/rag/rag.db`)
- **Engine**: SQLite (`better-sqlite3`) utilizing FTS5 (Full-Text Search).
- **Responsibility**: Hard bounding, metadata retrieval, and sparse scoring (`sparseScore`).
- **Schema Mapping**: Every semantic chunk is statically linked to its hierarchical origin (`institutionId`, `courseId`, `lectureId`, `sourceName`, `section`).

---

## 2. The Retrieval Algorithm: Reciprocal Rank Fusion (RRF)

When a query arrives, it is processed through a strict pipeline defined in `lib/rag/hybrid.ts`.

### Step 1: Query Profiling & Language Localization
- The query passes through `buildQueryProfile()`.
- **Localization**: Sarvam API detects the language. If the language is regional (e.g., Hindi `hi-IN`), it executes `translateTextBetweenSarvam` to convert the query into English. This maximizes dense retrieval hit rates within the English-indexed FAISS database.
- **Tokenization**: The prompt is tokenized to establish a `lexical` baseline for exact-match scoring.

### Step 2: The Bounded Fetch (`scoreScope`)
The system strictly enforces the `lectureId` boundary. It executes two parallel fetches:
1. **Dense Query**: Hits FAISS to retrieve the top 40 nearest neighbors (limit based on `lectureTopK * 5`).
2. **Sparse Query**: Hits SQLite FTS5 for the top 40 keyword matches.

*Note: If `isSubjectScope` is explicitly authorized by the context, it fetches from the broader `courseId` boundary.*

### Step 3: The Fusion Scoring Math
The engine merges the dense and sparse candidate arrays. Each candidate is assigned a composite score using predefined algorithmic weights from `lib/rag/config.ts`:

- **Dense Weight (0.46)**: Cosine similarity + FAISS RRF rank.
- **Sparse Weight (0.34)**: SQLite FTS5 RRF rank.
- **Lexical Coverage (0.14)**: Exact token overlap ratio between the query and the chunk text.
- **Metadata Coverage (0.06)**: Exact token overlap between the query and the chunk's `topic`, `section`, and `lectureTitle`.

#### Source Type Multipliers
To prioritize high-signal academic materials over generic textbooks, the score is mathematically multiplied by a `sourceTypeBoost`:
- **Faculty Notes**: `1.08x` multiplier
- **Lecture Transcripts**: `1.04x` multiplier
- **Presentation Slides**: `1.0x` (baseline)
- **Generic PDF Readings**: `0.96x` (penalized)

#### Boundary Boosts
If the query falls back to a broader scope, the penalty is applied mathematically:
- `lectureScopeBoost`: `1.12x` (Rewards exact lecture matches)
- `courseScopeBoost`: `0.88x` (Penalizes falling back to the wider course)

### Step 4: Diversification & Penalty (`diversify`)
To prevent the LLM from generating repetitive answers derived from 5 identical paragraphs across different slides, OneStop enforces a **Repeated Source Penalty**:
- The engine scans the top-K list.
- If it detects semantic overlap `> 0.78` (`duplicateEvidenceThreshold`) between two selected chunks, or if it sees the same `sourceId` repeatedly, it subtracts `0.08` (`repeatedSourcePenalty`) from the candidate's score.
- This forces the final evidence array to pull from diverse sources (e.g., pulling from both the transcript and the slide notes simultaneously).

---

## 3. Extractive Grounded Generation

The top 5 (`finalTopK`) diversified candidates that exceed the `minScoreThreshold` (0.18) are concatenated into an extractive generation prompt. 

**Zero-Hallucination Fallback**:
If the score thresholds are not met, the engine intercepts the prompt before hitting the LLM and forces a graceful abort: 
> *"I couldn't find enough evidence in the selected academic context to answer safely. Add or sync relevant notes, or ask a question covered by this lecture."*

### UI Citations
Because every sentence was tracked through the dual-store RRF pipeline, the final payload includes an array of `citations`. The UI iterates over these citations, generating the clickable badges that link the AI's answer directly back to the faculty's original Google Drive/Classroom document.
