'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export function AuthForm() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const result = mode === 'signin'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name.trim() })
      if (result.error) { setError('We could not verify those details. Check your information and try again.'); return }
      router.replace('/')
      router.refresh()
    } catch {
      setError('We could not complete sign-in right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  async function useTestAccount() {
    if (loading) return
    setError('')
    setLoading(true)
    const credentials = { email: 'test@quantpilot.dev', password: 'test' }
    try {
      const created = await authClient.signUp.email({ ...credentials, name: 'Test User' })
      if (created.error) {
        const signedIn = await authClient.signIn.email(credentials)
        if (signedIn.error) {
          setError('We could not open the test account. Please try again.')
          return
        }
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('We could not open the test account. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  return <main className="auth-screen"><section className="auth-card"><a className="auth-brand" href="/sign-in"><span className="brand-mark">Q</span><span><strong>QuantPilot</strong><small>RESEARCH TERMINAL</small></span></a><div className="auth-kicker"><ShieldCheck size={14} /> PRIVATE, ENCRYPTED WORKSPACE</div><h1>{mode === 'signin' ? 'Welcome back.' : 'Start with a clean slate.'}</h1><p className="auth-description">{mode === 'signin' ? 'Sign in to your research workspace.' : 'Create an account to save portfolios, strategies, and backtests.'}</p><form className="auth-form" onSubmit={submit}>
    {mode === 'signup' && <label>Full name<input required autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Alex Rivera" maxLength={100} /></label>}
    <label>Email address<span className="auth-input"><Mail size={16} /><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></span></label>
    <label>Password<span className="auth-input"><LockKeyhole size={16} /><input required type="password" minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" /></span></label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="auth-submit" type="submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={16} /> Please wait</> : <>{mode === 'signin' ? 'Sign in' : 'Create account'}<ArrowRight size={16} /></>}</button>
  </form>{process.env.NODE_ENV === 'development' && mode === 'signin' && <button className="auth-demo" type="button" onClick={useTestAccount} disabled={loading}><span className="auth-demo-copy"><strong>Use test account</strong><small>ID: test · Password: test</small></span><ArrowRight size={14} aria-hidden="true" /></button>}<div className="auth-switch">{mode === 'signin' ? 'New to QuantPilot?' : 'Already have an account?'} <button type="button" onClick={() => { setError(''); setMode(value => value === 'signin' ? 'signup' : 'signin') }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></div><div className="auth-note"><LockKeyhole size={13} /> Your research is private and scoped to your account.</div></section></main>
}
