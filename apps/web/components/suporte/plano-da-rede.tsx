'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alterarPlanoDaRede } from '@/actions/plataforma'
import { SITUACOES_DO_PLANO, ROTULO_DA_SITUACAO, rotuloDaSituacao, type SituacaoDoPlano } from '@/lib/plataforma/plano'

/**
 * Plano, situação e fim do trial da rede. Só o admin da plataforma muda; o
 * suporte vê. (Quando houver cobrança, quem escreve aqui é ela.)
 */
export function PlanoDaRede({ tenantId, podeEditar, inicial }: {
  tenantId: string
  podeEditar: boolean
  inicial: { planName: string | null; planStatus: string; trialEndsAt: string | null }
}) {
  const router = useRouter()
  const [planName, setPlanName] = useState(inicial.planName ?? '')
  const [planStatus, setPlanStatus] = useState(inicial.planStatus)
  const [trial, setTrial] = useState(inicial.trialEndsAt ? inicial.trialEndsAt.slice(0, 10) : '')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, startTransition] = useTransition()

  if (!podeEditar) {
    return (
      <p className="suporte-texto">
        {rotuloDaSituacao(inicial.planStatus)}
        {inicial.planName ? ` · ${inicial.planName}` : ''}
        {inicial.trialEndsAt ? ` · trial até ${new Date(inicial.trialEndsAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
      </p>
    )
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    setAviso(null)
    startTransition(async () => {
      const r = await alterarPlanoDaRede(tenantId, {
        planName: planName || null,
        planStatus: planStatus as SituacaoDoPlano,
        // Fim do dia no fuso da clínica.
        trialEndsAt: trial ? `${trial}T23:59:59-03:00` : null,
      })
      setAviso(r.ok ? { ok: true, texto: 'Plano atualizado.' } : { ok: false, texto: r.error })
      if (r.ok) router.refresh()
    })
  }

  return (
    <form className="suporte-form-linha" onSubmit={salvar}>
      <label className="suporte-campo">
        <span className="field-label">Plano</span>
        <input className="field" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Ex.: Essencial" />
      </label>
      <label className="suporte-campo">
        <span className="field-label">Situação</span>
        <select className="filtro-select" value={planStatus} onChange={e => setPlanStatus(e.target.value)}>
          {SITUACOES_DO_PLANO.map(s => <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</option>)}
        </select>
      </label>
      <label className="suporte-campo">
        <span className="field-label">Fim do trial</span>
        <input className="field" type="date" value={trial} onChange={e => setTrial(e.target.value)} />
      </label>
      <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</button>
      {aviso && <span className={aviso.ok ? 'suporte-ok' : 'suporte-erro'} role="status">{aviso.texto}</span>}
    </form>
  )
}
