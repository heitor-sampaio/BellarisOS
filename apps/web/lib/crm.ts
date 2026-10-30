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
export const DEFAULT_STAGES: { name: string; color: string; outcome: StageOutcome; marca?: 'AGENDADO' }[] = [
  { name: 'Novo',       color: '#c34d6b', outcome: 'OPEN' },
  { name: 'Em contato', color: '#7c4ddb', outcome: 'OPEN' },
  { name: 'Avaliação',  color: '#c98a1e', outcome: 'OPEN' },
  { name: 'Em negociação', color: '#b0568f', outcome: 'OPEN' },
  { name: 'Agendado',   color: '#2563b0', outcome: 'OPEN', marca: 'AGENDADO' },
  { name: 'Fechado',    color: '#3f9b6f', outcome: 'WON'  },
  { name: 'Perdido',    color: '#9e9e9e', outcome: 'LOST' },
]

/**
 * A cor que a etapa nova (Configurar funis) traz marcada: a do "Novo", a da
 * marca. É DADO (a cor da etapa se grava em hex), e o <input type=color> só
 * aceita hex — com "var(--brand)" o navegador o trocava por preto (2026-10-22).
 */
export const COR_DA_ETAPA_NOVA = DEFAULT_STAGES[0]!.color

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
  WON:  { label: 'Ganho',     hint: 'Fecha a oportunidade como ganha: é ela que conta na conversão do funil.' },
  LOST: { label: 'Perdido',   hint: 'Encerra o lead sem conversão.' },
}

export const OUTCOME_VALUES: StageOutcome[] = ['OPEN', 'WON', 'LOST']

export function isStageOutcome(v: unknown): v is StageOutcome {
  return typeof v === 'string' && (OUTCOME_VALUES as string[]).includes(v)
}
