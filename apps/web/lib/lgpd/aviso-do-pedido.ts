import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUser } from '@/lib/notifications/notify'
import { ler } from '@/lib/db'
import { adminsDaRede } from '@/lib/equipe/admin-da-rede'
import { prazoDeResposta } from '@/lib/lgpd/prazo'

type Admin = ReturnType<typeof createAdminClient>

/** Onde a clínica responde ao pedido: a aba LGPD de Configurações, no portal da rede. */
export const CAMINHO_DA_ABA_LGPD = '/admin/settings?tab=lgpd'

/**
 * Quem responde ao pedido de dados: quem abre a aba LGPD — Configurações em
 * Gerenciar, da clínica toda (a aba é do portal da rede) — e a Admin da rede
 * (o cargo de sistema, que tem tudo).
 */
async function quemResponde(admin: Admin, tenantId: string): Promise<string[]> {
  const cargos = await ler(admin.from('role_permissions').select('role_id')
    .eq('tenant_id', tenantId).eq('module', 'settings').eq('level', 'MANAGE'), 'listar os cargos que respondem à LGPD') as { role_id: string }[] | null
  const roleIds = (cargos ?? []).map(c => c.role_id)
  const comConfig = roleIds.length ? (await ler(admin.from('users').select('id')
    .eq('tenant_id', tenantId).eq('is_active', true).is('branch_id', null).in('role_id', roleIds),
  'listar quem responde à LGPD') as { id: string }[] | null ?? []).map(u => u.id) : []
  const admins = await adminsDaRede(admin, tenantId)
  const ativos = admins.size ? (await ler(admin.from('users').select('id')
    .eq('tenant_id', tenantId).eq('is_active', true).in('id', [...admins]), 'as Admins ativas') as { id: string }[] | null ?? []).map(u => u.id) : []
  return [...new Set([...comConfig, ...ativos])]
}

/**
 * A49 da 9ª simulação (2026-11-07): o pedido de dados feito pelo APP avisa a
 * clínica no sino — a Beatriz o procurou na ficha e no sino, e ele estava em
 * Configurações → LGPD. O aviso diz o prazo (15 dias) e abre a aba. Nunca
 * lança (fire-and-forget, no `after()`).
 */
export async function avisarPedidoDaCliente(pedidoId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const pedido = await ler(admin.from('lgpd_requests')
      .select('tenant_id, requested_at, include_medical, clients(name)').eq('id', pedidoId).maybeSingle(),
    'ler o pedido de dados') as { tenant_id: string; requested_at: string; include_medical: boolean; clients: { name: string } | null } | null
    if (!pedido) return
    const nome = pedido.clients?.name ?? 'Uma cliente'
    const ids = await quemResponde(admin, pedido.tenant_id)
    await Promise.allSettled(ids.map(id => notifyUser(admin, id, {
      type: 'lgpd.pedido',
      title: `Pedido de dados (LGPD): ${nome}`,
      body: `${nome} pediu os dados dela pelo app${pedido.include_medical ? ', com o prontuário (a parte do prontuário espera a liberação da clínica)' : ''}. Responder até ${prazoDeResposta(pedido.requested_at, true)} (15 dias do pedido), em Configurações → LGPD.`,
      data: { pedidoId, caminho: CAMINHO_DA_ABA_LGPD },
    })))
  } catch (e) {
    console.error('[avisarPedidoDaCliente]', e)
  }
}

/**
 * O pedido do app da cliente, para a ficha (A49): o em aberto (em preparo, ou o
 * prontuário esperando a clínica) — quando e até quando responder —, ou o
 * último dos 30 dias (a validade do pacote), já entregue.
 */
export async function pedidoLgpdEmAberto(tenantId: string, clientId: string): Promise<{ pedidoEm: string; prazo: string; aberto: boolean } | null> {
  const linhas = await ler(createAdminClient().from('lgpd_requests')
    .select('requested_at, status, include_medical, medical_status')
    .eq('tenant_id', tenantId).eq('client_id', clientId).eq('type', 'export').neq('requested_via', 'equipe')
    .order('requested_at', { ascending: false }).limit(5), 'ler o pedido de dados da cliente') as
    { requested_at: string; status: string; include_medical: boolean; medical_status: string }[] | null
  const aberto = (linhas ?? []).find(r => ['pending', 'processing'].includes(r.status) || (r.include_medical && r.medical_status === 'pending'))
  if (aberto) return { pedidoEm: aberto.requested_at, prazo: prazoDeResposta(aberto.requested_at, true), aberto: true }
  const recente = (linhas ?? []).find(r => Date.now() - new Date(r.requested_at).getTime() < 30 * 86_400_000)
  return recente ? { pedidoEm: recente.requested_at, prazo: prazoDeResposta(recente.requested_at, true), aberto: false } : null
}

/** O aviso da ficha (A49): o pedido em aberto e, a quem responde, o caminho da aba. */
export async function pedidoLgpdDaFicha(
  ctx: { tenantId: string | null; branchId: string | null; permissions: Record<string, string> }, clientId: string,
): Promise<{ pedidoEm: string; prazo: string; aberto: boolean; caminho: string | null } | null> {
  const p = ctx.tenantId ? await pedidoLgpdEmAberto(ctx.tenantId, clientId) : null
  if (!p) return null
  const responde = ctx.branchId === null && ctx.permissions.settings === 'MANAGE'
  return { ...p, caminho: responde ? CAMINHO_DA_ABA_LGPD : null }
}
