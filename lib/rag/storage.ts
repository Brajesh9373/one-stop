import { access, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { facultySourceDocuments } from '@/lib/rag/knowledge-base'
import type { FacultySourceDocument } from '@/lib/rag/types'

const ragDataDirectory = path.join(process.cwd(), 'data', 'rag')
const legacyDocumentsFilePath = path.join(ragDataDirectory, 'documents.json')
const sqliteFilePath = path.join(ragDataDirectory, 'rag.db')
const faissIndexPath = path.join(ragDataDirectory, 'faiss.index')
const faissMetaPath = path.join(ragDataDirectory, 'faiss-meta.json')

async function ensureStorageDirectory() {
  await mkdir(ragDataDirectory, { recursive: true })
}

export async function readLegacySeedDocuments() {
  await ensureStorageDirectory()

  try {
    await access(legacyDocumentsFilePath)
    const raw = await readFile(legacyDocumentsFilePath, 'utf8')
    return JSON.parse(raw) as FacultySourceDocument[]
  } catch {
    return facultySourceDocuments
  }
}

export async function ensureRagStorageReady() {
  await ensureStorageDirectory()
}

export function getRagStoragePaths() {
  return {
    directory: ragDataDirectory,
    legacyDocumentsFilePath,
    sqliteFilePath,
    faissIndexPath,
    faissMetaPath,
  }
}
