'use client'

import { SegSelect } from '@/components/shared/seg-select'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'

/**
 * Os campos de COMO vai ser pago — o vocabulário do fechamento do plano (no
 * atendimento, à vista, entrada + parcelas, a receber). Usado pelo pagamento
 * do contrato do procedimento e pela venda de pacote; cada tela escolhe quais
 * formas oferece.
 */

export type FormaDoPagamento = 'NADA_AGORA' | 'AVISTA' | 'PARCELADO' | 'A_RECEBER'

export interface EstadoDoPagamento {
  forma:    FormaDoPagamento
  metodo:   string
  entrada:  string
  parcelas: number
  /** 'YYYY-MM-DD' do vencimento da 1ª parcela. */
  data:     string
  /** 'YYYY-MM-DD' do vencimento do "a receber" — OPCIONAL (vazio = sem data). */
  vencimento: string
}

const METODOS = [
  { value: 'PIX',             label: 'Pix' },
  { value: 'CREDIT_CARD',     label: 'Cartão de crédito' },
  { value: 'DEBIT_CARD',      label: 'Cartão de débito' },
  { value: 'CASH',            label: 'Dinheiro' },
  { value: 'INTERNAL_CREDIT', label: 'Crédito do cliente' },
]

const ROTULOS: Record<FormaDoPagamento, string> = {
  NADA_AGORA: 'No atendimento', AVISTA: 'À vista', PARCELADO: 'Entrada + parcelas', A_RECEBER: 'A receber',
}

const hojeMais = (dias: number) => new Date(Date.now() + dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function estadoDoPagamento(atual: PagamentoDoPlano | null | undefined, padrao: FormaDoPagamento): EstadoDoPagamento {
  return {
    forma:    atual ? atual.forma : padrao,
    metodo:   atual?.metodo ?? 'PIX',
    entrada:  atual?.forma === 'PARCELADO' ? String(atual.entrada).replace('.', ',') : '',
    parcelas: atual?.forma === 'PARCELADO' ? atual.parcelas : 3,
    data:     atual?.forma === 'PARCELADO' ? diaDe(atual.primeiroVencimento) : hojeMais(30),
    vencimento: atual?.forma === 'A_RECEBER' && atual.vencimento ? diaDe(atual.vencimento) : '',
  }
}

/** O estado da tela → o pagamento (nulo = no atendimento). */
export function montarPagamento(e: EstadoDoPagamento): PagamentoDoPlano | null {
  // Meio-dia de Brasília: '2026-10-10' puro seria meia-noite UTC, dia 9 aqui.
  // Vazio segue vazio: o servidor responde "data inválida" em vez de a tela quebrar.
  const iso = (dia: string) => dia ? new Date(`${dia}T12:00:00-03:00`).toISOString() : ''
  if (e.forma === 'NADA_AGORA') return null
  if (e.forma === 'AVISTA') return { forma: 'AVISTA', metodo: e.metodo }
  if (e.forma === 'A_RECEBER') return { forma: 'A_RECEBER', metodo: e.metodo, vencimento: e.vencimento ? iso(e.vencimento) : null }
  const dataIso = iso(e.data)
  const s = e.entrada.trim()
  const valorEntrada = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0
  return { forma: 'PARCELADO', metodo: e.metodo, entrada: valorEntrada, parcelas: e.parcelas, primeiroVencimento: dataIso }
}

export function CamposDoPagamento({ estado, aoMudar, formas }: {
  estado: EstadoDoPagamento
  aoMudar: (e: EstadoDoPagamento) => void
  formas: FormaDoPagamento[]
}) {
  const mudar = (parte: Partial<EstadoDoPagamento>) => aoMudar({ ...estado, ...parte })
  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  const { forma } = estado
  return (
    <>
      <SegSelect
        ariaLabel="Como vai ser pago"
        options={formas.map(f => ({ key: f, label: ROTULOS[f] }))}
        value={forma} onSelect={k => mudar({ forma: k as FormaDoPagamento })}
      />
      {forma !== 'NADA_AGORA' && (
        <div className="form-2col">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={rotulo}>Meio de pagamento</span>
            <select className="field" value={estado.metodo} onChange={e => mudar({ metodo: e.target.value })} aria-label="Meio de pagamento">
              {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          {forma === 'PARCELADO' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Entrada (opcional)</span>
              <input className="field" inputMode="decimal" placeholder="0,00" value={estado.entrada}
                onChange={e => mudar({ entrada: e.target.value })} aria-label="Entrada" />
            </label>
          )}
          {forma === 'PARCELADO' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Parcelas do saldo</span>
              <select className="field" value={estado.parcelas} onChange={e => mudar({ parcelas: Number(e.target.value) })} aria-label="Parcelas">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}
              </select>
            </label>
          )}
          {forma === 'PARCELADO' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Vencimento da 1ª parcela</span>
              <input className="field" type="date" required value={estado.data} onChange={e => mudar({ data: e.target.value })} aria-label="Vencimento" />
            </label>
          )}
          {forma === 'A_RECEBER' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Vencimento (opcional)</span>
              <input className="field" type="date" value={estado.vencimento} onChange={e => mudar({ vencimento: e.target.value })} aria-label="Vencimento" />
            </label>
          )}
        </div>
      )}
    </>
  )
}
