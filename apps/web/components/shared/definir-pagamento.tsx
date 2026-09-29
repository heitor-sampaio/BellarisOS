'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SegSelect } from '@/components/shared/seg-select'
import { definirPagamentoDoContrato } from '@/actions/documentos'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'

/**
 * Definir o pagamento de um contrato do procedimento, antes de o cliente
 * assinar. O mesmo vocabulário do fechamento do plano (receber no
 * atendimento, à vista, entrada + parcelas, a receber); o servidor confere a
 * forma e monta o contrato de novo com ela.
 */

const METODOS = [
  { value: 'PIX',             label: 'Pix' },
  { value: 'CREDIT_CARD',     label: 'Cartão de crédito' },
  { value: 'DEBIT_CARD',      label: 'Cartão de débito' },
  { value: 'CASH',            label: 'Dinheiro' },
  { value: 'INTERNAL_CREDIT', label: 'Crédito do cliente' },
]

type Forma = 'NADA_AGORA' | 'AVISTA' | 'PARCELADO' | 'A_RECEBER'

const hojeMais = (dias: number) => new Date(Date.now() + dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function DefinirPagamento({ documentoId, atual, aoTerminar }: {
  documentoId: string
  /** O que já foi combinado (trocar), ou null. */
  atual:       PagamentoDoPlano | null | undefined
  aoTerminar:  () => void
}) {
  const router = useRouter()
  const [forma, setForma] = useState<Forma>(atual ? atual.forma : 'NADA_AGORA')
  const [metodo, setMetodo] = useState(atual && atual.forma !== 'A_RECEBER' ? atual.metodo : (atual?.metodo ?? 'PIX'))
  const [entrada, setEntrada] = useState(atual?.forma === 'PARCELADO' ? String(atual.entrada).replace('.', ',') : '')
  const [parcelas, setParcelas] = useState(atual?.forma === 'PARCELADO' ? atual.parcelas : 3)
  const [data, setData] = useState(atual?.forma === 'PARCELADO' ? diaDe(atual.primeiroVencimento)
    : atual?.forma === 'A_RECEBER' ? diaDe(atual.vencimento) : hojeMais(30))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  function montar(): PagamentoDoPlano | null {
    const dataIso = new Date(`${data}T12:00:00-03:00`).toISOString()
    if (forma === 'NADA_AGORA') return null
    if (forma === 'AVISTA') return { forma: 'AVISTA', metodo }
    if (forma === 'A_RECEBER') return { forma: 'A_RECEBER', metodo, vencimento: dataIso }
    const valorEntrada = Number(entrada.replace(/\./g, '').replace(',', '.')) || 0
    return { forma: 'PARCELADO', metodo, entrada: valorEntrada, parcelas, primeiroVencimento: dataIso }
  }

  function salvar() {
    setErro(null)
    iniciar(async () => {
      const r = await definirPagamentoDoContrato(documentoId, montar())
      if (r.error) { setErro(r.error); return }
      router.refresh()
      aoTerminar()
    })
  }

  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  return (
    <div data-definir-pagamento style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        O contrato cita o pagamento: defina como o cliente vai pagar antes de colher a assinatura.
      </p>
      <SegSelect
        ariaLabel="Como vai ser pago"
        options={[
          { key: 'NADA_AGORA', label: 'No atendimento' },
          { key: 'AVISTA',     label: 'À vista' },
          { key: 'PARCELADO',  label: 'Entrada + parcelas' },
          { key: 'A_RECEBER',  label: 'A receber' },
        ]}
        value={forma} onSelect={k => setForma(k as Forma)}
      />
      {forma !== 'NADA_AGORA' && (
        <div className="form-2col">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={rotulo}>Meio de pagamento</span>
            <select className="field" value={metodo} onChange={e => setMetodo(e.target.value)} aria-label="Meio de pagamento">
              {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          {forma === 'PARCELADO' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Entrada (opcional)</span>
              <input className="field" inputMode="decimal" placeholder="0,00" value={entrada} onChange={e => setEntrada(e.target.value)} aria-label="Entrada" />
            </label>
          )}
          {forma === 'PARCELADO' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Parcelas do saldo</span>
              <select className="field" value={parcelas} onChange={e => setParcelas(Number(e.target.value))} aria-label="Parcelas">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}
              </select>
            </label>
          )}
          {(forma === 'PARCELADO' || forma === 'A_RECEBER') && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>{forma === 'PARCELADO' ? 'Vencimento da 1ª parcela' : 'Vencimento'}</span>
              <input className="field" type="date" value={data} onChange={e => setData(e.target.value)} aria-label="Vencimento" />
            </label>
          )}
        </div>
      )}
      {forma === 'NADA_AGORA' && (
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
