'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Package, X } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { venderPacote } from '@/actions/pacotes'
import { CamposDoPagamento, estadoDoPagamento, montarPagamento } from '@/components/shared/campos-do-pagamento'

/**
 * Vender um pacote na ficha do cliente (decisão do Heitor, 2026-09-30): o
 * pacote do catálogo, e como vai ser pago — à vista, entrada + parcelas ou a
 * receber, o vocabulário do plano. As sessões nascem na venda; o que ficar a
 * receber aparece no financeiro como qualquer conta a receber.
 */

export interface PacoteAVenda {
  id: string; name: string; price: number; totalSessions: number
  /** "5× Limpeza + 3× Drenagem". */
  composicao: string; validityDays: number | null
}

export function VenderPacote({ clienteId, branchId, pacotes }: {
  clienteId: string
  branchId:  string
  pacotes:   PacoteAVenda[]
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [abertura, setAbertura] = useState(0)
  const abrir = useCallback(() => { setAbertura(n => n + 1); dialogRef.current?.showModal() }, [])
  const fechar = useCallback(() => dialogRef.current?.close(), [])

  if (!pacotes.length) return null
  return (
    <>
      <button type="button" className="btn-secondary" onClick={abrir} style={{ alignSelf: 'flex-start' }}>
        <Package size={15} aria-hidden /> Vender pacote
      </button>
      <dialog ref={dialogRef} className="modal modal-flex" style={{ maxWidth: 560, textAlign: 'left' }}
        onClick={e => { if (e.target === dialogRef.current) fechar() }} aria-label="Vender pacote">
        <div className="modal-container">
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--hairline)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Vender pacote</h2>
            <button type="button" className="btn-ghost" onClick={fechar} style={{ padding: 6 }} aria-label="Fechar"><X size={16} /></button>
          </div>
          <div className="modal-body" style={{ padding: '20px 24px 24px' }}>
            <Formulario key={abertura} clienteId={clienteId} branchId={branchId} pacotes={pacotes} onFim={fechar} />
          </div>
        </div>
      </dialog>
    </>
  )
}

function Formulario({ clienteId, branchId, pacotes, onFim }: {
  clienteId: string; branchId: string; pacotes: PacoteAVenda[]; onFim: () => void
}) {
  const router = useRouter()
  const [pacoteId, setPacoteId] = useState(pacotes[0]!.id)
  const [estado, setEstado] = useState(() => estadoDoPagamento(null, 'AVISTA'))
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const pacote = pacotes.find(p => p.id === pacoteId) ?? pacotes[0]!

  function vender() {
    setErro(null)
    iniciar(async () => {
      const r = await venderPacote(clienteId, pacote.id, branchId, montarPagamento(estado))
      if (r.error) { setErro(r.error); return }
      onFim()
      router.refresh()
    })
  }

  const texto = { fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="overline">Pacote</span>
        <select className="field" aria-label="Pacote" value={pacoteId} onChange={e => setPacoteId(e.target.value)}>
          {pacotes.map(p => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>)}
        </select>
      </label>
      <p style={texto} data-resumo-do-pacote>
        {pacote.composicao} ({pacote.totalSessions} sessões) · {formatBRL(pacote.price)}
        {pacote.validityDays ? ` · válido por ${pacote.validityDays} dias` : ''}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <p className="overline">Pagamento</p>
        <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']} />
        {estado.forma === 'A_RECEBER' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>O valor fica a receber no financeiro, com o vencimento escolhido.</p>
        )}
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={vender} disabled={pendente}>{pendente ? 'Vendendo…' : `Vender por ${formatBRL(pacote.price)}`}</button>
      </div>
    </div>
  )
}
