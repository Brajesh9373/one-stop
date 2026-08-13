import { NextResponse } from 'next/server'

import { getRagRepository } from '@/lib/rag/repository'

export async function GET() {
  const repository = getRagRepository()
  const chunks = await repository.listChunks()

  return NextResponse.json({
    status: 'ok',
    chunkCount: chunks.length,
  })
}
