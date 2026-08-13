import { NextResponse } from 'next/server'

import { listAvailableConnectors } from '@/lib/connectors/service'

export async function GET() {
  return NextResponse.json({
    connectors: listAvailableConnectors(),
  })
}
