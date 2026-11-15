import { rotuloDaForma } from '@/lib/financeiro/formas'

/**
 * As situações e a forma de uma comanda do PDV, sem nada do servidor: a tela
 * (client) importa daqui; a leitura (`comandasDoPdv`) mora em `./comandas`.
 */

export type SituacaoDoPdv = 'ABERTAS' | 'PAGAS' | 'TODAS'
export const SITUACOES_DO_PDV: readonly { key: SituacaoDoPdv; label: string }[] = [
  { key: 'ABERTAS', label: 'Abertas' },
  { key: 'PAGAS',   label: 'Pagas hoje' },
  { key: 'TODAS',   label: 'Todas' },
]
export const situacaoDoPdv = (pedida: string | null | undefined): SituacaoDoPdv =>
  SITUACOES_DO_PDV.some(s => s.key === pedida) ? pedida as SituacaoDoPdv : 'ABERTAS'

export interface ComandaDoPdv {
  id:            string
  numero:        number
  origem:        'ATENDIMENTO' | 'PLANO' | 'VENDA'
  abertaEm:      string
  canceladaEm:   string | null
  /** Por que saiu sem cobrança: o cancelamento, a falta, a sessão do pacote, o pré-pago. */
  canceladaMotivo: string | null
  clienteId:     string
  cliente:       string
  agendamentoId: string | null
  procedimento:  string | null
  profissional:  string | null
  agendadoPara:  string | null
  /** A situação do atendimento (IN_PROGRESS, COMPLETED…) — a comanda do atendimento. */
  atendimento:   string | null
  valor:         number
  paga:          boolean
  pagaEm:        string | null
  recebido:      number | null
  forma:         string | null
  /** A venda estornada inteira (nenhum lançamento vivo). */
  estornada:     boolean
  /** A comanda do plano (PDV4): o plano que ela recebe. */
  planoId:       string | null
  /**
   * A1/A17 da 15ª (princípio 3): o que a cliente ainda deve desta venda ou
   * plano — a venda no crediário "nasce paga" (PDV8) e o resto fica em aberto.
   * Sai do banco (`pdv_comandas`); zero na comanda do atendimento.
   */
  emAberto:         number
  parcelasEmAberto: number
  proximaParcela:   string | null
  /** A3 da 15ª: quantos produtos a comanda do atendimento leva. */
  produtos:         number
}

type Tom = 'ok' | 'warn' | 'info' | 'perigo'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const diaNo = (iso: string, fuso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: fuso })

/**
 * A situação da comanda, como o balcão a lê. A venda no crediário nasce paga
 * (PDV8), mas com dinheiro em aberto o selo é "A receber" — "Paga" mentia
 * (A1/A17 da 15ª simulação, princípio 3).
 */
export function seloDaComanda(c: ComandaDoPdv): { texto: string; tom: Tom } {
  if (c.estornada) return { texto: 'Estornada', tom: 'perigo' }
  if (c.canceladaEm) return c.canceladaMotivo === 'Sessão do pacote' || c.canceladaMotivo === 'Procedimento pré-pago'
    ? { texto: c.canceladaMotivo, tom: 'ok' } : { texto: 'Cancelada', tom: 'perigo' }
  if (c.paga && c.emAberto > 0) return { texto: 'A receber', tom: 'warn' }
  if (c.paga) return { texto: 'Paga', tom: 'ok' }
  if (c.atendimento === 'IN_PROGRESS') return { texto: 'Em atendimento', tom: 'info' }
  return { texto: 'Atendida, a pagar', tom: 'warn' }
}

/**
 * O que ainda está em aberto da venda ou do plano (A1/A17): "R$ 1.800,00 em
 * aberto (3 parcelas, a 1ª em 15/12)"; sem parcelas, "…, vence em 15/12".
 * Nada em aberto: nulo. Os números vêm do banco (`pdv_comandas`).
 */
export function emAbertoDaComanda(c: ComandaDoPdv, fuso: string): string | null {
  if (!(c.emAberto > 0) || c.estornada) return null
  const valor = `${brl(c.emAberto)} em aberto`
  const dia = c.proximaParcela ? diaNo(c.proximaParcela, fuso) : null
  if (c.parcelasEmAberto > 1) return `${valor} (${c.parcelasEmAberto} parcelas${dia ? `, a 1ª em ${dia}` : ''})`
  if (c.parcelasEmAberto === 1) return `${valor} (1 parcela${dia ? `, em ${dia}` : ''})`
  return dia ? `${valor}, vence em ${dia}` : valor
}

/**
 * A linha da comanda na lista: o que ela leva (com os produtos da comanda do
 * atendimento, A3), a hora, e a forma — com o que ficou em aberto — ou quem
 * atende.
 */
export function detalheDaComanda(c: ComandaDoPdv, hora: (iso: string | null) => string): string {
  const oQue = c.procedimento && c.produtos > 0
    ? `${c.procedimento} + ${c.produtos} ${c.produtos === 1 ? 'produto' : 'produtos'}` : c.procedimento
  const aberto = c.paga && c.emAberto > 0 && !c.estornada ? `${brl(c.emAberto)} em aberto` : null
  return [oQue, c.agendadoPara ? hora(c.agendadoPara) : null, c.paga ? rotuloDaForma(c.forma) : c.profissional, aberto]
    .filter(Boolean).join(' · ')
}
