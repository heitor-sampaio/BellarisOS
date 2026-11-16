/**
 * O motivo da perda no card (A17 da 18ª simulação): na coluna de perda, o
 * card não dizia por que se perdeu — o filtro "Motivo da perda" existia, e o
 * card, calado. Só na etapa de desfecho perdido; a observação vai junto (o
 * title do card a mostra inteira). Puro: o quadro e o teste dividem.
 */
export function perdaNoCard(
  lead: { crm_stage_id?: string | null; crm_motivos_perda?: { nome: string } | null; motivo_perda_obs?: string | null },
  etapas: readonly { id: string; outcome?: string | null }[],
): { texto: string; obs: string | null } | null {
  const etapa = etapas.find(s => s.id === lead.crm_stage_id)
  if (etapa?.outcome !== 'LOST') return null
  const motivo = lead.crm_motivos_perda?.nome?.trim()
  return { texto: `Perdida: ${motivo || 'sem motivo informado'}`, obs: lead.motivo_perda_obs?.trim() || null }
}
