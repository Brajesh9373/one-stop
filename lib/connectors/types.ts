import type { FacultySourceDocument } from '@/lib/rag/types'

export type FacultyConnectorType = 'google-drive' | 'google-classroom'

export type FacultyConnectorSyncRequest = {
  connector: FacultyConnectorType
  institutionId: string
  facultyId: string
  courseId: string
  courseName: string
  lectureId: string
  lectureTitle: string
  lectureSequence: number
  topic: string
  resourceId?: string
}

export type ConnectorFailure = { resourceId: string; name: string; reason: string }
export type ConnectorSyncResult = {
  documents: FacultySourceDocument[]
  failures: ConnectorFailure[]
  scannedResources: number
}

export type FacultyConnector = {
  type: FacultyConnectorType
  configured(): boolean
  sync(input: FacultyConnectorSyncRequest): Promise<ConnectorSyncResult>
}
