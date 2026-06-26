'use client'

import { useActionState } from 'react'
import { registerAction } from '@/actions/auth'
import Link from 'next/link'

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, undefined)

  if (state && 'needsConfirmation' in state && state.needsConfirmation) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--brand-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <span style={{ fontSize: 22 }}>✉️</span>
        </div>
        <h1 style={{
          fontSize: 'var(--text-title)',
          fontWeight: 'var(--weight-extrabold)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--text)',
          marginBottom: 10,
        }}>
          Confirme seu e-mail
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', lineHeight: 1.6 }}>
          Enviamos um link de confirmação para o seu e-mail. Após confirmar, você poderá fazer login e continuar a configuração.
        </p>
        <Link href="/login" className="btn-primary" style={{ display: 'inline-flex', marginTop: 24 }}>
          Ir para o login
        </Link>
      </div>
    )
  }

  return (
    <div className="card">
      <h1 style={{
        fontSize: 'var(--text-title)',
        fontWeight: 'var(--weight-extrabold)',
        letterSpacing: 'var(--tracking-tight)',
        color: 'var(--text)',
        marginBottom: 6,
      }}>
        Criar conta
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 28 }}>
        Comece agora — é grátis para testar
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
          <label htmlFor="password" className="overline">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="field"
            placeholder="Mínimo 8 caracteres"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="confirmPassword" className="overline">Confirmar senha</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="field"
            placeholder="Repita a senha"
          />
        </div>

        {state && 'error' in state && state.error && (
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
          {pending ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>

      <p style={{
        textAlign: 'center',
        marginTop: 20,
        fontSize: 'var(--text-xs-sz)',
        color: 'var(--text-muted)',
      }}>
        Já tem conta?{' '}
        <Link href="/login" style={{ color: 'var(--brand)', fontWeight: 'var(--weight-semibold)' }}>
          Entrar
        </Link>
      </p>
    </div>
  )
}
