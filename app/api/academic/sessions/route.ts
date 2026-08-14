import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import {
  parseEndSessionInput,
  parseStartLectureSessionInput,
  parseStartStudySessionInput,
} from '@/lib/academic/validation'

export async function POST(request: Request) {
  const body = await request.json()
  const action = typeof body?.action === 'string' ? body.action : ''

  try {
    if (action === 'start-lecture') {
      const input = parseStartLectureSessionInput(body)
      if (!input) return NextResponse.json({ error: 'Invalid lecture session payload.' }, { status: 400 })
      const session = await getAcademicRepository().startLectureSession(input)
      return NextResponse.json({ session }, { status: 201 })
    }

    if (action === 'start-study') {
      const input = parseStartStudySessionInput(body)
      if (!input) return NextResponse.json({ error: 'Invalid study session payload.' }, { status: 400 })
      const session = await getAcademicRepository().startStudySession(input)
      return NextResponse.json({ session }, { status: 201 })
    }

    if (action === 'end') {
      const input = parseEndSessionInput(body)
      if (!input) return NextResponse.json({ error: 'Invalid end session payload.' }, { status: 400 })
      const session = await getAcademicRepository().endSession(input)
      return NextResponse.json({ session })
    }

    return NextResponse.json({ error: 'Unknown session action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update session.' },
      { status: 400 }
    )
  }
}
