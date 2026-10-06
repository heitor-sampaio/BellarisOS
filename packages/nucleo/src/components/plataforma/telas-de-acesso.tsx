'use client'

import { Suspense, useActionState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

/**
 * As telas de ACESSO da equipe da plataforma (sistema e suporte): entrar,
 * pedir nova senha e definir a nova. As actions vêm do app
 * (`actions/acesso.ts`), que as liga ao núcleo (`lib/plataforma/acesso.ts`).
 */
type EstadoDoLogin = { error: string } | { redirectTo: string } | undefined
type EstadoDoPedido = { error: string } | { success: true } | undefined
type Acao<E> = (estado: E, formData: FormData) => Promise<E>

const aviso: React.CSSProperties = {
  color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)',
  padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
}
const titulo: React.CSSProperties = {
  fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', marginBottom: 6,
}
const sub: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginBottom: 28 }
const pilha: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }

/** A moldura das três telas: a marca e o nome do painel. */
export function MolduraDeAcesso({ painel, children }: { painel: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: 24, fontWeight: 'var(--weight-extrabold)', color: 'var(--brand)', letterSpacing: 'var(--tracking-tight)' }}>
            BellarisOS ✦
          </span>
          <p className="overline" style={{ marginTop: 6 }}>{painel}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export function TelaDeLogin({ entrar, painel }: { entrar: Acao<EstadoDoLogin>; painel: string }) {
  const [state, action, pending] = useActionState(entrar, undefined)
  useEffect(() => {
    if (state && 'redirectTo' in state) window.location.href = state.redirectTo
  }, [state])
  return (
    <div className="card">
      <h1 style={titulo}>Entrar</h1>
      <p style={sub}>{painel} — equipe do BellarisOS</p>
      <form action={action} style={pilha}>
        <div style={campo}>
          <label htmlFor="email" className="overline">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" placeholder="seu@email.com" />
        </div>
        <div style={campo}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="password" className="overline">Senha</label>
            <Link href="/reset-password" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--brand)', fontWeight: 'var(--weight-semibold)' }}>
              Esqueci a senha
            </Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" placeholder="••••••••" />
        </div>
        {state && 'error' in state && <p role="alert" style={aviso}>{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-primary" style={{ justifyContent: 'center', marginTop: 4 }}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export function TelaEsqueciASenha({ pedir }: { pedir: Acao<EstadoDoPedido> }) {
  const [state, action, pending] = useActionState(pedir, undefined)
  if (state && 'success' in state) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', marginBottom: 8 }}>E-mail enviado</h2>
        <p style={{ ...sub, marginBottom: 24 }}>Verifique sua caixa de entrada e siga as instruções.</p>
        <Link href="/login" className="btn-ghost" style={{ justifyContent: 'center' }}>Voltar ao login</Link>
      </div>
    )
  }
  return (
    <div className="card">
      <Link href="/login" style={{ display: 'inline-flex', color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginBottom: 20 }}>← Voltar</Link>
      <h1 style={titulo}>Recuperar senha</h1>
      <p style={sub}>Enviaremos um link de redefinição para seu e-mail.</p>
      <form action={action} style={pilha}>
        <div style={campo}>
          <label htmlFor="email" className="overline">E-mail</label>
          <input id="email" name="email" type="email" required className="field" placeholder="seu@email.com" />
        </div>
        {state && 'error' in state && <p role="alert" style={aviso}>{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-primary" style={{ justifyContent: 'center' }}>
          {pending ? 'Enviando…' : 'Enviar link'}
        </button>
      </form>
    </div>
  )
}

export function TelaNovaSenha({ trocar }: { trocar: Acao<EstadoDoLogin> }) {
  // useSearchParams pede Suspense, senão o build recusa a página estática.
  return <Suspense><NovaSenha trocar={trocar} /></Suspense>
}

function NovaSenha({ trocar }: { trocar: Acao<EstadoDoLogin> }) {
  const [state, action, pending] = useActionState(trocar, undefined)
  const linkRuim = useSearchParams().get('erro') === 'link'
  useEffect(() => {
    if (state && 'redirectTo' in state) window.location.href = state.redirectTo
  }, [state])
  if (linkRuim) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', marginBottom: 8 }}>Link expirado</h1>
        <p style={{ ...sub, marginBottom: 24 }}>O link já foi usado ou venceu. Peça outro.</p>
        <Link href="/reset-password" className="btn-primary" style={{ justifyContent: 'center' }}>Pedir outro link</Link>
      </div>
    )
  }
  return (
    <div className="card">
      <h1 style={titulo}>Nova senha</h1>
      <p style={sub}>Defina a senha da sua conta.</p>
      <form action={action} style={pilha}>
        <div style={campo}>
          <label htmlFor="password" className="overline">Nova senha</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required className="field" />
        </div>
        <div style={campo}>
          <label htmlFor="confirmPassword" className="overline">Confirme a senha</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required className="field" />
        </div>
        {state && 'error' in state && <p role="alert" style={aviso}>{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-primary" style={{ justifyContent: 'center' }}>
          {pending ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  )
}
