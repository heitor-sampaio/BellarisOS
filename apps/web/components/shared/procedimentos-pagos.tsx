'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { cancelarUnidadePrePaga } from '@/actions/pre-pago'
import type { PrePagoDoCliente, UnidadePrePaga } from '@/lib/pre-pago/leitura'

const TZ = 'America/Sao_Paulo'
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ })
const diaEHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * Os procedimentos pré-pagos do cliente, na ficha (2026-09-30): o que ele
 * comprou, o que ainda tem para agendar e o que já usou. Cancelar uma unidade
 * pede motivo e registra a devolução no financeiro (decisão do Heitor: "se
 * cancelar, registra para fazer estorno").
 */
export function ProcedimentosPagos({ vendas, podeCancelar }: {
  vendas:       PrePagoDoCliente[]
  podeCancelar: boolean
}) {
  if (!vendas.length) return null
  return (
    <section className="card" data-procedimentos-pagos style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Receipt size={14} style={{ color: 'var(--brand)' }} aria-hidden />
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Procedimentos pagos</h3>
      </div>
      {vendas.map(v => <Venda key={v.id} venda={v} podeCancelar={podeCancelar} />)}
    </section>
  )
}

function Venda({ venda: v, podeCancelar }: { venda: PrePagoDoCliente; podeCancelar: boolean }) {
  const [aberta, setAberta] = useState(v.disponiveis > 0)
  return (
    <div data-venda-pre-paga style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-row)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" onClick={() => setAberta(a => !a)} aria-expanded={aberta}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>{v.quantidade}× {v.procedimento}</span>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: v.disponiveis > 0 ? 'var(--brand)' : 'var(--text-muted)', fontWeight: 700 }}>
          {v.disponiveis > 0 ? `${v.disponiveis} para agendar` : 'nada para agendar'}
        </span>
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {formatBRL(v.price)}{v.desconto > 0 ? ` (desconto de ${formatBRL(v.desconto)})` : ''} · {dia(v.vendidoEm)}
          {v.venceEm ? ` · ${v.vencida ? 'venceu' : 'vale até'} ${dia(v.venceEm)}` : ''}
        </span>
      </button>
      {aberta && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {v.unidades.map(u => <Unidade key={u.id} unidade={u} podeCancelar={podeCancelar} />)}
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

function Unidade({ unidade: u, podeCancelar }: { unidade: UnidadePrePaga; podeCancelar: boolean }) {
  const router = useRouter()
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const livre = u.status === 'DISPONIVEL' && !u.agendamentoEm

  function cancelar() {
    setErro(null)
    iniciar(async () => {
      const r = await cancelarUnidadePrePaga(u.id, motivo)
      if (r.error) { setErro(r.error); return }
      setCancelando(false)
      setAviso(r.devolver && r.devolver > 0
        ? `Devolução de ${formatBRL(r.devolver)} registrada no financeiro.`
        : r.reduzido && r.reduzido > 0 ? `O a receber diminuiu ${formatBRL(r.reduzido)}.` : 'Unidade cancelada.')
      router.refresh()
    })
  }

  return (
    <li data-unidade-pre-paga style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-xs-sz)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>Unidade {u.numero}</span>
        <span style={{ color: 'var(--text-muted)' }}>{formatBRL(u.preco)}</span>
        <span style={{ color: u.status === 'DISPONIVEL' ? 'var(--success)' : 'var(--text-muted)' }}>{situacao(u)}</span>
        {podeCancelar && livre && !cancelando && (
          <button type="button" className="btn-ghost" style={{ fontSize: 'var(--text-2xs)', padding: '3px 7px', marginLeft: 'auto' }}
            onClick={() => setCancelando(true)}>
            Cancelar
          </button>
        )}
      </div>
      {cancelando && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="field" aria-label="Motivo do cancelamento" placeholder="Motivo (obrigatório)"
            value={motivo} onChange={e => setMotivo(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <button type="button" className="btn-ghost" onClick={() => { setCancelando(false); setErro(null) }} disabled={pendente}>Voltar</button>
          <button type="button" className="btn-secondary" onClick={cancelar} disabled={pendente || !motivo.trim()}>
            {pendente ? 'Cancelando…' : 'Cancelar unidade'}
          </button>
        </div>
      )}
      {erro && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {aviso && <p role="status" style={{ color: 'var(--text-soft)' }}>{aviso}</p>}
    </li>
  )
}
