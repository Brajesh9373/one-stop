import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import { parseSyncConnectorNotesInput } from '@/lib/academic/validation'

export async function POST(request: Request) {
  const input = parseSyncConnectorNotesInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid connector sync payload.' }, { status: 400 })
  }

  try {
    const lecture = await getAcademicRepository().syncConnectorNotes(input)
    return NextResponse.json({ lecture })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to sync connector notes.' },
      { status: 400 }
    )
  }
}
