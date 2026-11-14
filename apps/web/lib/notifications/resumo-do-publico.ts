/**
 * Os filtros do público de uma campanha, em português (A15 da 7ª simulação,
 * 2026-11-05: o "Revisar" mostrava só "0 clientes", sem dizer que o filtro era
 * a tag VIP — e a Camila não sabia por quê). O mesmo vale para o que a tela
 * mostra e para o que o disparo usa (`AudienceRules`).
 */
export interface RegrasDoPublico {
  genders?: ('M' | 'F' | 'O')[]
  procedure_ids?: string[]
  tags?: string[]
  has_app_account?: boolean
  max_days_since_visit?: number
  min_visits?: number
}

const SEXO: Record<'M' | 'F' | 'O', string> = { F: 'feminino', M: 'masculino', O: 'outro' }

export function filtrosDoPublico(
  regras: RegrasDoPublico,
  nomes: { procedimentos?: { id: string; name: string }[] } = {},
): string[] {
  const nomeDe = (lista: { id: string; name: string }[] | undefined, id: string) => lista?.find(x => x.id === id)?.name ?? 'removido'
  const saida: string[] = []
  if (regras.tags?.length) saida.push(`Tags: ${regras.tags.join(', ')}`)
  if (regras.genders?.length) saida.push(`Sexo: ${regras.genders.map(g => SEXO[g]).join(', ')}`)
  if (regras.procedure_ids?.length) saida.push(`Fez: ${regras.procedure_ids.map(id => nomeDe(nomes.procedimentos, id)).join(', ')}`)
  if (regras.max_days_since_visit) saida.push(`Sem visita há mais de ${regras.max_days_since_visit} dias`)
  if (regras.min_visits) saida.push(`Com ao menos ${regras.min_visits} ${regras.min_visits === 1 ? 'visita' : 'visitas'}`)
  if (regras.has_app_account) saida.push('Só quem tem o app')
  return saida
}
