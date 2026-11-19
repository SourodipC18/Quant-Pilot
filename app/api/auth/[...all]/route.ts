import { toNextJsHandler } from 'better-auth/next-js'
import { NextResponse } from 'next/server'
import { guestWorkspaceEnabled } from '@/lib/workspace-access'

function authHandler(method: 'GET' | 'POST') {
  return async (request: Request) => {
    if (guestWorkspaceEnabled) return NextResponse.json({ error: 'Sign-in is paused.' }, { status: 404 })

    const { auth } = await import('@/lib/auth')
    return toNextJsHandler(auth)[method](request)
  }
}

export const GET = authHandler('GET')
export const POST = authHandler('POST')
