import { DatabaseSync } from 'node:sqlite'

import { embedText } from '@/lib/rag/embedding'
import { rebuildFaissIndex, searchFaissIndex, type FaissSearchHit } from '@/lib/rag/faiss'
import { ingestFacultyDocuments, ingestSentenceUnits } from '@/lib/rag/ingestion'
import {
  readLegacySeedDocuments,
  ensureRagStorageReady,
  getRagStoragePaths,
} from '@/lib/rag/storage'
import type {
  FacultySourceDocument,
  LectureChunk,
  RetrievalScope,
  SentenceUnit,
} from '@/lib/rag/types'

type SparseSearchHit = {
  unitId: string
  score: number
}

export interface RagRepository {
  listDocuments(): Promise<FacultySourceDocument[]>
  listChunks(): Promise<LectureChunk[]>
  listSentenceUnits(): Promise<SentenceUnit[]>
  listLectureSentenceUnits(courseId: string, lectureId: string): Promise<SentenceUnit[]>
  listCourseSentenceUnits(courseId: string, excludedLectureId: string): Promise<SentenceUnit[]>
  getSentenceUnitsByIds(unitIds: string[]): Promise<SentenceUnit[]>
  searchSparse(
    query: string,
    courseId: string,
    lectureId: string,
    scope: RetrievalScope,
    topK: number
  ): Promise<SparseSearchHit[]>
  searchDense(query: string, topK: number): Promise<FaissSearchHit[]>
  ingest(documents: FacultySourceDocument[]): Promise<void>
}

type InitializableRagRepository = RagRepository & {
  init(): Promise<void>
}

let repositorySingleton: InitializableRagRepository | undefined
let initPromise: Promise<void> | undefined
let mutationQueue = Promise.resolve()

function toFtsQuery(query: string) {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1)

  if (terms.length === 0) return ''
  return terms.map((term) => `"${term}"`).join(' OR ')
}

function mapDocumentRow(row: Record<string, unknown>): FacultySourceDocument {
  return {
    id: String(row.id),
    institutionId: String(row.institution_id),
    facultyId: String(row.faculty_id),
    courseId: String(row.course_id),
    courseName: String(row.course_name),
    lectureId: String(row.lecture_id),
    lectureTitle: String(row.lecture_title),
    lectureSequence: Number(row.lecture_sequence),
    topic: String(row.topic),
    sourceType: row.source_type as FacultySourceDocument['sourceType'],
    sourceName: String(row.source_name),
    section: String(row.section),
    page: row.page == null ? undefined : Number(row.page),
    timestamp: row.timestamp == null ? undefined : String(row.timestamp),
    content: String(row.content),
    updatedAt: String(row.updated_at),
  }
}

function mapChunkRow(row: Record<string, unknown>): LectureChunk {
  return {
    id: String(row.id),
    institutionId: String(row.institution_id),
    facultyId: String(row.faculty_id),
    courseId: String(row.course_id),
    courseName: String(row.course_name),
    lectureId: String(row.lecture_id),
    lectureTitle: String(row.lecture_title),
    lectureSequence: Number(row.lecture_sequence),
    topic: String(row.topic),
    sourceId: String(row.source_id),
    sourceType: row.source_type as LectureChunk['sourceType'],
    sourceName: String(row.source_name),
    section: String(row.section),
    page: row.page == null ? undefined : Number(row.page),
    timestamp: row.timestamp == null ? undefined : String(row.timestamp),
    chunkIndex: Number(row.chunk_index),
    content: String(row.content),
    tokenCount: Number(row.token_count),
    updatedAt: String(row.updated_at),
  }
}

function mapSentenceUnitRow(row: Record<string, unknown>): SentenceUnit {
  return {
    id: String(row.id),
    chunkId: String(row.chunk_id),
    sourceId: String(row.source_id),
    institutionId: String(row.institution_id),
    facultyId: String(row.faculty_id),
    courseId: String(row.course_id),
    courseName: String(row.course_name),
    lectureId: String(row.lecture_id),
    lectureTitle: String(row.lecture_title),
    lectureSequence: Number(row.lecture_sequence),
    topic: String(row.topic),
    sourceType: row.source_type as SentenceUnit['sourceType'],
    sourceName: String(row.source_name),
    section: String(row.section),
    page: row.page == null ? undefined : Number(row.page),
    timestamp: row.timestamp == null ? undefined : String(row.timestamp),
    sentenceIndex: Number(row.sentence_index),
    content: String(row.content),
    tokenCount: Number(row.token_count),
    updatedAt: String(row.updated_at),
  }
}

class SqliteFaissRagRepository implements RagRepository {
  private readonly db: DatabaseSync

  constructor() {
    const { sqliteFilePath } = getRagStoragePaths()
    this.db = new DatabaseSync(sqliteFilePath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
  }

  async init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        faculty_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        course_name TEXT NOT NULL,
        lecture_id TEXT NOT NULL,
        lecture_title TEXT NOT NULL,
        lecture_sequence INTEGER NOT NULL,
        topic TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_name TEXT NOT NULL,
        section TEXT NOT NULL,
        page INTEGER,
        timestamp TEXT,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        institution_id TEXT NOT NULL,
        faculty_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        course_name TEXT NOT NULL,
        lecture_id TEXT NOT NULL,
        lecture_title TEXT NOT NULL,
        lecture_sequence INTEGER NOT NULL,
        topic TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_name TEXT NOT NULL,
        section TEXT NOT NULL,
        page INTEGER,
        timestamp TEXT,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sentence_units (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        institution_id TEXT NOT NULL,
        faculty_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        course_name TEXT NOT NULL,
        lecture_id TEXT NOT NULL,
        lecture_title TEXT NOT NULL,
        lecture_sequence INTEGER NOT NULL,
        topic TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_name TEXT NOT NULL,
        section TEXT NOT NULL,
        page INTEGER,
        timestamp TEXT,
        sentence_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        embedding_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS sentence_units_fts USING fts5(
        unit_id UNINDEXED,
        course_id UNINDEXED,
        lecture_id UNINDEXED,
        content,
        section,
        topic,
        source_name,
        lecture_title
      );
    `)

    const documentCountRow = this.db.prepare('SELECT COUNT(*) AS count FROM documents').get() as {
      count: number
    }
    const sentenceCountRow = this.db
      .prepare('SELECT COUNT(*) AS count FROM sentence_units')
      .get() as { count: number }

    if (Number(documentCountRow.count) === 0 || Number(sentenceCountRow.count) === 0) {
      const seedDocuments = await readLegacySeedDocuments()
      await this.persistDocuments(seedDocuments)
    }
  }

  async listDocuments() {
    const rows = this.db.prepare('SELECT * FROM documents ORDER BY lecture_sequence, id').all() as Array<
      Record<string, unknown>
    >
    return rows.map(mapDocumentRow)
  }

  async listChunks() {
    const rows = this.db
      .prepare('SELECT * FROM chunks ORDER BY lecture_sequence, source_id, chunk_index')
      .all() as Array<Record<string, unknown>>
    return rows.map(mapChunkRow)
  }

  async listSentenceUnits() {
    const rows = this.db
      .prepare(
        'SELECT * FROM sentence_units ORDER BY lecture_sequence, source_id, chunk_id, sentence_index'
      )
      .all() as Array<Record<string, unknown>>
    return rows.map(mapSentenceUnitRow)
  }

  async listLectureSentenceUnits(courseId: string, lectureId: string) {
    const rows = this.db
      .prepare(
        'SELECT * FROM sentence_units WHERE course_id = ? AND lecture_id = ? ORDER BY source_id, chunk_id, sentence_index'
      )
      .all(courseId, lectureId) as Array<Record<string, unknown>>
    return rows.map(mapSentenceUnitRow)
  }

  async listCourseSentenceUnits(courseId: string, excludedLectureId: string) {
    const rows = this.db
      .prepare(
        'SELECT * FROM sentence_units WHERE course_id = ? AND lecture_id != ? ORDER BY lecture_sequence DESC, source_id, chunk_id, sentence_index'
      )
      .all(courseId, excludedLectureId) as Array<Record<string, unknown>>
    return rows.map(mapSentenceUnitRow)
  }

  async getSentenceUnitsByIds(unitIds: string[]) {
    if (unitIds.length === 0) return []
    const placeholders = unitIds.map(() => '?').join(', ')
    const rows = this.db
      .prepare(`SELECT * FROM sentence_units WHERE id IN (${placeholders})`)
      .all(...unitIds) as Array<Record<string, unknown>>
    const mapped = rows.map(mapSentenceUnitRow)
    const byId = new Map(mapped.map((unit) => [unit.id, unit]))
    return unitIds
      .map((unitId) => byId.get(unitId))
      .filter((unit): unit is SentenceUnit => Boolean(unit))
  }

  async searchSparse(
    query: string,
    courseId: string,
    lectureId: string,
    scope: RetrievalScope,
    topK: number
  ) {
    const matchQuery = toFtsQuery(query)
    if (!matchQuery) return []

    const scopeOperator = scope === 'lecture' ? '=' : '!='
    const rows = this.db
      .prepare(`
        SELECT unit_id, bm25(sentence_units_fts) AS rank
        FROM sentence_units_fts
        WHERE sentence_units_fts MATCH ?
          AND course_id = ?
          AND lecture_id ${scopeOperator} ?
        ORDER BY rank
        LIMIT ?
      `)
      .all(matchQuery, courseId, lectureId, topK) as Array<{ unit_id: string; rank: number }>

    return rows.map((row) => ({
      unitId: row.unit_id,
      score: 1 / (1 + Math.max(0, Number(row.rank))),
    }))
  }

  async searchDense(query: string, topK: number) {
    return searchFaissIndex(query, topK)
  }

  async ingest(documents: FacultySourceDocument[]) {
    mutationQueue = mutationQueue.then(async () => {
      await this.persistDocuments(documents)
    })
    await mutationQueue
  }

  private async persistDocuments(documents: FacultySourceDocument[]) {
    const chunks = ingestFacultyDocuments(documents)
    const sentenceUnits = ingestSentenceUnits(chunks)

    const upsertDocument = this.db.prepare(`
      INSERT INTO documents (
        id, institution_id, faculty_id, course_id, course_name, lecture_id, lecture_title,
        lecture_sequence, topic, source_type, source_name, section, page, timestamp, content, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        institution_id = excluded.institution_id,
        faculty_id = excluded.faculty_id,
        course_id = excluded.course_id,
        course_name = excluded.course_name,
        lecture_id = excluded.lecture_id,
        lecture_title = excluded.lecture_title,
        lecture_sequence = excluded.lecture_sequence,
        topic = excluded.topic,
        source_type = excluded.source_type,
        source_name = excluded.source_name,
        section = excluded.section,
        page = excluded.page,
        timestamp = excluded.timestamp,
        content = excluded.content,
        updated_at = excluded.updated_at
    `)

    const deleteSentenceUnitsBySource = this.db.prepare(
      'DELETE FROM sentence_units WHERE source_id = ?'
    )
    const deleteSentenceFtsBySource = this.db.prepare(`
      DELETE FROM sentence_units_fts
      WHERE unit_id IN (SELECT id FROM sentence_units WHERE source_id = ?)
    `)
    const deleteChunksBySource = this.db.prepare('DELETE FROM chunks WHERE source_id = ?')

    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (
        id, source_id, institution_id, faculty_id, course_id, course_name, lecture_id,
        lecture_title, lecture_sequence, topic, source_type, source_name, section, page,
        timestamp, chunk_index, content, token_count, embedding_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertSentenceUnit = this.db.prepare(`
      INSERT INTO sentence_units (
        id, chunk_id, source_id, institution_id, faculty_id, course_id, course_name,
        lecture_id, lecture_title, lecture_sequence, topic, source_type, source_name,
        section, page, timestamp, sentence_index, content, token_count, embedding_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertSentenceFts = this.db.prepare(`
      INSERT INTO sentence_units_fts (
        unit_id, course_id, lecture_id, content, section, topic, source_name, lecture_title
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.db.exec('BEGIN')
    try {
      for (const document of documents) {
        upsertDocument.run(
          document.id,
          document.institutionId,
          document.facultyId,
          document.courseId,
          document.courseName,
          document.lectureId,
          document.lectureTitle,
          document.lectureSequence,
          document.topic,
          document.sourceType,
          document.sourceName,
          document.section,
          document.page ?? null,
          document.timestamp ?? null,
          document.content,
          document.updatedAt
        )
      }

      const sourceIds = Array.from(new Set(chunks.map((chunk) => chunk.sourceId)))
      for (const sourceId of sourceIds) {
        deleteSentenceFtsBySource.run(sourceId)
        deleteSentenceUnitsBySource.run(sourceId)
        deleteChunksBySource.run(sourceId)
      }

      for (const chunk of chunks) {
        const chunkEmbedding = embedText(
          [chunk.content, chunk.section, chunk.topic, chunk.sourceName, chunk.lectureTitle].join(' ')
        )

        insertChunk.run(
          chunk.id,
          chunk.sourceId,
          chunk.institutionId,
          chunk.facultyId,
          chunk.courseId,
          chunk.courseName,
          chunk.lectureId,
          chunk.lectureTitle,
          chunk.lectureSequence,
          chunk.topic,
          chunk.sourceType,
          chunk.sourceName,
          chunk.section,
          chunk.page ?? null,
          chunk.timestamp ?? null,
          chunk.chunkIndex,
          chunk.content,
          chunk.tokenCount,
          JSON.stringify(chunkEmbedding),
          chunk.updatedAt
        )
      }

      for (const unit of sentenceUnits) {
        const embedding = embedText(
          [unit.content, unit.section, unit.topic, unit.sourceName, unit.lectureTitle].join(' ')
        )

        insertSentenceUnit.run(
          unit.id,
          unit.chunkId,
          unit.sourceId,
          unit.institutionId,
          unit.facultyId,
          unit.courseId,
          unit.courseName,
          unit.lectureId,
          unit.lectureTitle,
          unit.lectureSequence,
          unit.topic,
          unit.sourceType,
          unit.sourceName,
          unit.section,
          unit.page ?? null,
          unit.timestamp ?? null,
          unit.sentenceIndex,
          unit.content,
          unit.tokenCount,
          JSON.stringify(embedding),
          unit.updatedAt
        )

        insertSentenceFts.run(
          unit.id,
          unit.courseId,
          unit.lectureId,
          unit.content,
          unit.section,
          unit.topic,
          unit.sourceName,
          unit.lectureTitle
        )
      }

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    await rebuildFaissIndex()
  }
}

async function ensureRepositoryInitialized() {
  if (!repositorySingleton) {
    await ensureRagStorageReady()
    repositorySingleton = new SqliteFaissRagRepository()
  }

  if (!initPromise) {
    initPromise = repositorySingleton.init()
  }

  await initPromise
}

export function getRagRepository() {
  return {
    async listDocuments() {
      await ensureRepositoryInitialized()
      return repositorySingleton!.listDocuments()
    },
    async listChunks() {
      await ensureRepositoryInitialized()
      return repositorySingleton!.listChunks()
    },
    async listSentenceUnits() {
      await ensureRepositoryInitialized()
      return repositorySingleton!.listSentenceUnits()
    },
    async listLectureSentenceUnits(courseId: string, lectureId: string) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.listLectureSentenceUnits(courseId, lectureId)
    },
    async listCourseSentenceUnits(courseId: string, excludedLectureId: string) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.listCourseSentenceUnits(courseId, excludedLectureId)
    },
    async getSentenceUnitsByIds(unitIds: string[]) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.getSentenceUnitsByIds(unitIds)
    },
    async searchSparse(
      query: string,
      courseId: string,
      lectureId: string,
      scope: RetrievalScope,
      topK: number
    ) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.searchSparse(query, courseId, lectureId, scope, topK)
    },
    async searchDense(query: string, topK: number) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.searchDense(query, topK)
    },
    async ingest(documents: FacultySourceDocument[]) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.ingest(documents)
    },
  } satisfies RagRepository
}
