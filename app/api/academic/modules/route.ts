import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import { parseCreateModuleInput } from '@/lib/academic/validation'

export async function POST(request: Request) {
  const input = parseCreateModuleInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid module payload.' }, { status: 400 })
  }

  try {
    const moduleUnit = await getAcademicRepository().createModule(input)
    return NextResponse.json({ moduleUnit }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create module.' },
      { status: 400 }
    )
  }
}
