'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { agendarUnidadePrePaga } from '@/actions/pre-pago'
import { CancelarUnidadePrePaga } from '@/components/shared/cancelar-unidade-pre-paga'
import { SessionScheduler } from '@/components/branch/treatment-sessions-modal'
import type { PrePagoDoCliente, UnidadePrePaga } from '@/lib/pre-pago/leitura'
import { textoDoParaAgendar } from '@/lib/pre-pago/contagem'

const TZ = 'America/Sao_Paulo'
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ })
const diaEHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * Os procedimentos pré-pagos do cliente, na ficha (2026-09-30): o que ele
 * comprou, o que ainda tem para agendar e o que já usou. Cancelar uma unidade
 * vai pelo fluxo do pacote (D1 da 6ª simulação): a janela mostra a conta e
 * pergunta como devolver — estorno ou crédito na clínica.
 */
interface Agenda { podeAgendar: boolean; branches: { id: string; name: string }[]; currentBranchId: string }

export function ProcedimentosPagos({ vendas, podeCancelar, podeAgendar = false, branches = [], currentBranchId = '' }: {
  vendas:       PrePagoDoCliente[]
  podeCancelar: boolean
  /** Agendar uma unidade livre aqui mesmo (agenda: MANAGE). */
  podeAgendar?: boolean
  branches?:    { id: string; name: string }[]
  currentBranchId?: string
}) {
  // Sem a unidade corrente (a ficha da rede com várias — D1 da 8ª), o agendar
  // pergunta a unidade entre as da rede.
  const agenda: Agenda = { podeAgendar: podeAgendar && (!!currentBranchId || branches.length > 1), branches, currentBranchId }
  if (!vendas.length) return null
  return (
    <section className="card" data-procedimentos-pagos style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Receipt size={14} style={{ color: 'var(--brand)' }} aria-hidden />
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Procedimentos pagos</h3>
      </div>
      {vendas.map(v => <Venda key={v.id} venda={v} podeCancelar={podeCancelar} agenda={agenda} />)}
    </section>
  )
}

function Venda({ venda: v, podeCancelar, agenda }: { venda: PrePagoDoCliente; podeCancelar: boolean; agenda: Agenda }) {
  const [aberta, setAberta] = useState(v.disponiveis > 0)
  return (
    <div data-venda-pre-paga style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-row)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" onClick={() => setAberta(a => !a)} aria-expanded={aberta}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>{v.quantidade}× {v.procedimento}</span>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: v.disponiveis > 0 ? 'var(--brand)' : 'var(--text-muted)', fontWeight: 700 }}>
          {textoDoParaAgendar({ paraAgendar: v.disponiveis, agendadas: v.agendadas })}
        </span>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {formatBRL(v.price)}{v.desconto > 0 ? ` (desconto de ${formatBRL(v.desconto)})` : ''} · {dia(v.vendidoEm)}
          {v.venceEm ? ` · ${v.vencida ? 'venceu' : 'vale até'} ${dia(v.venceEm)}` : ''}
        </span>
      </button>
      {aberta && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {v.unidades.map(u => <Unidade key={u.id} unidade={u} podeCancelar={podeCancelar} agenda={agenda} />)}
        </ul>
      )}
    </div>
  )
}

function situacao(u: UnidadePrePaga): string {
  if (u.status === 'USADA') return 'Usada'
  if (u.status === 'CANCELADA') return `Cancelada${u.canceladaPor ? ` — ${u.canceladaPor}` : ''}`
  return u.agendamentoEm ? `Agendada para ${diaEHora(u.agendamentoEm)}` : 'Disponível'
}

function Unidade({ unidade: u, podeCancelar, agenda }: { unidade: UnidadePrePaga; podeCancelar: boolean; agenda: Agenda }) {
  const router = useRouter()
  const [cancelando, setCancelando] = useState(false)
  const [agendando, setAgendando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const livre = u.status === 'DISPONIVEL' && !u.agendamentoEm

  return (
    <li data-unidade-pre-paga style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-xs-sz)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>Unidade {u.numero}</span>
        <span style={{ color: 'var(--text-muted)' }}>{formatBRL(u.preco)}</span>
        <span style={{ color: u.status === 'DISPONIVEL' ? 'var(--success)' : 'var(--text-muted)' }}>{situacao(u)}</span>
        {livre && !cancelando && !agendando && (
          <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {agenda.podeAgendar && (
              <button type="button" className="btn-ghost" style={{ fontSize: 'var(--text-2xs)', padding: '3px 7px' }}
                onClick={() => setAgendando(true)}>
                Agendar
              </button>
            )}
            {podeCancelar && (
              <button type="button" className="btn-ghost" style={{ fontSize: 'var(--text-2xs)', padding: '3px 7px' }}
                onClick={() => setCancelando(true)}>
                Cancelar
              </button>
            )}
          </span>
        )}
      </div>
      {agendando && (
        <SessionScheduler
          branches={agenda.branches.length ? agenda.branches : [{ id: agenda.currentBranchId, name: '' }]}
          currentBranchId={agenda.currentBranchId}
          onCancel={() => setAgendando(false)}
          onSave={async ({ branchId, professionalId, scheduledAt }) => {
            const r = await agendarUnidadePrePaga({ unidadeId: u.id, branchId, professionalId, scheduledAt })
            if (r.error) return { error: r.error }
            setAgendando(false)
            setAviso('Unidade agendada.')
            router.refresh()
            return {}
          }}
        />
      )}
      {cancelando && (
        <CancelarUnidadePrePaga unidadeId={u.id} onFechar={() => setCancelando(false)} onCancelada={setAviso} />
      )}
      {aviso && <p role="status" style={{ color: 'var(--text-soft)' }}>{aviso}</p>}
    </li>
  )
}
