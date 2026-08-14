import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import { parseAssignmentInput } from '@/lib/academic/validation'

export async function POST(request: Request) {
  const input = parseAssignmentInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid assignment payload.' }, { status: 400 })
  }

  try {
    const result = await getAcademicRepository().assign(input)
    return NextResponse.json({ result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to assign user.' },
      { status: 400 }
    )
  }
}

export async function DELETE(request: Request) {
  const input = parseAssignmentInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid assignment payload.' }, { status: 400 })
  }

  const result = await getAcademicRepository().unassign(input)
  return NextResponse.json({ result })
}
