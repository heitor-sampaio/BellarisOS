/**
 * CRM — funis, etapas e o vocabulário de resultado.
 *
 * Tipos e dados puros moram aqui porque os arquivos de action são `'use server'`
 * e só podem exportar função assíncrona: constante exportada de lá quebra o build.
 */

export type StageOutcome = 'OPEN' | 'WON' | 'LOST'

export interface CRMFunnel {
  id:          string
  name:        string
  is_default:  boolean
  position:    number
  archived_at: string | null
}

export interface CRMStage {
  id:        string
  funnel_id: string
  name:      string
  color:     string
  position:  number
  outcome:   StageOutcome
}

export const DEFAULT_FUNNEL_NAME = 'Funil de vendas'

/** Etapas que a rede recebe no primeiro acesso ao CRM. */
export const DEFAULT_STAGES: { name: string; color: string; outcome: StageOutcome }[] = [
  { name: 'Novo',       color: '#c34d6b', outcome: 'OPEN' },
  { name: 'Em contato', color: '#7c4ddb', outcome: 'OPEN' },
  { name: 'Avaliação',  color: '#c98a1e', outcome: 'OPEN' },
  { name: 'Agendado',   color: '#2563b0', outcome: 'OPEN' },
  { name: 'Fechado',    color: '#3f9b6f', outcome: 'WON'  },
  { name: 'Perdido',    color: '#9e9e9e', outcome: 'LOST' },
]

/**
 * Esqueleto de um funil novo.
 *
 * Funil criado vazio abre num quadro sem coluna nenhuma — não dá para arrastar
 * nada e não fica claro o que fazer. Estas quatro etapas são renomeáveis e
 * removíveis; servem só para a tela nascer utilizável.
 */
export const NEW_FUNNEL_STAGES: { name: string; color: string; outcome: StageOutcome }[] = [
  { name: 'Novo',         color: '#c34d6b', outcome: 'OPEN' },
  { name: 'Em andamento', color: '#7c4ddb', outcome: 'OPEN' },
  { name: 'Ganho',        color: '#3f9b6f', outcome: 'WON'  },
  { name: 'Perdido',      color: '#9e9e9e', outcome: 'LOST' },
]

export const OUTCOME_COPY: Record<StageOutcome, { label: string; hint: string }> = {
  OPEN: { label: 'Em aberto', hint: 'O lead continua em negociação.' },
  WON:  { label: 'Ganho',     hint: 'Conta como conversão deste funil.' },
  LOST: { label: 'Perdido',   hint: 'Encerra o lead sem conversão.' },
}

export const OUTCOME_VALUES: StageOutcome[] = ['OPEN', 'WON', 'LOST']

export function isStageOutcome(v: unknown): v is StageOutcome {
  return typeof v === 'string' && (OUTCOME_VALUES as string[]).includes(v)
}

/**
 * Estatística do topo do quadro, por funil.
 *
 * A conversão saía de `client_id != null` ("o lead virou cliente"). Num funil de
 * pós-venda isso nasce 100%, porque todo mundo ali já é cliente. Agora ela sai
 * das etapas marcadas como ganho — e só volta ao critério antigo em funil que
 * ainda não marcou nenhuma, para um funil recém-criado não exibir 0%.
 */
export function funnelStats(
  leads:  { crm_stage_id: string | null; client_id: string | null }[],
  stages: CRMStage[],
) {
  const won  = new Set(stages.filter(s => s.outcome === 'WON').map(s => s.id))
  const lost = new Set(stages.filter(s => s.outcome === 'LOST').map(s => s.id))
  const porResultado = won.size > 0

  const total = leads.length
  const ganhos = porResultado
    ? leads.filter(l => l.crm_stage_id !== null && won.has(l.crm_stage_id)).length
    : leads.filter(l => l.client_id !== null).length
  const perdidos = leads.filter(l => l.crm_stage_id !== null && lost.has(l.crm_stage_id)).length

  return {
    total,
    ganhos,
    perdidos,
    // Virar cliente e estar numa etapa de ganho são fatos diferentes: dá para
    // converter o lead sem arrastar o card. Como este número era o que a tela
    // mostrava antes, ele continua visível em vez de sumir na troca de critério.
    clientes: leads.filter(l => l.client_id !== null).length,
    conversao: total > 0 ? Math.round((ganhos / total) * 100) : 0,
    porResultado,
  }
}
