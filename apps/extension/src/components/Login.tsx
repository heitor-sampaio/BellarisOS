import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError('E-mail ou senha inválidos.')
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18, minHeight: '100vh' }}>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--brand)' }}>
          Bellaris <span style={{ color: 'var(--text)' }}>✦</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Entre com sua conta para agendar.
        </p>
      </div>

      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline">E-mail</label>
          <input
            className="field" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} placeholder="voce@clinica.com.br"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline">Senha</label>
          <input
            className="field" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
          />
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="btn-primary" type="submit" disabled={!email || !password || loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
