/**
 * Os pontos que a equipe digita: o ajuste manual (ficha da cliente) e os
 * pontos do procedimento (o cadastro, no modo "por procedimento").
 *
 * Os dois iam até 1.000.000, recusados acima ("Valor de pontos fora do
 * limite.", "Pontos de fidelidade inválidos."). O Heitor, 25/11: "Se não for
 * impossível, ainda que improvável, pode ser feito."
 *
 * Decisão do Claude, 25/11: acima de 1.000.000 (o antigo teto) a tela avisa e
 * o servidor grava. O impossível é a fração e o registro — `p_pontos`,
 * `loyalty_transactions.points` e `procedures.loyalty_points` são `integer`:
 * até 2.147.483.647. O saldo (`saldo_de_pontos`, também `integer`) e os pontos
 * de UM pagamento se conferem no banco (migration `20261207400001`).
 *
 * Puro: a tela e o servidor leem a mesma conta.
 */
import { LIMITE_DO_INTEIRO, acimaDoRegistro, avisoAcimaDoComum } from '@/lib/acima-do-comum'

export const AJUSTE_DE_PONTOS_COMUM = 1_000_000
export const PONTOS_DO_PROCEDIMENTO_COMUNS = 1_000_000

const RECUSA_DO_REGISTRO = acimaDoRegistro(LIMITE_DO_INTEIRO, 'pontos')

/** A recusa do ajuste (positivo credita, negativo debita), ou nulo. */
export function recusaDoAjusteDePontos(pontos: number): string | null {
  if (typeof pontos !== 'number' || !Number.isFinite(pontos) || pontos === 0) return 'Informe quantos pontos creditar ou debitar.'
  if (!Number.isInteger(pontos)) return 'Os pontos são um número inteiro.'
  return Math.abs(pontos) > LIMITE_DO_INTEIRO ? RECUSA_DO_REGISTRO : null
}

/** Acima de 1.000.000 (a crédito ou a débito): avisa, e vale como está. */
export function avisoDoAjusteDePontos(pontos: number): string | null {
  return avisoAcimaDoComum(Math.abs(pontos), AJUSTE_DE_PONTOS_COMUM, 'pontos')
}

/** O campo "Pontos de fidelidade" do procedimento: vazio = sem pontos (nulo). */
export function lerPontosDoProcedimento(bruto: string): { pontos: number | null } | { erro: string } {
  const texto = bruto.trim()
  if (texto === '') return { pontos: null }
  const n = Number(texto)
  if (!Number.isInteger(n) || n < 0) return { erro: 'Os pontos de fidelidade são um número inteiro, de zero para cima.' }
  if (n > LIMITE_DO_INTEIRO) return { erro: RECUSA_DO_REGISTRO }
  return { pontos: n }
}

/** Acima de 1.000.000 pontos no procedimento: avisa, e vale como está. */
export function avisoDosPontosDoProcedimento(pontos: number): string | null {
  return avisoAcimaDoComum(pontos, PONTOS_DO_PROCEDIMENTO_COMUNS, 'pontos')
}
