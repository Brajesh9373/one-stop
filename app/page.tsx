'use client'

import { AnimatePresence, motion } from 'motion/react'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronDown,
  Cloud,
  Database,
  FileText,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Mic,
  MonitorPlay,
  PanelLeftClose,
  Phone,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  SquareStack,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type {
  AcademicRole,
  AcademicWorkspace,
  FacultyAssistantResult,
  Lecture,
  LectureSession,
  Subject,
} from '@/lib/academic/types'
import type { LectureContext, RagResult } from '@/lib/rag/types'

type View = 'overview' | 'admin' | 'classroom' | 'subject' | 'lecture' | 'chat' | 'call' | 'connectors' | 'sessions' | 'profile'
type AiScope = 'lecture' | 'subject'
type VoiceAssistantState = 'idle' | 'listening' | 'processing' | 'completed' | 'error'

type BrowserSpeechAlternative = {
  transcript: string
  confidence?: number
}

type BrowserSpeechResult = {
  isFinal: boolean
  [index: number]: BrowserSpeechAlternative
}

type BrowserSpeechResultList = {
  length: number
  [index: number]: BrowserSpeechResult
}

type BrowserSpeechRecognitionEvent = Event & {
  resultIndex?: number
  results: BrowserSpeechResultList
}

type BrowserSpeechRecognitionErrorEvent = Event & {
  error?: string
  message?: string
}

type BrowserSpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: ((event: Event) => void) | null
  onend: ((event: Event) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition
  }
}

const demoUsers: Record<AcademicRole, string> = {
  'super-admin': 'super-admin-root',
  teacher: 'teacher-nk',
  student: 'student-brajesh',
}

const roleLabels: Record<AcademicRole, string> = {
  'super-admin': 'Super admin',
  teacher: 'Teacher',
  student: 'Student',
}

const navFor = (role: AcademicRole) =>
  role === 'super-admin'
    ? [
        { id: 'overview' as View, label: 'Command center', icon: LayoutDashboard },
        { id: 'admin' as View, label: 'Users & subjects', icon: ShieldCheck },
        { id: 'sessions' as View, label: 'Live sessions', icon: Radio },
      ]
    : role === 'teacher'
      ? [
          { id: 'overview' as View, label: 'Overview', icon: LayoutDashboard },
          { id: 'classroom' as View, label: 'Classroom', icon: GraduationCap },
          { id: 'connectors' as View, label: 'Connectors', icon: Cloud },
        ]
      : [
          { id: 'overview' as View, label: 'Overview', icon: LayoutDashboard },
          { id: 'classroom' as View, label: 'Classroom', icon: GraduationCap },
        ]

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Request failed.')
  }
  return payload as T
}

function summarizeText(value: string, fallback: string, maxSentences = 3) {
  const source = value.trim() || fallback
  const sentences = source
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  return sentences.slice(0, maxSentences).join(' ') || source.slice(0, 240)
}

function completedLectures(lectures: Lecture[]) {
  return lectures.filter((lecture) => lecture.notes.trim().length > 0 || lecture.status === 'completed' || lecture.status === 'live')
}

function createSubjectContext(subject: Subject | undefined, lectures: Lecture[], workspace: AcademicWorkspace | null): LectureContext | undefined {
  if (!subject || !workspace) return undefined
  const anchor = lectures.find((lecture) => lecture.notes.trim()) ?? lectures[0]
  if (!anchor) return undefined
  const anchorContext = workspace.lectureContexts[anchor.id]
  if (!anchorContext) return undefined

  return {
    ...anchorContext,
    lectureId: `${subject.id}-subject-context`,
    lectureTitle: `${subject.name} subject context`,
    lectureSequence: 0,
  }
}

function Logo() {
  return (
    <motion.div className="brand-logo" whileHover={{ x: 2 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>
      <Image src="/brand/onestop-logo-transparent.png" alt="OneStop" width={955} height={676} priority />
      <span className="brand-wordmark" aria-hidden="true">ONESTOP</span>
    </motion.div>
  )
}

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'success' | 'accent' | 'warning' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white/50 p-8 text-center">
      <div className="empty-orb">
        <Sparkles size={20} />
      </div>
      <p className="mt-4 font-display text-lg font-semibold">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, note }: { icon: typeof Activity; label: string; value: string | number; note: string }) {
  return (
    <div className="stat-card rounded-lg border border-white/70 bg-white/75 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon size={17} />
        </span>
        <span className="font-mono text-[10px] uppercase text-muted-foreground">{label}</span>
      </div>
      <p className="mt-5 font-display text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>
    </div>
  )
}

function SubjectCard({ subject, lectures, onOpen }: { subject: Subject; lectures: Lecture[]; onOpen: () => void }) {
  const ready = completedLectures(lectures).length
  const live = lectures.filter((lecture) => lecture.status === 'live').length

  return (
    <button className="subject-card rounded-lg border border-white/70 bg-white/75 p-5 text-left shadow-sm transition hover:border-primary/40" onClick={onOpen}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge tone="accent">{subject.code}</Badge>
          <h3 className="mt-3 font-display text-xl font-semibold">{subject.name}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{subject.description}</p>
        </div>
        <ArrowUpRight size={18} className="text-muted-foreground" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
        <span className="rounded-md bg-white/70 p-2"><strong className="block text-foreground">{ready}</strong>completed</span>
        <span className="rounded-md bg-white/70 p-2"><strong className="block text-foreground">{live}</strong>live</span>
        <span className="rounded-md bg-white/70 p-2"><strong className="block text-foreground">Sem {subject.semester}</strong>year {subject.year}</span>
      </div>
    </button>
  )
}

function LectureSummaryCard({ lecture, onOpen }: { lecture: Lecture; onOpen: () => void }) {
  return (
    <button className="lecture-summary-card rounded-lg border border-border bg-white/75 p-4 text-left transition hover:border-primary/40" onClick={onOpen}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Lecture {lecture.sequence}</span>
            <Badge tone={lecture.status === 'live' ? 'success' : lecture.status === 'draft' ? 'warning' : 'accent'}>{lecture.status}</Badge>
          </div>
          <h3 className="mt-2 text-base font-semibold">{lecture.title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{summarizeText(lecture.notes, lecture.topic, 3)}</p>
        </div>
        <ArrowUpRight size={16} className="text-muted-foreground" />
      </div>
    </button>
  )
}

function Overview({
  role,
  workspace,
  onNavigate,
  onOpenSubject,
}: {
  role: AcademicRole
  workspace: AcademicWorkspace
  onNavigate: (view: View) => void
  onOpenSubject: (subjectId: string) => void
}) {
  const liveSessions = workspace.sessions.filter((session) => session.status === 'live')

  const statCards =
    role === 'student'
      ? [
          { icon: BookOpen, label: 'Subjects', value: workspace.stats.assignedSubjects, note: 'Semester classrooms assigned to you' },
          { icon: FileText, label: 'Lectures', value: workspace.stats.completedLectures, note: 'Completed lectures with notes' },
          { icon: Radio, label: 'Live', value: workspace.stats.liveSessions, note: 'Sessions available to join' },
          { icon: BrainCircuit, label: 'Indexed', value: workspace.stats.indexedLectures, note: 'Lectures ready for AI help' },
        ]
      : role === 'teacher'
        ? [
            { icon: BookOpen, label: 'Assigned', value: workspace.stats.assignedSubjects, note: 'Subjects under your ownership' },
            { icon: FileText, label: 'Ready', value: workspace.stats.readyLectures, note: 'Lectures with indexed notes' },
            { icon: MessageSquareText, label: 'Doubts', value: workspace.stats.openDoubts, note: 'Open student AI conversations' },
            { icon: Cloud, label: 'Sources', value: workspace.stats.connectedSources, note: 'Connected note providers' },
          ]
        : [
            { icon: Users, label: 'Students', value: workspace.stats.activeStudents, note: 'Active learners in the system' },
            { icon: GraduationCap, label: 'Teachers', value: workspace.stats.activeTeachers, note: 'Faculty with classrooms' },
            { icon: BookOpen, label: 'Subjects', value: workspace.stats.activeSubjects, note: 'Running subject workspaces' },
            { icon: Radio, label: 'Live', value: workspace.stats.liveSessions, note: 'Active sessions now' },
          ]

  return (
    <motion.div className="overview-page animate-in" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-intro mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">{roleLabels[role]} workspace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Welcome, {workspace.viewer.name}.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {role === 'teacher'
              ? 'Control assigned subjects, respond to student learning signals, and use the assistant to prepare lecture material from connected notes.'
              : role === 'student'
                ? 'Open a subject, review completed lectures, and use chat, call, or a live replay only from the lecture or subject context.'
                : 'Manage academic users, subject assignments, lecture structure, and live readiness from one place.'}
          </p>
        </div>
        <Button className="rounded-lg" onClick={() => onNavigate(role === 'super-admin' ? 'admin' : 'classroom')}>
          <Sparkles size={16} /> Continue
        </Button>
      </div>

      <div className="stats-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item) => (
          <StatCard key={item.label} icon={item.icon} label={item.label} value={item.value} note={item.note} />
        ))}
      </div>

      {role === 'teacher' && <FacultyAssistantPanel workspace={workspace} />}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="surface-card rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">Classrooms</p>
              <h2 className="mt-1 font-display text-xl font-semibold">Assigned subjects</h2>
            </div>
            <Button variant="outline" className="rounded-lg" onClick={() => onNavigate('classroom')}>
              Open <ArrowUpRight size={15} />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {workspace.subjects.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                lectures={workspace.lectures.filter((lecture) => lecture.subjectId === subject.id)}
                onOpen={() => (role === 'student' ? onOpenSubject(subject.id) : onNavigate(role === 'teacher' ? 'classroom' : 'admin'))}
              />
            ))}
          </div>
        </section>

        <section className="surface-card rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">Now live</p>
              <h2 className="mt-1 font-display text-xl font-semibold">Sessions</h2>
            </div>
            <Radio size={18} className="text-primary" />
          </div>
          {liveSessions.length > 0 ? (
            <div className="grid gap-3">
              {liveSessions.slice(0, 4).map((session) => (
                <div key={session.id} className="rounded-lg border border-border bg-white/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{session.title}</p>
                    <span className="live-dot" />
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{session.focus}</p>
                  <p className="mt-2 font-mono text-[10px] uppercase text-muted-foreground">{session.mode}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No live sessions" description="Start a teacher-led session or student replay from a lecture." />
          )}
        </section>
      </div>
    </motion.div>
  )
}

function FacultyAssistantPanel({ workspace }: { workspace: AcademicWorkspace }) {
  const [subjectId, setSubjectId] = useState(workspace.subjects[0]?.id ?? '')
  const [connectorId, setConnectorId] = useState(workspace.connectors[0]?.id ?? '')
  const [result, setResult] = useState<FacultyAssistantResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceAssistantState>('idle')
  const [lastTranscript, setLastTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const submittedTranscriptRef = useRef(false)
  const selectedSubject = workspace.subjects.find((subject) => subject.id === subjectId)
  const selectedConnector = workspace.connectors.find((connector) => connector.id === connectorId)

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  async function runAssistant(nextCommand: string) {
    const command = nextCommand.trim()
    if (!command) return

    setVoiceState('processing')
    setError(null)
    setResult(null)
    setLastTranscript(command)
    setInterimTranscript('')

    try {
      const payload = await apiJson<FacultyAssistantResult>('/api/academic/assistant', {
        method: 'POST',
        body: JSON.stringify({
          teacherId: workspace.viewer.id,
          subjectId,
          connectorId,
          command,
        }),
      })
      setResult(payload)
      setVoiceState('completed')
    } catch (assistantError) {
      setError(assistantError instanceof Error ? assistantError.message : 'Unable to run assistant.')
      setVoiceState('error')
    }
  }

  function stopVoiceCommand() {
    recognitionRef.current?.stop()
  }

  function startVoiceCommand() {
    if (!subjectId) {
      setError('Select an assigned subject before using the faculty assistant.')
      setVoiceState('error')
      return
    }

    if (typeof window === 'undefined') return

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setError('Voice recognition is not supported in this browser. Use Chrome or Edge with microphone permission enabled.')
      setVoiceState('error')
      return
    }

    recognitionRef.current?.abort()
    setError(null)
    setResult(null)
    setLastTranscript('')
    setInterimTranscript('Listening for a faculty command...')
    submittedTranscriptRef.current = false

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'en-IN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    recognition.onstart = () => {
      setVoiceState('listening')
    }

    recognition.onerror = (event) => {
      submittedTranscriptRef.current = true
      setError(event.message || `Voice recognition failed${event.error ? `: ${event.error}` : '.'}`)
      setInterimTranscript('')
      setVoiceState('error')
    }

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      const startIndex = event.resultIndex ?? 0

      for (let index = startIndex; index < event.results.length; index += 1) {
        const speechResult = event.results[index]
        const transcript = speechResult[0]?.transcript?.trim()
        if (!transcript) continue

        if (speechResult.isFinal) {
          finalText = [finalText, transcript].filter(Boolean).join(' ')
        } else {
          interimText = [interimText, transcript].filter(Boolean).join(' ')
        }
      }

      if (interimText) setInterimTranscript(interimText)
      if (finalText.trim()) {
        submittedTranscriptRef.current = true
        recognition.stop()
        void runAssistant(finalText)
      }
    }

    recognition.onend = () => {
      recognitionRef.current = null
      if (!submittedTranscriptRef.current) {
        setInterimTranscript('')
        setVoiceState((current) => (current === 'listening' ? 'idle' : current))
      }
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setInterimTranscript('')
      setError('Could not start voice recognition. Check microphone permission and try again.')
      setVoiceState('error')
    }
  }

  const voiceLabel =
    voiceState === 'listening'
      ? 'Listening'
      : voiceState === 'processing'
        ? 'Running command'
        : voiceState === 'completed'
          ? 'Command completed'
          : voiceState === 'error'
            ? 'Needs attention'
            : 'Tap to speak'

  return (
    <section className="faculty-voice-panel mt-8">
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="faculty-voice-stage">
          <div className="max-w-lg text-center">
            <div>
              <p className="eyebrow">Faculty AI voice assistant</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Command classroom work by voice</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Tap the orb, speak naturally, and the assistant will execute only subject-scoped classroom actions.
              </p>
            </div>
            <button
              className={`voice-assistant-orb is-${voiceState}`}
              onClick={voiceState === 'listening' ? stopVoiceCommand : startVoiceCommand}
              disabled={voiceState === 'processing'}
              aria-label={voiceState === 'listening' ? 'Stop listening' : 'Start faculty voice assistant'}
              aria-pressed={voiceState === 'listening'}
            >
              <span className="voice-assistant-ring ring-one" />
              <span className="voice-assistant-ring ring-two" />
              <span className="voice-assistant-ring ring-three" />
              <span className="voice-assistant-core">
                <Mic size={30} />
              </span>
              <span className="voice-assistant-bars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            </button>
            <div className="voice-assistant-status">
              <p className="font-display text-lg font-semibold">{voiceLabel}</p>
              <p>{interimTranscript || lastTranscript || 'No voice command captured yet.'}</p>
            </div>
          </div>
        </div>
        <div className="faculty-voice-output">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="voice-context-field">
              <span>Subject scope</span>
              <select className="text-input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                {workspace.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.code} · {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="voice-context-field">
              <span>Connector access</span>
              <select className="text-input" value={connectorId} onChange={(event) => setConnectorId(event.target.value)}>
                {workspace.connectors.length === 0 && <option value="">No connector configured</option>}
                {workspace.connectors.map((connector) => (
                  <option key={connector.id} value={connector.id}>
                    {connector.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="voice-scope-card">
              <span>Active subject</span>
              <strong>{selectedSubject ? selectedSubject.code : 'None'}</strong>
              <p>{selectedSubject?.name ?? 'Assign a subject before running commands.'}</p>
            </div>
            <div className="voice-scope-card">
              <span>Connected notes</span>
              <strong>{selectedConnector?.status ?? 'none'}</strong>
              <p>{selectedConnector?.name ?? 'No connector selected.'}</p>
            </div>
            <div className="voice-scope-card">
              <span>Allowed work</span>
              <strong>Guarded</strong>
              <p>Create lectures, sync notes, answer lecture-grounded questions, summarize doubts.</p>
            </div>
          </div>
          {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
          {result ? (
            <div className="mt-4 rounded-lg border border-border bg-white/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <Badge tone={result.action === 'blocked' ? 'warning' : 'success'}>{result.action}</Badge>
                <ShieldCheck size={16} className="text-primary" />
              </div>
              <p className="mt-3 text-sm leading-6">{result.answer}</p>
              {result.citations && result.citations.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.citations.slice(0, 3).map((citation) => (
                    <span key={`${citation.sourceName}-${citation.section}`} className="answer-source">
                      <FileText size={12} /> {citation.sourceName} · {citation.section}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-2">
                {result.guardrails.map((guardrail) => (
                  <p key={guardrail} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                    <Check size={13} className="mt-0.5 text-primary" /> {guardrail}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-white/55 p-4">
              <p className="text-sm font-semibold">Example voice commands</p>
              <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
                <p>“Create a lecture on graph cycle detection.”</p>
                <p>“Fetch notes from Drive for this subject.”</p>
                <p>“How many students have doubts in this subject?”</p>
                <p>“Explain the weakest concept from the current lecture notes.”</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function AdminPanel({ workspace, reload }: { workspace: AcademicWorkspace; reload: () => Promise<void> }) {
  const teachers = workspace.users.filter((user) => user.role === 'teacher')
  const students = workspace.users.filter((user) => user.role === 'student')
  const [userForm, setUserForm] = useState({ role: 'student' as AcademicRole, name: '', email: '', year: 3, semester: 5 })
  const [assignmentSubjectId, setAssignmentSubjectId] = useState(workspace.subjects[0]?.id ?? '')
  const [message, setMessage] = useState<string | null>(null)

  async function createUser() {
    await apiJson('/api/academic/users', {
      method: 'POST',
      body: JSON.stringify(userForm),
    })
    setUserForm({ role: 'student', name: '', email: '', year: 3, semester: 5 })
    setMessage('User created.')
    await reload()
  }

  async function assignStudent(studentId: string, assigned: boolean) {
    if (!assignmentSubjectId) return
    await apiJson('/api/academic/assignments', {
      method: assigned ? 'DELETE' : 'POST',
      body: JSON.stringify({ subjectId: assignmentSubjectId, userId: studentId, kind: 'student' }),
    })
    await reload()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <section className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Super admin</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Create users</h2>
          </div>
          <UserPlus size={18} className="text-primary" />
        </div>
        <div className="mt-5 grid gap-3">
          <select className="text-input" value={userForm.role} onChange={(event) => setUserForm((form) => ({ ...form, role: event.target.value as AcademicRole }))}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="super-admin">Super admin</option>
          </select>
          <input className="text-input" value={userForm.name} onChange={(event) => setUserForm((form) => ({ ...form, name: event.target.value }))} placeholder="Full name" />
          <input className="text-input" value={userForm.email} onChange={(event) => setUserForm((form) => ({ ...form, email: event.target.value }))} placeholder="email@college.edu" />
          {userForm.role === 'student' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="text-input" type="number" value={userForm.year} onChange={(event) => setUserForm((form) => ({ ...form, year: Number(event.target.value) }))} placeholder="Year" />
              <input className="text-input" type="number" value={userForm.semester} onChange={(event) => setUserForm((form) => ({ ...form, semester: Number(event.target.value) }))} placeholder="Semester" />
            </div>
          )}
          <Button className="rounded-lg" disabled={!userForm.name.trim() || !userForm.email.trim()} onClick={() => void createUser()}>
            <Plus size={16} /> Add user
          </Button>
        </div>
        {message && <p className="mt-4 rounded-lg bg-primary/10 p-3 text-xs text-primary">{message}</p>}
      </section>

      <section className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Assignments</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Students and subjects</h2>
          </div>
          <select className="text-input max-w-xs" value={assignmentSubjectId} onChange={(event) => setAssignmentSubjectId(event.target.value)}>
            {workspace.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.code} · {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-5 grid gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Teachers</p>
            <div className="grid gap-2">
              {teachers.map((teacher) => (
                <div key={teacher.id} className="rounded-lg border border-border bg-white/70 p-3">
                  <p className="text-sm font-semibold">{teacher.name}</p>
                  <p className="text-xs text-muted-foreground">{teacher.email}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Students</p>
            <div className="grid gap-2">
              {students.map((student) => {
                const assigned = workspace.enrollments.some((enrollment) => enrollment.subjectId === assignmentSubjectId && enrollment.studentId === student.id)
                return (
                  <div key={student.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white/70 p-3">
                    <div>
                      <p className="text-sm font-semibold">{student.name}</p>
                      <p className="text-xs text-muted-foreground">Year {student.year} · Sem {student.semester} · {student.email}</p>
                    </div>
                    <Button variant={assigned ? 'secondary' : 'outline'} className="rounded-lg" onClick={() => void assignStudent(student.id, assigned)}>
                      {assigned ? <Check size={15} /> : <Plus size={15} />} {assigned ? 'Enrolled' : 'Enroll'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function StudentClassroom({ workspace, onOpenSubject }: { workspace: AcademicWorkspace; onOpenSubject: (subjectId: string) => void }) {
  return (
    <section>
      <div className="mb-6">
        <p className="eyebrow">Student classroom</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Your subjects</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Open a subject to see completed lectures and subject-level doubt options.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspace.subjects.map((subject) => (
          <SubjectCard
            key={subject.id}
            subject={subject}
            lectures={workspace.lectures.filter((lecture) => lecture.subjectId === subject.id)}
            onOpen={() => onOpenSubject(subject.id)}
          />
        ))}
      </div>
    </section>
  )
}

function StudentSubjectPage({
  subject,
  lectures,
  onBack,
  onOpenLecture,
  onOpenChat,
  onOpenCall,
  onStartSubjectRoom,
}: {
  subject: Subject | undefined
  lectures: Lecture[]
  onBack: () => void
  onOpenLecture: (lectureId: string) => void
  onOpenChat: () => void
  onOpenCall: () => void
  onStartSubjectRoom: () => void
}) {
  const completed = completedLectures(lectures)
  if (!subject) return <EmptyState title="No subject selected" description="Return to classroom and open a subject." />

  return (
    <section>
      <button className="back-link mb-5" onClick={onBack}>
        <ArrowLeft size={15} /> Back to subjects
      </button>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">{subject.code} · Subject workspace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{subject.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{subject.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-lg" onClick={onOpenChat}><MessageSquareText size={15} /> Ask subject doubt</Button>
          <Button variant="outline" className="rounded-lg" onClick={onOpenCall}><Phone size={15} /> Subject call</Button>
          <Button variant="outline" className="rounded-lg" onClick={onStartSubjectRoom}><Play size={15} /> Subject room</Button>
        </div>
      </div>
      <div className="grid gap-4">
        {completed.length > 0 ? (
          completed.map((lecture) => <LectureSummaryCard key={lecture.id} lecture={lecture} onOpen={() => onOpenLecture(lecture.id)} />)
        ) : (
          <EmptyState title="No completed lectures" description="Completed lectures will appear here with summaries once notes are added." />
        )}
      </div>
      <div className="mt-6 rounded-lg border border-border bg-white/70 p-4 text-xs leading-5 text-muted-foreground">
        Subject-level AI uses a subject context so retrieval can search across the notes indexed for this subject.
      </div>
    </section>
  )
}

function StudentLecturePage({
  workspace,
  subject,
  lecture,
  onBack,
  onChat,
  onCall,
  reload,
}: {
  workspace: AcademicWorkspace
  subject: Subject | undefined
  lecture: Lecture | undefined
  onBack: () => void
  onChat: () => void
  onCall: () => void
  reload: () => Promise<void>
}) {
  const [focus, setFocus] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function startReplay() {
    if (!subject || !lecture) return
    await apiJson('/api/academic/sessions', {
      method: 'POST',
      body: JSON.stringify({
        action: 'start-study',
        subjectId: subject.id,
        lectureId: lecture.id,
        studentId: workspace.viewer.id,
        focus: focus.trim() || lecture.topic,
      }),
    })
    setMessage('Virtual classroom replay started for this lecture.')
    await reload()
  }

  if (!lecture) return <EmptyState title="No lecture selected" description="Return to the subject page and open a lecture." />

  return (
    <section>
      <button className="back-link mb-5" onClick={onBack}>
        <ArrowLeft size={15} /> Back to {subject?.code ?? 'subject'}
      </button>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
          <p className="eyebrow">{subject?.code} · Lecture {lecture.sequence}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{lecture.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{lecture.topic}</p>
          <div className="mt-5 rounded-lg border border-border bg-white/70 p-4">
            <p className="mb-2 text-sm font-semibold">Summary</p>
            <p className="text-sm leading-7 text-muted-foreground">{summarizeText(lecture.notes, lecture.topic, 3)}</p>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-white/70 p-4">
            <p className="mb-2 text-sm font-semibold">Notes</p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{lecture.notes || 'No notes have been added for this lecture yet.'}</p>
          </div>
        </div>
        <aside className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
          <p className="eyebrow">Interaction options</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Use this lecture context</h2>
          <div className="mt-5 grid gap-3">
            <Button className="rounded-lg justify-start" onClick={onChat}><MessageSquareText size={15} /> Chat with lecture</Button>
            <Button variant="outline" className="rounded-lg justify-start" onClick={onCall}><Phone size={15} /> Call lecture agent</Button>
            <Button variant="outline" className="rounded-lg justify-start" onClick={() => void startReplay()} disabled={!lecture.notes.trim()}><Play size={15} /> Virtual classroom replay</Button>
          </div>
          <label className="field-label mt-5 block">
            Replay focus
            <input className="text-input mt-2" value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="Example: explain this in Marathi" />
          </label>
          {message && <p className="mt-4 rounded-lg bg-primary/10 p-3 text-xs text-primary">{message}</p>}
        </aside>
      </div>
    </section>
  )
}

function TeacherClassroom({ workspace, reload }: { workspace: AcademicWorkspace; reload: () => Promise<void> }) {
  const [selectedSubjectId, setSelectedSubjectId] = useState(workspace.subjects[0]?.id ?? '')
  const [selectedDoubtId, setSelectedDoubtId] = useState(workspace.doubts[0]?.id ?? '')
  const subject = workspace.subjects.find((entry) => entry.id === selectedSubjectId)
  const modules = workspace.modules.filter((moduleUnit) => moduleUnit.subjectId === selectedSubjectId)
  const lectures = workspace.lectures.filter((lecture) => lecture.subjectId === selectedSubjectId)
  const doubts = workspace.doubts.filter((doubt) => doubt.subjectId === selectedSubjectId)
  const selectedDoubt = workspace.doubts.find((doubt) => doubt.id === selectedDoubtId)
  const [lectureForm, setLectureForm] = useState({ title: '', topic: '', moduleId: modules[0]?.id ?? '', notes: '' })
  const [message, setMessage] = useState<string | null>(null)
  const activeModuleId = lectureForm.moduleId || modules[0]?.id || ''

  async function addLecture() {
    if (!subject || !activeModuleId) return
    await apiJson('/api/academic/lectures', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: subject.id,
        moduleId: activeModuleId,
        title: lectureForm.title,
        topic: lectureForm.topic,
        notes: lectureForm.notes,
        createdBy: workspace.viewer.id,
      }),
    })
    setLectureForm({ title: '', topic: '', moduleId: modules[0]?.id ?? '', notes: '' })
    setMessage('Lecture created and indexed if notes were provided.')
    await reload()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Teacher classroom</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">Assigned subjects and lectures</h1>
          </div>
          <select className="text-input max-w-sm" value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
            {workspace.subjects.map((item) => (
              <option key={item.id} value={item.id}>{item.code} · {item.name}</option>
            ))}
          </select>
        </div>

        {subject && (
          <div className="mb-5 rounded-lg border border-border bg-white/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge tone="accent">{subject.code}</Badge>
                <h2 className="mt-2 font-display text-xl font-semibold">{subject.name}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{subject.description}</p>
              </div>
              <Badge tone="success">{lectures.length} lectures</Badge>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {completedLectures(lectures).map((lecture) => (
            <div key={lecture.id} className="rounded-lg border border-border bg-white/75 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">Lecture {lecture.sequence}</span>
                    <Badge tone={lecture.status === 'live' ? 'success' : 'accent'}>{lecture.status}</Badge>
                  </div>
                  <h3 className="mt-2 text-base font-semibold">{lecture.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{summarizeText(lecture.notes, lecture.topic, 3)}</p>
                </div>
                <FileText size={17} className="text-primary" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Create lecture</h3>
            <Plus size={18} className="text-primary" />
          </div>
          <div className="grid gap-3">
            <select className="text-input" value={activeModuleId} onChange={(event) => setLectureForm((form) => ({ ...form, moduleId: event.target.value }))}>
              {modules.map((moduleUnit) => (
                <option key={moduleUnit.id} value={moduleUnit.id}>{moduleUnit.title}</option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="text-input" value={lectureForm.title} onChange={(event) => setLectureForm((form) => ({ ...form, title: event.target.value }))} placeholder="Lecture title" />
              <input className="text-input" value={lectureForm.topic} onChange={(event) => setLectureForm((form) => ({ ...form, topic: event.target.value }))} placeholder="Topic" />
            </div>
            <textarea className="text-input min-h-28" value={lectureForm.notes} onChange={(event) => setLectureForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Paste notes or sync them from Connectors" />
            <Button className="rounded-lg" disabled={!lectureForm.title.trim() || !lectureForm.topic.trim()} onClick={() => void addLecture()}>
              <Plus size={15} /> Create lecture
            </Button>
            {message && <p className="rounded-lg bg-primary/10 p-3 text-xs text-primary">{message}</p>}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Student doubts</p>
            <h2 className="mt-1 font-display text-xl font-semibold">AI conversation review</h2>
          </div>
          <MessageSquareText size={18} className="text-primary" />
        </div>
        <div className="grid gap-2">
          {doubts.length > 0 ? (
            doubts.map((doubt) => (
              <button key={doubt.id} className={`rounded-lg border p-3 text-left ${doubt.id === selectedDoubtId ? 'border-primary bg-primary/5' : 'border-border bg-white/70'}`} onClick={() => setSelectedDoubtId(doubt.id)}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{doubt.studentName}</p>
                  <Badge tone={doubt.status === 'open' ? 'warning' : 'success'}>{doubt.status}</Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{doubt.summary}</p>
              </button>
            ))
          ) : (
            <EmptyState title="No student doubts" description="Doubts appear when students ask AI or start replay sessions." />
          )}
        </div>
        {selectedDoubt && (
          <div className="mt-5 rounded-lg border border-border bg-white/70 p-4">
            <p className="eyebrow">Conversation summary</p>
            <p className="mt-3 text-sm font-semibold">{selectedDoubt.question}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{selectedDoubt.summary}</p>
            <div className="mt-3 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">{selectedDoubt.aiResponse}</div>
          </div>
        )}
      </section>
    </div>
  )
}

function ConnectorsView({ workspace, reload }: { workspace: AcademicWorkspace; reload: () => Promise<void> }) {
  const teacherLectures = workspace.lectures.filter((lecture) => lecture.createdBy === workspace.viewer.id || workspace.subjects.some((subject) => subject.id === lecture.subjectId))
  const [connectorId, setConnectorId] = useState(workspace.connectors[0]?.id ?? '')
  const [lectureId, setLectureId] = useState(teacherLectures[0]?.id ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function syncNotes() {
    setError(null)
    setMessage(null)
    try {
      await apiJson('/api/academic/connectors', {
        method: 'POST',
        body: JSON.stringify({ connectorId, lectureId, teacherId: workspace.viewer.id }),
      })
      setMessage('Connector notes fetched, attached to the lecture, and indexed into RAG.')
      await reload()
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync connector.')
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
        <p className="eyebrow">Connectors</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Fetch notes from configured platforms</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Connected sources are available to the faculty assistant and can be synced into any assigned lecture.</p>
        <div className="mt-5 grid gap-3">
          {workspace.connectors.map((connector) => (
            <div key={connector.id} className="rounded-lg border border-border bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{connector.name}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">{connector.provider}</p>
                </div>
                <Badge tone={connector.status === 'connected' ? 'success' : 'warning'}>{connector.status}</Badge>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{connector.availableNotes}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Sync notes</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Attach connector data to lecture</h2>
          </div>
          <Database size={18} className="text-primary" />
        </div>
        <div className="mt-5 grid gap-3">
          <select className="text-input" value={connectorId} onChange={(event) => setConnectorId(event.target.value)}>
            {workspace.connectors.map((connector) => (
              <option key={connector.id} value={connector.id}>{connector.name}</option>
            ))}
          </select>
          <select className="text-input" value={lectureId} onChange={(event) => setLectureId(event.target.value)}>
            {teacherLectures.map((lecture) => (
              <option key={lecture.id} value={lecture.id}>{lecture.title}</option>
            ))}
          </select>
          <Button className="rounded-lg" disabled={!connectorId || !lectureId} onClick={() => void syncNotes()}>
            <Cloud size={15} /> Fetch and index notes
          </Button>
        </div>
        {message && <p className="mt-4 rounded-lg bg-primary/10 p-3 text-xs text-primary">{message}</p>}
        {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
      </section>
    </div>
  )
}

function ChatView({ userId, context, onBack }: { userId: string; context: LectureContext | undefined; onBack: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<RagResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function ask() {
    if (!context || !prompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const payload = await apiJson<RagResult>('/api/rag/query', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'chat',
          studentId: userId,
          prompt,
          context,
        }),
      })
      setResult(payload)
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Unable to query lecture RAG.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl rounded-lg border border-white/70 bg-white/75 shadow-sm">
      <div className="border-b border-border p-5">
        <button className="back-link mb-4" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <p className="eyebrow">RAG-grounded chat</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">{context?.lectureTitle ?? 'Select context'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{context ? context.courseName : 'Chat needs active lecture or subject context.'}</p>
      </div>
      <div className="min-h-80 p-5">
        {!context ? (
          <EmptyState title="Context missing" description="Open a subject or lecture before asking AI." />
        ) : result || error || loading ? (
          <div className="space-y-4">
            <div className="ml-auto max-w-2xl rounded-lg bg-primary/10 p-4 text-sm">{prompt}</div>
            {loading && <div className="max-w-2xl rounded-lg border border-border bg-white p-4 text-sm text-muted-foreground">Searching indexed academic notes.</div>}
            {error && <div className="max-w-2xl rounded-lg border border-destructive/30 bg-white p-4 text-sm text-destructive">{error}</div>}
            {result && (
              <div className="max-w-3xl rounded-lg border border-border bg-white p-4">
                <p className="text-sm leading-7">{result.answer}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.citations.map((citation) => (
                    <span key={citation.chunkId} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      <FileText size={12} /> {citation.sourceName} · {citation.section}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState title="Ask your doubt" description="Use this for explanations, translations, examples, and lecture-grounded revision." />
        )}
      </div>
      <div className="border-t border-border p-4">
        <textarea className="text-input min-h-24" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask from this context..." />
        <div className="mt-3 flex justify-end">
          <Button className="rounded-lg" disabled={!context || !prompt.trim() || loading} onClick={() => void ask()}>
            <ArrowUpRight size={15} /> Ask
          </Button>
        </div>
      </div>
    </section>
  )
}

type SarvamVoiceTurn = {
  transcript: string
  answer: string
  audioBase64: string
  audioMimeType: string
  languageCode: string
  speaker: string
  citations: RagResult['citations']
  fallbackUsed: boolean
}

function CallView({ context, onBack }: { context: LectureContext | undefined; onBack: () => void }) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneStatus, setPhoneStatus] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording' | 'processing' | 'answered' | 'error'>('idle')
  const [turn, setTurn] = useState<SarvamVoiceTurn | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phoneLoading, setPhoneLoading] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    return () => {
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function submitVoiceTurn(audio: Blob) {
    if (!context) return
    setVoiceStatus('processing')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('audio', audio, `onestop-turn.${audio.type.includes('webm') ? 'webm' : 'wav'}`)
      formData.append('context', JSON.stringify(context))
      formData.append('studentId', 'browser-voice-student')

      const response = await fetch('/api/call/sarvam/turn', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to run Sarvam voice turn.')

      const nextTurn = payload as SarvamVoiceTurn
      setTurn(nextTurn)
      setVoiceStatus('answered')
      const audioPlayer = new Audio(`data:${nextTurn.audioMimeType};base64,${nextTurn.audioBase64}`)
      await audioPlayer.play()
    } catch (voiceError) {
      setVoiceStatus('error')
      setError(voiceError instanceof Error ? voiceError.message : 'Unable to run Sarvam voice turn.')
    }
  }

  async function startVoiceTurn() {
    if (!context) {
      setError('Select a lecture or subject context before starting a voice turn.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Browser audio recording is not supported here. Use Chrome or Edge with microphone permission enabled.')
      setVoiceStatus('error')
      return
    }

    setError(null)
    setTurn(null)
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        void submitVoiceTurn(audio)
      }
      recorder.start()
      setVoiceStatus('recording')
    } catch {
      setVoiceStatus('error')
      setError('Microphone permission was blocked or no input device is available.')
    }
  }

  function stopVoiceTurn() {
    recorderRef.current?.stop()
  }

  async function startCall() {
    if (!context || !phoneNumber.trim()) return
    setPhoneLoading(true)
    setPhoneStatus(null)
    setError(null)

    try {
      const payload = await apiJson<{ status?: string; lectureTitle?: string }>('/api/call/outbound', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber,
          studentName: 'OneStop student',
          context,
        }),
      })
      setPhoneStatus(`Twilio call ${payload.status ?? 'queued'} for ${payload.lectureTitle ?? context.lectureTitle}. Sarvam handles the voice prompts.`)
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : 'Unable to place call.')
    } finally {
      setPhoneLoading(false)
    }
  }

  return (
    <section className="call-console mx-auto max-w-5xl">
      <button className="back-link mb-5" onClick={onBack}><ArrowLeft size={15} /> Back</button>
      <div className="call-console-header">
        <div>
          <p className="eyebrow">Sarvam lecture call</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{context?.lectureTitle ?? 'Select context'}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Browser voice turns use Sarvam SDK for speech-to-text and text-to-speech, then answer through the same lecture-scoped RAG.
          </p>
        </div>
        <Badge tone={context ? 'success' : 'warning'}>{context ? 'context active' : 'missing context'}</Badge>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <div className="call-voice-panel">
          <button
            className={`voice-assistant-orb is-${voiceStatus === 'recording' ? 'listening' : voiceStatus === 'processing' ? 'processing' : voiceStatus === 'answered' ? 'completed' : voiceStatus}`}
            onClick={voiceStatus === 'recording' ? stopVoiceTurn : startVoiceTurn}
            disabled={!context || voiceStatus === 'processing'}
            aria-label={voiceStatus === 'recording' ? 'Stop Sarvam recording' : 'Start Sarvam voice turn'}
          >
            <span className="voice-assistant-ring ring-one" />
            <span className="voice-assistant-ring ring-two" />
            <span className="voice-assistant-ring ring-three" />
            <span className="voice-assistant-core">
              <Mic size={30} />
            </span>
            <span className="voice-assistant-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
          </button>
          <div className="voice-assistant-status">
            <p className="font-display text-lg font-semibold">
              {voiceStatus === 'recording'
                ? 'Listening'
                : voiceStatus === 'processing'
                  ? 'Sarvam is processing'
                  : voiceStatus === 'answered'
                    ? 'Answer played'
                    : voiceStatus === 'error'
                      ? 'Needs attention'
                      : 'Tap to speak'}
            </p>
            <p>{turn?.transcript ?? 'Ask in English, Marathi, Hindi, or another supported Indian language.'}</p>
          </div>
          {turn && (
            <div className="voice-turn-result">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{turn.languageCode}</Badge>
                <Badge>{turn.speaker}</Badge>
                {turn.fallbackUsed && <Badge tone="warning">course fallback</Badge>}
              </div>
              <p className="mt-3 text-sm leading-6">{turn.answer}</p>
              {turn.citations.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {turn.citations.slice(0, 3).map((citation) => (
                    <span key={citation.chunkId} className="answer-source">
                      <FileText size={12} /> {citation.sourceName} · {citation.section}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="call-phone-panel">
          <div>
            <p className="eyebrow">Phone transport</p>
            <h2 className="mt-2 font-display text-xl font-semibold">Place Twilio call</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Twilio connects the phone call; prompts and answers are generated with Sarvam audio endpoints.
            </p>
          </div>
          <label className="field-label">Student phone number<input className="text-input mt-2" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+919373675705" inputMode="tel" /></label>
          <Button className="mt-4 w-full rounded-lg" disabled={!context || !phoneNumber.trim() || phoneLoading} onClick={() => void startCall()}>
            <Phone size={15} /> {phoneLoading ? 'Starting call...' : 'Start phone call'}
          </Button>
          <div className="mt-4 grid gap-2">
            <div className="rounded-lg border border-border bg-white p-3 text-xs text-muted-foreground"><strong className="text-foreground">Context:</strong> {context ? `${context.courseName} · ${context.lectureTitle}` : 'No context selected'}</div>
            {phoneStatus && <p className="rounded-lg bg-primary/10 p-3 text-xs text-primary">{phoneStatus}</p>}
            {error && <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

function SessionsView({ workspace, reload }: { workspace: AcademicWorkspace; reload: () => Promise<void> }) {
  async function endSession(session: LectureSession) {
    await apiJson('/api/academic/sessions', {
      method: 'POST',
      body: JSON.stringify({ action: 'end', sessionId: session.id }),
    })
    await reload()
  }

  return (
    <section className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="eyebrow">Session lifecycle</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Live and completed sessions</h1>
        </div>
        <Radio size={20} className="text-primary" />
      </div>
      <div className="grid gap-3">
        {workspace.sessions.map((session) => (
          <div key={session.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-white/70 p-4 md:flex-row md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={session.status === 'live' ? 'success' : 'default'}>{session.status}</Badge>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">{session.mode}</span>
              </div>
              <p className="mt-2 text-sm font-semibold">{session.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{session.focus}</p>
            </div>
            {session.status === 'live' && workspace.viewer.role !== 'student' && (
              <Button variant="outline" className="rounded-lg" onClick={() => void endSession(session)}>
                <X size={15} /> End
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function ProfileView({ workspace }: { workspace: AcademicWorkspace }) {
  return (
    <section className="mx-auto max-w-3xl rounded-lg border border-white/70 bg-white/75 p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="profile-avatar">{workspace.viewer.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
        <div>
          <p className="font-display text-2xl font-semibold">{workspace.viewer.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{roleLabels[workspace.viewer.role]} · {workspace.viewer.department}</p>
        </div>
      </div>
    </section>
  )
}

function Login({
  role,
  setRole,
  setUserId,
  onContinue,
}: {
  role: AcademicRole
  setRole: (role: AcademicRole) => void
  setUserId: (userId: string) => void
  onContinue: () => void
}) {
  function chooseRole(nextRole: AcademicRole) {
    setRole(nextRole)
    setUserId(demoUsers[nextRole])
  }

  return (
    <main className="login-page">
      <div className="login-left">
        <div className="login-grid" />
        <Logo />
        <div className="login-copy">
          <Badge tone="accent"><Sparkles size={12} /> Academic intelligence, grounded</Badge>
          <h1 className="mt-6 max-w-xl font-display text-5xl font-semibold leading-tight text-foreground sm:text-6xl">Every lecture becomes a learning companion.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">OneStop turns faculty notes into trusted, lecture-aware classrooms where every answer, call, and replay stays connected to the source.</p>
          <div className="login-points mt-10">
            <span><Check size={14} /> Lecture-grounded answers</span>
            <span><Check size={14} /> Multilingual voice</span>
            <span><Check size={14} /> Connector-backed notes</span>
          </div>
          <div className="login-product-map" aria-label="OneStop learning flow">
            <div><span><Cloud size={17} /></span><strong>Connect</strong><small>Drive & Classroom</small></div>
            <i />
            <div><span><SquareStack size={17} /></span><strong>Ground</strong><small>Lecture context</small></div>
            <i />
            <div><span><BrainCircuit size={17} /></span><strong>Learn</strong><small>Chat, call & replay</small></div>
          </div>
        </div>
        <p className="login-trust mt-auto text-xs text-muted-foreground"><ShieldCheck size={14} /> Built for traceable, institution-scoped learning</p>
      </div>
      <div className="login-right">
        <div className="login-card-wrap">
          <div className="login-card">
            <div className="login-card-heading">
              <span className="login-lock"><ShieldCheck size={19} /></span>
              <div>
                <p className="eyebrow">Secure demo access</p>
                <h2 className="mt-2 font-display text-2xl font-semibold">Choose your workspace</h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Select a role to preview its complete academic workflow.</p>
            <div className="mt-7 grid gap-2">
              {(['super-admin', 'teacher', 'student'] as AcademicRole[]).map((item) => (
                <button key={item} className={`role-choice ${role === item ? 'active' : ''}`} onClick={() => chooseRole(item)}>
                  <span className="role-choice-icon">{item === 'super-admin' ? <ShieldCheck size={17} /> : item === 'teacher' ? <Users size={17} /> : <GraduationCap size={17} />}</span>
                  <span><strong>{roleLabels[item]}</strong><small>{item === 'super-admin' ? 'Manage people, subjects and sessions' : item === 'teacher' ? 'Create lectures and review doubts' : 'Learn from your lecture context'}</small></span>
                  {role === item && <Check size={15} className="ml-auto" />}
                </button>
              ))}
            </div>
            <Button className="mt-6 h-11 w-full rounded-lg" onClick={onContinue}>Enter OneStop <ArrowUpRight size={15} /></Button>
          </div>
          <div className="login-side-panel">
            <p className="eyebrow">Platform signal</p>
            <div className="login-side-status">
              <span className="live-dot" />
              <div><strong>Knowledge ready</strong><small>Lecture index is online</small></div>
            </div>
            <div className="login-side-list">
              <p><MonitorPlay size={15} /><span><strong>3 learning modes</strong><small>Chat, voice and classroom</small></span></p>
              <p><Headphones size={15} /><span><strong>Indian languages</strong><small>Powered by Sarvam voice</small></span></p>
              <p><FileText size={15} /><span><strong>Visible citations</strong><small>Answers linked to notes</small></span></p>
            </div>
          </div>
        </div>
        <div className="login-footer">
          <span>OneStop Academic OS</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={12} /> Lecture-grounded by design</span>
        </div>
      </div>
    </main>
  )
}

export default function Page() {
  const [role, setRole] = useState<AcademicRole>('student')
  const [userId, setUserId] = useState(demoUsers.student)
  const [view, setView] = useState<View>('overview')
  const [previousView, setPreviousView] = useState<View>('classroom')
  const [aiScope, setAiScope] = useState<AiScope>('lecture')
  const [loggedIn, setLoggedIn] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [workspace, setWorkspace] = useState<AcademicWorkspace | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedLectureId, setSelectedLectureId] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const nav = useMemo(() => navFor(role), [role])

  async function loadWorkspace(nextRole: AcademicRole, nextUserId: string) {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson<AcademicWorkspace>(`/api/academic/workspace?role=${nextRole}&userId=${nextUserId}`)
      setWorkspace(payload)
      const subjectId = payload.subjects.some((subject) => subject.id === selectedSubjectId) ? selectedSubjectId : payload.subjects[0]?.id
      setSelectedSubjectId(subjectId ?? '')
      const lecture = payload.lectures.find((item) => item.subjectId === subjectId) ?? payload.lectures[0]
      const lectureId = payload.lectures.some((item) => item.id === selectedLectureId && item.subjectId === subjectId) ? selectedLectureId : lecture?.id
      setSelectedLectureId(lectureId ?? '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load workspace.')
    } finally {
      setLoading(false)
    }
  }

  async function reload() {
    await loadWorkspace(role, userId)
  }

  function enterWorkspace() {
    setLoggedIn(true)
    if (window.innerWidth <= 960) setSidebarOpen(false)
    void loadWorkspace(role, userId)
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setRoleMenuOpen(false)
        setNotificationsOpen(false)
      }
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  if (!loggedIn) {
    return <Login role={role} setRole={setRole} setUserId={setUserId} onContinue={enterWorkspace} />
  }

  const selectedSubject = workspace?.subjects.find((subject) => subject.id === selectedSubjectId)
  const subjectLectures = workspace?.lectures.filter((lecture) => lecture.subjectId === selectedSubjectId) ?? []
  const selectedLecture = workspace?.lectures.find((lecture) => lecture.id === selectedLectureId)
  const selectedLectureContext = selectedLecture ? workspace?.lectureContexts[selectedLecture.id] : undefined
  const selectedSubjectContext = createSubjectContext(selectedSubject, subjectLectures, workspace)
  const activeContext = aiScope === 'subject' ? selectedSubjectContext : selectedLectureContext
  const activeLabel = nav.find((item) => item.id === view)?.label ?? (view === 'subject' ? selectedSubject?.code : view === 'lecture' ? selectedLecture?.title : 'Workspace')

  function navigate(next: View) {
    setView(next)
    setRoleMenuOpen(false)
    setNotificationsOpen(false)
    if (window.innerWidth <= 960) setSidebarOpen(false)
  }

  function switchRole(nextRole: AcademicRole) {
    const nextUserId = demoUsers[nextRole]
    setRole(nextRole)
    setUserId(nextUserId)
    setView('overview')
    setWorkspace(null)
    setSelectedSubjectId('')
    setSelectedLectureId('')
    setRoleMenuOpen(false)
    void loadWorkspace(nextRole, nextUserId)
  }

  function openSubject(subjectId: string) {
    setSelectedSubjectId(subjectId)
    const firstLecture = workspace?.lectures.find((lecture) => lecture.subjectId === subjectId)
    if (firstLecture) setSelectedLectureId(firstLecture.id)
    setView('subject')
    setSearchOpen(false)
  }

  function openLecture(lectureId: string) {
    setSelectedLectureId(lectureId)
    setView('lecture')
    setSearchOpen(false)
  }

  function openAi(nextView: 'chat' | 'call', scope: AiScope, backTo: View) {
    setAiScope(scope)
    setPreviousView(backTo)
    setView(nextView)
  }

  async function startSubjectRoom() {
    const lecture = completedLectures(subjectLectures)[0]
    if (!workspace || !selectedSubject || !lecture) return
    await apiJson('/api/academic/sessions', {
      method: 'POST',
      body: JSON.stringify({
        action: 'start-study',
        subjectId: selectedSubject.id,
        lectureId: lecture.id,
        studentId: workspace.viewer.id,
        focus: `${selectedSubject.name} subject-level doubt room`,
      }),
    })
    await reload()
    setView('subject')
  }

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const searchSubjects = workspace?.subjects.filter((subject) => !normalizedSearch || `${subject.code} ${subject.name} ${subject.description}`.toLowerCase().includes(normalizedSearch)).slice(0, 4) ?? []
  const searchLectures = workspace?.lectures.filter((lecture) => !normalizedSearch || `${lecture.title} ${lecture.topic}`.toLowerCase().includes(normalizedSearch)).slice(0, 5) ?? []

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : 'is-collapsed'}`}>
        <div className="sidebar-top">
          <Logo />
          <button className="icon-button sidebar-collapse" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={17} /> : <Menu size={17} />}
          </button>
        </div>
        <button className="role-switcher" onClick={() => setRoleMenuOpen((open) => !open)} aria-expanded={roleMenuOpen}>
          <span className="role-avatar">{workspace?.viewer.name.split(' ').map((part) => part[0]).join('').slice(0, 2) ?? 'OS'}</span>
          <span className="min-w-0 flex-1">
            <strong>{workspace?.viewer.name ?? roleLabels[role]}</strong>
            <small>{roleLabels[role]}</small>
          </span>
          <ChevronDown size={14} className={roleMenuOpen ? 'rotate-180' : ''} />
        </button>
        {roleMenuOpen && (
          <div className="role-menu">
            {(['student', 'teacher', 'super-admin'] as AcademicRole[]).map((item) => (
              <button key={item} onClick={() => switchRole(item)} className={item === role ? 'active' : ''}>
                {item === 'student' ? <GraduationCap size={15} /> : item === 'teacher' ? <Users size={15} /> : <ShieldCheck size={15} />}
                <span>{roleLabels[item]}</span>
                {item === role && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {nav.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} onClick={() => navigate(item.id)} className={`nav-item ${view === item.id ? 'active' : ''}`}>
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            )
          })}
          <p className="nav-label nav-label-lower">Account</p>
          <button className={`nav-item ${view === 'profile' ? 'active' : ''}`} onClick={() => navigate('profile')}>
            <Settings2 size={17} />
            <span>Profile</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <Sparkles size={15} />
            <p>
              <strong>AI context</strong>
              <span>{aiScope === 'subject' ? selectedSubject?.name : selectedLecture?.title ?? 'Choose a lecture.'}</span>
            </p>
          </div>
          <button className="logout-link" onClick={() => setLoggedIn(false)}><LogOut size={14} /> Sign out</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <div className="main-column">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button className="mobile-menu icon-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Open navigation">
              <Menu size={19} />
            </button>
            <div>
              <span className="topbar-kicker">OneStop workspace</span>
              <span className="topbar-title">{activeLabel}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" type="button" onClick={() => setSearchOpen(true)}>
              <Search size={15} />
              <span>Search workspace</span>
              <kbd>/</kbd>
            </button>
            <div className="topbar-chip">
              <span className="live-dot" /> {activeContext ? 'RAG context active' : 'No AI context'}
            </div>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotificationsOpen((open) => !open)} aria-expanded={notificationsOpen}>
              <Bell size={17} />
              <span />
            </button>
            {notificationsOpen && (
              <div className="notification-popover">
                <div><strong>Learning signals</strong><button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={15} /></button></div>
                <p><span className="live-dot" /> {workspace?.stats.liveSessions ?? 0} live session{workspace?.stats.liveSessions === 1 ? '' : 's'} available now.</p>
                <p><BrainCircuit size={15} /> {workspace?.stats.indexedLectures ?? 0} lectures are indexed for grounded AI.</p>
              </div>
            )}
          </div>
        </header>

        <main className="content">
          {loading && !workspace && <EmptyState title="Loading workspace" description="Preparing academic data and lecture context." />}
          {error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {workspace && (
            <AnimatePresence mode="wait">
              <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                {view === 'overview' && <Overview role={role} workspace={workspace} onNavigate={navigate} onOpenSubject={openSubject} />}
                {view === 'admin' && <AdminPanel workspace={workspace} reload={reload} />}
                {view === 'classroom' && (role === 'student' ? <StudentClassroom workspace={workspace} onOpenSubject={openSubject} /> : <TeacherClassroom workspace={workspace} reload={reload} />)}
                {view === 'subject' && (
                  <StudentSubjectPage
                    subject={selectedSubject}
                    lectures={subjectLectures}
                    onBack={() => navigate('classroom')}
                    onOpenLecture={openLecture}
                    onOpenChat={() => openAi('chat', 'subject', 'subject')}
                    onOpenCall={() => openAi('call', 'subject', 'subject')}
                    onStartSubjectRoom={() => void startSubjectRoom()}
                  />
                )}
                {view === 'lecture' && (
                  <StudentLecturePage
                    workspace={workspace}
                    subject={selectedSubject}
                    lecture={selectedLecture}
                    onBack={() => navigate('subject')}
                    onChat={() => openAi('chat', 'lecture', 'lecture')}
                    onCall={() => openAi('call', 'lecture', 'lecture')}
                    reload={reload}
                  />
                )}
                {view === 'connectors' && <ConnectorsView workspace={workspace} reload={reload} />}
                {view === 'chat' && <ChatView userId={workspace.viewer.id} context={activeContext} onBack={() => navigate(previousView)} />}
                {view === 'call' && <CallView context={activeContext} onBack={() => navigate(previousView)} />}
                {view === 'sessions' && <SessionsView workspace={workspace} reload={reload} />}
                {view === 'profile' && <ProfileView workspace={workspace} />}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <AnimatePresence>
        {searchOpen && (
          <motion.div className="search-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setSearchOpen(false)}>
            <motion.div className="search-dialog" initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} onMouseDown={(event) => event.stopPropagation()}>
              <div className="search-input-row">
                <Search size={18} />
                <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search subjects, lectures, or topics..." />
                <button onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={18} /></button>
              </div>
              <div className="search-results">
                {searchSubjects.length > 0 && <p className="eyebrow">Subjects</p>}
                {searchSubjects.map((subject) => (
                  <button key={subject.id} onClick={() => openSubject(subject.id)}><BookOpen size={16} /><span><strong>{subject.code} · {subject.name}</strong><small>{subject.description}</small></span><ArrowUpRight size={14} /></button>
                ))}
                {searchLectures.length > 0 && <p className="eyebrow search-group-label">Lectures</p>}
                {searchLectures.map((lecture) => (
                  <button key={lecture.id} onClick={() => { setSelectedSubjectId(lecture.subjectId); openLecture(lecture.id) }}><FileText size={16} /><span><strong>{lecture.title}</strong><small>{lecture.topic}</small></span><ArrowUpRight size={14} /></button>
                ))}
                {searchSubjects.length === 0 && searchLectures.length === 0 && <EmptyState title="No results found" description="Try a subject code, lecture name, or topic." />}
              </div>
              <div className="search-hint"><span><kbd>ESC</kbd> close</span><span>Search is scoped to your assigned academic workspace.</span></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
