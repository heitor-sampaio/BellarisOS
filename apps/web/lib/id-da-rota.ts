import { notFound } from 'next/navigation'

/**
 * O id que vem da URL (`[id]`, `[planId]`, `[mapId]`), conferido ANTES de ir
 * ao banco (D15 da simulação de 2026-10-29).
 *
 * As colunas são uuid: um id que não é uuid ("comissoes", de quem digitou
 * `/agenda/comissoes`) faz o Postgres responder 22P02, e `ler` lança — a tela
 * de erro ("A tela não conseguiu carregar") no lugar do 404. Não é falha de
 * consulta, é endereço que não existe.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ehUuid(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID.test(id)
}

/** O id da rota, ou o 404 da seção (`notFound()`) se não for um uuid. */
export function idOu404(id: string | null | undefined): string {
  if (!ehUuid(id)) notFound()
  return id
}
