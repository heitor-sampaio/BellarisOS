'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@estetica-os/utils'
import { venderPacote } from '@/actions/pacotes'
import { CamposDoPagamento, estadoDoPagamento, montarPagamento } from '@/components/shared/campos-do-pagamento'
import { CampoDoDesconto, SEM_DESCONTO, contaDoDesconto, descontoDoEstado } from '@/components/shared/campo-do-desconto'

/**
 * Vender um pacote (decisão do Heitor, 2026-09-30): o pacote do catálogo, e
 * como vai ser pago — à vista, entrada + parcelas ou a receber, o vocabulário
 * do plano. As sessões nascem na venda; o que ficar a receber aparece no
 * financeiro como qualquer conta a receber. A janela é o "Vender" único.
 */

export interface PacoteAVenda {
  id: string; name: string; price: number; totalSessions: number
  /** "5× Limpeza + 3× Drenagem". */
  composicao: string; validityDays: number | null
}

/** O formulário da venda do pacote — dentro do "Vender" (`components/shared/vender.tsx`). */
export function FormularioDoPacote({ clienteId, branchId, pacotes, onFim }: {
  clienteId: string; branchId: string; pacotes: PacoteAVenda[]; onFim: () => void
}) {
  const router = useRouter()
  const [pacoteId, setPacoteId] = useState(pacotes[0]!.id)
  const [estado, setEstado] = useState(() => estadoDoPagamento(null, 'AVISTA'))
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const pacote = pacotes.find(p => p.id === pacoteId) ?? pacotes[0]!
  const [desconto, setDesconto] = useState(SEM_DESCONTO)
  const conta = contaDoDesconto(pacote.price, desconto)

  function vender() {
    setErro(null)
    iniciar(async () => {
      const r = await venderPacote(clienteId, pacote.id, branchId, montarPagamento(estado), descontoDoEstado(desconto))
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
        <CampoDoDesconto estado={desconto} aoMudar={setDesconto} total={pacote.price} />
        <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']} />
        {estado.forma === 'A_RECEBER' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>O valor fica a receber no financeiro, com o vencimento, se você informar um.</p>
        )}
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={vender} disabled={pendente || !!conta.recusa}>{pendente ? 'Vendendo…' : `Vender por ${formatBRL(conta.liquido)}`}</button>
      </div>
    </div>
  )
}
