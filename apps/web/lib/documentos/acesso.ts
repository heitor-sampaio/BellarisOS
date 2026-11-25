import { can, podeReceber, temRecurso } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import type { TenantContext } from '@estetica-os/types'

/**
 * Quem vê e quem colhe os documentos da cliente — a decisão do Heitor de
 * 2026-11-16: "A permissão de gerenciar documentos serve para alguém poder
 * criar/editar/excluir os modelos de documentos. É uma proteção para que os
 * documentos não sejam modificados por quem não deve. Um
 * procedimento/plano/pacote que tenha documentos que precisam de assinatura,
 * os documentos precisam ser assinados. É só uma questão de disponibilizar
 * para o cliente assinar e isso não representa risco."
 *
 * O módulo `documents` virou o dos MODELOS. Ver e colher não pedem permissão
 * de documento: a trava de cada documento continua sendo chegar a ele
 * (`documentoAoAlcance`: a rede, a unidade ao alcance e, com o prontuário "só
 * os meus", a cliente que ela atende). Os documentos são funcionalidade do
 * PLANO da rede (`documentos`): fora dele, nada disto abre.
 */

/** Vê os documentos da cliente (a aba da ficha, o painel, a trilha): quem vê a cliente. */
export function veOsDocumentos(ctx: TenantContext): boolean {
  return !ctx.isClient && temRecurso(ctx, 'documentos') && can(ctx, 'clients', 'VIEW')
}

/**
 * Colhe a assinatura: quem está com a cliente na tela em que ela é pedida — a
 * ficha (Clientes em Ver), a tela do atendimento (o Atendimento em Ver, que a
 * abre desde a UM1 — o Heitor, 2026-11-23), a janela do agendamento (a Agenda)
 * e a venda e o recebimento (quem recebe, `podeReceber`). Na tela, no papel,
 * pelo link, pela conversa, pelo app, montar de novo, revogar o link, o
 * pagamento do contrato. O Prontuário em Ver sozinho não abre nenhuma dessas
 * telas, e saiu (DQ-06 do catálogo de Documentos, 24/11). A vista pessoal só
 * mostra: não colhe.
 */
export function colheOsDocumentos(ctx: TenantContext): boolean {
  if (ctx.isClient || !temRecurso(ctx, 'documentos')) return false
  return can(ctx, 'clients', 'VIEW') || can(ctx, 'atendimento', 'VIEW') || can(ctx, 'agenda', 'VIEW') || podeReceber(ctx)
}

export function assertColheOsDocumentos(ctx: TenantContext): void {
  if (!colheOsDocumentos(ctx)) throw semAcesso()
}

/**
 * Dispensar um documento obrigatório (com motivo) é de quem responde pelos
 * modelos — é o "excluir" da frase do Heitor, o único jeito de uma assinatura
 * exigida deixar de ser colhida.
 */
export function dispensaDocumentos(ctx: TenantContext): boolean {
  return !ctx.isClient && temRecurso(ctx, 'documentos') && can(ctx, 'documents', 'MANAGE')
}

export function assertVeOsDocumentos(ctx: TenantContext): void {
  if (!veOsDocumentos(ctx)) throw semAcesso()
}
