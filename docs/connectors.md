# Faculty Connectors & Data Ingestion (`lib/connectors`)

The Connectors layer resolves the structural friction between raw, unstructured faculty teaching materials and the rigid, metadata-bound RAG engine. Faculty maintain their normal workflow (uploading PDFs/Slides to Google Drive or Classroom), and the system autonomously synchronizes, extracts, and chunks these materials into the `lib/rag` engine.

## 1. Pluggable Service Architecture

The system abstracts external systems into a strict `FacultyConnector` TypeScript interface (`lib/connectors/types.ts`). Connectors are registered in a Map inside `service.ts` and dynamically invoked via `syncConnectorDocuments`.

### A. Google Drive Connector (`google.ts`)
- **Authentication**: Utilizes OAuth 2.0. Requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a `GOOGLE_REFRESH_TOKEN` (which can be overridden per faculty member via `GOOGLE_REFRESH_TOKEN_<FACULTY_ID>`).
- **Traversal**: Uses the Google Drive v3 API. Given a `GOOGLE_DRIVE_FOLDER_ID`, it queries `files` iteratively using `pageToken`, explicitly excluding trashed items and folders.
- **Dynamic Mime Mapping**: Natively handles Google Workspace proprietary formats. If a file is `application/vnd.google-apps.presentation` (Google Slides), the connector dynamically modifies the `/v3/files/export` URL to request an `application/vnd.openxmlformats-officedocument.presentationml.presentation` (.pptx) byte stream buffer.

### B. Google Classroom Connector (`google.ts`)
- **API Strategy**: Hits the `v1/courses/{courseId}/courseWorkMaterials` endpoints.
- **Deep Linking**: Iterates through `courseWorkMaterial` items, extracts embedded `driveFile.id` references, and routes those IDs through the same Drive API resolution layer to acquire the underlying binary streams.

## 2. The Extraction & Normalization Pipeline (`extract.ts`)

LLMs and FAISS cannot read binary blobs. `extractDocumentText` handles this translation.

- **Primary Engine (`officeparser`)**: Handles modern formats (`pdf`, `docx`, `pptx`, `xlsx`, `odt`, `epub`, `rtf`). The parser is explicitly configured with `ignoreComments: true` and `ignoreSlideMasters: true` to prevent polluting the RAG context with hidden PowerPoint metadata or speaker notes unless explicitly desired.
- **Fallback Engine (`Apache Tika`)**: For legacy binary formats (e.g., `application/vnd.ms-powerpoint` .ppt) or if `officeparser` encounters a catastrophic AST failure, the pipeline falls back to an external Apache Tika server (configured via `TIKA_URL`). It executes an HTTP PUT stream with an aggressive 60-second AbortController timeout.
- **Sanitization**: Standard `text/html` files are stripped of active `<script>` and `<style>` tags before being passed to the chunker.
- **Validation Check**: If the resulting normalized text string is < 20 characters, the extraction throws a `No usable text` error, flagging to the faculty member that the PDF might be an image scan requiring external OCR.

## 3. Metadata Stamping

The final step before handing the extracted text back to the `service.ts` caller is generating the `FacultySourceDocument`.
This object statically binds the raw extracted text (and its `contentHash` via sha256) to the strict architectural boundaries:
- `institutionId`, `facultyId`, `courseId`, `lectureId`, `lectureSequence`
- `sourceType`: Dynamically inferred from the mime-type (e.g., `presentation` -> `slides`, `.pdf` -> `reading`, `/transcript/i` -> `transcript`).
- `version`: Derived from the Google API `modifiedTime`.

This object is then passed into `lib/rag/ingestion.ts`, where it is sliced into overlapping windows and finally indexed into SQLite and FAISS.
