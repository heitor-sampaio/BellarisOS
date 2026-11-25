/**
 * O princípio 2 (o Heitor, 2026-11-04): "Não recusar o valor que a rede
 * escolheu (taxa, percentual, preço, prazo): no máximo, avisar. Só o que é
 * impossível (negativo, a rede errada, sem permissão) é recusado."
 *
 * Os campos de configuração recusam só o impossível — negativo, zero onde não
 * cabe, fracionário, acima de 100%, ou acima do que a coluna do banco GUARDA
 * (o "limite do registro", como a taxa de 999,99%). Acima do comum, a tela
 * avisa e o servidor grava (decisão do Claude, 25/11: o "comum" é o antigo
 * teto de cada campo).
 */

/** O maior `integer` do Postgres. */
export const LIMITE_DO_INTEIRO = 2_147_483_647
/** O maior `smallint` do Postgres (os prazos em dias e o limite do crediário). */
export const LIMITE_DO_INTEIRO_CURTO = 32_767
/** O maior `numeric(12,4)` inteiro (os pontos por real, o valor do ponto). */
export const LIMITE_DO_DECIMAL = 99_999_999

/**
 * Os prazos que viram DATA (a validade dos pontos e do voucher, o aviso antes
 * de vencer): até 100 anos — acima disso a conta da data estoura no banco, e o
 * erro só apareceria no dia do resgate (decisão do Claude, 25/11).
 */
export const LIMITE_DE_DIAS = 36_500
export const LIMITE_DE_MESES = 1_200

const numero = (n: number) => n.toLocaleString('pt-BR')

/** "Acima do comum (mais de 120 meses). Confira: o valor vale como está." — ou `null`. */
export function avisoAcimaDoComum(valor: number, comum: number, unidade: string): string | null {
  return Number.isFinite(valor) && valor > comum
    ? `Acima do comum (mais de ${numero(comum)} ${unidade}). Confira: o valor vale como está.`
    : null
}

/** A recusa de quem passa do que o registro guarda. */
export function acimaDoRegistro(limite: number, unidade: string): string {
  return `No máximo ${numero(limite)} ${unidade} (o limite do registro).`
}

/** A recusa do prazo que vira data acima de 100 anos. */
export function acimaDeCemAnos(limite: number, unidade: string): string {
  return `No máximo ${numero(limite)} ${unidade} (100 anos, o limite das datas).`
}
