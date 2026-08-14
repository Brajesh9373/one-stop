import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import {
  parseCreateSubjectInput,
  parseUpdateSubjectInput,
} from '@/lib/academic/validation'

export async function GET() {
  const subjects = await getAcademicRepository().listSubjects()
  return NextResponse.json({ subjects })
}

export async function POST(request: Request) {
  const input = parseCreateSubjectInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid subject payload.' }, { status: 400 })
  }

  try {
    const subject = await getAcademicRepository().createSubject(input)
    return NextResponse.json({ subject }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create subject.' },
      { status: 400 }
    )
  }
}

export async function PATCH(request: Request) {
  const input = parseUpdateSubjectInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid subject update payload.' }, { status: 400 })
  }

  try {
    const subject = await getAcademicRepository().updateSubject(input)
    return NextResponse.json({ subject })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update subject.' },
      { status: 400 }
    )
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { id?: unknown }
  if (typeof body.id !== 'string' || !body.id.trim()) {
    return NextResponse.json({ error: 'Subject id is required.' }, { status: 400 })
  }

  const result = await getAcademicRepository().deleteSubject(body.id.trim())
  return NextResponse.json(result)
}
