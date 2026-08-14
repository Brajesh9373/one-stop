import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import { parseFacultyAssistantInput } from '@/lib/academic/validation'

export async function POST(request: Request) {
  const input = parseFacultyAssistantInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid faculty assistant payload.' }, { status: 400 })
  }

  try {
    const result = await getAcademicRepository().runFacultyAssistant(input)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to run faculty assistant.' },
      { status: 400 }
    )
  }
}
