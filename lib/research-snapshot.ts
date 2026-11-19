import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ResearchEvidence } from './research-evidence'

export const researchTokenLimit = 64_000
const lifetime = 2 * 60 * 60 * 1000

function signature(payload: string, owner: string, secret: string) {
  return createHmac('sha256', secret).update('quantpilot/research/v1\0').update(owner).update('\0').update(payload).digest()
}

export function sealResearch(report: ResearchEvidence, owner: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ expires: now + lifetime, report })).toString('base64url')
  return `${payload}.${signature(payload, owner, secret).toString('base64url')}`
}

export function openResearch(token: string, owner: string, secret: string, now = Date.now()): ResearchEvidence | null {
  if (token.length > researchTokenLimit || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null
  const [payload, mac] = token.split('.')
  if (!timingSafeEqual(Buffer.from(mac, 'base64url'), signature(payload, owner, secret))) return null
  try {
    const { expires, report } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { expires: number; report: ResearchEvidence }
    return expires > now ? report : null
  } catch {
    return null
  }
}
