import { formatBRL } from '@estetica-os/utils'

/**
 * O que a tela de cobrança diz quando a forma é o CRÉDITO NA CLÍNICA (A36 da
 * 8ª simulação, 2026-11-06; princípio 3): "Crédito interno" não mostrava o
 * saldo da cliente nem o que sobra. O saldo é o do banco
 * (`getCreditoInternoDoCliente`, a conta da ficha); aqui só a subtração em
 * centavos para o texto. Sem saldo que cubra, o banco recusa o pagamento
 * (`trg_credito_interno_uso`) — a tela avisa antes.
 */
export function textoDoSaldoDoCredito(saldo: number, valor: number): { texto: string; cobre: boolean } {
  const s = Math.round(saldo * 100)
  const v = Math.round(Math.max(valor, 0) * 100)
  if (s <= 0) return { texto: 'A cliente não tem crédito na clínica: o pagamento com crédito é recusado.', cobre: false }
  if (v > s) {
    return { texto: `Crédito na clínica: ${formatBRL(s / 100)} — não cobre ${formatBRL(v / 100)} (faltam ${formatBRL((v - s) / 100)}); o pagamento com crédito é recusado.`, cobre: false }
  }
  return { texto: `Crédito na clínica: ${formatBRL(s / 100)} · depois deste pagamento: ${formatBRL((s - v) / 100)}`, cobre: true }
}
