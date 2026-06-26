'use client'

import { useActionState } from 'react'
import { resetPasswordAction } from '@/actions/auth'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined)

  if (state?.success) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', marginBottom: 8 }}>
          E-mail enviado
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 24 }}>
          Verifique sua caixa de entrada e siga as instruções.
        </p>
        <Link href="/login" className="btn-ghost" style={{ justifyContent: 'center' }}>
          Voltar ao login
        </Link>
      </div>
    )
  }

  return (
    <div className="card">
      <Link
        href="/login"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginBottom: 20 }}
      >
        ← Voltar
      </Link>

      <h1 style={{
        fontSize: 'var(--text-title)',
        fontWeight: 'var(--weight-extrabold)',
        letterSpacing: 'var(--tracking-tight)',
        marginBottom: 6,
      }}>
        Recuperar senha
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 28 }}>
        Enviaremos um link de redefinição para seu e-mail.
      </p>

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="email" className="overline">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="field"
            placeholder="seu@email.com"
          />
        </div>

        {state?.error && (
          <p style={{
            color: 'var(--warning)',
            background: 'var(--warning-soft)',
            borderRadius: 'var(--radius-field-token)',
            padding: '8px 12px',
            fontSize: 'var(--text-xs-sz)',
          }}>
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
          style={{ justifyContent: 'center' }}
        >
          {pending ? 'Enviando…' : 'Enviar link'}
        </button>
      </form>
    </div>
  )
}
