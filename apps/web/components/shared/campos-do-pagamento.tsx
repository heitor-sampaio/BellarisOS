'use client'

import { Dica } from '@/components/shared/dica'
import { parseDinheiro, formatDinheiroCampo } from '@estetica-os/utils'
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
import { limiteDoCrediarioEmTexto, rotuloDaOpcaoDeParcelas } from '@/lib/financeiro/parcelas-do-crediario'
import { OutrasFormas } from '@/components/shared/outras-formas'
import { recusaDasOutras, valorDaParte, valorDaPrincipal, type EstadoDaParte } from '@/lib/checkout/varias-formas'

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
  /**
   * D1 da 18ª ("+ Outra forma"): no à vista, as outras formas, cada uma com o
   * valor dela; a primeira (o meio de cima) fica com o que falta.
   */
  outras?: EstadoDaParte[]
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
    outras: atual?.forma === 'AVISTA' && atual.outras?.length
      ? atual.outras.map(o => ({ metodo: o.metodo, valor: String(o.valor.toFixed(2)).replace('.', ','), vezes: o.vezes ?? 1, bandeira: o.bandeira ?? '', maquininha: o.maquininha ?? '' }))
      : [],
  }
}

/** D1 da 18ª: as outras formas do estado → as partes do pagamento (o valor lido, o cartão de cada uma). */
function partesDoEstado(outras: EstadoDaParte[]) {
  return outras.map(o => ({
    metodo: o.metodo, valor: valorDaParte(o) ?? 0,
    ...(o.metodo === 'CREDIT_CARD' && o.vezes > 1 ? { vezes: o.vezes } : {}),
    ...(temBandeira(o.metodo) && o.bandeira ? { bandeira: o.bandeira } : {}),
    ...(temBandeira(o.metodo) && o.maquininha ? { maquininha: o.maquininha } : {}),
  }))
}

/**
 * O estado da tela → o pagamento (nulo = no atendimento). `total` é o que se
 * paga: com outras formas, a primeira fica com o que falta delas (D1 da 18ª).
 */
export function montarPagamento(e: EstadoDoPagamento, total?: number): PagamentoDoPlano | null {
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
    const base: PagamentoDoPlano = e.metodo === 'CREDIT_CARD' && e.vezes > 1
      ? { forma: 'AVISTA', metodo: e.metodo, vezes: e.vezes, ...bandeira }
      : { forma: 'AVISTA', metodo: e.metodo, ...bandeira }
    if (!e.outras?.length || total === undefined) return base
    return { ...base, valor: valorDaPrincipal(total, e.outras), outras: partesDoEstado(e.outras) }
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
  // D1 da 18ª: cada outra forma com a forma e o valor, e a de cima ainda com o que falta.
  if (e.forma === 'AVISTA' && e.outras?.length) {
    const recusa = recusaDasOutras(e.outras, total)
    if (recusa) return recusa
  }
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
    if (varias && pagaAgora && temBandeira(e.metodo) && !e.maquininha) return 'Escolha a maquininha do cartão.'
    // D1 da 18ª: cada outra forma no cartão também pede a maquininha.
    if (varias && e.forma === 'AVISTA' && (e.outras ?? []).some(o => temBandeira(o.metodo) && !o.maquininha)) return 'Escolha a maquininha de cada cartão.'
    return null
  }
}

/**
 * A5 da 18ª (princípio 7): o "Vender" desabilitado não dizia por quê — no
 * crediário, a "Forma da entrada" só aparece depois de digitar a entrada. O
 * motivo vai ao lado do botão; a recusa que o campo da entrada já mostra
 * (ilegível, acima do total) não se repete ali.
 */
export function recusaForaDoCampo(e: EstadoDoPagamento, total: number | undefined, recusa: string | null, doQue = 'da venda'): string | null {
  if (!recusa) return null
  return recusa === recusaDaEntradaDoEstado(e, total, doQue) ? null : recusa
}

/** O motivo do botão desabilitado, ao lado dele (A5 da 18ª). */
export function MotivoDoBotao({ motivo }: { motivo: string | null }) {
  if (!motivo) return null
  return (
    <span data-motivo-do-botao role="status" style={{
      marginRight: 'auto', alignSelf: 'center', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', fontWeight: 'var(--weight-semibold)',
    }}>{motivo}</span>
  )
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

export function CamposDoPagamento({ estado, aoMudar, formas, total, doQue = 'da venda', clienteId, semCredito = false, semMaquininha = false, variasFormas = false }: {
  estado: EstadoDoPagamento
  /**
   * D1 da 18ª: o "+ Outra forma" no à vista — a comanda do atendimento, a
   * Nova venda e o plano no PDV. O contrato (que só vira texto) não o tem.
   */
  variasFormas?: boolean
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
    // As outras formas são do à vista: o crediário e o a receber as tiram.
    if (b === 'CREDIARIO') return mudar({ forma: 'PARCELADO', metodo: '', vezes: 1, bandeira: '', maquininha: '', outras: [] })
    if (b === 'A_RECEBER' || b === 'NADA_AGORA') return mudar({ forma: b, metodo: '', vezes: 1, bandeira: '', maquininha: '', outras: [] })
    // Trocar o meio zera as vezes e a bandeira, que eram do outro.
    mudar({ forma: 'AVISTA', metodo: b, ...(b !== estado.metodo ? { vezes: 1, bandeira: '', maquininha: '' } : {}) })
  }
  const comEntrada = forma === 'PARCELADO' && temEntrada(estado)
  const valorDaEntrada = (() => { const l = lerEntrada(estado.entrada); return 'valor' in l ? l.valor : 0 })()
  // O que se paga AGORA com o meio escolhido: o à vista inteiro (dividido, o que
  // falta das outras formas — D1 da 18ª), ou a entrada.
  const outras = forma === 'AVISTA' ? estado.outras ?? [] : []
  const pagaAgora = forma === 'AVISTA'
    ? (total !== undefined && outras.length ? Math.max(0, valorDaPrincipal(total, outras)) : total)
    : comEntrada ? valorDaEntrada : undefined
  const comMeio = (forma === 'AVISTA' || comEntrada) && !!estado.metodo
  return (
    <>
      <FormasDePagamento valor={blocoDoEstado(estado)} aoMudar={escolher} formas={blocos} />
      {forma === 'PARCELADO' && (
        <div className="form-2col">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={rotulo}>Entrada (opcional)</span>
            <input className="field" inputMode="decimal" placeholder="0,00" value={estado.entrada}
              onChange={e => mudar({ entrada: e.target.value })} aria-label="Entrada" aria-invalid={!!recusaDaEntrada}
              // A5 da 17ª: ao sair do campo, a entrada fica no formato do dinheiro ("100" → "100,00");
              // o que não se lê fica como foi escrito, com a recusa ao lado.
              onBlur={e => { const n = parseDinheiro(e.target.value); if (e.target.value.trim() && Number.isFinite(n)) mudar({ entrada: formatDinheiroCampo(n) }) }} />
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
                {/* A4 da 15ª: os nomes da lista de formas ao lado ("Débito", "Crédito"), um nome só. */}
                {metodos.map(m => <option key={m} value={m}>{rotuloDaForma(m)}</option>)}
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
      {variasFormas && forma === 'AVISTA' && !!estado.metodo && total !== undefined && total > 0 && (
        <OutrasFormas metodoPrincipal={estado.metodo} total={total} outras={outras} aoMudar={o => mudar({ outras: o })}
          metodos={metodos} clienteId={clienteId} semMaquininha={semMaquininha} />
      )}
      {forma === 'PARCELADO' && (
        <div className="form-2col">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={rotulo}>Parcelas</span>
            <select className="field" value={estado.parcelas} onChange={e => mudar({ parcelas: Number(e.target.value) })} aria-label="Parcelas">
              {/* A1 da 20ª: com entrada, a opção diz quantos pagamentos dá. */}
              {opcoesDeParcelas.map(n => <option key={n} value={n}>{rotuloDaOpcaoDeParcelas(n, comEntrada)}</option>)}
            </select>
            {/* A23 da 14ª: a lista para no limite — e diz que é o da clínica. */}
            <span data-limite-do-crediario style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              {limiteDoCrediarioEmTexto(opcoesDeParcelas.length)}
            </span>
          </label>
          {/* O "e a forma?" mora na dica, ao lado do rótulo (2026-11-16 — era uma linha fixa).
              Um <div>, não <label>: o botão da dica dentro do rótulo o roubaria do campo
              (o campo tem o próprio aria-label). */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={rotulo}>1º vencimento</span>
              <Dica rotulo="A forma de cada parcela">
                <span data-forma-ao-receber>Cada parcela, quando a cliente vier pagar, pede a forma dela.</span>
              </Dica>
            </span>
            <input className="field" type="date" required value={estado.data} onChange={e => mudar({ data: e.target.value })} aria-label="Vencimento" />
          </div>
        </div>
      )}
      {forma === 'A_RECEBER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={rotulo}>Vencimento (opcional)</span>
            <Dica rotulo="A forma do a receber">
              <span data-forma-ao-receber>Nada entra agora: a forma se escolhe quando a cliente pagar.</span>
            </Dica>
          </span>
          <input className="field" type="date" value={estado.vencimento} onChange={e => mudar({ vencimento: e.target.value })} aria-label="Vencimento" />
        </div>
      )}
      {forma === 'PARCELADO' && total !== undefined && !recusaDaEntrada && (
        <ResumoDasParcelas total={total} entrada={valorDaEntrada} parcelas={estado.parcelas} />
      )}
    </>
  )
}
