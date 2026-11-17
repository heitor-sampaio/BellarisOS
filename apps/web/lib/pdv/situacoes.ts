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
   * atendimento paga (o atendimento e os produtos), com o valor. A1 da 19ª: e
   * a bandeira do cartão; e as da venda paga à vista (D1 da 19ª). Vazia nas outras.
   */
  formas:           { forma: string; vezes: number; valor: number; bandeira?: string | null }[]
  /** A1 da 17ª: o desconto comercial dado na comanda do atendimento paga. */
  desconto:         number
  /** A1 da 17ª: o desconto da fidelidade (o voucher ou os pontos) da comanda do atendimento paga. */
  fidelidade:       number
  /** A1 da 17ª: o nome do voucher usado nela, quando foi um voucher. */
  voucher:          string | null
  /**
   * A2 da 17ª: o pagamento do atendimento estornado mais recente, na comanda
   * reaberta (a receber). D1 da 19ª: na da venda e do plano, o pagamento
   * estornado que ganhou o lançamento reaberto (a receber ou recebido de novo).
   * Nulo nas outras.
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
  // D4 da 20ª simulação (princípio 3): a comanda do plano aceito não tem
  // atendimento — "Atendida" mentia; a venda reaberta a receber também não.
  if (c.origem === 'PLANO') return { texto: 'Plano aceito, a pagar', tom: 'warn' }
  if (c.origem === 'VENDA') return { texto: 'A receber', tom: 'warn' }
  return { texto: 'Atendida, a pagar', tom: 'warn' }
}

/**
 * A comanda da venda estornada (A2 da 20ª simulação; princípio 3): dizia "Não
 * há o que receber", e o balcão não sabia como cobrar de novo — é uma Nova
 * venda (a estornada não se reabre).
 */
export function vendaEstornadaEmTexto(c: ComandaDoPdv): string {
  return `Venda estornada: o dinheiro dela voltou. Não há o que receber.${c.origem === 'VENDA' ? ' Para cobrar de novo, faça uma Nova venda.' : ''}`
}

/** Uma parcela em aberto, como a janela de receber a lê (A5 da 20ª). */
export interface ParcelaParaAdiantar {
  id: string; numero: number | null; total: number | null
  /** "Vence 16/12/2026", "Vencida em 10/11" — ou nulo. */
  vencimento: string | null
  /** A venda da parcela (o pacote, o plano, o atendimento…): só as da mesma venda se comparam. */
  venda: string | null
}

/**
 * A parcela recebida ADIANTADA (A5 da 20ª simulação; princípio 3): a 2/2 se
 * recebia com a 1/2 aberta, e a janela dizia só "Parcela 2 de 2". Diz as de
 * antes da mesma venda que seguem em aberto. Só avisa (princípio 2).
 */
export function anterioresEmAbertoEmTexto(p: ParcelaParaAdiantar, todas: readonly ParcelaParaAdiantar[]): string | null {
  if (!p.venda || p.numero == null) return null
  const antes = todas
    .filter(o => o.id !== p.id && o.venda === p.venda && o.numero != null && o.numero < p.numero!)
    .sort((a, b) => a.numero! - b.numero!)
  if (!antes.length) return null
  const uma = (o: ParcelaParaAdiantar) => `a ${o.numero}/${o.total ?? p.total}${o.vencimento ? ` (${o.vencimento.charAt(0).toLocaleLowerCase('pt-BR')}${o.vencimento.slice(1)})` : ''}`
  const lista = antes.length === 1 ? uma(antes[0]!) : `${antes.slice(0, -1).map(uma).join(', ')} e ${uma(antes[antes.length - 1]!)}`
  return `Adiantada: ${lista} ${antes.length === 1 ? 'segue' : 'seguem'} em aberto.`
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
  // A1 da 19ª: com a bandeira ("Crédito Mastercard 10x") — a taxa depende dela.
  if (c.formas.length > 1) return c.formas.map(f => `${rotuloDaForma(f.forma, f.vezes, { bandeira: f.bandeira })} ${brl(f.valor)}`).join(' + ')
  if (c.formas.length === 1) return rotuloDaForma(c.formas[0]!.forma, c.formas[0]!.vezes, { bandeira: c.formas[0]!.bandeira })
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
 * O estorno anterior na comanda da VENDA (D1 da 19ª simulação, 2026-11-16;
 * princípio 3). A venda estornada de dentro da comanda volta a ter o valor a
 * receber (`estornar_e_reabrir`), e a comanda segue entre as pagas — dizia
 * R$ 2.000,00 do pacote de R$ 1.000, somando o estornado e o reaberto. O
 * valor agora é o vendido uma vez, e a comanda diz o estorno: a receber de
 * novo, "Estornada às 09:27 — R$ 1.000,00, Débito: o valor voltou a
 * receber."; recebida, "Recebida de novo depois do estorno das 09:27
 * (R$ 1.000,00, Débito)." A do atendimento segue a regra da 17ª
 * (`estornoAnteriorEmTexto`, só a receber).
 */
export function estornoDaVendaEmTexto(c: ComandaDoPdv, hora: (iso: string | null) => string): string | null {
  const e = c.estornoAnterior
  if (!e || (c.origem !== 'VENDA' && c.origem !== 'PLANO')) return null
  const oQue = [brl(e.valor), e.forma ? rotuloDaForma(e.forma, e.vezes) : null].filter(Boolean).join(', ')
  return c.emAberto > 0
    ? `Estornada às ${hora(e.quando)} — ${oQue}: o valor voltou a receber.`
    : `Recebida de novo depois do estorno das ${hora(e.quando)} (${oQue}).`
}

/**
 * O que acabou de ser recebido (A2 da 19ª simulação; princípio 3): depois de
 * "Receber", a comanda sai das abertas, e a tela ficava em "Nenhuma comanda
 * aberta", sem dizer o que entrou. Diz o valor e a forma, e onde ela está.
 */
export function recebidaAgoraEmTexto(c: ComandaDoPdv): string | null {
  if (!c.paga || c.recebido == null) return null
  return `Recebido ${brl(c.recebido)} (${formasDaComandaEmTexto(c)}). A comanda saiu das abertas e está em “Pagas hoje”.`
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
export function situacaoDoItemDaComanda(i: ProdutoNaComanda, aReceber: boolean, naoPontua = false): string {
  if (i.estornadoEm) return `Produto · estornado · ${i.voltouAoEstoque ? 'voltou ao estoque' : 'não voltou ao estoque'}`
  // A32 da 20ª (princípio 3): com a regra da rede, o produto da comanda não pontua — e a linha diz.
  const pontos = naoPontua ? ' · não pontua' : ''
  if (i.vendido) return (aReceber ? 'Produto · já pago, fora do que falta receber' : 'Produto · saiu do estoque da unidade') + pontos
  return 'Produto · sai do estoque da unidade ao receber' + pontos
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

/**
 * O voucher da comanda paga depois do estorno só do produto (A7 da 19ª
 * simulação, 2026-11-16; princípio 3). O voucher se rateia entre o
 * atendimento e os produtos (`private.parte_dos_itens`); estornado o produto,
 * a linha dele ficava em "−R$ 28,71" no lugar dos R$ 30,00, sem dizer por quê.
 * Diz que ele segue usado na parte do atendimento.
 */
export function voucherDoProdutoEstornadoEmTexto(c: ComandaDoPdv, itens: readonly ProdutoNaComanda[]): string | null {
  if (!c.paga || !c.voucher || !(c.fidelidade > 0) || !itens.some(i => i.estornadoEm)) return null
  return `O voucher “${c.voucher}” segue usado na parte do atendimento (${brl(c.fidelidade)}). A parte dele no produto estornado saiu com o estorno.`
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
