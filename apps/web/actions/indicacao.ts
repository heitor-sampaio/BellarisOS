'use server'

import { getTenantContext, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * "Indicada por" (decisão do Heitor, 2026-11-10): a busca da ficha de quem
 * indicou, pelo nome ou pelo telefone — as fichas ATIVAS da clínica, pela regra
 * da busca de sempre (`buscar_clientes`). É de quem cadastra cliente: o Novo
 * cliente e a aba Dados (Clientes em Gerenciar) e o Agendar com cliente nova
 * (a Agenda em Gerenciar). A ficha escolhida é conferida de novo ao gravar.
 */
export async function buscarQuemIndicou(termo: string, excetoId?: string | null): Promise<{ id: string; nome: string; telefone: string }[]> {
  const ctx = await getTenantContext()
  if (!can(ctx, 'clients', 'MANAGE') && !can(ctx, 'agenda', 'MANAGE')) return []
  const busca = typeof termo === 'string' ? termo.trim() : ''
  if (busca.length < 2) return []
  const { data, error } = await createAdminClient().rpc('buscar_clientes', { p_tenant: ctx.tenantId!, p_termo: busca, p_limite: 8 })
  if (error) return []
  return ((data ?? []) as { id: string; name: string; phone: string | null }[])
    .filter(c => c.id !== excetoId)
    .map(c => ({ id: c.id, nome: c.name, telefone: c.phone ?? '' }))
}
