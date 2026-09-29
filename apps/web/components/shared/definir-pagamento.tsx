'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { definirPagamentoDoContrato } from '@/actions/documentos'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { CamposDoPagamento, estadoDoPagamento, montarPagamento } from '@/components/shared/campos-do-pagamento'

/**
 * Definir o pagamento de um contrato do procedimento, antes de o cliente
 * assinar. O mesmo vocabulário do fechamento do plano (receber no
 * atendimento, à vista, entrada + parcelas, a receber); o servidor confere a
 * forma e monta o contrato de novo com ela.
 */
export function DefinirPagamento({ documentoId, atual, aoTerminar }: {
  documentoId: string
  /** O que já foi combinado (trocar), ou null. */
  atual:       PagamentoDoPlano | null | undefined
  aoTerminar:  () => void
}) {
  const router = useRouter()
  const [estado, setEstado] = useState(() => estadoDoPagamento(atual, 'NADA_AGORA'))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  function salvar() {
    setErro(null)
    iniciar(async () => {
      const r = await definirPagamentoDoContrato(documentoId, montarPagamento(estado))
      if (r.error) { setErro(r.error); return }
      router.refresh()
      aoTerminar()
    })
  }

  return (
    <div data-definir-pagamento style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        O contrato cita o pagamento: defina como o cliente vai pagar antes de colher a assinatura.
      </p>
      <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['NADA_AGORA', 'AVISTA', 'PARCELADO', 'A_RECEBER']} />
      {estado.forma === 'NADA_AGORA' && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-soft)' }}>O contrato diz o valor do atendimento, a receber no dia.</p>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-ghost" onClick={aoTerminar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar pagamento'}</button>
      </div>
    </div>
  )
}
