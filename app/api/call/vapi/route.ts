import { NextResponse } from 'next/server'

import { buildLectureCallAssistant } from '@/lib/call/assistant'
import { getDefaultLectureContext, getPublicAppUrl } from '@/lib/call/config'
import { runHybridLectureRag } from '@/lib/rag/hybrid'
import type { LectureContext } from '@/lib/rag/types'

type VapiMessage = {
  type?: string
  call?: {
    id?: string
    customer?: {
      number?: string
    }
  }
  customer?: {
    number?: string
  }
  toolCallList?: Array<{
    id?: string
    name?: string
    parameters?: {
      question?: string
    }
  }>
  artifact?: {
    transcript?: string
  }
  endedReason?: string
}

function readLectureContextFromMetadata(metadata: unknown): LectureContext {
  if (!metadata || typeof metadata !== 'object') {
    return getDefaultLectureContext()
  }

  const record = metadata as Record<string, string | undefined>
  const fallback = getDefaultLectureContext()

  return {
    institutionId: record.institutionId ?? fallback.institutionId,
    facultyId: record.facultyId ?? fallback.facultyId,
    courseId: record.courseId ?? fallback.courseId,
    courseName: record.courseName ?? fallback.courseName,
    lectureId: record.lectureId ?? fallback.lectureId,
    lectureTitle: record.lectureTitle ?? fallback.lectureTitle,
    lectureSequence: Number(record.lectureSequence ?? fallback.lectureSequence),
  }
}

function formatToolResult(answer: Awaited<ReturnType<typeof runHybridLectureRag>>) {
  const sourceLabel = answer.citations
    .slice(0, 2)
    .map((citation) => `${citation.sourceName}${citation.section ? `, ${citation.section}` : ''}`)
    .join('; ')

  return [
    answer.answer,
    sourceLabel ? `Sources: ${sourceLabel}.` : '',
    answer.fallbackUsed ? 'This answer used broader course context after weak lecture-only retrieval.' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export async function POST(request: Request) {
  const body = await request.json()
  const message = (body?.message ?? {}) as VapiMessage

  if (message.type === 'assistant-request') {
    const context = readLectureContextFromMetadata(body?.message?.call?.metadata)

    return NextResponse.json({
      assistant: buildLectureCallAssistant(context, getPublicAppUrl()),
    })
  }

  if (message.type === 'tool-calls') {
    const context = readLectureContextFromMetadata(body?.message?.call?.metadata)
    const toolCalls = Array.isArray(message.toolCallList) ? message.toolCallList : []

    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const question = toolCall.parameters?.question?.trim()

        if (!toolCall.id || toolCall.name !== 'answer_from_lecture' || !question) {
          return {
            toolCallId: toolCall.id ?? 'unknown',
            result: 'I could not process that lecture query.',
          }
        }

        const answer = await runHybridLectureRag({
          mode: 'call',
          studentId: message.customer?.number ?? message.call?.customer?.number ?? 'phone-student',
          prompt: question,
          context,
        })

        return {
          name: toolCall.name,
          toolCallId: toolCall.id,
          result: formatToolResult(answer),
        }
      })
    )

    return NextResponse.json({ results })
  }

  if (message.type === 'status-update') {
    console.info('[vapi][status-update]', {
      callId: message.call?.id,
      status: body?.message?.status,
    })
    return NextResponse.json({ ok: true })
  }

  if (message.type === 'end-of-call-report') {
    console.info('[vapi][end-of-call-report]', {
      callId: message.call?.id,
      endedReason: message.endedReason,
      transcriptPreview: message.artifact?.transcript?.slice(0, 280),
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
