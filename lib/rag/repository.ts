import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import { embedText, embedTexts, getEmbeddingDimension, getEmbeddingFingerprint } from '@/lib/rag/embedding'
import { rebuildFaissIndex, searchFaissIndex, type FaissSearchHit } from '@/lib/rag/faiss'
import { ingestFacultyDocuments, ingestSentenceUnits } from '@/lib/rag/ingestion'
import { normalizeText, tokenize } from '@/lib/rag/text'
import { ensureRagStorageReady, getRagStoragePaths, readLegacySeedDocuments } from '@/lib/rag/storage'
import type { FacultySourceDocument, LectureChunk, RetrievalScope, SentenceUnit } from '@/lib/rag/types'

type SparseSearchHit = { unitId: string; score: number }
type SearchBoundary = {
  institutionId: string
  courseId: string
  lectureId: string
  scope: RetrievalScope
}

export interface RagRepository {
  listDocuments(): Promise<FacultySourceDocument[]>
  listChunks(): Promise<LectureChunk[]>
  listSentenceUnits(): Promise<SentenceUnit[]>
  listLectureSentenceUnits(institutionId: string, courseId: string, lectureId: string): Promise<SentenceUnit[]>
  listCourseSentenceUnits(institutionId: string, courseId: string, excludedLectureId: string): Promise<SentenceUnit[]>
  getSentenceUnitsByIds(unitIds: string[]): Promise<SentenceUnit[]>
  searchSparse(query: string, boundary: SearchBoundary, topK: number): Promise<SparseSearchHit[]>
  searchDense(query: string, boundary: SearchBoundary, topK: number): Promise<FaissSearchHit[]>
  ingest(documents: FacultySourceDocument[]): Promise<void>
  getHealth(): Promise<Record<string, unknown>>
}

type InitializableRagRepository = RagRepository & { init(): Promise<void> }
type Row = Record<string, unknown>

let repositorySingleton: InitializableRagRepository | undefined
let initPromise: Promise<void> | undefined
let mutationQueue = Promise.resolve()

function toFtsQuery(query: string) {
  const terms = Array.from(new Set(tokenize(query))).slice(0, 24)
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ')
}

function hashContent(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

function mapDocumentRow(row: Row): FacultySourceDocument {
  return {
    id: String(row.id), institutionId: String(row.institution_id), facultyId: String(row.faculty_id),
    courseId: String(row.course_id), courseName: String(row.course_name), lectureId: String(row.lecture_id),
    lectureTitle: String(row.lecture_title), lectureSequence: Number(row.lecture_sequence), topic: String(row.topic),
    sourceType: row.source_type as FacultySourceDocument['sourceType'], sourceName: String(row.source_name),
    section: String(row.section), page: row.page == null ? undefined : Number(row.page),
    timestamp: row.timestamp == null ? undefined : String(row.timestamp),
    mimeType: row.mime_type == null ? undefined : String(row.mime_type),
    sourceUrl: row.source_url == null ? undefined : String(row.source_url),
    externalId: row.external_id == null ? undefined : String(row.external_id),
    connectorType: row.connector_type == null ? undefined : String(row.connector_type),
    visibility: (row.visibility ?? 'students') as FacultySourceDocument['visibility'],
    version: row.version == null ? undefined : String(row.version),
    contentHash: row.content_hash == null ? undefined : String(row.content_hash),
    content: String(row.content), updatedAt: String(row.updated_at),
  }
}

function mapChunkRow(row: Row): LectureChunk {
  return {
    id: String(row.id), institutionId: String(row.institution_id), facultyId: String(row.faculty_id),
    courseId: String(row.course_id), courseName: String(row.course_name), lectureId: String(row.lecture_id),
    lectureTitle: String(row.lecture_title), lectureSequence: Number(row.lecture_sequence), topic: String(row.topic),
    sourceId: String(row.source_id), sourceType: row.source_type as LectureChunk['sourceType'],
    sourceName: String(row.source_name), section: String(row.section), page: row.page == null ? undefined : Number(row.page),
    timestamp: row.timestamp == null ? undefined : String(row.timestamp), chunkIndex: Number(row.chunk_index),
    content: String(row.content), tokenCount: Number(row.token_count), updatedAt: String(row.updated_at),
  }
}

function mapSentenceUnitRow(row: Row): SentenceUnit {
  return {
    id: String(row.id), chunkId: String(row.chunk_id), sourceId: String(row.source_id),
    institutionId: String(row.institution_id), facultyId: String(row.faculty_id), courseId: String(row.course_id),
    courseName: String(row.course_name), lectureId: String(row.lecture_id), lectureTitle: String(row.lecture_title),
    lectureSequence: Number(row.lecture_sequence), topic: String(row.topic),
    sourceType: row.source_type as SentenceUnit['sourceType'], sourceName: String(row.source_name),
    section: String(row.section), page: row.page == null ? undefined : Number(row.page),
    timestamp: row.timestamp == null ? undefined : String(row.timestamp), sentenceIndex: Number(row.sentence_index),
    content: String(row.content), tokenCount: Number(row.token_count), updatedAt: String(row.updated_at),
  }
}

class SqliteFaissRagRepository implements RagRepository {
  private readonly db: DatabaseSync

  constructor() {
    this.db = new DatabaseSync(getRagStoragePaths().sqliteFilePath)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  }

  private addColumn(table: string, column: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!columns.some((entry) => entry.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }

  async init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, faculty_id TEXT NOT NULL, course_id TEXT NOT NULL,
        course_name TEXT NOT NULL, lecture_id TEXT NOT NULL, lecture_title TEXT NOT NULL, lecture_sequence INTEGER NOT NULL,
        topic TEXT NOT NULL, source_type TEXT NOT NULL, source_name TEXT NOT NULL, section TEXT NOT NULL,
        page INTEGER, timestamp TEXT, content TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL, institution_id TEXT NOT NULL, faculty_id TEXT NOT NULL,
        course_id TEXT NOT NULL, course_name TEXT NOT NULL, lecture_id TEXT NOT NULL, lecture_title TEXT NOT NULL,
        lecture_sequence INTEGER NOT NULL, topic TEXT NOT NULL, source_type TEXT NOT NULL, source_name TEXT NOT NULL,
        section TEXT NOT NULL, page INTEGER, timestamp TEXT, chunk_index INTEGER NOT NULL, content TEXT NOT NULL,
        token_count INTEGER NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sentence_units (
        id TEXT PRIMARY KEY, chunk_id TEXT NOT NULL, source_id TEXT NOT NULL, institution_id TEXT NOT NULL,
        faculty_id TEXT NOT NULL, course_id TEXT NOT NULL, course_name TEXT NOT NULL, lecture_id TEXT NOT NULL,
        lecture_title TEXT NOT NULL, lecture_sequence INTEGER NOT NULL, topic TEXT NOT NULL, source_type TEXT NOT NULL,
        source_name TEXT NOT NULL, section TEXT NOT NULL, page INTEGER, timestamp TEXT, sentence_index INTEGER NOT NULL,
        content TEXT NOT NULL, token_count INTEGER NOT NULL, embedding_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS sentence_units_fts USING fts5(
        unit_id UNINDEXED, course_id UNINDEXED, lecture_id UNINDEXED, content, section, topic, source_name, lecture_title
      );
      CREATE TABLE IF NOT EXISTS rag_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_units_lecture ON sentence_units(institution_id, course_id, lecture_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);
    `)
    this.addColumn('documents', 'mime_type', 'TEXT')
    this.addColumn('documents', 'source_url', 'TEXT')
    this.addColumn('documents', 'external_id', 'TEXT')
    this.addColumn('documents', 'connector_type', 'TEXT')
    this.addColumn('documents', 'visibility', "TEXT NOT NULL DEFAULT 'students'")
    this.addColumn('documents', 'version', 'TEXT')
    this.addColumn('documents', 'content_hash', 'TEXT')

    const count = Number((this.db.prepare('SELECT COUNT(*) AS count FROM documents').get() as { count: number }).count)
    if (count === 0) {
      await this.persistDocuments(await readLegacySeedDocuments())
      return
    }

    const fingerprint = this.db.prepare("SELECT value FROM rag_metadata WHERE key = 'embedding_fingerprint'").get() as { value: string } | undefined
    const sample = this.db.prepare('SELECT embedding_json FROM sentence_units LIMIT 1').get() as { embedding_json: string } | undefined
    const sampleDimension = sample ? (JSON.parse(sample.embedding_json) as number[]).length : 0
    if (fingerprint?.value !== getEmbeddingFingerprint() || sampleDimension !== getEmbeddingDimension()) {
      await this.persistDocuments(await this.listDocuments())
    } else {
      await rebuildFaissIndex()
    }
  }

  async listDocuments() {
    return (this.db.prepare('SELECT * FROM documents ORDER BY lecture_sequence, id').all() as Row[]).map(mapDocumentRow)
  }
  async listChunks() {
    return (this.db.prepare('SELECT * FROM chunks ORDER BY lecture_sequence, source_id, chunk_index').all() as Row[]).map(mapChunkRow)
  }
  async listSentenceUnits() {
    return (this.db.prepare('SELECT * FROM sentence_units ORDER BY lecture_sequence, source_id, chunk_id, sentence_index').all() as Row[]).map(mapSentenceUnitRow)
  }
  async listLectureSentenceUnits(institutionId: string, courseId: string, lectureId: string) {
    return (this.db.prepare('SELECT * FROM sentence_units WHERE institution_id = ? AND course_id = ? AND lecture_id = ? ORDER BY source_id, chunk_id, sentence_index').all(institutionId, courseId, lectureId) as Row[]).map(mapSentenceUnitRow)
  }
  async listCourseSentenceUnits(institutionId: string, courseId: string, excludedLectureId: string) {
    return (this.db.prepare('SELECT * FROM sentence_units WHERE institution_id = ? AND course_id = ? AND lecture_id != ? ORDER BY lecture_sequence DESC, source_id, chunk_id, sentence_index').all(institutionId, courseId, excludedLectureId) as Row[]).map(mapSentenceUnitRow)
  }
  async getSentenceUnitsByIds(unitIds: string[]) {
    if (unitIds.length === 0) return []
    const rows = this.db.prepare(`SELECT * FROM sentence_units WHERE id IN (${unitIds.map(() => '?').join(',')})`).all(...unitIds) as Row[]
    const byId = new Map(rows.map(mapSentenceUnitRow).map((unit) => [unit.id, unit]))
    return unitIds.map((id) => byId.get(id)).filter((unit): unit is SentenceUnit => Boolean(unit))
  }

  async searchSparse(query: string, boundary: SearchBoundary, topK: number) {
    const matchQuery = toFtsQuery(query)
    if (!matchQuery) return []
    const operator = boundary.scope === 'lecture' ? '=' : '!='
    const rows = this.db.prepare(`
      SELECT f.unit_id, bm25(sentence_units_fts, 1.0, 0.45, 0.7, 0.35, 0.75) AS rank
      FROM sentence_units_fts AS f
      JOIN sentence_units AS u ON u.id = f.unit_id
      JOIN documents AS d ON d.id = u.source_id
      WHERE sentence_units_fts MATCH ? AND u.institution_id = ? AND u.course_id = ?
        AND u.lecture_id ${operator} ? AND d.visibility != 'private'
      ORDER BY rank LIMIT ?
    `).all(matchQuery, boundary.institutionId, boundary.courseId, boundary.lectureId, topK) as Array<{ unit_id: string; rank: number }>
    return rows.map((row, index) => ({ unitId: row.unit_id, score: 1 / (60 + index + 1) }))
  }

  async searchDense(query: string, boundary: SearchBoundary, topK: number) {
    return searchFaissIndex(await embedText(query), topK, boundary)
  }

  async ingest(documents: FacultySourceDocument[]) {
    mutationQueue = mutationQueue.then(() => this.persistDocuments(documents))
    await mutationQueue
  }

  async getHealth() {
    const documents = Number((this.db.prepare('SELECT COUNT(*) AS count FROM documents').get() as { count: number }).count)
    const chunks = Number((this.db.prepare('SELECT COUNT(*) AS count FROM chunks').get() as { count: number }).count)
    const units = Number((this.db.prepare('SELECT COUNT(*) AS count FROM sentence_units').get() as { count: number }).count)
    return { status: 'ok', documents, chunks, sentenceUnits: units, embeddingFingerprint: getEmbeddingFingerprint() }
  }

  private async persistDocuments(rawDocuments: FacultySourceDocument[]) {
    const documents = rawDocuments.map((document) => {
      const content = normalizeText(document.content)
      if (!content) throw new Error(`Document ${document.id} has no extractable text.`)
      return { ...document, content, visibility: document.visibility ?? 'students', contentHash: document.contentHash ?? hashContent(content) }
    })
    const chunks = ingestFacultyDocuments(documents)
    const units = ingestSentenceUnits(chunks)
    const embeddingInputs = units.map((unit) => [unit.lectureTitle, unit.topic, unit.section, unit.content].join('\n'))
    const embeddings: number[][] = []
    for (let start = 0; start < embeddingInputs.length; start += 64) {
      embeddings.push(...await embedTexts(embeddingInputs.slice(start, start + 64)))
    }

    const upsertDocument = this.db.prepare(`
      INSERT INTO documents (id,institution_id,faculty_id,course_id,course_name,lecture_id,lecture_title,lecture_sequence,topic,source_type,source_name,section,page,timestamp,mime_type,source_url,external_id,connector_type,visibility,version,content_hash,content,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET institution_id=excluded.institution_id,faculty_id=excluded.faculty_id,course_id=excluded.course_id,course_name=excluded.course_name,lecture_id=excluded.lecture_id,lecture_title=excluded.lecture_title,lecture_sequence=excluded.lecture_sequence,topic=excluded.topic,source_type=excluded.source_type,source_name=excluded.source_name,section=excluded.section,page=excluded.page,timestamp=excluded.timestamp,mime_type=excluded.mime_type,source_url=excluded.source_url,external_id=excluded.external_id,connector_type=excluded.connector_type,visibility=excluded.visibility,version=excluded.version,content_hash=excluded.content_hash,content=excluded.content,updated_at=excluded.updated_at
    `)
    const deleteFts = this.db.prepare('DELETE FROM sentence_units_fts WHERE unit_id IN (SELECT id FROM sentence_units WHERE source_id = ?)')
    const deleteUnits = this.db.prepare('DELETE FROM sentence_units WHERE source_id = ?')
    const deleteChunks = this.db.prepare('DELETE FROM chunks WHERE source_id = ?')
    const insertChunk = this.db.prepare('INSERT INTO chunks (id,source_id,institution_id,faculty_id,course_id,course_name,lecture_id,lecture_title,lecture_sequence,topic,source_type,source_name,section,page,timestamp,chunk_index,content,token_count,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const insertUnit = this.db.prepare('INSERT INTO sentence_units (id,chunk_id,source_id,institution_id,faculty_id,course_id,course_name,lecture_id,lecture_title,lecture_sequence,topic,source_type,source_name,section,page,timestamp,sentence_index,content,token_count,embedding_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const insertFts = this.db.prepare('INSERT INTO sentence_units_fts (unit_id,course_id,lecture_id,content,section,topic,source_name,lecture_title) VALUES (?,?,?,?,?,?,?,?)')

    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const d of documents) upsertDocument.run(d.id,d.institutionId,d.facultyId,d.courseId,d.courseName,d.lectureId,d.lectureTitle,d.lectureSequence,d.topic,d.sourceType,d.sourceName,d.section,d.page??null,d.timestamp??null,d.mimeType??null,d.sourceUrl??null,d.externalId??null,d.connectorType??null,d.visibility,d.version??null,d.contentHash,d.content,d.updatedAt)
      for (const sourceId of new Set(documents.map((document) => document.id))) { deleteFts.run(sourceId); deleteUnits.run(sourceId); deleteChunks.run(sourceId) }
      for (const c of chunks) insertChunk.run(c.id,c.sourceId,c.institutionId,c.facultyId,c.courseId,c.courseName,c.lectureId,c.lectureTitle,c.lectureSequence,c.topic,c.sourceType,c.sourceName,c.section,c.page??null,c.timestamp??null,c.chunkIndex,c.content,c.tokenCount,c.updatedAt)
      units.forEach((u, index) => {
        insertUnit.run(u.id,u.chunkId,u.sourceId,u.institutionId,u.facultyId,u.courseId,u.courseName,u.lectureId,u.lectureTitle,u.lectureSequence,u.topic,u.sourceType,u.sourceName,u.section,u.page??null,u.timestamp??null,u.sentenceIndex,u.content,u.tokenCount,JSON.stringify(embeddings[index]),u.updatedAt)
        insertFts.run(u.id,u.courseId,u.lectureId,u.content,u.section,u.topic,u.sourceName,u.lectureTitle)
      })
      this.db.prepare("INSERT INTO rag_metadata(key,value) VALUES('embedding_fingerprint',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(getEmbeddingFingerprint())
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    await rebuildFaissIndex()
  }
}

async function ensureRepositoryInitialized() {
  if (!repositorySingleton) { await ensureRagStorageReady(); repositorySingleton = new SqliteFaissRagRepository() }
  initPromise ??= repositorySingleton.init()
  await initPromise
}

export function getRagRepository(): RagRepository {
  return {
    async listDocuments(){ await ensureRepositoryInitialized(); return repositorySingleton!.listDocuments() },
    async listChunks(){ await ensureRepositoryInitialized(); return repositorySingleton!.listChunks() },
    async listSentenceUnits(){ await ensureRepositoryInitialized(); return repositorySingleton!.listSentenceUnits() },
    async listLectureSentenceUnits(i,c,l){ await ensureRepositoryInitialized(); return repositorySingleton!.listLectureSentenceUnits(i,c,l) },
    async listCourseSentenceUnits(i,c,l){ await ensureRepositoryInitialized(); return repositorySingleton!.listCourseSentenceUnits(i,c,l) },
    async getSentenceUnitsByIds(ids){ await ensureRepositoryInitialized(); return repositorySingleton!.getSentenceUnitsByIds(ids) },
    async searchSparse(q,b,k){ await ensureRepositoryInitialized(); return repositorySingleton!.searchSparse(q,b,k) },
    async searchDense(q,b,k){ await ensureRepositoryInitialized(); return repositorySingleton!.searchDense(q,b,k) },
    async ingest(d){ await ensureRepositoryInitialized(); return repositorySingleton!.ingest(d) },
    async getHealth(){ await ensureRepositoryInitialized(); return repositorySingleton!.getHealth() },
  }
}
