import { NextResponse } from 'next/server'

import { getRagRepository } from '@/lib/rag/repository'
import { getRagStoragePaths } from '@/lib/rag/storage'

export async function GET() {
  const repository = getRagRepository()
  const documents = await repository.listDocuments()
  const paths = getRagStoragePaths()

  return NextResponse.json({
    count: documents.length,
    storage: {
      sqlite: paths.sqliteFilePath,
      faissIndex: paths.faissIndexPath,
      faissMeta: paths.faissMetaPath,
    },
    documents,
  })
}
