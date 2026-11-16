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
  /**
   * D1 da 16ª (princípio 3): os produtos da comanda do atendimento já vendidos
   * e pagos enquanto ela está a receber — a comanda reaberta pelo estorno só
   * do atendimento. Ficam fora de `valor`, que é o que falta receber.
   */
  jaPago:           number
  /**
   * D3 da 17ª: cada forma dos lançamentos vivos e pagos da comanda do
   * atendimento paga (o atendimento e os produtos), com o valor. Vazia nas outras.
   */
  formas:           { forma: string; vezes: number; valor: number }[]
  /** A1 da 17ª: o desconto comercial dado na comanda do atendimento paga. */
  desconto:         number
  /** A1 da 17ª: o desconto da fidelidade (o voucher ou os pontos) da comanda do atendimento paga. */
  fidelidade:       number
  /** A1 da 17ª: o nome do voucher usado nela, quando foi um voucher. */
  voucher:          string | null
  /**
   * A2 da 17ª: o pagamento do atendimento estornado mais recente, na comanda
   * reaberta (a receber). Nulo nas outras.
   */
  estornoAnterior:  EstornoAnteriorDaComanda | null
}

export interface EstornoAnteriorDaComanda {
  /** Quando foi estornado. */
  quando:     string
  valor:      number
  forma:      string | null
  vezes:      number
  desconto:   number
  fidelidade: number
  voucher:    string | null
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
 * A forma da comanda paga (D3 da 17ª, princípio 3): paga em duas formas (o
 * produto no débito, o atendimento recebido de novo no Pix), ela diz as duas
 * com o valor de cada — "Pix R$ 220,00 + Débito R$ 120,00". Numa forma só, só
 * o nome dela ("Crédito 3x").
 */
export function formasDaComandaEmTexto(c: ComandaDoPdv): string {
  if (c.formas.length > 1) return c.formas.map(f => `${rotuloDaForma(f.forma, f.vezes)} ${brl(f.valor)}`).join(' + ')
  if (c.formas.length === 1) return rotuloDaForma(c.formas[0]!.forma, c.formas[0]!.vezes)
  return rotuloDaForma(c.forma)
}

/**
 * As linhas do que se descontou na comanda paga (A1 da 17ª, princípio 3): o
 * desconto comercial, e o da fidelidade — o voucher pelo nome, ou os pontos.
 * A comanda a receber não as tem (o desconto se escolhe ao receber).
 */
export function descontosDaComanda(c: ComandaDoPdv): { chave: 'desconto' | 'voucher' | 'pontos'; rotulo: string; valor: number }[] {
  if (!c.paga) return []
  const linhas: { chave: 'desconto' | 'voucher' | 'pontos'; rotulo: string; valor: number }[] = []
  if (c.desconto > 0) linhas.push({ chave: 'desconto', rotulo: 'Desconto', valor: c.desconto })
  if (c.fidelidade > 0) linhas.push(c.voucher
    ? { chave: 'voucher', rotulo: `Voucher “${c.voucher}”`, valor: c.fidelidade }
    : { chave: 'pontos', rotulo: 'Pontos', valor: c.fidelidade })
  return linhas
}

/**
 * O valor da comanda na lista (A1 da 17ª): a do atendimento paga mostra o que
 * foi PAGO (o Peeling de R$ 280 com R$ 30 de desconto aparecia "R$ 280,00" em
 * "Pagas hoje"); a aberta, o que falta; a venda e o plano, o valor deles (o
 * em aberto se diz ao lado).
 */
export function valorNaLista(c: ComandaDoPdv): number {
  return c.origem === 'ATENDIMENTO' && c.paga && c.recebido != null ? c.recebido : c.valor
}

/**
 * O estorno anterior da comanda reaberta (A2 da 17ª, princípio 3): "Estornada
 * às 21:20 — R$ 250,00, Pix, com R$ 30,00 de desconto". O desconto dado antes
 * não some calado: quem recebe de novo decide o desconto de novo.
 */
export function estornoAnteriorEmTexto(c: ComandaDoPdv, hora: (iso: string | null) => string): string | null {
  const e = c.estornoAnterior
  if (!e || c.paga) return null
  const com = [
    e.desconto > 0 ? `${brl(e.desconto)} de desconto` : null,
    e.fidelidade > 0 ? (e.voucher ? `o voucher “${e.voucher}” (${brl(e.fidelidade)})` : `${brl(e.fidelidade)} da fidelidade`) : null,
  ].filter(Boolean)
  return `Estornada às ${hora(e.quando)} — ${[brl(e.valor), e.forma ? rotuloDaForma(e.forma, e.vezes) : null].filter(Boolean).join(', ')}`
    + (com.length ? `, com ${com.join(' e ')}` : '')
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
  // D1 da 16ª: a comanda reaberta pelo estorno só do atendimento — o produto segue pago.
  const jaPago = !c.paga && c.jaPago > 0 ? `${brl(c.jaPago)} já pago` : null
  return [oQue, c.agendadoPara ? hora(c.agendadoPara) : null, c.paga ? formasDaComandaEmTexto(c) : c.profissional, aberto, jaPago]
    .filter(Boolean).join(' · ')
}

/** O que a linha de um produto da comanda precisa (D2 da 18ª). */
export interface ProdutoNaComanda {
  nome:            string
  quantidade:      number
  vendido:         boolean
  /** A venda do produto foi estornada (quando); nulo: não foi. */
  estornadoEm:     string | null
  /** No estorno, o produto voltou ao estoque; nulo sem estorno. */
  voltouAoEstoque: boolean | null
}

/**
 * A linha do produto na comanda (D2 da 18ª, princípio 3): o produto estornado
 * dizia "saiu do estoque da unidade" e, na comanda reaberta, "já pago" — o
 * dinheiro e o produto já tinham voltado. Agora diz o estorno e se voltou.
 */
export function situacaoDoItemDaComanda(i: ProdutoNaComanda, aReceber: boolean): string {
  if (i.estornadoEm) return `Produto · estornado · ${i.voltouAoEstoque ? 'voltou ao estoque' : 'não voltou ao estoque'}`
  if (i.vendido) return aReceber ? 'Produto · já pago, fora do que falta receber' : 'Produto · saiu do estoque da unidade'
  return 'Produto · sai do estoque da unidade ao receber'
}

/**
 * A comanda reaberta cita o produto estornado (D2 da 18ª), não só o estorno
 * do atendimento: "Produto estornado às 01:59 — Protetor solar FPS 60 × 2,
 * voltou ao estoque". Nenhum estornado: nulo.
 */
export function produtosEstornadosEmTexto(itens: readonly ProdutoNaComanda[], hora: (iso: string | null) => string): string | null {
  const estornados = itens.filter(i => i.estornadoEm)
  if (!estornados.length) return null
  const um = (i: ProdutoNaComanda) => `${i.nome} × ${i.quantidade}, ${i.voltouAoEstoque ? 'voltou ao estoque' : 'não voltou ao estoque'}`
  if (estornados.length === 1) return `Produto estornado às ${hora(estornados[0]!.estornadoEm)} — ${um(estornados[0]!)}`
  return `Produtos estornados — ${estornados.map(i => `${um(i)} (às ${hora(i.estornadoEm)})`).join('; ')}`
}

/** Um pagamento da comanda, como a tela o mostra (A1 da 18ª). */
export interface PagamentoDaComandaNaTela {
  valor: number; metodo: string | null; vezes: number | null
  doAtendimento: boolean; vendaDeProduto: boolean; vendaDeCredito: boolean
}

/** O que o pagamento é, para a linha dele (A1 da 18ª): "Atendimento", "Produto"; nulo = a descrição dele. */
export function rotuloDoPagamentoDaComanda(l: PagamentoDaComandaNaTela): string | null {
  if (l.doAtendimento) return 'Atendimento'
  if (l.vendaDeProduto) return 'Produto'
  if (l.vendaDeCredito) return 'Crédito interno'
  return null
}

/**
 * A1 da 18ª (princípio 3): um recebimento só da comanda (o atendimento e os
 * produtos na mesma forma) são dois lançamentos — cada um com o seu
 * "Estornar" —, e a tela mostrava dois "Crédito 3x" sem dizer por quê. Diz:
 * "Pago junto: atendimento R$ 1.411,56 + produtos R$ 184,44 (Crédito 3x)".
 * Em formas diferentes (o produto pago antes no débito) não é "junto": nulo.
 */
export function pagoJuntoEmTexto(pagamentos: readonly PagamentoDaComandaNaTela[]): string | null {
  if (pagamentos.length < 2) return null
  const chave = (l: PagamentoDaComandaNaTela) => `${l.metodo ?? ''}:${l.metodo === 'CREDIT_CARD' ? (l.vezes ?? 1) : 1}`
  if (new Set(pagamentos.map(chave)).size !== 1) return null
  const soma = (f: (l: PagamentoDaComandaNaTela) => boolean) =>
    pagamentos.filter(f).reduce((t, l) => t + Math.round(l.valor * 100), 0) / 100
  const atendimento = soma(l => l.doAtendimento)
  const produtos = soma(l => !l.doAtendimento && l.vendaDeProduto)
  if (!(atendimento > 0) || !(produtos > 0)) return null
  const forma = pagamentos[0]!.metodo ? ` (${rotuloDaForma(pagamentos[0]!.metodo, pagamentos[0]!.vezes)})` : ''
  return `Pago junto: atendimento ${brl(atendimento)} + produtos ${brl(produtos)}${forma}`
}
