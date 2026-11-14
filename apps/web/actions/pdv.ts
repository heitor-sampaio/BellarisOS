'use server'

import { getTenantContext, podeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * A cliente da "Nova venda" do PDV (PDV2, a revisão do Heitor de 2026-11-13):
 * a busca pelo nome ou telefone, de quem recebe. A cliente é da rede (H5): a
 * busca é na rede inteira, e a venda é na unidade do PDV.
 */
export async function buscarClientesParaVender(termo: string): Promise<{
  clientes: { id: string; name: string; phone: string }[]
}> {
  const ctx = await getTenantContext()
  if (!podeReceber(ctx)) return { clientes: [] }
  const busca = typeof termo === 'string' ? termo.trim() : ''
  if (busca.length < 2) return { clientes: [] }
  const { data, error } = await createAdminClient().rpc('buscar_clientes', {
    p_tenant: ctx.tenantId!, p_termo: busca, p_limite: 10,
  })
  if (error) return { clientes: [] }
  return {
    clientes: ((data ?? []) as { id: string; name: string; phone: string | null }[])
      .map(c => ({ id: c.id, name: c.name, phone: c.phone ?? '' })),
  }
}
