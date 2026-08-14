import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import {
  parseCreateLectureInput,
  parseUpdateLectureInput,
} from '@/lib/academic/validation'

export async function POST(request: Request) {
  const input = parseCreateLectureInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid lecture payload.' }, { status: 400 })
  }

  try {
    const lecture = await getAcademicRepository().createLecture(input)
    return NextResponse.json({ lecture }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create lecture.' },
      { status: 400 }
    )
  }
}

export async function PATCH(request: Request) {
  const input = parseUpdateLectureInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid lecture update payload.' }, { status: 400 })
  }

  try {
    const lecture = await getAcademicRepository().updateLecture(input)
    return NextResponse.json({ lecture })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update lecture.' },
      { status: 400 }
    )
  }
}
