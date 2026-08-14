import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import { isAcademicRole, isNonEmptyString } from '@/lib/academic/validation'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const role = url.searchParams.get('role')
  const userId = url.searchParams.get('userId')

  if (!isAcademicRole(role) || !isNonEmptyString(userId)) {
    return NextResponse.json({ error: 'Valid role and userId are required.' }, { status: 400 })
  }

  try {
    const workspace = await getAcademicRepository().getWorkspace(role, userId)
    return NextResponse.json(workspace)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load workspace.' },
      { status: 404 }
    )
  }
}
