/**
 * A etapa "agendado" do funil, achada pela MARCA (`crm_stages.marca`), nunca
 * pelo nome — a clínica renomeia etapa. Agendar uma cliente com oportunidade
 * aberta leva o card até ela (A12, 2026-10-27).
 */
export const MARCA_AGENDADO = 'AGENDADO'

export interface EtapaDoFunil { id: string; position: number; outcome: string; marca: string | null }

/**
 * Para onde o card vai quando a cliente é agendada, ou null para não mexer:
 * funil sem etapa marcada, card que já está nela ou já passou dela (nunca
 * recua), e card de desfecho (ganho ou perdido não é "em aberto").
 */
export function etapaParaAgendar(etapas: EtapaDoFunil[], atualId: string): string | null {
  const alvo  = etapas.filter(x => x.marca === MARCA_AGENDADO && x.outcome === 'OPEN').sort((a, b) => a.position - b.position)[0]
  const atual = etapas.find(x => x.id === atualId)
  if (!alvo || !atual || atual.outcome !== 'OPEN') return null
  return atual.position < alvo.position ? alvo.id : null
}
