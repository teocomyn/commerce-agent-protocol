import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'

// DELETE /api/keys/[id] — revoke a key
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ revoked: true })
}
