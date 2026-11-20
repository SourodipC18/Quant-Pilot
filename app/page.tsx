import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { QuantDashboard } from '@/components/quant-dashboard'
import { guestWorkspaceEnabled } from '@/lib/workspace-access'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  if (guestWorkspaceEnabled) return <QuantDashboard user={null} />

  const { auth } = await import('@/lib/auth')
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  return <QuantDashboard user={{ name: session.user.name, email: session.user.email }} />
}
