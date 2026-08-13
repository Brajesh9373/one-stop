import { NextResponse } from 'next/server'

import { getRagRepository } from '@/lib/rag/repository'
import { parseFacultySourceDocuments } from '@/lib/rag/validation'

export async function POST(request: Request) {
  const body = await request.json()
  const documents = parseFacultySourceDocuments(body)

  if (!documents) {
    return NextResponse.json(
      {
        error: 'Invalid ingestion payload.',
      },
      { status: 400 }
    )
  }

  const repository = getRagRepository()
  await repository.ingest(documents)

  return NextResponse.json({
    ingestedDocuments: documents.length,
  })
}
