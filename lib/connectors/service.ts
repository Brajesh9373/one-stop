import { mockGoogleClassroomConnector, mockGoogleDriveConnector } from '@/lib/connectors/mock'
import type { FacultyConnector, FacultyConnectorSyncRequest, FacultyConnectorType } from '@/lib/connectors/types'

const connectors = new Map<FacultyConnectorType, FacultyConnector>([
  ['google-drive', mockGoogleDriveConnector],
  ['google-classroom', mockGoogleClassroomConnector],
])

export function listAvailableConnectors() {
  return Array.from(connectors.keys())
}

export async function syncConnectorDocuments(input: FacultyConnectorSyncRequest) {
  const connector = connectors.get(input.connector)
  if (!connector) {
    throw new Error(`Unsupported connector: ${input.connector}`)
  }

  return connector.sync(input)
}
