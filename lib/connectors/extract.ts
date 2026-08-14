import { OfficeParser, type SupportedFileType } from 'officeparser'

import { hybridLectureRagConfig } from '@/lib/rag/config'
import { normalizeText } from '@/lib/rag/text'

const MIME_TO_TYPE: Record<string, SupportedFileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'text/html': 'html',
  'application/epub+zip': 'epub',
}

const LEGACY_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-excel',
])

function removeActiveHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
}

async function extractWithTika(buffer: Buffer, mimeType: string) {
  const endpoint = process.env.TIKA_URL?.replace(/\/$/, '')
  if (!endpoint) throw new Error(`Format ${mimeType} requires TIKA_URL.`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(`${endpoint}/tika`, {
      method: 'PUT',
      headers: { Accept: 'text/plain', 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Tika returned HTTP ${response.status}.`)
    return response.text()
  } finally { clearTimeout(timeout) }
}

export async function extractDocumentText(input: { buffer: Buffer; mimeType: string; fileName: string }) {
  if (input.buffer.length === 0) throw new Error('Document is empty.')
  if (input.buffer.length > hybridLectureRagConfig.maxDocumentBytes) {
    throw new Error(`Document exceeds the ${hybridLectureRagConfig.maxDocumentBytes} byte ingestion limit.`)
  }

  const mimeType = input.mimeType.split(';')[0].trim().toLowerCase()
  let text = ''
  let parser = 'native'
  const warnings: string[] = []

  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') {
    text = input.buffer.toString('utf8')
    if (mimeType === 'text/html') text = removeActiveHtml(text)
  } else if (LEGACY_MIME_TYPES.has(mimeType)) {
    parser = 'apache-tika'
    text = await extractWithTika(input.buffer, mimeType)
  } else {
    const fileType = MIME_TO_TYPE[mimeType]
    if (!fileType) {
      parser = 'apache-tika'
      text = await extractWithTika(input.buffer, mimeType)
    } else {
      parser = 'officeparser'
      try {
        const ast = await OfficeParser.parseOffice(input.buffer, {
          fileType,
          ignoreComments: true,
          ignoreSlideMasters: true,
          ignoreHeadersAndFooters: false,
          includeRawContent: false,
          extractAttachments: false,
          ocr: false,
        })
        text = ast.toText()
        warnings.push(...ast.warnings.map((warning) => String(warning)))
      } catch (error) {
        if (!process.env.TIKA_URL) throw error
        parser = 'apache-tika-fallback'
        text = await extractWithTika(input.buffer, mimeType)
        warnings.push('Primary parser failed; Apache Tika fallback was used.')
      }
    }
  }

  const normalized = normalizeText(text)
  if (normalized.length < 20) throw new Error(`No usable text was extracted from ${input.fileName}. Scanned documents may require OCR.`)
  return { text: normalized, parser, warnings }
}
