import { googleClassroomConnector, googleDriveConnector } from '@/lib/connectors/google'
import type { FacultyConnector, FacultyConnectorSyncRequest, FacultyConnectorType } from '@/lib/connectors/types'

const connectors = new Map<FacultyConnectorType, FacultyConnector>([
  ['google-drive', googleDriveConnector], ['google-classroom', googleClassroomConnector],
])

export function listAvailableConnectors() {
  return [...connectors.values()].map((connector) => ({ type: connector.type, configured: connector.configured() }))
}

export async function syncConnectorDocuments(input: FacultyConnectorSyncRequest) {
  const connector = connectors.get(input.connector)
  if (!connector) throw new Error(`Unsupported connector: ${input.connector}`)
  return connector.sync(input)
}
