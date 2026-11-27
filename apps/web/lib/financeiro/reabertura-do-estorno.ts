import { formatBRL } from '@estetica-os/utils'
import { rotuloDaForma } from '@/lib/financeiro/formas'

/** Um lançamento em aberto ou pago da venda de produto (o estorno é da venda inteira). */
export interface LancamentoDaVendaDoEstorno { valor: number; pago: boolean; metodo: string | null; vezes: number | null }

/**
 * A13 da 23ª simulação (princípio 3): a janela dizia "2× Sérum facial · R$
 * 100,00" — o valor da linha clicada — e "Estorna a venda inteira", que era de
 * R$ 300. O valor é o da VENDA, com as formas do pago e o que estava a receber.
 */
export function vendaDoEstornoEmTexto(linhas: readonly LancamentoDaVendaDoEstorno[]): { total: number; texto: string } {
  const centavos = (v: number) => Math.round(v * 100)
  const total = linhas.reduce((s, l) => s + centavos(l.valor), 0) / 100
  const porForma = new Map<string, number>()
  for (const l of linhas.filter(x => x.pago)) {
    const forma = rotuloDaForma(l.metodo, l.vezes)
    porForma.set(forma, (porForma.get(forma) ?? 0) + centavos(l.valor))
  }
  const aReceber = linhas.filter(l => !l.pago).reduce((s, l) => s + centavos(l.valor), 0) / 100
  const pagas = [...porForma.entries()].map(([f, c]) => `${f} ${formatBRL(c / 100)}`)
  const partes = [pagas.length ? emLista(pagas) : null, aReceber > 0 ? `${formatBRL(aReceber)} a receber` : null].filter(Boolean)
  return { total, texto: `A venda inteira: ${formatBRL(total)}${partes.length ? ` (${partes.join('; ')})` : ''}.` }
}

/**
 * O que o estorno do pagamento do pacote reabre, dito antes de estornar (C39;
 * A6 da 19ª simulação, 2026-11-16; princípio 3). O estorno devolve o dinheiro
 * e o pacote volta a ter o valor a receber — e as sessões já feitas seguem
 * feitas: a janela dizia só o dinheiro, e o pacote com 4 das 5 sessões
 * surpreendia. Agora diz quantas foram feitas e quantas restam.
 */
export function textoDaReaberturaDoPacote(valor: number, usadas: number, total: number, onde: OndeSeCancela = 'na ficha'): string {
  const feitas = Math.max(0, Math.min(usadas, total))
  const restam = total - feitas
  const sessoes = feitas <= 0 || total <= 0 ? ''
    : restam === 0 ? ` As ${total} sessões já foram feitas.`
    : ` ${feitas} das ${total} sessões já ${feitas === 1 ? 'foi feita' : 'foram feitas'}, e o pacote segue com ${restam === 1 ? 'a 1 que resta' : `as ${restam} que restam`}.`
  return `O dinheiro volta à cliente, e o pacote volta a ter ${formatBRL(valor)} a receber.${sessoes}${paraDesfazer('use “Cancelar pacote” na ficha', onde)}`
}

/**
 * D1 da 35ª (DP-08; decisão do Claude, 27/11): quem tem só o Financeiro em
 * Gerenciar não abre a ficha (o Clientes) nem a página do plano (o
 * Atendimento), e a janela mandava cancelar "na ficha". Com o botão do
 * cancelamento na própria janela (`'aqui'`), a frase termina nele.
 */
export type OndeSeCancela = 'na ficha' | 'aqui'

const paraDesfazer = (naFicha: string, onde: OndeSeCancela) =>
  onde === 'aqui' ? ' Para desfazer a venda:' : ` Para desfazer a venda, ${naFicha}.`

export function textoDaReaberturaDoPlano(valor: number, onde: OndeSeCancela = 'na ficha'): string {
  return `O dinheiro volta à cliente, e o plano volta a ter ${formatBRL(valor)} a receber.${paraDesfazer('use “Cancelar plano” na ficha', onde)}`
}

export function textoDaReaberturaDoPrePago(valor: number, onde: OndeSeCancela = 'na ficha'): string {
  return `O dinheiro volta à cliente, e o pré-pago volta a ter ${formatBRL(valor)} a receber.${paraDesfazer('cancele a sessão pré-paga na ficha', onde)}`
}

/** O que a janela do estorno oferece cancelar (D1 da 35ª): a mesma janela de cada um. */
export type CancelarPeloEstorno =
  | { tipo: 'PACOTE'; id: string }
  | { tipo: 'PLANO'; id: string }
  | { tipo: 'PRE_PAGO'; sessoes: { id: string; numero: number }[] }

const emLista = (itens: string[]) => itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`

/**
 * O que o estorno faz com a comissão e a taxa, dito antes de estornar (A7 da
 * 20ª simulação; princípio 3): a conta estava certa (a comissão liberada
 * voltava, a taxa do 2x sumia), mas a janela não dizia.
 * - `comissoes`: a comissão que este pagamento deixou liberada, por pessoa;
 *   'OCULTA' quando há, mas quem estorna não vê quanto cada um ganha.
 * - `produto`: a venda de produto estornada inteira — a comissão sai junto.
 * - `pagas`: a parte dessa comissão que JÁ FOI PAGA num fechamento (CF-16,
 *   comissoes.md: "Fechamento não se reabre: estorno depois dele vira
 *   lançamento negativo no próximo") — o estorno a desconta no próximo
 *   fechamento; fora da venda de produto, ela volta a aguardar o pagamento
 *   (D5 da 31ª: a janela dizia só "volta a aguardar", e o banco fazia −90).
 * - `cartao`: o pagamento no cartão — a taxa da maquininha dele sai da conta.
 * Nada a dizer: nulo.
 */
export function textoDaComissaoETaxaDoEstorno(e: {
  cartao: boolean
  comissoes: { nome: string; valor: number }[] | 'OCULTA'
  pagas?: { nome: string; valor: number }[] | 'OCULTA'
  produto: boolean
}): string | null {
  const partes: string[] = []
  const destino = e.produto ? 'sai junto' : 'volta a aguardar o pagamento'
  if (e.comissoes === 'OCULTA') partes.push(`A comissão que este pagamento liberou ${destino}.`)
  else if (e.comissoes.length) partes.push(`A comissão de ${emLista(e.comissoes.map(c => `${c.nome} (${formatBRL(c.valor)})`))} ${destino}.`)
  const depois = e.produto ? '' : ', e ela volta a aguardar o pagamento'
  if (e.pagas === 'OCULTA') partes.push(`A comissão que este pagamento liberou já foi paga: o estorno a desconta no próximo fechamento${depois}.`)
  else if (e.pagas?.length) {
    const total = e.pagas.reduce((s, c) => s + Math.round(c.valor * 100), 0) / 100
    partes.push(`A comissão de ${emLista(e.pagas.map(c => `${c.nome} (${formatBRL(c.valor)})`))} já foi paga: o estorno a desconta no próximo fechamento (−${formatBRL(total)})${depois}.`)
  }
  if (e.cartao) partes.push('A taxa da maquininha deste pagamento sai da conta.')
  return partes.length ? partes.join(' ') : null
}
