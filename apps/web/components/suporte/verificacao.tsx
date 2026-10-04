'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  confirmarCodigo, iniciarCadastroDoAutenticador, type EstadoDaVerificacao,
} from '@/actions/plataforma-verificacao'

/**
 * Cadastro do autenticador (QR + segredo) e confirmação do código. Depois de
 * confirmado, a sessão vira aal2 e o painel abre.
 */
export function Verificacao({ inicial, destino }: { inicial: EstadoDaVerificacao; destino: string }) {
  const router = useRouter()
  const [factorId, setFactorId] = useState<string | null>(inicial.factorId)
  const [cadastro, setCadastro] = useState<{ qr: string; segredo: string } | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  function cadastrar() {
    setErro(null)
    startTransition(async () => {
      const r = await iniciarCadastroDoAutenticador()
      if (!r.ok) { setErro(r.error); return }
      setFactorId(r.factorId)
      setCadastro({ qr: r.qr, segredo: r.segredo })
    })
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setErro(null)
    startTransition(async () => {
      const r = await confirmarCodigo(factorId, codigo)
      if (!r.ok) { setErro(r.error); setCodigo(''); return }
      router.replace(destino)
      router.refresh()
    })
  }

  if (!factorId) {
    return (
      <div className="suporte-pilha">
        <p className="suporte-texto">Você ainda não tem um autenticador cadastrado.</p>
        {erro && <p className="suporte-erro" role="alert">{erro}</p>}
        <button type="button" className="btn-primary" onClick={cadastrar} disabled={pendente}>
          {pendente ? 'Preparando…' : 'Cadastrar autenticador'}
        </button>
      </div>
    )
  }

  return (
    <form className="suporte-pilha" onSubmit={confirmar}>
      {cadastro && (
        <div className="suporte-pilha">
          <p className="suporte-texto">Leia o QR com o aplicativo autenticador:</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG em data URI que o Auth devolve */}
          <img src={cadastro.qr} alt="QR do autenticador" className="suporte-qr" />
          <p className="suporte-texto-fraco">
            Ou digite o código: <code className="suporte-segredo" data-testid="segredo-totp">{cadastro.segredo}</code>
          </p>
        </div>
      )}
      <label className="field-label" htmlFor="codigo-totp">Código de 6 dígitos</label>
      <input
        id="codigo-totp" className="field" inputMode="numeric" autoComplete="one-time-code"
        maxLength={7} value={codigo} onChange={e => setCodigo(e.target.value)} autoFocus
      />
      {erro && <p className="suporte-erro" role="alert">{erro}</p>}
      <button type="submit" className="btn-primary" disabled={pendente || codigo.replace(/\D/g, '').length !== 6}>
        {pendente ? 'Conferindo…' : 'Confirmar'}
      </button>
    </form>
  )
}
