import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import { parseCreateDoubtInput } from '@/lib/academic/validation'

export async function POST(request: Request) {
  const input = parseCreateDoubtInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid doubt payload.' }, { status: 400 })
  }

  try {
    const doubt = await getAcademicRepository().createDoubt(input)
    return NextResponse.json({ doubt }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create doubt.' },
      { status: 400 }
    )
  }
}
