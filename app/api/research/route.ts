import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { classifyProviderFailure } from '@/lib/market-data'
import { guestCookieName, guestWorkspaceEnabled } from '@/lib/workspace-access'
import { researchInput, ResearchUnavailable, runResearch } from '@/lib/research-run'
import { openResearch, researchTokenLimit, sealResearch } from '@/lib/research-snapshot'

export const runtime = 'nodejs'
const privateHeaders = { 'Cache-Control': 'private, no-store' }
const token = z.string().min(1).max(researchTokenLimit)
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('run'), input: researchInput }),
  z.object({ action: z.literal('export'), token }),
  z.object({ action: z.literal('interpret'), token, question: z.enum(['takeaway', 'risk', 'limits']) }),
])
const guestKeySchema = z.uuidv4()
const windows = new Map<string, { hits: number; until: number }>()

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers: { ...privateHeaders, ...headers } })
}
const error = (message: string, status: number) => json({ error: message }, status)

async function resolveOwner(request: NextRequest) {
  if (guestWorkspaceEnabled) {
    const guest = guestKeySchema.safeParse(request.cookies.get(guestCookieName)?.value)
    return guest.success ? `guest:${guest.data}` : null
  }
  const { auth } = await import('@/lib/auth')
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user.id ? `user:${session.user.id}` : null
}

function limit(key: string, cap: number) {
  const now = Date.now(), current = windows.get(key)
  if (current && current.until > now) {
    if (current.hits >= cap) return Math.ceil((current.until - now) / 1000)
    current.hits++
    return 0
  }
  if (windows.size >= 2048) for (const [candidate, window] of windows) if (window.until <= now) windows.delete(candidate)
  if (windows.size >= 2048) return 60
  windows.set(key, { hits: 1, until: now + 60_000 })
  return 0
}

async function receiveJson(request: NextRequest) {
  const reader = request.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder(), limit = researchTokenLimit + 1024
  let text = '', length = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > limit) { await reader.cancel(); return null }
    text += decoder.decode(value, { stream: true })
  }
  return JSON.parse(text + decoder.decode()) as unknown
}

export async function POST(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return error('Open Research Studio in your workspace to continue.', 403)
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return error('Expected application/json.', 415)
  const owner = await resolveOwner(request)
  if (!owner) return guestWorkspaceEnabled ? error('Your guest workspace could not be opened. Allow cookies and refresh the page.', 409) : error('Sign in to access this analysis.', 401)
  const parsed = bodySchema.safeParse(await receiveJson(request).catch(() => null))
  if (!parsed.success) return error('Check the research controls and try again.', 400)
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) return error('Snapshot signing is not configured on the server.', 503)
  const data = parsed.data
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim().slice(0, 64) || 'unknown'
  const retryAfter = limit(`${data.action}:ip:${ip}`, data.action === 'interpret' ? 8 : 24) || limit(`${data.action}:owner:${owner}`, data.action === 'interpret' ? 4 : 12)
  if (retryAfter) return json({ error: 'Too many research requests. Try again shortly.' }, 429, { 'Retry-After': String(retryAfter) })

  if (data.action === 'run') {
    try {
      const report = await runResearch(data.input)
      return json({ report, token: sealResearch(report, owner, secret) })
    } catch (failure) {
      if (failure instanceof ResearchUnavailable) return error(failure.message, 422)
      const providerError = classifyProviderFailure(failure)
      return error(providerError.message, providerError.httpStatus)
    }
  }

  const report = openResearch(data.token, owner, secret)
  if (!report) return error('This snapshot is unavailable or expired. Run the analysis again in this workspace.', 404)
  if (data.action === 'export') {
    try {
      const { renderResearchPdf } = await import('@/lib/research-pdf')
      const pdf = await renderResearchPdf(report)
      return new NextResponse(Uint8Array.from(pdf), { headers: { ...privateHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="quantpilot-${report.method}.pdf"` } })
    } catch { return error('The PDF could not be generated. Try again.', 500) }
  }
  try {
    const { interpretResearch } = await import('@/lib/research-assistant')
    const answer = await interpretResearch(report, data.question)
    if (!answer.length) return error('Assistant has no eligible evidence for this analysis.', 422)
    return json({ answer })
  } catch (failure) {
    if (failure instanceof Error && failure.name.startsWith('Gateway') && 'statusCode' in failure && failure.statusCode === 403 && /credit card|billing/i.test(failure.message)) {
      return error('AI Gateway needs a payment method for this Vercel team. Add one in the team’s AI Gateway settings to enable interpretation. Reports and analysis still work.', 503)
    }
    return error('Assistant is unavailable. If the problem persists, verify AI Gateway access in the Vercel project.', 503)
  }
}
