'use client'

import { lerEntrada, erroDaEntrada, recusaDaEntradaAcimaDoTotal } from '@/lib/checkout/entrada'
import { SegSelect } from '@/components/shared/seg-select'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import { DicaDasVezes, ResumoDasParcelas } from '@/components/shared/resumo-das-vezes'
import { CampoDaBandeira } from '@/components/shared/campo-da-bandeira'
import { temBandeira } from '@/lib/financeiro/bandeiras'
import { SaldoDoCredito } from '@/components/shared/saldo-do-credito'

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
  /** À vista no cartão de crédito: em quantas vezes na maquininha (1 = à vista). */
  vezes:    number
  /** A bandeira do cartão (r3-f13-01), opcional: '' = a regra geral. */
  bandeira: string
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
    // A37 da 6ª simulação: a forma nasce VAZIA (o Pix era o padrão calado).
    metodo:   atual?.metodo ?? '',
    entrada:  atual?.forma === 'PARCELADO' ? String(atual.entrada).replace('.', ',') : '',
    parcelas: atual?.forma === 'PARCELADO' ? atual.parcelas : 3,
    data:     atual?.forma === 'PARCELADO' ? diaDe(atual.primeiroVencimento) : hojeMais(30),
    vencimento: atual?.forma === 'A_RECEBER' && atual.vencimento ? diaDe(atual.vencimento) : '',
    vezes:    atual?.forma === 'AVISTA' || atual?.forma === 'PARCELADO' ? (atual.vezes ?? 1) : 1,
    bandeira: atual && atual.forma !== 'A_RECEBER' ? (atual.bandeira ?? '') : '',
  }
}

/** O estado da tela → o pagamento (nulo = no atendimento). */
export function montarPagamento(e: EstadoDoPagamento): PagamentoDoPlano | null {
  // Meio-dia de Brasília: '2026-10-10' puro seria meia-noite UTC, dia 9 aqui.
  // Vazio segue vazio: o servidor responde "data inválida" em vez de a tela quebrar.
  const iso = (dia: string) => dia ? new Date(`${dia}T12:00:00-03:00`).toISOString() : ''
  if (e.forma === 'NADA_AGORA') return null
  // A bandeira só no cartão, e só quando escolhida (r3-f13-01).
  const bandeira = temBandeira(e.metodo) && e.bandeira ? { bandeira: e.bandeira } : {}
  if (e.forma === 'AVISTA') {
    return e.metodo === 'CREDIT_CARD' && e.vezes > 1
      ? { forma: 'AVISTA', metodo: e.metodo, vezes: e.vezes, ...bandeira }
      : { forma: 'AVISTA', metodo: e.metodo, ...bandeira }
  }
  if (e.forma === 'A_RECEBER') return { forma: 'A_RECEBER', metodo: e.metodo || null, vencimento: e.vencimento ? iso(e.vencimento) : null }
  const dataIso = iso(e.data)
  // A regra de todo campo de dinheiro ("1.400" é mil e quatrocentos — D3). O
  // ilegível não chega aqui: quem salva confere `recusaDoPagamento` antes.
  const lida = lerEntrada(e.entrada)
  const valorEntrada = 'valor' in lida ? lida.valor : 0
  // D5: as vezes da ENTRADA no crédito (a maquininha); as parcelas são da clínica.
  const vezes = e.metodo === 'CREDIT_CARD' && valorEntrada > 0 && e.vezes > 1 ? { vezes: e.vezes } : {}
  return { forma: 'PARCELADO', metodo: e.metodo, entrada: valorEntrada, parcelas: e.parcelas, primeiroVencimento: dataIso, ...vezes, ...bandeira }
}

/**
 * O pagamento que não se pode salvar: a entrada ilegível ("1,400.50") virava
 * R$ 0 calado (frente de cadastro, 2026-10-29). Quem salva confere ANTES de
 * montar — o aviso é o de todo campo de dinheiro.
 */
export function recusaDoPagamento(e: EstadoDoPagamento, total?: number, doQue = 'da venda'): string | null {
  // A37: o que se recebe agora pede a forma — ela nasce vazia.
  if ((e.forma === 'AVISTA' || e.forma === 'PARCELADO') && !e.metodo) return 'Escolha a forma de pagamento.'
  return recusaDaEntradaDoEstado(e, total, doQue)
}

/** Só a entrada (a que aparece junto do campo). */
function recusaDaEntradaDoEstado(e: EstadoDoPagamento, total?: number, doQue = 'da venda'): string | null {
  if (e.forma !== 'PARCELADO') return null
  const ilegivel = erroDaEntrada(e.entrada)
  if (ilegivel) return ilegivel
  // A entrada acima do total é recusada, não cortada (ven-02); o servidor confere igual.
  const lida = lerEntrada(e.entrada)
  return total !== undefined && 'valor' in lida ? recusaDaEntradaAcimaDoTotal(lida.valor, total, doQue) : null
}

export function CamposDoPagamento({ estado, aoMudar, formas, total, doQue = 'da venda', clienteId, semCredito = false }: {
  estado: EstadoDoPagamento
  aoMudar: (e: EstadoDoPagamento) => void
  formas: FormaDoPagamento[]
  /** O valor que se paga (já com o desconto): o resumo das parcelas e o valor da parcela no crédito (A46/A47). */
  total?: number
  /** Completa a recusa da entrada acima do total: "da venda", "do atendimento". */
  doQue?: string
  /** A cliente: com o crédito na clínica escolhido, o saldo dela e o que sobra (A36 da 8ª). */
  clienteId?: string
  /** Sem "Crédito do cliente" entre os meios: a venda do próprio crédito na clínica (decisão 1 da 9ª). */
  semCredito?: boolean
}) {
  const recusaDaEntrada = recusaDaEntradaDoEstado(estado, total, doQue)
  const mudar = (parte: Partial<EstadoDoPagamento>) => aoMudar({ ...estado, ...parte })
  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  const { forma } = estado
  // Até quantas vezes a clínica parcela no crédito (D-15).
  const opcoesDeVezes = useOpcoesDeVezes()
  const metodos = semCredito ? METODOS.filter(m => m.value !== 'INTERNAL_CREDIT') : METODOS
  return (
    <>
      {/* Uma forma só (o crédito na clínica é pago na hora): não há o que escolher. */}
      {formas.length > 1 && (
        <SegSelect
          ariaLabel="Como vai ser pago"
          options={formas.map(f => ({ key: f, label: ROTULOS[f] }))}
          value={forma} onSelect={k => mudar({ forma: k as FormaDoPagamento })}
        />
      )}
      {forma !== 'NADA_AGORA' && (
        <div className="form-2col">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={rotulo}>Meio de pagamento{forma === 'A_RECEBER' ? ' (opcional)' : ' *'}</span>
            <select className="field" value={estado.metodo} onChange={e => mudar({ metodo: e.target.value })} aria-label="Meio de pagamento">
              <option value="">{forma === 'A_RECEBER' ? 'Não informado' : 'Selecione…'}</option>
              {metodos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {estado.metodo === 'INTERNAL_CREDIT' && clienteId && total !== undefined && (
              <SaldoDoCredito clienteId={clienteId}
                valor={forma === 'PARCELADO' ? (() => { const l = lerEntrada(estado.entrada); return 'valor' in l ? l.valor : 0 })() : total} />
            )}
          </label>
          {(forma === 'AVISTA' || forma === 'PARCELADO') && estado.metodo === 'CREDIT_CARD' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* D5: na entrada + parcelas, as vezes são da ENTRADA (a maquininha). */}
              <span style={rotulo}>{forma === 'PARCELADO' ? 'Vezes no cartão (a entrada)' : 'Vezes no cartão'}</span>
              <select className="field" value={estado.vezes} onChange={e => mudar({ vezes: Number(e.target.value) })} aria-label="Vezes no cartão">
                {opcoesDeVezes.map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
              </select>
              {(() => {
                const lida = forma === 'PARCELADO' ? lerEntrada(estado.entrada) : null
                const base = forma === 'PARCELADO' ? (lida && 'valor' in lida ? lida.valor : 0) : total
                return base !== undefined && <DicaDasVezes total={base} vezes={estado.vezes} opcoes={opcoesDeVezes} />
              })()}
              <AvisoDaTaxa vezes={estado.vezes} bandeira={estado.bandeira}
                total={forma === 'PARCELADO' ? (() => { const l = lerEntrada(estado.entrada); return 'valor' in l ? l.valor : 0 })() : total} />
            </label>
          )}
          {(forma === 'AVISTA' || forma === 'PARCELADO') && (
            <CampoDaBandeira metodo={estado.metodo} valor={estado.bandeira} aoMudar={v => mudar({ bandeira: v })}
              total={forma === 'PARCELADO' ? (() => { const l = lerEntrada(estado.entrada); return 'valor' in l ? l.valor : 0 })() : total} />
          )}
          {forma === 'PARCELADO' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Entrada (opcional)</span>
              <input className="field" inputMode="decimal" placeholder="0,00" value={estado.entrada}
                onChange={e => mudar({ entrada: e.target.value })} aria-label="Entrada" aria-invalid={!!recusaDaEntrada} />
              {recusaDaEntrada && (
                <span role="alert" data-recusa-da-entrada style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>
                  {recusaDaEntrada}
                </span>
              )}
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
      {forma === 'PARCELADO' && total !== undefined && !recusaDaEntrada && (() => {
        const lida = lerEntrada(estado.entrada)
        return <ResumoDasParcelas total={total} entrada={'valor' in lida ? lida.valor : 0} parcelas={estado.parcelas} />
      })()}
    </>
  )
}
