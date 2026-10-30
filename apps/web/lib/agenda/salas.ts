/**
 * As salas da unidade e o procedimento (D5, decisão do Heitor, 2026-10-30).
 *
 * A regra é UMA, pura, e vale para a tela (o que o agendar oferece) e para o
 * servidor (o que ele aceita):
 * - o procedimento pode ser ligado às salas em que é feito (`procedure_rooms`);
 * - a ligação é OPCIONAL e conta por UNIDADE: sem nenhuma sala ligada a ele
 *   NESTA unidade, qualquer sala ativa dela serve;
 * - com sala ligada aqui, só as ligadas.
 */

export interface SalaComId { id: string }

/** As salas (ativas) da unidade que servem ao procedimento. */
export function salasParaOProcedimento<T extends SalaComId>(salasDaUnidade: T[], ligadasAoProcedimento: Iterable<string>): T[] {
  const ligadas = new Set(ligadasAoProcedimento)
  const daqui = salasDaUnidade.filter(s => ligadas.has(s.id))
  return daqui.length ? daqui : salasDaUnidade
}

/** A sala serve ao procedimento nesta unidade? (A sala precisa estar entre as da unidade.) */
export function salaServeAoProcedimento(salaId: string, salasDaUnidade: SalaComId[], ligadasAoProcedimento: Iterable<string>): boolean {
  return salasParaOProcedimento(salasDaUnidade, ligadasAoProcedimento).some(s => s.id === salaId)
}

/** A sala sugerida: a primeira livre, na ordem em que a tela as mostra. */
export function salaSugerida(salas: { id: string; livre: boolean }[]): string | null {
  return salas.find(s => s.livre)?.id ?? null
}

export const NOME_DE_SALA_MAX = 60

/** O nome que a tela mandou, limpo — ou a recusa em português. */
export function nomeDeSala(texto: unknown): { nome: string } | { erro: string } {
  const nome = typeof texto === 'string' ? texto.replace(/\s+/g, ' ').trim() : ''
  if (!nome) return { erro: 'Dê um nome à sala.' }
  if (nome.length > NOME_DE_SALA_MAX) return { erro: `O nome da sala tem no máximo ${NOME_DE_SALA_MAX} caracteres.` }
  return { nome }
}
