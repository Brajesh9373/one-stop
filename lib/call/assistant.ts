import type { LectureContext } from '@/lib/rag/types'

function lectureSummary(context: LectureContext) {
  return `${context.courseName} · Lecture ${String(context.lectureSequence).padStart(2, '0')} · ${context.lectureTitle}`
}

export function buildLectureCallAssistant(context: LectureContext, publicAppUrl: string) {
  const lectureLabel = lectureSummary(context)

  return {
    name: `OneStop Lecture Call - ${context.lectureId}`,
    firstMessage: `Hello, this is OneStop. We are in ${lectureLabel}. Ask any question about this lecture whenever you're ready.`,
    firstMessageMode: 'assistant-speaks-first',
    server: {
      url: `${publicAppUrl}/api/call/vapi`,
    },
    serverMessages: ['assistant-request', 'tool-calls', 'status-update', 'end-of-call-report'],
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'You are OneStop, a lecture-grounded academic voice tutor.',
            `The active lecture is: ${lectureLabel}.`,
            'Answer only from the selected lecture unless the retrieval tool explicitly says fallback course context was used.',
            'Before answering any academic question, call the answer_from_lecture function.',
            'Keep spoken answers concise, accurate, and classroom-appropriate.',
            'When you answer, mention the source briefly in natural speech, for example: "According to the lecture notes..."',
            'If the retrieved result says the answer is not grounded strongly enough, say that clearly instead of guessing.',
          ].join(' '),
        },
      ],
      functions: [
        {
          name: 'answer_from_lecture',
          description: 'Retrieve a grounded answer for the selected lecture before replying to the student.',
          parameters: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The student question to answer from the selected lecture context.',
              },
            },
            required: ['question'],
          },
        },
      ],
    },
    voice: {
      provider: 'custom-voice',
      server: {
        url: `${publicAppUrl}/api/call/voice`,
        timeoutSeconds: 30,
      },
      fallbackPlan: {
        voices: [
          {
            provider: 'vapi',
            voiceId: 'Sagar',
            version: 2,
            language: 'en',
          },
        ],
      },
    },
    transcriber: {
      provider: 'deepgram',
      language: 'en',
    },
    metadata: {
      institutionId: context.institutionId,
      facultyId: context.facultyId,
      courseId: context.courseId,
      courseName: context.courseName,
      lectureId: context.lectureId,
      lectureTitle: context.lectureTitle,
      lectureSequence: String(context.lectureSequence),
    },
  }
}
