import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type {
  AcademicRole,
  AcademicUser,
  AcademicWorkspace,
  AssignmentInput,
  ConnectorSource,
  CreateLectureInput,
  CreateSubjectInput,
  CreateUserInput,
  EndSessionInput,
  FacultyAssistantInput,
  FacultyAssistantResult,
  Lecture,
  LectureSession,
  ModuleUnit,
  StartLectureSessionInput,
  StartStudySessionInput,
  StudentDoubt,
  Subject,
  SubjectEnrollment,
  SyncConnectorNotesInput,
  UpdateLectureInput,
  UpdateSubjectInput,
  UpdateUserInput,
} from '@/lib/academic/types'
import { getRagRepository } from '@/lib/rag/repository'
import { runHybridLectureRag } from '@/lib/rag/hybrid'
import { syncConnectorDocuments } from '@/lib/connectors/service'
import { createConfirmationToken, readConfirmationToken } from '@/lib/academic/assistant-guard'
import type { FacultySourceDocument, LectureContext } from '@/lib/rag/types'

const institutionId = 'onestop-demo'
const academicDataDirectory = path.join(process.cwd(), 'data', 'academic')
const academicDbPath = path.join(academicDataDirectory, 'academic.db')

type Row = Record<string, unknown>

let repositorySingleton: AcademicRepository | undefined
let initPromise: Promise<void> | undefined
let mutationQueue = Promise.resolve()

function now() {
  return new Date().toISOString()
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function toOptionalNumber(value: unknown) {
  return value == null ? undefined : Number(value)
}

function toOptionalString(value: unknown) {
  return value == null ? undefined : String(value)
}

function mapUser(row: Row): AcademicUser {
  return {
    id: String(row.id),
    role: row.role as AcademicUser['role'],
    name: String(row.name),
    email: String(row.email),
    department: String(row.department),
    year: toOptionalNumber(row.year),
    semester: toOptionalNumber(row.semester),
    status: row.status as AcademicUser['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapSubject(row: Row): Subject {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    description: String(row.description),
    year: Number(row.year),
    semester: Number(row.semester),
    teacherId: String(row.teacher_id),
    teacherName: String(row.teacher_name ?? 'Unassigned'),
    status: row.status as Subject['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapEnrollment(row: Row): SubjectEnrollment {
  return {
    subjectId: String(row.subject_id),
    studentId: String(row.student_id),
    createdAt: String(row.created_at),
  }
}

function mapModule(row: Row): ModuleUnit {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    title: String(row.title),
    sequence: Number(row.sequence),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapLecture(row: Row): Lecture {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    moduleId: String(row.module_id),
    title: String(row.title),
    topic: String(row.topic),
    sequence: Number(row.sequence),
    status: row.status as Lecture['status'],
    notes: String(row.notes ?? ''),
    plannedAt: toOptionalString(row.planned_at),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapSession(row: Row): LectureSession {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    lectureId: String(row.lecture_id),
    teacherId: toOptionalString(row.teacher_id),
    studentId: toOptionalString(row.student_id),
    startedByRole: row.started_by_role as AcademicRole,
    title: String(row.title),
    focus: String(row.focus),
    mode: row.mode as LectureSession['mode'],
    status: row.status as LectureSession['status'],
    noteSnapshot: String(row.note_snapshot ?? ''),
    startedAt: String(row.started_at),
    endedAt: toOptionalString(row.ended_at),
  }
}

function mapDoubt(row: Row): StudentDoubt {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    lectureId: String(row.lecture_id),
    studentId: String(row.student_id),
    studentName: String(row.student_name ?? 'Student'),
    question: String(row.question),
    summary: String(row.summary),
    aiResponse: String(row.ai_response),
    status: row.status as StudentDoubt['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapConnector(row: Row): ConnectorSource {
  return {
    id: String(row.id),
    teacherId: String(row.teacher_id),
    provider: row.provider as ConnectorSource['provider'],
    name: String(row.name),
    status: row.status as ConnectorSource['status'],
    availableNotes: String(row.available_notes),
    lastSyncedAt: toOptionalString(row.last_synced_at),
  }
}

function readBodyValue<T>(value: T | undefined, fallback: T) {
  return value === undefined ? fallback : value
}

function summarizeText(value: string, maxSentences = 3) {
  const sentences = value
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  return sentences.slice(0, maxSentences).join(' ') || value.slice(0, 220)
}

async function syncLectureToRag(db: DatabaseSync, lectureId: string) {
  const row = db
    .prepare(
      `
        SELECT
          l.*,
          s.name AS subject_name,
          s.code AS subject_code,
          s.teacher_id,
          s.year,
          s.semester
        FROM lectures l
        JOIN subjects s ON s.id = l.subject_id
        WHERE l.id = ?
      `
    )
    .get(lectureId) as Row | undefined

  if (!row || !String(row.notes ?? '').trim()) return

  const document: FacultySourceDocument = {
    id: `academic:${lectureId}:notes`,
    institutionId,
    facultyId: String(row.teacher_id),
    courseId: String(row.subject_id),
    courseName: String(row.subject_name),
    lectureId,
    lectureTitle: String(row.title),
    lectureSequence: Number(row.sequence),
    topic: String(row.topic),
    sourceType: 'notes',
    sourceName: `${String(row.subject_code)} digital notes`,
    section: String(row.topic),
    content: String(row.notes),
    updatedAt: String(row.updated_at),
  }

  await getRagRepository().ingest([document])
}

class AcademicRepository {
  private readonly db: DatabaseSync

  constructor() {
    mkdirSync(academicDataDirectory, { recursive: true })
    this.db = new DatabaseSync(academicDbPath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
  }

  async init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL,
        year INTEGER,
        semester INTEGER,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        year INTEGER NOT NULL,
        semester INTEGER NOT NULL,
        teacher_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subject_enrollments (
        subject_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(subject_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        title TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lectures (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        module_id TEXT NOT NULL,
        title TEXT NOT NULL,
        topic TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL,
        notes TEXT NOT NULL,
        planned_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lecture_sessions (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        lecture_id TEXT NOT NULL,
        teacher_id TEXT,
        student_id TEXT,
        started_by_role TEXT NOT NULL,
        title TEXT NOT NULL,
        focus TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        note_snapshot TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT
      );

      CREATE TABLE IF NOT EXISTS student_doubts (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        lecture_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        question TEXT NOT NULL,
        summary TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS connector_sources (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        available_notes TEXT NOT NULL,
        last_synced_at TEXT
      );
    `)

    const count = this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
    if (Number(count.count) === 0) {
      await this.seed()
    }

    const connectorCount = this.db.prepare('SELECT COUNT(*) AS count FROM connector_sources').get() as { count: number }
    if (Number(connectorCount.count) === 0) {
      this.seedConnectors()
    }

    const doubtCount = this.db.prepare('SELECT COUNT(*) AS count FROM student_doubts').get() as { count: number }
    if (Number(doubtCount.count) === 0) {
      this.seedDoubts()
    }
  }

  async getWorkspace(role: AcademicRole, userId: string): Promise<AcademicWorkspace> {
    const viewer = this.getUserById(userId)
    if (!viewer || viewer.role !== role) {
      throw new Error('Viewer not found for the requested role.')
    }

    const allUsers = this.listUsers()
    const allSubjects = this.listSubjects()
    const allEnrollments = this.listEnrollments()
    const allModules = this.listModules()
    const allLectures = this.listLectures()
    const allSessions = this.listSessions()
    const allDoubts = this.listDoubts()
    const allConnectors = this.listConnectors()

    const allowedSubjectIds =
      role === 'super-admin'
        ? new Set(allSubjects.map((subject) => subject.id))
        : role === 'teacher'
          ? new Set(allSubjects.filter((subject) => subject.teacherId === userId).map((subject) => subject.id))
          : new Set(allEnrollments.filter((enrollment) => enrollment.studentId === userId).map((enrollment) => enrollment.subjectId))

    const subjects = allSubjects.filter((subject) => allowedSubjectIds.has(subject.id))
    const modules = allModules.filter((moduleUnit) => allowedSubjectIds.has(moduleUnit.subjectId))
    const lectures = allLectures.filter((lecture) => allowedSubjectIds.has(lecture.subjectId))
    const sessions = allSessions.filter((session) => allowedSubjectIds.has(session.subjectId))
    const doubts = allDoubts.filter((doubt) => allowedSubjectIds.has(doubt.subjectId))
    const connectors = role === 'teacher'
      ? allConnectors.filter((connector) => connector.teacherId === userId)
      : role === 'super-admin'
        ? allConnectors
        : []
    const enrollments =
      role === 'super-admin'
        ? allEnrollments
        : allEnrollments.filter((enrollment) => allowedSubjectIds.has(enrollment.subjectId))

    return {
      viewer,
      users: role === 'super-admin' ? allUsers : allUsers.filter((user) => user.id === userId),
      subjects,
      enrollments,
      modules,
      lectures,
      sessions,
      doubts,
      connectors,
      lectureContexts: Object.fromEntries(lectures.map((lecture) => [lecture.id, this.getLectureContext(lecture.id)])),
      stats: {
        activeStudents: allUsers.filter((user) => user.role === 'student' && user.status === 'active').length,
        activeTeachers: allUsers.filter((user) => user.role === 'teacher' && user.status === 'active').length,
        activeSubjects: allSubjects.filter((subject) => subject.status === 'active').length,
        liveSessions: allSessions.filter((session) => session.status === 'live').length,
        indexedLectures: allLectures.filter((lecture) => lecture.notes.trim().length > 0).length,
        assignedSubjects: subjects.length,
        readyLectures: lectures.filter((lecture) => lecture.notes.trim().length > 0 && lecture.status !== 'draft').length,
        completedLectures: lectures.filter((lecture) => lecture.status === 'completed' || lecture.notes.trim().length > 0).length,
        openDoubts: doubts.filter((doubt) => doubt.status === 'open').length,
        connectedSources: connectors.filter((connector) => connector.status === 'connected').length,
      },
    }
  }

  listUsers() {
    return (this.db.prepare('SELECT * FROM users ORDER BY role, name').all() as Row[]).map(mapUser)
  }

  listSubjects() {
    return (
      this.db
        .prepare(
          `
            SELECT s.*, COALESCE(u.name, 'Unassigned') AS teacher_name
            FROM subjects s
            LEFT JOIN users u ON u.id = s.teacher_id
            ORDER BY s.year, s.semester, s.code
          `
        )
        .all() as Row[]
    ).map(mapSubject)
  }

  listEnrollments() {
    return (this.db.prepare('SELECT * FROM subject_enrollments ORDER BY subject_id, student_id').all() as Row[]).map(mapEnrollment)
  }

  listModules() {
    return (this.db.prepare('SELECT * FROM modules ORDER BY subject_id, sequence').all() as Row[]).map(mapModule)
  }

  listLectures() {
    return (this.db.prepare('SELECT * FROM lectures ORDER BY subject_id, sequence').all() as Row[]).map(mapLecture)
  }

  listSessions() {
    return (this.db.prepare('SELECT * FROM lecture_sessions ORDER BY started_at DESC').all() as Row[]).map(mapSession)
  }

  listDoubts() {
    return (
      this.db
        .prepare(
          `
            SELECT d.*, COALESCE(u.name, 'Student') AS student_name
            FROM student_doubts d
            LEFT JOIN users u ON u.id = d.student_id
            ORDER BY d.created_at DESC
          `
        )
        .all() as Row[]
    ).map(mapDoubt)
  }

  listConnectors() {
    return (this.db.prepare('SELECT * FROM connector_sources ORDER BY provider, name').all() as Row[]).map(mapConnector)
  }

  getUserById(userId: string) {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Row | undefined
    return row ? mapUser(row) : null
  }

  getLectureContext(lectureId: string): LectureContext {
    const row = this.db
      .prepare(
        `
          SELECT
            l.id AS lecture_id,
            l.title AS lecture_title,
            l.sequence AS lecture_sequence,
            s.id AS subject_id,
            s.name AS subject_name,
            s.teacher_id
          FROM lectures l
          JOIN subjects s ON s.id = l.subject_id
          WHERE l.id = ?
        `
      )
      .get(lectureId) as Row | undefined

    if (!row) {
      throw new Error('Lecture not found.')
    }

    return {
      institutionId,
      facultyId: String(row.teacher_id),
      courseId: String(row.subject_id),
      courseName: String(row.subject_name),
      lectureId: String(row.lecture_id),
      lectureTitle: String(row.lecture_title),
      lectureSequence: Number(row.lecture_sequence),
    }
  }

  async createUser(input: CreateUserInput) {
    return this.runMutation(async () => {
      const timestamp = now()
      const id = `${input.role}-${slugify(input.name)}-${randomUUID().slice(0, 6)}`
      this.db
        .prepare(
          `
            INSERT INTO users (
              id, role, name, email, department, year, semester, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
          `
        )
        .run(
          id,
          input.role,
          input.name,
          input.email,
          input.department ?? 'Computer Science',
          input.year ?? null,
          input.semester ?? null,
          timestamp,
          timestamp
        )
      return this.getUserById(id)!
    })
  }

  async updateUser(input: UpdateUserInput) {
    return this.runMutation(async () => {
      const existing = this.getUserById(input.id)
      if (!existing) throw new Error('User not found.')

      this.db
        .prepare(
          `
            UPDATE users
            SET role = ?, name = ?, email = ?, department = ?, year = ?, semester = ?, status = ?, updated_at = ?
            WHERE id = ?
          `
        )
        .run(
          readBodyValue(input.role, existing.role),
          readBodyValue(input.name, existing.name),
          readBodyValue(input.email, existing.email),
          readBodyValue(input.department, existing.department),
          readBodyValue(input.year, existing.year ?? null),
          readBodyValue(input.semester, existing.semester ?? null),
          readBodyValue(input.status, existing.status),
          now(),
          input.id
        )

      return this.getUserById(input.id)!
    })
  }

  async deleteUser(userId: string) {
    return this.runMutation(async () => {
      this.db.prepare('DELETE FROM subject_enrollments WHERE student_id = ?').run(userId)
      this.db.prepare("UPDATE subjects SET teacher_id = 'teacher-nk', updated_at = ? WHERE teacher_id = ?").run(now(), userId)
      this.db.prepare('DELETE FROM users WHERE id = ?').run(userId)
      return { deleted: true }
    })
  }

  async createSubject(input: CreateSubjectInput) {
    return this.runMutation(async () => {
      const timestamp = now()
      const id = slugify(input.code)
      this.db
        .prepare(
          `
            INSERT INTO subjects (
              id, code, name, description, year, semester, teacher_id, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
          `
        )
        .run(
          id,
          input.code,
          input.name,
          input.description ?? 'Academic subject workspace',
          input.year,
          input.semester,
          input.teacherId,
          timestamp,
          timestamp
        )

      this.createDefaultModule(id, 'Module 01', 1)
      return this.listSubjects().find((subject) => subject.id === id)!
    })
  }

  async updateSubject(input: UpdateSubjectInput) {
    return this.runMutation(async () => {
      const existing = this.listSubjects().find((subject) => subject.id === input.id)
      if (!existing) throw new Error('Subject not found.')

      this.db
        .prepare(
          `
            UPDATE subjects
            SET code = ?, name = ?, description = ?, year = ?, semester = ?, teacher_id = ?, status = ?, updated_at = ?
            WHERE id = ?
          `
        )
        .run(
          readBodyValue(input.code, existing.code),
          readBodyValue(input.name, existing.name),
          readBodyValue(input.description, existing.description),
          readBodyValue(input.year, existing.year),
          readBodyValue(input.semester, existing.semester),
          readBodyValue(input.teacherId, existing.teacherId),
          readBodyValue(input.status, existing.status),
          now(),
          input.id
        )

      return this.listSubjects().find((subject) => subject.id === input.id)!
    })
  }

  async assign(input: AssignmentInput) {
    return this.runMutation(async () => {
      if (input.kind === 'teacher') {
        this.db.prepare('UPDATE subjects SET teacher_id = ?, updated_at = ? WHERE id = ?').run(input.userId, now(), input.subjectId)
        return this.listSubjects().find((subject) => subject.id === input.subjectId)!
      }

      this.db
        .prepare('INSERT OR IGNORE INTO subject_enrollments (subject_id, student_id, created_at) VALUES (?, ?, ?)')
        .run(input.subjectId, input.userId, now())
      return { assigned: true }
    })
  }

  async unassign(input: AssignmentInput) {
    return this.runMutation(async () => {
      if (input.kind === 'teacher') {
        this.db.prepare("UPDATE subjects SET teacher_id = 'teacher-nk', updated_at = ? WHERE id = ?").run(now(), input.subjectId)
        return { unassigned: true }
      }

      this.db.prepare('DELETE FROM subject_enrollments WHERE subject_id = ? AND student_id = ?').run(input.subjectId, input.userId)
      return { unassigned: true }
    })
  }

  async createLecture(input: CreateLectureInput) {
    return this.runMutation(async () => {
      const timestamp = now()
      const sequenceRow = this.db
        .prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM lectures WHERE subject_id = ?')
        .get(input.subjectId) as { next_sequence: number }
      const id = `${input.subjectId}-lecture-${String(sequenceRow.next_sequence).padStart(2, '0')}-${randomUUID().slice(0, 4)}`

      this.db
        .prepare(
          `
            INSERT INTO lectures (
              id, subject_id, module_id, title, topic, sequence, status, notes, planned_at, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          id,
          input.subjectId,
          input.moduleId,
          input.title,
          input.topic,
          Number(sequenceRow.next_sequence),
          input.notes?.trim() ? 'ready' : 'draft',
          input.notes ?? '',
          input.plannedAt ?? null,
          input.createdBy,
          timestamp,
          timestamp
        )

      if (input.notes?.trim()) await syncLectureToRag(this.db, id)
      return this.listLectures().find((lecture) => lecture.id === id)!
    })
  }

  async updateLecture(input: UpdateLectureInput) {
    return this.runMutation(async () => {
      const existing = this.listLectures().find((lecture) => lecture.id === input.id)
      if (!existing) throw new Error('Lecture not found.')
      const nextNotes = readBodyValue(input.notes, existing.notes)
      const nextStatus = readBodyValue(input.status, nextNotes.trim() ? existing.status === 'draft' ? 'ready' : existing.status : 'draft')

      this.db
        .prepare(
          `
            UPDATE lectures
            SET subject_id = ?, module_id = ?, title = ?, topic = ?, status = ?, notes = ?, planned_at = ?, updated_at = ?
            WHERE id = ?
          `
        )
        .run(
          readBodyValue(input.subjectId, existing.subjectId),
          readBodyValue(input.moduleId, existing.moduleId),
          readBodyValue(input.title, existing.title),
          readBodyValue(input.topic, existing.topic),
          nextStatus,
          nextNotes,
          readBodyValue(input.plannedAt, existing.plannedAt ?? null),
          now(),
          input.id
        )

      if (nextNotes.trim()) await syncLectureToRag(this.db, input.id)
      return this.listLectures().find((lecture) => lecture.id === input.id)!
    })
  }

  async startLectureSession(input: StartLectureSessionInput) {
    return this.runMutation(async () => {
      const lecture = this.listLectures().find((entry) => entry.id === input.lectureId)
      if (!lecture) throw new Error('Lecture not found.')
      if (!lecture.notes.trim()) throw new Error('Add lecture notes before starting the session.')

      const subject = this.listSubjects().find((entry) => entry.id === lecture.subjectId)
      if (!subject) throw new Error('Subject not found.')

      this.db.prepare("UPDATE lecture_sessions SET status = 'ended', ended_at = ? WHERE lecture_id = ? AND status = 'live'").run(now(), lecture.id)
      this.db.prepare("UPDATE lectures SET status = 'live', updated_at = ? WHERE id = ?").run(now(), lecture.id)

      const session = this.insertSession({
        subjectId: lecture.subjectId,
        lectureId: lecture.id,
        teacherId: input.teacherId,
        studentId: null,
        startedByRole: 'teacher',
        title: lecture.title,
        focus: lecture.topic,
        mode: 'teacher-led',
        noteSnapshot: lecture.notes,
      })

      await syncLectureToRag(this.db, lecture.id)
      return session
    })
  }

  async startStudySession(input: StartStudySessionInput) {
    return this.runMutation(async () => {
      const lecture = this.listLectures().find((entry) => entry.id === input.lectureId)
      if (!lecture) throw new Error('Lecture not found.')

      const session = this.insertSession({
        subjectId: input.subjectId,
        lectureId: lecture.id,
        teacherId: null,
        studentId: input.studentId,
        startedByRole: 'student',
        title: `Study room: ${lecture.title}`,
        focus: input.focus,
        mode: 'student-replay',
        noteSnapshot: lecture.notes,
      })

      this.insertDoubt({
        subjectId: input.subjectId,
        lectureId: lecture.id,
        studentId: input.studentId,
        question: input.focus,
        aiResponse: lecture.notes.trim()
          ? `The AI used ${lecture.title} notes to answer this student replay focus.`
          : 'The AI could not find notes for this lecture yet.',
      })

      return session
    })
  }

  async endSession(input: EndSessionInput) {
    return this.runMutation(async () => {
      const session = this.listSessions().find((entry) => entry.id === input.sessionId)
      if (!session) throw new Error('Session not found.')

      this.db.prepare("UPDATE lecture_sessions SET status = 'ended', ended_at = ? WHERE id = ?").run(now(), input.sessionId)
      this.db.prepare("UPDATE lectures SET status = 'completed', updated_at = ? WHERE id = ?").run(now(), session.lectureId)
      return this.listSessions().find((entry) => entry.id === input.sessionId)!
    })
  }

  async syncConnectorNotes(input: SyncConnectorNotesInput) {
    return this.runMutation(async () => {
      const connector = this.listConnectors().find((entry) => entry.id === input.connectorId && entry.teacherId === input.teacherId)
      if (!connector) throw new Error('Connector not found for this teacher.')

      const lecture = this.listLectures().find((entry) => entry.id === input.lectureId)
      if (!lecture) throw new Error('Lecture not found.')
      const subject = this.listSubjects().find((entry) => entry.id === lecture.subjectId && entry.teacherId === input.teacherId)
      if (!subject) throw new Error('The lecture is not assigned to this teacher.')
      if (connector.provider !== 'google-drive' && connector.provider !== 'google-classroom') {
        throw new Error('Manual uploads must use the document upload endpoint.')
      }

      const sync = await syncConnectorDocuments({
        connector: connector.provider,
        institutionId,
        facultyId: input.teacherId,
        courseId: subject.id,
        courseName: subject.name,
        lectureId: lecture.id,
        lectureTitle: lecture.title,
        lectureSequence: lecture.sequence,
        topic: lecture.topic,
      })
      if (sync.documents.length === 0) {
        const reason = sync.failures[0]?.reason ?? 'No supported documents were found in the configured source.'
        throw new Error(`Connector sync produced no indexable notes. ${reason}`)
      }
      const importedNotes = sync.documents.map((document) => `Source: ${document.sourceName}\n${document.content}`).join('\n\n')
      const nextNotes = [lecture.notes, importedNotes].filter((part) => part.trim()).join('\n\n')
      this.db
        .prepare("UPDATE lectures SET notes = ?, status = 'ready', updated_at = ? WHERE id = ?")
        .run(nextNotes, now(), lecture.id)
      this.db
        .prepare('UPDATE connector_sources SET status = ?, last_synced_at = ? WHERE id = ?')
        .run('connected', now(), connector.id)

      await getRagRepository().ingest(sync.documents)
      return this.listLectures().find((entry) => entry.id === lecture.id)!
    })
  }

  async runFacultyAssistant(input: FacultyAssistantInput): Promise<FacultyAssistantResult> {
    const guardrails = [
      'Faculty assistant can only access subjects assigned to the requesting teacher.',
      'Mutations are limited to lecture creation and connector-note sync.',
      'Academic answers must use lecture-grounded RAG before responding.',
      'Student doubt summaries expose learning needs, not private credentials or unrelated profile data.',
    ]

    const teacherSubjects = this.listSubjects().filter((subject) => subject.teacherId === input.teacherId)
    const subject = input.subjectId
      ? teacherSubjects.find((entry) => entry.id === input.subjectId)
      : teacherSubjects[0]

    if (!subject) {
      return {
        action: 'blocked',
        answer: 'I could not find an assigned subject for this teacher.',
        guardrails,
      }
    }

    const command = input.command.toLowerCase()
    const subjectModules = this.listModules().filter((moduleUnit) => moduleUnit.subjectId === subject.id)
    const subjectLectures = this.listLectures().filter((lecture) => lecture.subjectId === subject.id)
    const subjectDoubts = this.listDoubts().filter((doubt) => doubt.subjectId === subject.id && doubt.status === 'open')

    if (command.includes('doubt') || command.includes('student')) {
      const topDoubts = subjectDoubts.slice(0, 4)
      return {
        action: 'summarized-doubts',
        answer: topDoubts.length
          ? `There are ${subjectDoubts.length} open student doubts in ${subject.code}. ${topDoubts.map((doubt) => `${doubt.studentName}: ${doubt.summary}`).join(' ')}`
          : `There are no open student doubts in ${subject.code}.`,
        guardrails,
      }
    }

    const confirmed = input.confirmationToken ? readConfirmationToken(input.confirmationToken) : null
    if (input.confirmationToken && (!confirmed || confirmed.teacherId !== input.teacherId || confirmed.subjectId !== subject.id)) {
      return { action: 'blocked', answer: 'The confirmation expired or does not match this teacher and subject.', guardrails }
    }

    if (confirmed?.action === 'create-lecture') {
      const topic = confirmed.topic ?? 'New lecture'
      const lecture = await this.createLecture({
        subjectId: subject.id, moduleId: subjectModules[0]?.id ?? `${subject.id}-module-01`,
        title: topic, topic, notes: '', createdBy: input.teacherId,
      })
      return { action: 'created-lecture', answer: `Created "${lecture.title}" in ${subject.code}. Add or sync source notes before starting it.`, guardrails, createdLectureId: lecture.id }
    }

    if (confirmed?.action === 'sync-notes') {
      const connector = this.listConnectors().find((entry) => entry.id === confirmed.connectorId && entry.teacherId === input.teacherId)
      const lecture = subjectLectures.find((entry) => entry.id === confirmed.lectureId)
      if (!connector || !lecture) return { action: 'blocked', answer: 'The connector or lecture no longer exists.', guardrails }
      const updatedLecture = await this.syncConnectorNotes({ connectorId: connector.id, lectureId: lecture.id, teacherId: input.teacherId })
      return { action: 'synced-notes', answer: `Synced ${connector.name} into "${updatedLecture.title}" and rebuilt its lecture-scoped index.`, guardrails, updatedLectureId: updatedLecture.id }
    }

    if (command.includes('create') && command.includes('lecture')) {
      const topicMatch = input.command.match(/(?:on|about|for)\s+(.+)$/i)
      const topic = topicMatch?.[1]?.trim() || 'Connector-assisted lecture'
      return {
        action: 'confirmation-required', answer: `I am ready to create a lecture titled "${topic}" in ${subject.code}. Say confirm to proceed.`,
        guardrails, proposedAction: `Create lecture: ${topic}`,
        confirmationToken: createConfirmationToken({ teacherId: input.teacherId, subjectId: subject.id, action: 'create-lecture', topic }),
      }
    }

    if (command.includes('sync') || command.includes('fetch') || command.includes('upload')) {
      const connector = input.connectorId
        ? this.listConnectors().find((entry) => entry.id === input.connectorId && entry.teacherId === input.teacherId)
        : this.listConnectors().find((entry) => entry.teacherId === input.teacherId && entry.status === 'connected')
      const lecture = subjectLectures[0]
      if (!connector || !lecture) {
        return {
          action: 'blocked',
          answer: 'I need a connected source and an existing lecture before syncing notes.',
          guardrails,
        }
      }

      return {
        action: 'confirmation-required', answer: `I am ready to fetch ${connector.name} into "${lecture.title}". Say confirm to start the external sync and indexing.`,
        guardrails, proposedAction: `Sync ${connector.name} into ${lecture.title}`,
        confirmationToken: createConfirmationToken({ teacherId: input.teacherId, subjectId: subject.id, connectorId: connector.id, action: 'sync-notes', lectureId: lecture.id }),
      }
    }

    const lecture = subjectLectures.find((entry) => entry.notes.trim()) ?? subjectLectures[0]
    if (!lecture) {
      return {
        action: 'blocked',
        answer: `No lecture exists in ${subject.code} yet.`,
        guardrails,
      }
    }

    const answer = await runHybridLectureRag({
      mode: 'chat',
      studentId: input.teacherId,
      prompt: input.command,
      context: this.getLectureContext(lecture.id),
    })

    return {
      action: 'answered',
      answer: answer.answer,
      guardrails,
      citations: answer.citations.map((citation) => ({
        sourceName: citation.sourceName,
        section: citation.section,
      })),
    }
  }

  private insertSession(input: {
    subjectId: string
    lectureId: string
    teacherId: string | null
    studentId: string | null
    startedByRole: AcademicRole
    title: string
    focus: string
    mode: LectureSession['mode']
    noteSnapshot: string
  }) {
    const id = `session-${randomUUID()}`
    const timestamp = now()
    this.db
      .prepare(
        `
          INSERT INTO lecture_sessions (
            id, subject_id, lecture_id, teacher_id, student_id, started_by_role, title, focus,
            mode, status, note_snapshot, started_at, ended_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?, NULL)
        `
      )
      .run(
        id,
        input.subjectId,
        input.lectureId,
        input.teacherId,
        input.studentId,
        input.startedByRole,
        input.title,
        input.focus,
        input.mode,
        input.noteSnapshot,
        timestamp
      )

    return this.listSessions().find((session) => session.id === id)!
  }

  private insertDoubt(input: {
    subjectId: string
    lectureId: string
    studentId: string
    question: string
    aiResponse: string
  }) {
    const timestamp = now()
    this.db
      .prepare(
        `
          INSERT INTO student_doubts (
            id, subject_id, lecture_id, student_id, question, summary, ai_response, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
        `
      )
      .run(
        `doubt-${randomUUID()}`,
        input.subjectId,
        input.lectureId,
        input.studentId,
        input.question,
        summarizeText(input.question, 2),
        input.aiResponse,
        timestamp,
        timestamp
      )
  }

  private createDefaultModule(subjectId: string, title: string, sequence: number) {
    const timestamp = now()
    this.db
      .prepare(
        'INSERT OR IGNORE INTO modules (id, subject_id, title, sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(`${subjectId}-module-${String(sequence).padStart(2, '0')}`, subjectId, title, sequence, timestamp, timestamp)
  }

  private seedConnectors() {
    const connectors = [
      {
        id: 'connector-drive-nk',
        teacherId: 'teacher-nk',
        provider: 'google-drive',
        name: 'CS Drive Notes',
        status: 'connected',
        availableNotes:
          'Drive folder contains module notes, handwritten examples, and previous-year explanation sheets for trees, graphs, gradient descent, and exam revision.',
      },
      {
        id: 'connector-classroom-nk',
        teacherId: 'teacher-nk',
        provider: 'google-classroom',
        name: 'Google Classroom Stream',
        status: 'connected',
        availableNotes:
          'Classroom stream includes posted lecture PDFs, student questions, assignment rubrics, and short recap notes from recent lectures.',
      },
      {
        id: 'connector-drive-sp',
        teacherId: 'teacher-sp',
        provider: 'google-drive',
        name: 'Statistics Drive',
        status: 'connected',
        availableNotes:
          'Statistics Drive includes probability distribution notes, solved numerical examples, and tutorial problem summaries.',
      },
    ] satisfies Array<Omit<ConnectorSource, 'lastSyncedAt'>>

    const insertConnector = this.db.prepare(
      'INSERT OR IGNORE INTO connector_sources (id, teacher_id, provider, name, status, available_notes, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, NULL)'
    )

    for (const connector of connectors) {
      insertConnector.run(connector.id, connector.teacherId, connector.provider, connector.name, connector.status, connector.availableNotes)
    }
  }

  private seedDoubts() {
    const timestamp = now()
    const doubts = [
      {
        id: 'doubt-brajesh-bst-balance',
        subjectId: 'cs-301',
        lectureId: 'cs-301-lecture-08',
        studentId: 'student-brajesh',
        question: 'Why does a balanced tree improve search compared with a skewed tree?',
        summary: 'Needs reinforcement on height, skew, and O(log n) versus O(n) search behavior.',
        aiResponse: 'The AI explained that a skewed tree behaves like a linked list, while balance keeps height small.',
      },
      {
        id: 'doubt-maya-inorder',
        subjectId: 'cs-301',
        lectureId: 'cs-301-lecture-08',
        studentId: 'student-maya',
        question: 'How does inorder traversal produce sorted output in a binary search tree?',
        summary: 'Understands traversal order but needs a concrete BST example.',
        aiResponse: 'The AI explained left subtree, root, right subtree using the selected lecture notes.',
      },
      {
        id: 'doubt-maya-gradient',
        subjectId: 'cs-340',
        lectureId: 'cs-340-lecture-03',
        studentId: 'student-maya',
        question: 'What happens if the learning rate is too high?',
        summary: 'Needs a visual explanation of overshooting during gradient descent.',
        aiResponse: 'The AI described overshooting and unstable convergence from the lecture notes.',
      },
    ]

    const insertDoubt = this.db.prepare(
      'INSERT OR IGNORE INTO student_doubts (id, subject_id, lecture_id, student_id, question, summary, ai_response, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )

    for (const doubt of doubts) {
      insertDoubt.run(doubt.id, doubt.subjectId, doubt.lectureId, doubt.studentId, doubt.question, doubt.summary, doubt.aiResponse, 'open', timestamp, timestamp)
    }
  }

  private async runMutation<T>(operation: () => Promise<T> | T) {
    const run = mutationQueue.then(() => operation())
    mutationQueue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async seed() {
    const timestamp = now()
    const users: AcademicUser[] = [
      {
        id: 'super-admin-root',
        role: 'super-admin',
        name: 'Ananya Sharma',
        email: 'admin@onestop.edu',
        department: 'Academic Operations',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'teacher-nk',
        role: 'teacher',
        name: 'Dr. Nilay Karade',
        email: 'nilay@onestop.edu',
        department: 'Computer Science',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'teacher-sp',
        role: 'teacher',
        name: 'Prof. Sneha Patil',
        email: 'sneha@onestop.edu',
        department: 'Statistics',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'student-brajesh',
        role: 'student',
        name: 'Brajesh Kurkure',
        email: 'brajesh@onestop.edu',
        department: 'Computer Science',
        year: 3,
        semester: 5,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'student-maya',
        role: 'student',
        name: 'Maya Rodriguez',
        email: 'maya@onestop.edu',
        department: 'Computer Science',
        year: 3,
        semester: 5,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'student-arjun',
        role: 'student',
        name: 'Arjun Mehta',
        email: 'arjun@onestop.edu',
        department: 'Computer Science',
        year: 2,
        semester: 3,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]

    const subjects = [
      {
        id: 'cs-301',
        code: 'CS 301',
        name: 'Data Structures & Algorithms',
        description: 'Trees, graphs, traversal strategies, and algorithmic reasoning.',
        year: 3,
        semester: 5,
        teacherId: 'teacher-nk',
      },
      {
        id: 'cs-340',
        code: 'CS 340',
        name: 'Machine Learning Systems',
        description: 'Model training, evaluation, optimization, and production ML systems.',
        year: 3,
        semester: 5,
        teacherId: 'teacher-nk',
      },
      {
        id: 'stat-210',
        code: 'STAT 210',
        name: 'Applied Statistics',
        description: 'Probability, distributions, estimation, and applied inference.',
        year: 2,
        semester: 3,
        teacherId: 'teacher-sp',
      },
    ]

    const modules = [
      { id: 'cs-301-module-01', subjectId: 'cs-301', title: 'Module 01: Trees and Graphs', sequence: 1 },
      { id: 'cs-301-module-02', subjectId: 'cs-301', title: 'Module 02: Algorithm Design', sequence: 2 },
      { id: 'cs-340-module-01', subjectId: 'cs-340', title: 'Module 01: Optimization', sequence: 1 },
      { id: 'stat-210-module-01', subjectId: 'stat-210', title: 'Module 01: Probability Models', sequence: 1 },
    ]

    const lectures = [
      {
        id: 'cs-301-lecture-08',
        subjectId: 'cs-301',
        moduleId: 'cs-301-module-01',
        title: 'Trees, Graphs & Traversals',
        topic: 'Binary search trees and traversal patterns',
        sequence: 8,
        status: 'live',
        notes:
          'A complete tree fills every level except possibly the last, and nodes on the last level are filled from left to right. A balanced tree keeps its height small enough that search, insert, and delete operations stay efficient. In a binary search tree, inorder traversal visits the left subtree, then the root, then the right subtree, producing values in sorted order. Balance matters because a skewed tree can behave like a linked list, making search O(n), while a balanced tree keeps search near O(log n). Breadth-first search uses a queue and explores nodes level by level, which is useful for shortest-path reasoning in unweighted graphs.',
        createdBy: 'teacher-nk',
      },
      {
        id: 'cs-301-lecture-09',
        subjectId: 'cs-301',
        moduleId: 'cs-301-module-01',
        title: 'Graph Search Strategies',
        topic: 'BFS, DFS, visited sets, and traversal tradeoffs',
        sequence: 9,
        status: 'ready',
        notes:
          'Breadth-first search explores the nearest neighbors first and uses a queue. Depth-first search follows a path deeply before backtracking and often uses recursion or a stack. A visited set prevents repeated work and avoids cycles in graph traversal.',
        createdBy: 'teacher-nk',
      },
      {
        id: 'cs-340-lecture-03',
        subjectId: 'cs-340',
        moduleId: 'cs-340-module-01',
        title: 'Gradient Descent Intuition',
        topic: 'Loss functions, gradients, and step sizes',
        sequence: 3,
        status: 'ready',
        notes:
          'Gradient descent updates parameters in the direction that reduces loss. The learning rate controls step size. If the learning rate is too high, training can overshoot; if it is too low, convergence can be slow.',
        createdBy: 'teacher-nk',
      },
      {
        id: 'stat-210-lecture-05',
        subjectId: 'stat-210',
        moduleId: 'stat-210-module-01',
        title: 'Probability Distributions',
        topic: 'Discrete and continuous distributions',
        sequence: 5,
        status: 'ready',
        notes:
          'A probability distribution describes how probability mass or density is assigned across possible outcomes. Discrete distributions assign probability to countable outcomes, while continuous distributions use density over intervals.',
        createdBy: 'teacher-sp',
      },
    ]

    const insertUser = this.db.prepare(
      'INSERT INTO users (id, role, name, email, department, year, semester, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertSubject = this.db.prepare(
      'INSERT INTO subjects (id, code, name, description, year, semester, teacher_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertModule = this.db.prepare(
      'INSERT INTO modules (id, subject_id, title, sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const insertLecture = this.db.prepare(
      'INSERT INTO lectures (id, subject_id, module_id, title, topic, sequence, status, notes, planned_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)'
    )
    const insertEnrollment = this.db.prepare(
      'INSERT INTO subject_enrollments (subject_id, student_id, created_at) VALUES (?, ?, ?)'
    )

    this.db.exec('BEGIN')
    try {
      for (const user of users) {
        insertUser.run(user.id, user.role, user.name, user.email, user.department, user.year ?? null, user.semester ?? null, user.status, user.createdAt, user.updatedAt)
      }
      for (const subject of subjects) {
        insertSubject.run(subject.id, subject.code, subject.name, subject.description, subject.year, subject.semester, subject.teacherId, 'active', timestamp, timestamp)
      }
      for (const moduleUnit of modules) {
        insertModule.run(moduleUnit.id, moduleUnit.subjectId, moduleUnit.title, moduleUnit.sequence, timestamp, timestamp)
      }
      for (const lecture of lectures) {
        insertLecture.run(lecture.id, lecture.subjectId, lecture.moduleId, lecture.title, lecture.topic, lecture.sequence, lecture.status, lecture.notes, lecture.createdBy, timestamp, timestamp)
      }
      for (const [subjectId, studentId] of [
        ['cs-301', 'student-brajesh'],
        ['cs-340', 'student-brajesh'],
        ['cs-301', 'student-maya'],
        ['cs-340', 'student-maya'],
        ['stat-210', 'student-arjun'],
      ]) {
        insertEnrollment.run(subjectId, studentId, timestamp)
      }

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    this.insertSession({
      subjectId: 'cs-301',
      lectureId: 'cs-301-lecture-08',
      teacherId: 'teacher-nk',
      studentId: null,
      startedByRole: 'teacher',
      title: 'Trees, Graphs & Traversals',
      focus: 'Binary search trees and traversal patterns',
      mode: 'teacher-led',
      noteSnapshot: lectures[0].notes,
    })

    await Promise.all(lectures.map((lecture) => syncLectureToRag(this.db, lecture.id)))
  }
}

async function ensureRepositoryInitialized() {
  if (!repositorySingleton) {
    repositorySingleton = new AcademicRepository()
  }

  if (!initPromise) {
    initPromise = repositorySingleton.init()
  }

  await initPromise
}

export function getAcademicRepository() {
  return {
    async getWorkspace(role: AcademicRole, userId: string) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.getWorkspace(role, userId)
    },
    async listUsers() {
      await ensureRepositoryInitialized()
      return repositorySingleton!.listUsers()
    },
    async createUser(input: CreateUserInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.createUser(input)
    },
    async updateUser(input: UpdateUserInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.updateUser(input)
    },
    async deleteUser(userId: string) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.deleteUser(userId)
    },
    async listSubjects() {
      await ensureRepositoryInitialized()
      return repositorySingleton!.listSubjects()
    },
    async createSubject(input: CreateSubjectInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.createSubject(input)
    },
    async updateSubject(input: UpdateSubjectInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.updateSubject(input)
    },
    async assign(input: AssignmentInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.assign(input)
    },
    async unassign(input: AssignmentInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.unassign(input)
    },
    async createLecture(input: CreateLectureInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.createLecture(input)
    },
    async updateLecture(input: UpdateLectureInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.updateLecture(input)
    },
    async startLectureSession(input: StartLectureSessionInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.startLectureSession(input)
    },
    async startStudySession(input: StartStudySessionInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.startStudySession(input)
    },
    async endSession(input: EndSessionInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.endSession(input)
    },
    async syncConnectorNotes(input: SyncConnectorNotesInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.syncConnectorNotes(input)
    },
    async runFacultyAssistant(input: FacultyAssistantInput) {
      await ensureRepositoryInitialized()
      return repositorySingleton!.runFacultyAssistant(input)
    },
  }
}
