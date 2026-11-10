/**
 * O saldo de um produto com unidade de consumo, como a prateleira o mostra (A50
 * da 11ª simulação, 2026-11-10; princípio 3): "Atual: 11 refil" valia 10,84 — o
 * `current_stock` conta a embalagem aberta inteira. Agora "10 refil fechados + 1
 * aberto com 840 g". Puro: roda no navegador.
 */
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export function saldoNaPrateleira(rendimento: number, rende: number, embalagem: string, consumo: string): string {
  if (!(rende > 0)) return `${fmt(rendimento)} ${embalagem}`
  const total = Math.max(0, rendimento)
  const fechados = Math.floor(Math.round(total / rende * 1e6) / 1e6)
  const resto = Math.round((total - fechados * rende) * 1000) / 1000
  if (resto <= 0) return `${fmt(fechados)} ${embalagem}`
  if (fechados === 0) return `1 ${embalagem} aberto com ${fmt(resto)} ${consumo}`
  return `${fmt(fechados)} ${embalagem} ${fechados === 1 ? 'fechado' : 'fechados'} + 1 aberto com ${fmt(resto)} ${consumo}`
}
