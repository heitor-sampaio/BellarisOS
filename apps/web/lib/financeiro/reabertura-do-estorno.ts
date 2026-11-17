import { formatBRL } from '@estetica-os/utils'

/**
 * O que o estorno do pagamento do pacote reabre, dito antes de estornar (C39;
 * A6 da 19ª simulação, 2026-11-16; princípio 3). O estorno devolve o dinheiro
 * e o pacote volta a ter o valor a receber — e as sessões já feitas seguem
 * feitas: a janela dizia só o dinheiro, e o pacote com 4 das 5 sessões
 * surpreendia. Agora diz quantas foram feitas e quantas restam.
 */
export function textoDaReaberturaDoPacote(valor: number, usadas: number, total: number): string {
  const feitas = Math.max(0, Math.min(usadas, total))
  const restam = total - feitas
  const sessoes = feitas <= 0 || total <= 0 ? ''
    : restam === 0 ? ` As ${total} sessões já foram feitas.`
    : ` ${feitas} das ${total} sessões já ${feitas === 1 ? 'foi feita' : 'foram feitas'}, e o pacote segue com ${restam === 1 ? 'a 1 que resta' : `as ${restam} que restam`}.`
  return `O dinheiro volta à cliente, e o pacote volta a ter ${formatBRL(valor)} a receber.${sessoes} Para desfazer a venda, use “Cancelar pacote” na ficha.`
}

const emLista = (itens: string[]) => itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`

/**
 * O que o estorno faz com a comissão e a taxa, dito antes de estornar (A7 da
 * 20ª simulação; princípio 3): a conta estava certa (a comissão liberada
 * voltava, a taxa do 2x sumia), mas a janela não dizia.
 * - `comissoes`: a comissão que este pagamento deixou liberada, por pessoa;
 *   'OCULTA' quando há, mas quem estorna não vê quanto cada um ganha.
 * - `produto`: a venda de produto estornada inteira — a comissão sai junto.
 * - `cartao`: o pagamento no cartão — a taxa da maquininha dele sai da conta.
 * Nada a dizer: nulo.
 */
export function textoDaComissaoETaxaDoEstorno(e: {
  cartao: boolean
  comissoes: { nome: string; valor: number }[] | 'OCULTA'
  produto: boolean
}): string | null {
  const partes: string[] = []
  const destino = e.produto ? 'sai junto' : 'volta a aguardar o pagamento'
  if (e.comissoes === 'OCULTA') partes.push(`A comissão que este pagamento liberou ${destino}.`)
  else if (e.comissoes.length) partes.push(`A comissão de ${emLista(e.comissoes.map(c => `${c.nome} (${formatBRL(c.valor)})`))} ${destino}.`)
  if (e.cartao) partes.push('A taxa da maquininha deste pagamento sai da conta.')
  return partes.length ? partes.join(' ') : null
}
