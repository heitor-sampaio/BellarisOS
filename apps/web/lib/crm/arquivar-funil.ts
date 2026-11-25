/**
 * Arquivar um funil com oportunidades (A3 da 30ª simulação; decisão do Claude
 * 4, 25/11 — OP-15 por analogia, princípio 7): pergunta antes e diz quantas
 * oportunidades ficam nele e que elas saem do quadro e dos relatórios. Não
 * recusa: arquivar é da rede. Funil vazio arquiva sem pergunta. Puro: a tela e
 * o teste usam.
 */
export function perguntaAoArquivarFunil(nome: string, n: { total: number; abertas: number }): string | null {
  if (n.total <= 0) return null
  if (n.total === 1) {
    return `Arquivar o funil “${nome}”? A oportunidade dele${n.abertas > 0 ? ' (aberta)' : ''} sai do quadro e dos relatórios. Reativar o funil a traz de volta.`
  }
  const abertas = n.abertas === n.total ? ' (todas abertas)'
    : n.abertas > 0 ? ` (${n.abertas === 1 ? '1 aberta' : `${n.abertas} abertas`})` : ''
  return `Arquivar o funil “${nome}”? As ${n.total} oportunidades dele${abertas} saem do quadro e dos relatórios. Reativar o funil as traz de volta.`
}
