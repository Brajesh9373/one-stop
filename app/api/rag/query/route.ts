import { NextResponse } from 'next/server'

import { runHybridLectureRag } from '@/lib/rag/hybrid'
import { parseRagQuery } from '@/lib/rag/validation'

export async function POST(request: Request) {
  const body = await request.json()
  const query = parseRagQuery(body)

  if (!query) {
    return NextResponse.json(
      {
        error: 'Invalid RAG query payload.',
      },
      { status: 400 }
    )
  }

  const result = await runHybridLectureRag(query)
  return NextResponse.json(result)
}
