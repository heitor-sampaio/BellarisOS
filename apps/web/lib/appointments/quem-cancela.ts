import type { TenantContext } from '@estetica-os/types'
import { can } from '@/lib/auth'

/**
 * Quem CANCELA um agendamento — e quem DESISTE no meio do atendimento.
 *
 * CLAUDE.md §11 (o Heitor, 2026-11-18: "Agenda é agenda e atendimento é
 * atendimento"; 2026-11-23: cada passo, um módulo): o módulo Atendimento
 * "inicia, conclui, desiste no meio"; a Agenda "agenda, confirma, remarca,
 * cancela e marca a falta". Cancelar o que está EM ATENDIMENTO é desistir
 * dele: pede o Atendimento em Gerenciar. O resto pede a Agenda em Gerenciar.
 * Uma regra só: a agenda, a tela do atendimento e o Copilot (`cancelarCore`)
 * decidem por ela.
 */

export const RECUSA_DESISTIR = 'Cancelar o atendimento em andamento é de quem tem o Atendimento em Gerenciar.'
export const RECUSA_CANCELAR = 'Cancelar o agendamento é de quem tem a Agenda em Gerenciar.'

export function recusaDoCancelar(
  ctx: TenantContext,
  ag: { status: string; professional_id?: string | null },
): string | null {
  if (ag.status === 'IN_PROGRESS') return can(ctx, 'atendimento', 'MANAGE') ? null : RECUSA_DESISTIR
  return can(ctx, 'agenda', 'MANAGE') ? null : RECUSA_CANCELAR
}

/** Cancela ALGUM agendamento (a porta da action e da ferramenta): a Agenda ou o Atendimento em Gerenciar. */
export function podeCancelarAlgum(ctx: TenantContext): boolean {
  return can(ctx, 'agenda', 'MANAGE') || can(ctx, 'atendimento', 'MANAGE')
}
