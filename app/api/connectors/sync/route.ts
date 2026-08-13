import { NextResponse } from 'next/server'

import { syncConnectorDocuments } from '@/lib/connectors/service'
import { parseConnectorSyncRequest } from '@/lib/connectors/validation'
import { getRagRepository } from '@/lib/rag/repository'

export async function POST(request: Request) {
  const body = await request.json()
  const input = parseConnectorSyncRequest(body)

  if (!input) {
    return NextResponse.json(
      {
        error: 'Invalid connector sync payload.',
      },
      { status: 400 }
    )
  }

  const documents = await syncConnectorDocuments(input)
  const repository = getRagRepository()
  await repository.ingest(documents)

  return NextResponse.json({
    connector: input.connector,
    syncedDocuments: documents.length,
    lectureIds: Array.from(new Set(documents.map((document) => document.lectureId))),
  })
}
