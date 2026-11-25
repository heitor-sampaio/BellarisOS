import { LIMITE_DO_INTEIRO, avisoAcimaDoComum, acimaDoRegistro } from '@/lib/acima-do-comum'

/**
 * O "No máximo" e as tags do passo "Buscar clientes" — uma regra só para a
 * tela, a validação, a prévia (`contarBuscaDeClientes`, `contarAntesDeLigar`)
 * e o motor (`buscarClientes`).
 *
 * O princípio 2 (o Heitor, 25/11: "Se não for impossível, ainda que
 * improvável, pode ser feito.") e o 3 (o que a tela mostra é o que vale na
 * conta): a prévia e o motor cortavam o "No máximo" em 500 e as tags em 50,
 * calados, e o passo dizia "O teto de 2000 cortou a lista" com 500. Agora vale
 * o número gravado. Acima de 500 (o comum, o antigo teto) a tela avisa; só o
 * impossível se recusa — zero, negativo, fracionário e acima do que o registro
 * guarda (o grafo é jsonb, e o número é lido como o `integer` do Postgres).
 * Decisão do Claude, 25/11.
 */

/** O que vale sem valor gravado — é o que a tela mostra no campo. */
export const LIMITE_PADRAO_DA_BUSCA = 200
/** O comum: acima disto a tela avisa (o antigo teto calado). */
export const LIMITE_COMUM_DA_BUSCA = 500

/** O "No máximo" gravado, ou a recusa do impossível. */
export function conferirLimiteDaBusca(valor: unknown): { limite: number } | { recusa: string } {
  if (valor === undefined || valor === null || valor === '') return { limite: LIMITE_PADRAO_DA_BUSCA }
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return { recusa: 'O "No máximo" precisa ser maior que zero.' }
  if (!Number.isInteger(n)) return { recusa: 'O "No máximo" é um número inteiro de clientes.' }
  if (n > LIMITE_DO_INTEIRO) return { recusa: acimaDoRegistro(LIMITE_DO_INTEIRO, 'clientes') }
  return { limite: n }
}

/** O aviso ao lado do campo, acima do comum — ou `null`. */
export function avisoDoLimiteDaBusca(valor: unknown): string | null {
  const r = conferirLimiteDaBusca(valor)
  return 'limite' in r ? avisoAcimaDoComum(r.limite, LIMITE_COMUM_DA_BUSCA, 'clientes') : null
}

/**
 * As tags do filtro, todas: vão no corpo da função do banco
 * (`clientes_do_publico`, POST), sem limite de URL nem de `in (...)`.
 */
export function tagsDaBusca(valor: unknown): string[] | undefined {
  return Array.isArray(valor) ? valor.filter((t): t is string => typeof t === 'string') : undefined
}
