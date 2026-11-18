import type { TenantContext } from '@estetica-os/types'
import { can, isOwnScope } from '@/lib/auth'

/**
 * Quem CANCELA um agendamento — e quem DESISTE no meio do atendimento.
 *
 * CLAUDE.md §11 (o Heitor, 2026-11-18: "Agenda é agenda e atendimento é
 * atendimento"): o módulo Atendimento "inicia, conclui, desiste no meio"; a
 * Agenda "agenda, confirma, remarca, cancela e marca a falta". Cancelar o que
 * está EM ATENDIMENTO é desistir dele: pede o Atendimento em Gerenciar, com o
 * escopo dele (e o "só os meus" da Agenda, que é o de VER o atendimento — como
 * no iniciar e no concluir). O resto pede a Agenda em Gerenciar, com o "só os
 * meus" dela (agenda-06). Uma regra só: a agenda, a tela do atendimento e o
 * Copilot (`cancelarCore`) decidem por ela.
 */

export const RECUSA_DESISTIR = 'Desistir do atendimento em andamento é de quem tem o Atendimento em Gerenciar.'
export const RECUSA_CANCELAR = 'Cancelar o agendamento é de quem tem a Agenda em Gerenciar.'
const DE_OUTRA_PESSOA = 'Este agendamento é de outro profissional.'

const deOutra = (ctx: TenantContext, professionalId: string | null | undefined) =>
  !ctx.internalUserId || professionalId !== ctx.internalUserId

export function recusaDoCancelar(
  ctx: TenantContext,
  ag: { status: string; professional_id: string | null | undefined },
): string | null {
  if (ag.status === 'IN_PROGRESS') {
    if (!can(ctx, 'atendimento', 'MANAGE')) return RECUSA_DESISTIR
    if ((isOwnScope(ctx, 'atendimento') || isOwnScope(ctx, 'agenda')) && deOutra(ctx, ag.professional_id)) return DE_OUTRA_PESSOA
    return null
  }
  if (!can(ctx, 'agenda', 'MANAGE')) return RECUSA_CANCELAR
  if (isOwnScope(ctx, 'agenda') && deOutra(ctx, ag.professional_id)) return DE_OUTRA_PESSOA
  return null
}

/** Cancela ALGUM agendamento (a porta da action e da ferramenta): a Agenda ou o Atendimento em Gerenciar. */
export function podeCancelarAlgum(ctx: TenantContext): boolean {
  return can(ctx, 'agenda', 'MANAGE') || can(ctx, 'atendimento', 'MANAGE')
}
