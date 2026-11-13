import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { QuantDashboard } from '@/components/quant-dashboard'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  return <QuantDashboard user={{ name: session.user.name || 'Researcher', email: session.user.email }} />
}
