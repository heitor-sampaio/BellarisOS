'use client'

import { Info } from 'lucide-react'
import { lerEntrada, erroDaEntrada, recusaDaEntradaAcimaDoTotal } from '@/lib/checkout/entrada'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { useOpcoesDeVezes, useOpcoesDeParcelas } from '@/components/shared/use-maximo-de-vezes'
import { DicaDasVezes, ResumoDasParcelas } from '@/components/shared/resumo-das-vezes'
import { CampoDaBandeira, CampoDaMaquininha } from '@/components/shared/campo-da-bandeira'
import { useMaquininhas } from '@/components/shared/use-maquininhas'
import { FormasDePagamento, FORMAS_DO_BALCAO } from '@/components/shared/formas-de-pagamento'
import { temBandeira } from '@/lib/financeiro/bandeiras'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { SaldoDoCredito } from '@/components/shared/saldo-do-credito'
import { limiteDoCrediarioEmTexto } from '@/lib/financeiro/parcelas-do-crediario'

/**
 * Os campos de COMO vai ser pago — o vocabulário do fechamento do plano (no
 * atendimento, à vista, crediário, a receber). Usado pelo pagamento do
 * contrato do procedimento e pelas vendas; cada tela escolhe quais formas
 * oferece.
 *
 * PDV8 (o Heitor, 13/11: "sempre tem que ter forma de pagamento, o crediario
 * é uma forma de pagamento, não existe pagamento sem forma de pagamento"): as
 * formas são BLOCOS lado a lado — Pix, Dinheiro, Débito, Crédito, Crédito
 * interno, Crediário, A receber. O bloco de um meio é o à vista nele; o
 * Crediário pede a forma só da ENTRADA, quando há entrada; o A receber não
 * pede meio (a forma se escolhe quando o dinheiro entra).
 */

export type FormaDoPagamento = 'NADA_AGORA' | 'AVISTA' | 'PARCELADO' | 'A_RECEBER'

export interface EstadoDoPagamento {
  forma:    FormaDoPagamento
  /** No à vista, o meio; no crediário, o da ENTRADA (vazio sem entrada); no a receber, nenhum. */
  metodo:   string
  entrada:  string
  parcelas: number
  /** 'YYYY-MM-DD' do vencimento da 1ª parcela. */
  data:     string
  /** 'YYYY-MM-DD' do vencimento do "a receber" — OPCIONAL (vazio = sem data). */
  vencimento: string
  /** À vista no cartão de crédito: em quantas vezes na maquininha (1 = à vista). */
  vezes:    number
  /** A bandeira do cartão (r3-f13-01), opcional: '' = não informada. */
  bandeira: string
  /** C75: a maquininha do cartão ('' = nenhuma escolhida; com uma só na rede, o banco põe a única). */
  maquininha?: string
}

// O dia de "hoje + N" no relógio da unidade (F62b).
const hojeMais = (dias: number, fuso = 'America/Sao_Paulo') => new Date(Date.now() + dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: fuso })
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function estadoDoPagamento(atual: PagamentoDoPlano | null | undefined, padrao: FormaDoPagamento, fuso?: string): EstadoDoPagamento {
  return {
    forma:    atual ? atual.forma : padrao,
    // A37 da 6ª simulação: a forma nasce VAZIA (o Pix era o padrão calado).
    // PDV8: o a receber não tem meio — o do retrato de antes não volta.
    metodo:   atual?.forma === 'A_RECEBER' ? '' : atual?.metodo ?? '',
    entrada:  atual?.forma === 'PARCELADO' ? String(atual.entrada).replace('.', ',') : '',
    parcelas: atual?.forma === 'PARCELADO' ? atual.parcelas : 3,
    data:     atual?.forma === 'PARCELADO' ? diaDe(atual.primeiroVencimento) : hojeMais(30, fuso),
    vencimento: atual?.forma === 'A_RECEBER' && atual.vencimento ? diaDe(atual.vencimento) : '',
    vezes:    atual?.forma === 'AVISTA' || atual?.forma === 'PARCELADO' ? (atual.vezes ?? 1) : 1,
    bandeira: atual && atual.forma !== 'A_RECEBER' ? (atual.bandeira ?? '') : '',
    maquininha: atual && atual.forma !== 'A_RECEBER' ? (atual.maquininha ?? '') : '',
  }
}

/** O estado da tela → o pagamento (nulo = no atendimento). */
export function montarPagamento(e: EstadoDoPagamento): PagamentoDoPlano | null {
  // Meio-dia de Brasília: '2026-10-10' puro seria meia-noite UTC, dia 9 aqui.
  // Vazio segue vazio: o servidor responde "data inválida" em vez de a tela quebrar.
  const iso = (dia: string) => dia ? new Date(`${dia}T12:00:00-03:00`).toISOString() : ''
  if (e.forma === 'NADA_AGORA') return null
  // A bandeira só no cartão, e só quando escolhida (r3-f13-01).
  const bandeira = {
    ...(temBandeira(e.metodo) && e.bandeira ? { bandeira: e.bandeira } : {}),
    ...(temBandeira(e.metodo) && e.maquininha ? { maquininha: e.maquininha } : {}),
  }
  if (e.forma === 'AVISTA') {
    return e.metodo === 'CREDIT_CARD' && e.vezes > 1
      ? { forma: 'AVISTA', metodo: e.metodo, vezes: e.vezes, ...bandeira }
      : { forma: 'AVISTA', metodo: e.metodo, ...bandeira }
  }
  // PDV8: o a receber não tem meio.
  if (e.forma === 'A_RECEBER') return { forma: 'A_RECEBER', vencimento: e.vencimento ? iso(e.vencimento) : null }
  const dataIso = iso(e.data)
  // A regra de todo campo de dinheiro ("1.400" é mil e quatrocentos — D3). O
  // ilegível não chega aqui: quem salva confere `recusaDoPagamento` antes.
  const lida = lerEntrada(e.entrada)
  const valorEntrada = 'valor' in lida ? lida.valor : 0
  // PDV8: sem entrada, nada se recebe agora — nenhum meio (nem a bandeira dele).
  if (!(valorEntrada > 0)) return { forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: e.parcelas, primeiroVencimento: dataIso }
  // D5: as vezes da ENTRADA no crédito (a maquininha); as parcelas são da clínica.
  const vezes = e.metodo === 'CREDIT_CARD' && e.vezes > 1 ? { vezes: e.vezes } : {}
  return { forma: 'PARCELADO', metodo: e.metodo || null, entrada: valorEntrada, parcelas: e.parcelas, primeiroVencimento: dataIso, ...vezes, ...bandeira }
}

/**
 * O pagamento que não se pode salvar: a entrada ilegível ("1,400.50") virava
 * R$ 0 calado (frente de cadastro, 2026-10-29). Quem salva confere ANTES de
 * montar — o aviso é o de todo campo de dinheiro.
 */
export function recusaDoPagamento(e: EstadoDoPagamento, total?: number, doQue = 'da venda'): string | null {
  // PDV8: não existe pagamento sem forma. O à vista pede o meio; o crediário,
  // o da ENTRADA quando há entrada (sem ela, nada se recebe agora).
  if (e.forma === 'AVISTA' && !e.metodo) return 'Escolha a forma de pagamento.'
  if (e.forma === 'PARCELADO' && !e.metodo && temEntrada(e)) return 'Escolha a forma da entrada.'
  return recusaDaEntradaDoEstado(e, total, doQue)
}

/**
 * C75: a recusa do pagamento com a maquininha — com mais de uma na rede, o que
 * se recebe agora no cartão (à vista ou a entrada) não segue sem "Qual
 * maquininha?". Devolve a mesma conta de `recusaDoPagamento`, mais essa.
 */
export function useRecusaDoPagamento(): (e: EstadoDoPagamento, total?: number, doQue?: string) => string | null {
  const leitura = useMaquininhas()
  const varias = (leitura?.lista.length ?? 0) > 1
  return (e, total, doQue) => {
    const recusa = recusaDoPagamento(e, total, doQue)
    if (recusa) return recusa
    const entrada = lerEntrada(e.entrada)
    const pagaAgora = e.forma === 'AVISTA' || (e.forma === 'PARCELADO' && 'valor' in entrada && entrada.valor > 0)
    return varias && pagaAgora && temBandeira(e.metodo) && !e.maquininha ? 'Escolha a maquininha do cartão.' : null
  }
}

/** O crediário tem entrada (um valor legível acima de zero)? */
function temEntrada(e: EstadoDoPagamento): boolean {
  const lida = lerEntrada(e.entrada)
  return 'valor' in lida ? lida.valor > 0 : e.entrada.trim() !== ''
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

/** O bloco marcado: o meio do à vista, ou a forma (Crediário, A receber, No atendimento). */
function blocoDoEstado(e: EstadoDoPagamento): string {
  if (e.forma === 'AVISTA') return e.metodo
  if (e.forma === 'PARCELADO') return 'CREDIARIO'
  return e.forma
}

export function CamposDoPagamento({ estado, aoMudar, formas, total, doQue = 'da venda', clienteId, semCredito = false, semMaquininha = false }: {
  estado: EstadoDoPagamento
  /**
   * C75: sem o "Qual maquininha?" — o pagamento combinado do contrato só vira
   * texto; a maquininha se escolhe quando o dinheiro entra (no atendimento).
   */
  semMaquininha?: boolean
  aoMudar: (e: EstadoDoPagamento) => void
  formas: FormaDoPagamento[]
  /** O valor que se paga (já com o desconto): o resumo das parcelas e o valor da parcela no crédito (A46/A47). */
  total?: number
  /** Completa a recusa da entrada acima do total: "da venda", "do atendimento". */
  doQue?: string
  /** A cliente: com o crédito na clínica escolhido, o saldo dela e o que sobra (A36 da 8ª). */
  clienteId?: string
  /** Sem "Crédito interno" entre os meios: a venda do próprio crédito na clínica (decisão 1 da 9ª). */
  semCredito?: boolean
}) {
  const recusaDaEntrada = recusaDaEntradaDoEstado(estado, total, doQue)
  const mudar = (parte: Partial<EstadoDoPagamento>) => aoMudar({ ...estado, ...parte })
  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  const { forma } = estado
  // Até quantas vezes a clínica parcela no crédito (D-15).
  const opcoesDeVezes = useOpcoesDeVezes(estado.maquininha)
  // C38: o crediário até o limite da rede (padrão 12).
  const opcoesDeParcelas = useOpcoesDeParcelas()
  const metodos: readonly string[] = semCredito ? FORMAS_DO_BALCAO.filter(m => m !== 'INTERNAL_CREDIT') : FORMAS_DO_BALCAO
  const blocos = [
    ...(formas.includes('AVISTA') ? metodos : []),
    ...(formas.includes('PARCELADO') ? ['CREDIARIO'] : []),
    ...(formas.includes('A_RECEBER') ? ['A_RECEBER'] : []),
    ...(formas.includes('NADA_AGORA') ? ['NADA_AGORA'] : []),
  ]
  const escolher = (b: string) => {
    if (b === 'CREDIARIO') return mudar({ forma: 'PARCELADO', metodo: '', vezes: 1, bandeira: '', maquininha: '' })
    if (b === 'A_RECEBER' || b === 'NADA_AGORA') return mudar({ forma: b, metodo: '', vezes: 1, bandeira: '', maquininha: '' })
    // Trocar o meio zera as vezes e a bandeira, que eram do outro.
    mudar({ forma: 'AVISTA', metodo: b, ...(b !== estado.metodo ? { vezes: 1, bandeira: '', maquininha: '' } : {}) })
  }
  const comEntrada = forma === 'PARCELADO' && temEntrada(estado)
  const valorDaEntrada = (() => { const l = lerEntrada(estado.entrada); return 'valor' in l ? l.valor : 0 })()
  // O que se paga AGORA com o meio escolhido: o à vista inteiro, ou a entrada.
  const pagaAgora = forma === 'AVISTA' ? total : comEntrada ? valorDaEntrada : undefined
  const comMeio = (forma === 'AVISTA' || comEntrada) && !!estado.metodo
  return (
    <>
      <FormasDePagamento valor={blocoDoEstado(estado)} aoMudar={escolher} formas={blocos} />
      {forma === 'PARCELADO' && (
        <div className="form-2col">
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
          {/* PDV8: com entrada, ela pede a forma dela — sem entrada, nada se recebe agora. */}
          {comEntrada && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={rotulo}>Forma da entrada *</span>
              <select className="field" value={estado.metodo} aria-label="Forma da entrada"
                onChange={e => mudar({ metodo: e.target.value, vezes: 1, bandeira: '', maquininha: '' })}>
                <option value="">Selecione…</option>
                {metodos.map(m => <option key={m} value={m}>{rotuloDaForma(m, null, { longo: true })}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {comMeio && (
        <div className="form-2col">
          {estado.metodo === 'INTERNAL_CREDIT' && clienteId && pagaAgora !== undefined && (
            <SaldoDoCredito clienteId={clienteId} valor={pagaAgora} />
          )}
          {!semMaquininha && (
            <CampoDaMaquininha metodo={estado.metodo} valor={estado.maquininha ?? ''} aoMudar={v => mudar({ maquininha: v, vezes: 1 })} rotuloComoLabel="" estiloDoRotulo={rotulo} />
          )}
          {estado.metodo === 'CREDIT_CARD' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* D5: no crediário, as vezes são da ENTRADA (a maquininha). */}
              <span style={rotulo}>{forma === 'PARCELADO' ? 'Vezes no cartão (a entrada)' : 'Vezes no cartão'}</span>
              <select className="field" value={estado.vezes} onChange={e => mudar({ vezes: Number(e.target.value) })} aria-label="Vezes no cartão">
                {opcoesDeVezes.map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
              </select>
              {pagaAgora !== undefined && <DicaDasVezes total={pagaAgora} vezes={estado.vezes} opcoes={opcoesDeVezes} />}
              <AvisoDaTaxa vezes={estado.vezes} bandeira={estado.bandeira} maquininha={estado.maquininha} total={pagaAgora} />
            </label>
          )}
          <CampoDaBandeira metodo={estado.metodo} valor={estado.bandeira} aoMudar={v => mudar({ bandeira: v })} maquininha={estado.maquininha}
            total={pagaAgora} />
        </div>
      )}
      {forma === 'PARCELADO' && (
        <div className="form-2col">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={rotulo}>Parcelas</span>
            <select className="field" value={estado.parcelas} onChange={e => mudar({ parcelas: Number(e.target.value) })} aria-label="Parcelas">
              {opcoesDeParcelas.map(n => <option key={n} value={n}>{n}x</option>)}
            </select>
            {/* A23 da 14ª: a lista para no limite — e diz que é o da clínica. */}
            <span data-limite-do-crediario style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              {limiteDoCrediarioEmTexto(opcoesDeParcelas.length)}
            </span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={rotulo}>1º vencimento</span>
            <input className="field" type="date" required value={estado.data} onChange={e => mudar({ data: e.target.value })} aria-label="Vencimento" />
          </label>
        </div>
      )}
      {forma === 'A_RECEBER' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
          <span style={rotulo}>Vencimento (opcional)</span>
          <input className="field" type="date" value={estado.vencimento} onChange={e => mudar({ vencimento: e.target.value })} aria-label="Vencimento" />
        </label>
      )}
      {forma === 'PARCELADO' && total !== undefined && !recusaDaEntrada && (
        <ResumoDasParcelas total={total} entrada={valorDaEntrada} parcelas={estado.parcelas} />
      )}
      {(forma === 'PARCELADO' || forma === 'A_RECEBER') && (
        <p data-forma-ao-receber style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          <Info size={13} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
          {forma === 'PARCELADO'
            ? 'Cada parcela, quando a cliente vier pagar, pede a forma dela.'
            : 'Nada entra agora: a forma se escolhe quando a cliente pagar.'}
        </p>
      )}
    </>
  )
}
