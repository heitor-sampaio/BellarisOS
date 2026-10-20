'use client'

import { useState, useTransition } from 'react'
import { Lock } from 'lucide-react'
import { PreAtendimentoDaCliente } from '@/components/client-portal/pre-atendimento'
import type { FichaDePreAtendimento, RespostaDaAnamnese } from '@/lib/anamnese-geral'

/**
 * A cliente pelo link: primeiro confirma quem é (CPF, ou a data de
 * nascimento), depois responde a ficha na mesma tela do app.
 *
 * A identidade fica só na memória desta página e vai de novo na resposta —
 * a rota de responder confere tudo outra vez, sem sessão para lembrar.
 */

interface Ficha { modo: 'COMPLETO' | 'CONFIRMAR'; ficha: FichaDePreAtendimento; respostasAnteriores: Record<string, RespostaDaAnamnese> }

function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

async function postar<T>(rota: string, corpo: unknown): Promise<T & { erro?: string }> {
  try {
    const r = await fetch(rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), referrerPolicy: 'no-referrer' })
    return await r.json()
  } catch {
    return { erro: 'Sem conexão. Confira a internet e tente de novo.' } as T & { erro: string }
  }
}

export function FichaPorLink({ token, clinica, pede }: { token: string; clinica: string; pede: 'CPF' | 'NASCIMENTO' }) {
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [bloqueado, setBloqueado] = useState(false)
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [enviando, iniciar] = useTransition()

  const identidade = pede === 'CPF' ? { token, cpf: valor } : { token, nascimento: valor }
  const pronto = pede === 'CPF' ? valor.replace(/\D/g, '').length === 11 : /^\d{4}-\d{2}-\d{2}$/.test(valor)

  function continuar(e: React.FormEvent) {
    e.preventDefault()
    if (!pronto) return
    setErro(null)
    iniciar(async () => {
      const r = await postar<{ ficha?: Ficha }>('/api/pre-atendimento/abrir', identidade)
      if (r.erro || !r.ficha) {
        setErro(r.erro ?? 'Não consegui abrir a ficha.')
        // Link revogado ou vencido no meio do caminho: não adianta tentar de novo.
        if (r.erro && !r.erro.startsWith('Os dados não conferem')) setBloqueado(true)
        return
      }
      setFicha(r.ficha)
    })
  }

  if (ficha) {
    const responder = async (corpo: Record<string, unknown>) => {
      const r = await postar<{ ok?: true }>('/api/pre-atendimento/responder', { ...identidade, ...corpo })
      return r.erro ? { error: r.erro } : { ok: true as const }
    }
    return (
      <PreAtendimentoDaCliente
        modo={ficha.modo} ficha={ficha.ficha} respostasAnteriores={ficha.respostasAnteriores} voltar={null}
        enviar={respostas => responder({ respostas })}
        confirmar={() => responder({ nadaMudou: true })}
      />
    )
  }

  return (
    <form onSubmit={continuar} className="card" style={{ padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p className="overline">Antes do seu atendimento</p>
        <h1 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)', marginTop: 4 }}>
          {clinica} mandou a sua ficha de pré-atendimento.
        </h1>
      </div>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
        <Lock size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        Para proteger os seus dados, confirme {pede === 'CPF' ? 'o seu CPF' : 'a sua data de nascimento'} antes de ver as perguntas.
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>
          {pede === 'CPF' ? 'CPF' : 'Data de nascimento'}
        </span>
        {pede === 'CPF'
          ? <input className="field" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={valor}
              onChange={e => setValor(mascaraCpf(e.target.value))} disabled={bloqueado} aria-label="CPF" />
          : <input className="field" type="date" value={valor} onChange={e => setValor(e.target.value)} disabled={bloqueado} aria-label="Data de nascimento" />}
      </label>
      {erro && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <button type="submit" className="btn-primary" disabled={!pronto || enviando || bloqueado}>
        {enviando ? 'Conferindo…' : 'Continuar'}
      </button>
    </form>
  )
}
