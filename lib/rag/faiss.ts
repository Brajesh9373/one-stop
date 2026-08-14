import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { getEmbeddingDimension, getEmbeddingFingerprint } from '@/lib/rag/embedding'
import { getRagStoragePaths } from '@/lib/rag/storage'
import type { RetrievalScope } from '@/lib/rag/types'

const execFileAsync = promisify(execFile)
const isWindows = process.platform === 'win32'
const pythonBinary = process.env.RAG_PYTHON_BINARY ?? path.join(process.cwd(), '.venv-rag', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python')
const scriptPath = path.join(process.cwd(), 'scripts', 'rag_faiss.py')

export type FaissSearchHit = { chunkId: string; score: number }

export type FaissSearchScope = {
  institutionId: string
  courseId: string
  lectureId: string
  scope: RetrievalScope
}

async function runFaissCommand(command: string, payload?: Record<string, unknown>) {
  const storage = getRagStoragePaths()
  const { stdout } = await execFileAsync(
    pythonBinary,
    [scriptPath, command, JSON.stringify({
      ...payload,
      sqlitePath: storage.sqliteFilePath,
      indexPath: storage.faissIndexPath,
      metaPath: storage.faissMetaPath,
      dimension: getEmbeddingDimension(),
      fingerprint: getEmbeddingFingerprint(),
    })],
    { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }
  )
  return JSON.parse(stdout) as Record<string, unknown>
}

export async function rebuildFaissIndex() {
  return runFaissCommand('rebuild')
}

export async function searchFaissIndex(
  queryVector: number[],
  topK: number,
  filter: FaissSearchScope
) {
  const result = await runFaissCommand('search', { queryVector, topK, filter })
  return (result.matches as FaissSearchHit[] | undefined) ?? []
}
