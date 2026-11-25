import { acimaDoRegistro } from '@/lib/acima-do-comum'

/**
 * O dinheiro que o REGISTRO guarda (o Heitor, 25/11: "Se não for impossível,
 * ainda que improvável, pode ser feito."). O impossível é o tipo da coluna
 * (decisão do Claude, 25/11): `financial_transactions.amount` e
 * `products.cost_price` são numeric(10,2) — até 99.999.999,99. Acima disso o
 * banco respondia "numeric field overflow", em inglês, e a tela mostrava.
 * Puro: o núcleo do lançamento, o da entrada de estoque, a action e o Copilot
 * leem daqui.
 */

/** numeric(10,2): `financial_transactions.amount` e `products.cost_price`. */
export const LIMITE_DO_DINHEIRO = 99_999_999.99

export const RECUSA_DO_DINHEIRO = acimaDoRegistro(LIMITE_DO_DINHEIRO, 'reais')

/**
 * O número passa do que a coluna numeric(p, `casas`) guarda, contado como o
 * BANCO conta: o texto que vai a ele (o mesmo do JSON) arredondado em `casas`
 * (metade para cima) — 99.999.999,994 cabe em numeric(10,2); 99.999.999,995
 * vira 100.000.000,00 e não cabe. Pelo texto, e não por `valor * 100`: a conta
 * em ponto flutuante arredondaria o ,995 para baixo, e o banco, para cima.
 */
export function passaDoRegistro(valor: number, limite: number, casas: number): boolean {
  if (!Number.isFinite(valor)) return false
  const emCasas = (n: number): bigint => {
    const texto = Math.abs(n).toString()
    if (/e/i.test(texto)) return BigInt(Math.round(Math.abs(n) * 10 ** casas))
    const [inteira = '0', fracao = ''] = texto.split('.')
    const cheia = (fracao + '0'.repeat(casas + 1)).slice(0, casas + 1)
    const base = BigInt(inteira) * BigInt(10) ** BigInt(casas) + BigInt(cheia.slice(0, casas) || '0')
    return Number(cheia[casas]) >= 5 ? base + BigInt(1) : base
  }
  return emCasas(valor) > emCasas(limite)
}

/** A recusa do valor que o registro não guarda (para mais ou para menos), ou `null`. */
export function recusaDoDinheiroAcimaDoRegistro(valor: number): string | null {
  return passaDoRegistro(valor, LIMITE_DO_DINHEIRO, 2) ? RECUSA_DO_DINHEIRO : null
}
