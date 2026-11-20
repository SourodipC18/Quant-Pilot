import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { guestWorkspaceEnabled } from '@/lib/workspace-access'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  if (guestWorkspaceEnabled) redirect('/')

  const { auth } = await import('@/lib/auth')
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/')
  return <AuthForm />
}
