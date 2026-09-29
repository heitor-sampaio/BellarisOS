/**
 * As sessões de um pacote vendido e a parte do preço de cada uma.
 *
 * Um pacote é um conjunto de procedimentos, iguais ou não ("5 limpezas + 3
 * drenagens"). O preço do pacote é rateado entre as sessões pelo preço de
 * TABELA de cada procedimento — o pacote de R$ 800 com 1× A (R$ 300) e 1× B
 * (R$ 100) dá R$ 600 e R$ 200. Sem preço de tabela nenhum, divide igual. A
 * parte de cada sessão é a base da comissão dela.
 *
 * Em centavos; a última sessão leva o que sobra do arredondamento, para a soma
 * fechar com o preço (o banco confere).
 */
export interface ItemDoPacote { procedureId: string; quantidade: number; precoTabela: number }
export interface SessaoVendida { procedure_id: string; preco: number }

const centavos = (v: number) => Math.round(v * 100) / 100

export function sessoesDoPacote(itens: ItemDoPacote[], precoDoPacote: number): SessaoVendida[] {
  const sessoes = itens.flatMap(i => Array.from({ length: Math.max(0, Math.trunc(i.quantidade)) }, () => ({
    procedureId: i.procedureId, peso: Math.max(0, i.precoTabela),
  })))
  if (!sessoes.length) return []
  const total = centavos(precoDoPacote)
  const somaDosPesos = sessoes.reduce((s, x) => s + x.peso, 0)
  const peso = (x: { peso: number }) => somaDosPesos > 0 ? x.peso / somaDosPesos : 1 / sessoes.length
  let distribuido = 0
  return sessoes.map((s, i) => {
    const preco = i === sessoes.length - 1 ? centavos(total - distribuido) : centavos(total * peso(s))
    distribuido = centavos(distribuido + preco)
    return { procedure_id: s.procedureId, preco }
  })
}

/** "5× Limpeza + 3× Drenagem" — a composição para a tela. */
export function composicaoDoPacote(itens: { procedureName: string; quantidade: number }[]): string {
  return itens.map(i => `${i.quantidade}× ${i.procedureName}`).join(' + ')
}
