'use client'

import { Suspense, useActionState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { updatePasswordAction } from '@/actions/auth'
import Link from 'next/link'

/**
 * A nova senha, na volta do link de recuperação. Quem chega aqui já passou por
 * /auth/confirm, que abriu a sessão; `?erro=link` é o link que não serviu.
 */
export default function UpdatePasswordPage() {
  // useSearchParams pede Suspense, senão o build recusa a página estática.
  return <Suspense><NovaSenha /></Suspense>
}

function NovaSenha() {
  const [state, action, pending] = useActionState(updatePasswordAction, undefined)
  const linkRuim = useSearchParams().get('erro') === 'link'

  useEffect(() => {
    if (state && 'redirectTo' in state && state.redirectTo) window.location.href = state.redirectTo
  }, [state])

  if (linkRuim) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', marginBottom: 8 }}>
          Link expirado
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 24 }}>
          Este link de recuperação expirou ou já foi usado. Peça um novo.
        </p>
        <Link href="/reset-password" className="btn-primary" style={{ justifyContent: 'center' }}>
          Pedir novo link
        </Link>
      </div>
    )
  }

  const erro = state && 'error' in state ? state.error : null

  return (
    <div className="card">
      <h1 style={{
        fontSize: 'var(--text-title)',
        fontWeight: 'var(--weight-extrabold)',
        letterSpacing: 'var(--tracking-tight)',
        marginBottom: 6,
      }}>
        Nova senha
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 28 }}>
        Escolha a senha que vai usar para entrar.
      </p>

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="password" className="overline">Nova senha</label>
          <input id="password" name="password" type="password" required minLength={8}
            autoComplete="new-password" className="field" placeholder="Mínimo de 8 caracteres" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="confirmPassword" className="overline">Confirmar senha</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required
            autoComplete="new-password" className="field" placeholder="Repita a senha" />
        </div>

        {erro && (
          <p style={{
            color: 'var(--warning)',
            background: 'var(--warning-soft)',
            borderRadius: 'var(--radius-field-token)',
            padding: '8px 12px',
            fontSize: 'var(--text-xs-sz)',
          }}>
            {erro}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary" style={{ justifyContent: 'center' }}>
          {pending ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  )
}
