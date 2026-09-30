'use server'

/**
 * O que o cliente já pagou e ainda tem para agendar (fase 3 de "Vender",
 * 2026-09-30): unidades de procedimento pré-pago e sessões de pacote. Lido
 * pelos dois lugares que agendam — a agenda e o inbox (CRM).
 *
 * Todo export é endpoint público: confere permissão e a rede do cliente.
 */

import { getTenantContext, can } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { creditosDoCliente, type CreditoParaAgendar } from '@/lib/creditos/credito'

export async function creditosParaAgendar(clientId: string): Promise<CreditoParaAgendar[]> {
  const ctx = await getTenantContext()
  if (!can(ctx, 'agenda', 'MANAGE') && !can(ctx, 'crm', 'MANAGE')) throw semAcesso()
  if (typeof clientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientId)) return []
  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('id').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente')
  if (!cliente) return []
  return creditosDoCliente(admin, ctx.tenantId!, clientId)
}
