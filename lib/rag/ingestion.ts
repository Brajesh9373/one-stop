import { hybridLectureRagConfig } from '@/lib/rag/config'
import type { FacultySourceDocument, LectureChunk, SentenceUnit } from '@/lib/rag/types'

function countTokens(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length
}

function splitIntoChunks(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean)
  const chunkSize = hybridLectureRagConfig.chunkSizeWords
  const overlap = hybridLectureRagConfig.chunkOverlapWords

  if (words.length <= chunkSize) return [words.join(' ')]

  const chunks: string[] = []
  for (let start = 0; start < words.length; start += chunkSize - overlap) {
    const slice = words.slice(start, start + chunkSize)
    if (slice.length === 0) break
    chunks.push(slice.join(' '))
    if (start + chunkSize >= words.length) break
  }
  return chunks
}

function splitIntoSentences(content: string) {
  return content
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

export function ingestFacultyDocuments(documents: FacultySourceDocument[]) {
  return documents.flatMap<LectureChunk>((document) =>
    splitIntoChunks(document.content).map((content, index) => ({
      id: `${document.id}-chunk-${index + 1}`,
      institutionId: document.institutionId,
      facultyId: document.facultyId,
      courseId: document.courseId,
      courseName: document.courseName,
      lectureId: document.lectureId,
      lectureTitle: document.lectureTitle,
      lectureSequence: document.lectureSequence,
      topic: document.topic,
      sourceId: document.id,
      sourceType: document.sourceType,
      sourceName: document.sourceName,
      section: document.section,
      page: document.page,
      timestamp: document.timestamp,
      chunkIndex: index,
      content,
      tokenCount: countTokens(content),
      updatedAt: document.updatedAt,
    }))
  )
}

export function ingestSentenceUnits(chunks: LectureChunk[]) {
  return chunks.flatMap<SentenceUnit>((chunk) =>
    splitIntoSentences(chunk.content).map((content, index) => ({
      id: `${chunk.id}-sentence-${index + 1}`,
      chunkId: chunk.id,
      sourceId: chunk.sourceId,
      institutionId: chunk.institutionId,
      facultyId: chunk.facultyId,
      courseId: chunk.courseId,
      courseName: chunk.courseName,
      lectureId: chunk.lectureId,
      lectureTitle: chunk.lectureTitle,
      lectureSequence: chunk.lectureSequence,
      topic: chunk.topic,
      sourceType: chunk.sourceType,
      sourceName: chunk.sourceName,
      section: chunk.section,
      page: chunk.page,
      timestamp: chunk.timestamp,
      sentenceIndex: index,
      content,
      tokenCount: countTokens(content),
      updatedAt: chunk.updatedAt,
    }))
  )
}
