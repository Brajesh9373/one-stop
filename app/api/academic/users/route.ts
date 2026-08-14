import { NextResponse } from 'next/server'

import { getAcademicRepository } from '@/lib/academic/repository'
import {
  isNonEmptyString,
  parseCreateUserInput,
  parseUpdateUserInput,
} from '@/lib/academic/validation'

export async function GET() {
  const users = await getAcademicRepository().listUsers()
  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const input = parseCreateUserInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid user payload.' }, { status: 400 })
  }

  try {
    const user = await getAcademicRepository().createUser(input)
    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create user.' },
      { status: 400 }
    )
  }
}

export async function PATCH(request: Request) {
  const input = parseUpdateUserInput(await request.json())
  if (!input) {
    return NextResponse.json({ error: 'Invalid user update payload.' }, { status: 400 })
  }

  try {
    const user = await getAcademicRepository().updateUser(input)
    return NextResponse.json({ user })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update user.' },
      { status: 400 }
    )
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { id?: unknown }
  if (!isNonEmptyString(body.id)) {
    return NextResponse.json({ error: 'User id is required.' }, { status: 400 })
  }

  const result = await getAcademicRepository().deleteUser(body.id.trim())
  return NextResponse.json(result)
}
