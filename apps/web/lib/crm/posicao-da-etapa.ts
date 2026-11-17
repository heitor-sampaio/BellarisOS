import type { StageOutcome } from '@/lib/crm'

interface EtapaDoFunil { id: string; position: number; outcome: StageOutcome }

/**
 * Onde a etapa nova entra no funil (A28 da 20ª simulação; princípio 7): a
 * etapa recriada ia para o fim, depois de "Perdido", e só o arrastar a punha
 * no lugar. A etapa ABERTA entra antes do bloco de fechamento do fim (Ganho,
 * Perdido), que anda uma casa; a de ganho ou de perda vai para o fim. Devolve
 * a posição dela e as etapas que mudam de número (a ordem fica 0, 1, 2…).
 * Puro, para a action e o teste.
 */
export function posicaoDaEtapaNova(etapas: readonly EtapaDoFunil[], outcome: StageOutcome): { posicao: number; renumerar: { id: string; position: number }[] } {
  const emOrdem = etapas.map((e, i) => ({ e, i })).sort((a, b) => a.e.position - b.e.position || a.i - b.i).map(x => x.e)
  let corte = emOrdem.length
  if (outcome === 'OPEN') while (corte > 0 && emOrdem[corte - 1]!.outcome !== 'OPEN') corte--
  const renumerar: { id: string; position: number }[] = []
  emOrdem.forEach((e, i) => {
    const nova = i < corte ? i : i + 1
    if (e.position !== nova) renumerar.push({ id: e.id, position: nova })
  })
  return { posicao: corte, renumerar }
}
