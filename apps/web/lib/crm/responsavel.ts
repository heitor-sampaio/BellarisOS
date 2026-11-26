import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O RESPONSÁVEL da oportunidade (`leads.owner_id`) — o núcleo que a tela (o
 * modal do lead) e a automação "Definir responsável" dividem (2026-10-09).
 * Antes só a automação trocava, e a linha do tempo dizia "de: —" sempre.
 *
 * Na tela e no histórico é "Responsável", nunca "Dono" (decisão do Heitor):
 * o código segue `owner`.
 */

type Admin = ReturnType<typeof createAdminClient>

/** Quem troca o responsável: CRM em Gerenciar. */
export function podeTrocarResponsavel(ctx: TenantContext): boolean {
  return can(ctx, 'crm', 'MANAGE')
}

export type ResultadoDaTroca =
  | { trocado: true; de: string | null; para: string | null }
  | { trocado: false; motivo?: string }

/**
 * Troca o responsável e grava na linha do tempo DE quem PARA quem.
 *
 * A pessoa tem de ser da rede E ativa (membro desativado não opera). `null`
 * tira o responsável. Sem mudança, não grava nada.
 */
export async function trocarResponsavelCore(
  admin: Admin,
  tenantId: string,
  leadId: string,
  usuarioId: string | null,
  autor: { actorUserId?: string | null; actorName?: string | null },
): Promise<ResultadoDaTroca> {
  const lead = await ler(admin
    .from('leads').select('owner_id, users(name)')
    .eq('id', leadId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a oportunidade')
  if (!lead) return { trocado: false, motivo: 'Oportunidade não encontrada.' }

  const atual = (lead as { owner_id: string | null }).owner_id
  if (atual === usuarioId) return { trocado: false }
  const embed = (lead as unknown as { users: { name: string } | { name: string }[] | null }).users
  const nomeAntes = (Array.isArray(embed) ? embed[0]?.name : embed?.name) ?? null

  let nomeDepois: string | null = null
  if (usuarioId) {
    const membro = await ler(admin
      .from('users').select('name, is_active')
      .eq('id', usuarioId).eq('tenant_id', tenantId).maybeSingle(), 'buscar o responsável')
    if (!membro) return { trocado: false, motivo: 'Pessoa não encontrada nesta rede.' }
    if (!(membro as { is_active: boolean }).is_active) return { trocado: false, motivo: 'Esta pessoa está desativada.' }
    nomeDepois = (membro as { name: string }).name
  }

  // A troca e o evento da linha do tempo numa transação só (o app calcula, uma
  // função grava): eram duas gravações, e o responsável novo aparecia antes do
  // "de X para Y" (migration 20261210600001).
  const gravou = await ler(admin.rpc('lead_trocar_responsavel', {
    p_tenant:     tenantId,
    p_lead:       leadId,
    p_usuario:    usuarioId,
    p_actor_user: autor.actorUserId ?? null,
    p_actor_name: autor.actorName ?? null,
    p_changes:    [{ campo: 'Responsável', de: nomeAntes, para: nomeDepois }],
  }), 'trocar o responsável')
  if (!gravou) return { trocado: false, motivo: 'Oportunidade não encontrada.' }
  return { trocado: true, de: nomeAntes, para: nomeDepois }
}
