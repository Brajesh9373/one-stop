import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { getEmbeddingDimension } from '@/lib/rag/embedding'
import { getRagStoragePaths } from '@/lib/rag/storage'

const execFileAsync = promisify(execFile)
const pythonBinary = '/home/brajesh_kurkure/Projects/one-stop/.venv-rag/bin/python'
const scriptPath = '/home/brajesh_kurkure/Projects/one-stop/scripts/rag_faiss.py'

export type FaissSearchHit = {
  chunkId: string
  score: number
}

async function runFaissCommand(command: string, payload?: Record<string, unknown>) {
  const storage = getRagStoragePaths()
  const { stdout } = await execFileAsync(pythonBinary, [
    scriptPath,
    command,
    JSON.stringify({
      ...payload,
      sqlitePath: storage.sqliteFilePath,
      indexPath: storage.faissIndexPath,
      metaPath: storage.faissMetaPath,
      dimension: getEmbeddingDimension(),
    }),
  ])

  return JSON.parse(stdout) as Record<string, unknown>
}

export async function rebuildFaissIndex() {
  await runFaissCommand('rebuild')
}

export async function searchFaissIndex(query: string, topK: number) {
  const result = await runFaissCommand('search', {
    query,
    topK,
  })

  return (result.matches as FaissSearchHit[] | undefined) ?? []
}
