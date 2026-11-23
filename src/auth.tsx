import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'
import { Logo, btnGhost, btnPrimary, inputCls } from './ui'

// Same Supabase project as silus.app, so accounts are shared. Publishable key is public by design.
export const supabase = createClient(
  'https://wzethvmmngttquycyyks.supabase.co',
  'sb_publishable_iMYOBQcrsM1aNmwztoly5Q_4IKaJiRg',
  { db: { schema: 'prism' } },
)

export function AuthGate({ children }: { children: (user: { id: string; email: string }) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return null
  return session ? <>{children({ id: session.user.id, email: session.user.email?.toLowerCase() ?? '' })}</> : <Login />
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError('E-mail ou senha incorretos.')
  }
  // Trailing slash matters: Supabase's "https://host/**" allowlist entries do not match a bare origin.
  const google = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/` } })

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-white/[0.08] bg-raised p-6">
        <div className="mb-2 flex items-center gap-2"><Logo /></div>
        <p className="text-sm text-white/60">Entre com sua conta Silus.</p>
        <input className={inputCls} type="email" autoComplete="email" required placeholder="E-mail" aria-label="E-mail"
          value={email} onChange={e => setEmail(e.target.value)} />
        <input className={inputCls} type="password" autoComplete="current-password" required placeholder="Senha" aria-label="Senha"
          value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-sm text-coral">{error}</p>}
        <button type="submit" disabled={busy} className={`${btnPrimary} justify-center`}>Entrar</button>
        <button type="button" onClick={google} className={`${btnGhost} justify-center border border-white/[0.08]`}>Entrar com Google</button>
      </form>
    </main>
  )
}
