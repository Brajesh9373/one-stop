import type { FacultySourceDocument } from '@/lib/rag/types'

export type FacultyConnectorType = 'google-drive' | 'google-classroom'

export type FacultyConnectorSyncRequest = {
  connector: FacultyConnectorType
  facultyId: string
  courseId: string
}

export type FacultyConnector = {
  type: FacultyConnectorType
  sync(input: FacultyConnectorSyncRequest): Promise<FacultySourceDocument[]>
}
