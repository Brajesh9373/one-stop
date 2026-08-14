import { createHash } from 'node:crypto'

import { extractDocumentText } from '@/lib/connectors/extract'
import type { ConnectorFailure, ConnectorSyncResult, FacultyConnector, FacultyConnectorSyncRequest } from '@/lib/connectors/types'
import type { FacultySourceDocument, SourceType } from '@/lib/rag/types'

type DriveFile = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string; description?: string }
type ClassroomMaterial = { driveFile?: { driveFile?: { id?: string; title?: string; alternateLink?: string } }; link?: { url?: string; title?: string } }
type ClassroomItem = { id?: string; title?: string; description?: string; updateTime?: string; materials?: ClassroomMaterial[] }

function teacherEnv(name: string, facultyId: string) {
  const suffix = facultyId.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return process.env[`${name}_${suffix}`] ?? process.env[name]
}

async function googleAccessToken(facultyId: string) {
  const direct = teacherEnv('GOOGLE_ACCESS_TOKEN', facultyId)
  if (direct) return direct
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = teacherEnv('GOOGLE_REFRESH_TOKEN', facultyId)
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and a faculty refresh token.')
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!response.ok) throw new Error(`Google OAuth token refresh failed with HTTP ${response.status}.`)
  const payload = await response.json() as { access_token?: string }
  if (!payload.access_token) throw new Error('Google OAuth response did not include an access token.')
  return payload.access_token
}

async function googleJson<T>(url: URL, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error(`Google API request failed with HTTP ${response.status}.`)
  return response.json() as Promise<T>
}

function exportTarget(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.document') return { mime: 'text/plain', extension: '.txt' }
  if (mimeType === 'application/vnd.google-apps.presentation') return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: '.pptx' }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' }
  return null
}

async function downloadDriveFile(file: DriveFile, token: string) {
  const target = exportTarget(file.mimeType)
  const url = target
    ? new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export`)
    : new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`)
  if (target) url.searchParams.set('mimeType', target.mime)
  else url.searchParams.set('alt', 'media')
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Unable to download ${file.name} (HTTP ${response.status}).`)
  const mimeType = target?.mime ?? response.headers.get('content-type')?.split(';')[0] ?? file.mimeType
  return { buffer: Buffer.from(await response.arrayBuffer()), mimeType, fileName: file.name + (target?.extension ?? '') }
}

function sourceType(file: DriveFile): SourceType {
  if (file.mimeType.includes('presentation')) return 'slides'
  if (/transcript/i.test(file.name)) return 'transcript'
  if (file.mimeType.includes('pdf')) return 'reading'
  return 'notes'
}

async function fileToDocument(file: DriveFile, token: string, input: FacultyConnectorSyncRequest): Promise<FacultySourceDocument> {
  const downloaded = await downloadDriveFile(file, token)
  const extracted = await extractDocumentText(downloaded)
  return {
    id: `connector:${input.connector}:${file.id}:${input.lectureId}`,
    institutionId: input.institutionId, facultyId: input.facultyId, courseId: input.courseId,
    courseName: input.courseName, lectureId: input.lectureId, lectureTitle: input.lectureTitle,
    lectureSequence: input.lectureSequence, topic: input.topic, sourceType: sourceType(file), sourceName: file.name,
    section: input.topic, mimeType: downloaded.mimeType, sourceUrl: file.webViewLink, externalId: file.id,
    connectorType: input.connector, visibility: 'students', version: file.modifiedTime,
    contentHash: createHash('sha256').update(extracted.text).digest('hex'), content: extracted.text,
    updatedAt: file.modifiedTime ?? new Date().toISOString(),
  }
}

async function listDriveFiles(token: string, folderId: string) {
  const files: DriveFile[] = []; let pageToken: string | undefined
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('q', `'${folderId.replaceAll("'", "\\'")}' in parents and trashed = false`)
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,description)')
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const result = await googleJson<{ files?: DriveFile[]; nextPageToken?: string }>(url, token)
    files.push(...(result.files ?? [])); pageToken = result.nextPageToken
  } while (pageToken)
  return files.filter((file) => file.mimeType !== 'application/vnd.google-apps.folder')
}

async function processFiles(files: DriveFile[], token: string, input: FacultyConnectorSyncRequest): Promise<ConnectorSyncResult> {
  const documents: FacultySourceDocument[] = []; const failures: ConnectorFailure[] = []
  for (const file of files) {
    try { documents.push(await fileToDocument(file, token, input)) }
    catch (error) { failures.push({ resourceId: file.id, name: file.name, reason: error instanceof Error ? error.message : 'Extraction failed.' }) }
  }
  return { documents, failures, scannedResources: files.length }
}

export const googleDriveConnector: FacultyConnector = {
  type: 'google-drive',
  configured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
  async sync(input) {
    const token = await googleAccessToken(input.facultyId)
    const folderId = input.resourceId ?? teacherEnv('GOOGLE_DRIVE_FOLDER_ID', input.facultyId)
    if (!folderId) throw new Error('A Google Drive folder ID is required for connector sync.')
    return processFiles(await listDriveFiles(token, folderId), token, input)
  },
}

export const googleClassroomConnector: FacultyConnector = {
  type: 'google-classroom',
  configured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
  async sync(input) {
    const token = await googleAccessToken(input.facultyId)
    const classroomCourseId = input.resourceId ?? teacherEnv('GOOGLE_CLASSROOM_COURSE_ID', input.facultyId)
    if (!classroomCourseId) throw new Error('A Google Classroom course ID is required for connector sync.')
    const files = new Map<string, DriveFile>(); let pageToken: string | undefined; let scanned = 0
    do {
      const url = new URL(`https://classroom.googleapis.com/v1/courses/${encodeURIComponent(classroomCourseId)}/courseWorkMaterials`)
      url.searchParams.set('pageSize', '100'); if (pageToken) url.searchParams.set('pageToken', pageToken)
      const result = await googleJson<{ courseWorkMaterial?: ClassroomItem[]; nextPageToken?: string }>(url, token)
      for (const item of result.courseWorkMaterial ?? []) {
        scanned += 1
        for (const material of item.materials ?? []) {
          const drive = material.driveFile?.driveFile
          if (!drive?.id) continue
          const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(drive.id)}`)
          metadataUrl.searchParams.set('fields', 'id,name,mimeType,modifiedTime,webViewLink,description')
          files.set(drive.id, await googleJson<DriveFile>(metadataUrl, token))
        }
      }
      pageToken = result.nextPageToken
    } while (pageToken)
    const result = await processFiles([...files.values()], token, input)
    return { ...result, scannedResources: scanned }
  },
}
