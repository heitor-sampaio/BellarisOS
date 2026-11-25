import type { LeadChange, LeadEventType } from '@/lib/lead-events'

/**
 * O que a linha do tempo do card lê do `changes` gravado (D11 da 30ª
 * simulação; crm-inbox:OP-09, "a linha do tempo diz de quem para quem";
 * OP-26, "a linha do tempo guarda o histórico" da perda). Puro: a tela e o
 * teste usam. O de → para vem de `trocarResponsavelCore`, e o motivo, de
 * `camposDaPerda` — os dois já gravavam, e a tela não mostrava.
 */
type Evento = { type: LeadEventType; changes: LeadChange[] | null }

const SEM_RESPONSAVEL = 'Sem responsável'

/** "Cássia → Denílson" (o vazio é "Sem responsável"); o evento antigo, sem o registro, nulo. */
export function trocaDoResponsavel(e: Evento): { de: string; para: string } | null {
  if (e.type !== 'OWNER_CHANGED') return null
  const c = e.changes?.find(x => x.campo === 'Responsável')
  if (!c) return null
  return { de: c.de || SEM_RESPONSAVEL, para: c.para || SEM_RESPONSAVEL }
}

/** O motivo da perda (com a observação) gravado no movimento à etapa perdida. */
export function motivoDaPerdaNoEvento(e: Evento): string | null {
  if (e.type !== 'STAGE_CHANGED') return null
  return e.changes?.find(x => x.campo === 'Motivo da perda')?.para ?? null
}
