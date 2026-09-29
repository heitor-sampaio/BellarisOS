/**
 * Pontos como desconto no pagamento — o cálculo. Puro.
 *
 * O banco (`confirmar_pagamento_do_atendimento`) confere o mesmo número, então
 * as duas contas TÊM de bater ao centavo:
 *   desconto = min(round(pontos × valorDoPonto, 2), preço)
 *   desconto ≤ round(preço × tetoPct / 100, 2)
 * Por isso tudo aqui é em inteiros (centavos, e décimos de milésimo para o valor
 * do ponto, que é numeric(12,4)): um float que arredondasse para o outro lado
 * faria o banco recusar um pagamento legítimo.
 */

export interface RegrasDeResgate {
  /** R$ por ponto. */
  valorDoPonto: number
  /** Mínimo de pontos para usar. */
  minimo:       number
  /** Até quantos % do valor os pontos pagam. */
  tetoPct:      number
}

export interface ResultadoDoResgate {
  pontos:   number
  /** Desconto em R$. */
  desconto: number
  /** O que falta receber, em R$. */
  restante: number
  /** Motivo da recusa; ausente = pode usar. */
  motivo?:  string
}

const centavos = (reais: number) => Math.round(reais * 100)
const reais    = (c: number) => c / 100
/** round(x/100) do Postgres (meio para cima, x ≥ 0), em inteiros. */
const arredondaCentena = (x: number) => Math.floor((x + 50) / 100)

/** Desconto, em centavos, de `pontos` — o round(pontos × valor, 2) do banco. */
function descontoEmCentavos(pontos: number, valorDoPonto: number): number {
  const decimilesimos = Math.round(valorDoPonto * 10_000)   // numeric(12,4)
  return arredondaCentena(pontos * decimilesimos)
}

/**
 * Quantos pontos, no máximo, este pagamento aceita: o menor entre o saldo e o
 * que cabe no teto. Zero quando não chega ao mínimo.
 */
export function maximoDePontos(saldo: number, preco: number, r: RegrasDeResgate): number {
  if (!(r.valorDoPonto > 0) || !(preco > 0) || !(saldo > 0)) return 0
  const precoC = centavos(preco)
  const tetoC  = Math.min(precoC, Math.round(precoC * r.tetoPct / 100))
  // O maior p com desconto(p) ≤ teto. Começa pela conta direta e corrige o
  // arredondamento de um lado e do outro.
  let p = Math.floor((tetoC * 100) / Math.round(r.valorDoPonto * 10_000))
  while (p > 0 && descontoEmCentavos(p, r.valorDoPonto) > tetoC) p--
  while (descontoEmCentavos(p + 1, r.valorDoPonto) <= tetoC && p + 1 <= saldo) p++
  const max = Math.min(p, Math.floor(saldo))
  return max >= r.minimo ? max : 0
}

export function calcularDescontoComPontos(entrada: {
  saldo:  number
  preco:  number
  pedido: number
  regras: RegrasDeResgate
}): ResultadoDoResgate {
  const { saldo, preco, regras } = entrada
  const pedido = Math.trunc(Number(entrada.pedido) || 0)
  const precoC = centavos(preco)
  const semDesconto = { pontos: 0, desconto: 0, restante: reais(precoC) }

  if (pedido <= 0) return semDesconto
  if (!(regras.valorDoPonto > 0)) return { ...semDesconto, motivo: 'Os pontos desta rede não valem desconto.' }
  if (pedido < regras.minimo)     return { ...semDesconto, motivo: `O mínimo para usar pontos é ${regras.minimo} pontos.` }
  if (pedido > Math.max(0, saldo)) return { ...semDesconto, motivo: `Saldo de pontos insuficiente: o cliente tem ${Math.max(0, saldo)} pontos.` }

  const descontoC = Math.min(descontoEmCentavos(pedido, regras.valorDoPonto), precoC)
  const tetoC     = Math.round(precoC * regras.tetoPct / 100)
  if (descontoC > tetoC) {
    return { ...semDesconto, motivo: `Os pontos pagam no máximo ${String(regras.tetoPct).replace('.', ',')}% do atendimento.` }
  }
  return { pontos: pedido, desconto: reais(descontoC), restante: reais(precoC - descontoC) }
}
