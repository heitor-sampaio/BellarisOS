'use client'

import { useActionState, useEffect } from 'react'
import { loginAction } from '@/actions/auth'
import { createClient } from '@/lib/supabase/client'
import { nativeStore } from '@/lib/supabase/native-store'
import Link from 'next/link'

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined)

  useEffect(() => {
    if (!(state && 'redirectTo' in state && state.redirectTo)) return
    const dest = state.redirectTo
    // Persiste tokens no armazenamento nativo (Android SharedPreferences / iOS NSUserDefaults)
    // para que o cold start funcione mesmo quando os cookies do WebView não forem enviados.
    createClient().auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await nativeStore.save({
          access_token:  session.access_token,
          refresh_token: session.refresh_token,
        })
      }
      window.location.href = dest
    })
  }, [state])

  return (
    <div className="card">
      <h1 style={{
        fontSize: 'var(--text-title)',
        fontWeight: 'var(--weight-extrabold)',
        letterSpacing: 'var(--tracking-tight)',
        color: 'var(--text)',
        marginBottom: 6,
      }}>
        Entrar
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 28 }}>
        Portal de gestão Lumière
      </p>

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="email" className="overline">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="field"
            placeholder="seu@email.com"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="password" className="overline">Senha</label>
            <Link
              href="/reset-password"
              style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--brand)', fontWeight: 'var(--weight-semibold)' }}
            >
              Esqueci a senha
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field"
            placeholder="••••••••"
          />
        </div>

        {state?.error && (
          <p style={{
            color: 'var(--warning)',
            background: 'var(--warning-soft)',
            borderRadius: 'var(--radius-field-token)',
            padding: '8px 12px',
            fontSize: 'var(--text-xs-sz)',
            fontWeight: 'var(--weight-semibold)',
          }}>
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
          style={{ justifyContent: 'center', marginTop: 4 }}
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
