import type { NextRequest } from 'next/server'
import { z } from 'zod'

export const guestWorkspaceEnabled: boolean = true
export const guestCookieName = '__Host-quantpilot-guest'
const guestKeySchema = z.uuidv4()

export async function resolveWorkspaceIdentity(request: NextRequest): Promise<{ kind: 'guest' | 'user'; id: string } | null> {
  if (guestWorkspaceEnabled) {
    const key = guestKeySchema.safeParse(request.cookies.get(guestCookieName)?.value)
    return key.success ? { kind: 'guest', id: key.data } : null
  }
  const { auth } = await import('@/lib/auth')
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user ? { kind: 'user', id: session.user.id } : null
}
