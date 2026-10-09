import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { registrarEventoLead } from '@/lib/lead-events'

/**
 * O RESPONSÁVEL da oportunidade (`leads.owner_id`) — o núcleo que a tela (o
 * modal do lead) e a automação "Definir responsável" dividem (2026-10-09).
 * Antes só a automação trocava, e a linha do tempo dizia "de: —" sempre.
 *
 * Na tela e no histórico é "Responsável", nunca "Dono" (decisão do Heitor):
 * o código segue `owner`.
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * Quem troca o responsável: CRM em Gerenciar com escopo "todos". O "só os
 * meus" vê, mas não troca — passar o card a outra pessoa o tiraria do próprio
 * alcance, e pegar o de outra pessoa é exatamente o que o escopo impede.
 */
export function podeTrocarResponsavel(ctx: TenantContext): boolean {
  return can(ctx, 'crm', 'MANAGE') && !isOwnScope(ctx, 'crm')
}

export type ResultadoDaTroca =
  | { trocado: true; de: string | null; para: string | null }
  | { trocado: false; motivo?: string }

/**
 * Troca o responsável e grava na linha do tempo DE quem PARA quem.
 *
 * A pessoa tem de ser da rede E ativa (membro desativado não opera, e um card
 * com ele de responsável sumiria de todos os "só os meus"). `null` tira o
 * responsável. Sem mudança, não grava nada.
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

  await gravar(admin
    .from('leads').update({ owner_id: usuarioId }).eq('id', leadId).eq('tenant_id', tenantId),
  'trocar o responsável')

  await registrarEventoLead({
    tenantId, leadId, type: 'OWNER_CHANGED',
    actorUserId: autor.actorUserId ?? null,
    actorName:   autor.actorName ?? null,
    changes:     [{ campo: 'Responsável', de: nomeAntes, para: nomeDepois }],
  })
  return { trocado: true, de: nomeAntes, para: nomeDepois }
}
