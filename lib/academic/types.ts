import type { LectureContext } from '@/lib/rag/types'

export type AcademicRole = 'super-admin' | 'teacher' | 'student'
export type AcademicStatus = 'active' | 'inactive'
export type LectureStatus = 'draft' | 'ready' | 'live' | 'completed'
export type SessionStatus = 'live' | 'ended'
export type SessionMode = 'teacher-led' | 'student-replay' | 'ai-generated'
export type ConnectorProvider = 'google-drive' | 'google-classroom' | 'manual-upload'
export type ConnectorStatus = 'connected' | 'needs-auth' | 'syncing'
export type DoubtStatus = 'open' | 'reviewed' | 'resolved'

export type AcademicUser = {
  id: string
  role: AcademicRole
  name: string
  email: string
  department: string
  year?: number
  semester?: number
  status: AcademicStatus
  createdAt: string
  updatedAt: string
}

export type Subject = {
  id: string
  code: string
  name: string
  description: string
  year: number
  semester: number
  teacherId: string
  teacherName: string
  status: AcademicStatus
  createdAt: string
  updatedAt: string
}

export type SubjectEnrollment = {
  subjectId: string
  studentId: string
  createdAt: string
}

export type ModuleUnit = {
  id: string
  subjectId: string
  title: string
  sequence: number
  createdAt: string
  updatedAt: string
}

export type Lecture = {
  id: string
  subjectId: string
  moduleId: string
  title: string
  topic: string
  sequence: number
  status: LectureStatus
  notes: string
  plannedAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type LectureSession = {
  id: string
  subjectId: string
  lectureId: string
  teacherId?: string
  studentId?: string
  startedByRole: AcademicRole
  title: string
  focus: string
  mode: SessionMode
  status: SessionStatus
  noteSnapshot: string
  startedAt: string
  endedAt?: string
}

export type StudentDoubt = {
  id: string
  subjectId: string
  lectureId: string
  studentId: string
  studentName: string
  question: string
  summary: string
  aiResponse: string
  status: DoubtStatus
  createdAt: string
  updatedAt: string
}

export type ConnectorSource = {
  id: string
  teacherId: string
  provider: ConnectorProvider
  name: string
  status: ConnectorStatus
  availableNotes: string
  lastSyncedAt?: string
}

export type AcademicWorkspace = {
  viewer: AcademicUser
  users: AcademicUser[]
  subjects: Subject[]
  enrollments: SubjectEnrollment[]
  modules: ModuleUnit[]
  lectures: Lecture[]
  sessions: LectureSession[]
  doubts: StudentDoubt[]
  connectors: ConnectorSource[]
  lectureContexts: Record<string, LectureContext>
  stats: {
    activeStudents: number
    activeTeachers: number
    activeSubjects: number
    liveSessions: number
    indexedLectures: number
    assignedSubjects: number
    readyLectures: number
    completedLectures: number
    openDoubts: number
    connectedSources: number
  }
}

export type CreateUserInput = {
  role: AcademicRole
  name: string
  email: string
  department?: string
  year?: number
  semester?: number
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, 'role'>> & {
  id: string
  role?: AcademicRole
  status?: AcademicStatus
}

export type CreateSubjectInput = {
  code: string
  name: string
  description?: string
  year: number
  semester: number
  teacherId: string
}

export type UpdateSubjectInput = Partial<CreateSubjectInput> & {
  id: string
  status?: AcademicStatus
}

export type CreateModuleInput = {
  subjectId: string
  title: string
}

export type CreateDoubtInput = {
  subjectId: string
  lectureId: string
  studentId: string
  question: string
  aiResponse: string
}

export type CreateLectureInput = {
  subjectId: string
  moduleId: string
  title: string
  topic: string
  notes?: string
  plannedAt?: string
  createdBy: string
}

export type UpdateLectureInput = Partial<Omit<CreateLectureInput, 'createdBy'>> & {
  id: string
  status?: LectureStatus
}

export type AssignmentInput = {
  subjectId: string
  userId: string
  kind: 'teacher' | 'student'
}

export type StartLectureSessionInput = {
  lectureId: string
  teacherId: string
}

export type StartStudySessionInput = {
  subjectId: string
  lectureId: string
  studentId: string
  focus: string
}

export type EndSessionInput = {
  sessionId: string
}

export type SyncConnectorNotesInput = {
  connectorId: string
  lectureId: string
  teacherId: string
}

export type FacultyAssistantInput = {
  teacherId: string
  subjectId?: string
  connectorId?: string
  command: string
  confirmationToken?: string
}

export type FacultyAssistantResult = {
  answer: string
  action: 'answered' | 'created-lecture' | 'synced-notes' | 'summarized-doubts' | 'confirmation-required' | 'blocked'
  confirmationToken?: string
  proposedAction?: string
  guardrails: string[]
  createdLectureId?: string
  updatedLectureId?: string
  citations?: Array<{
    sourceName: string
    section: string
  }>
}
