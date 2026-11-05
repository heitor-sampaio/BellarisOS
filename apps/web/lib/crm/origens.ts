import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * As origens do lead são da CLÍNICA (A14 da 7ª simulação, 2026-11-05;
 * princípio 1): `crm_origens`, editada em "Configurar funis" como os motivos
 * de perda, nasce com as de LEAD_SOURCES. `leads.source` guarda o NOME —
 * desativar tira da escolha sem mexer em quem já tem; a origem do anúncio
 * (Meta Ads, Google Ads) segue vindo da atribuição.
 */
export interface OrigemDoLead { id: string; nome: string; ativo: boolean }

export async function origensDaRede(admin: Admin, tenantId: string, incluirInativas = false): Promise<OrigemDoLead[]> {
  let q = admin.from('crm_origens').select('id, nome, ativo').eq('tenant_id', tenantId)
  if (!incluirInativas) q = q.eq('ativo', true)
  return ((await ler(q.order('posicao').order('nome'), 'carregar as origens do lead')) ?? []) as OrigemDoLead[]
}
