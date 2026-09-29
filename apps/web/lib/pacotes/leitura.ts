import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { PacoteAVenda } from '@/components/shared/vender-pacote'

/** O catálogo de pacotes: da rede (e os da unidade, quando houver). */
export async function catalogoDePacotes(tenantId: string, opcoes: { branchId?: string | null; soAtivos?: boolean } = {}) {
  let q = createAdminClient().from('service_packages')
    .select('id, name, price, total_sessions, validity_days, is_active, procedure_id, procedures(name)')
    .eq('tenant_id', tenantId)
  if (opcoes.soAtivos) q = q.eq('is_active', true)
  if (opcoes.branchId) q = q.or(`branch_id.is.null,branch_id.eq.${opcoes.branchId}`)
  const linhas = await ler(q.order('name'), 'carregar o catálogo de pacotes')
  return ((linhas ?? []) as unknown as {
    id: string; name: string; price: number; total_sessions: number; validity_days: number | null
    is_active: boolean; procedure_id: string; procedures: { name: string } | null
  }[]).map(p => ({
    id: p.id, name: p.name, price: Number(p.price), totalSessions: p.total_sessions,
    validityDays: p.validity_days, isActive: p.is_active, procedureId: p.procedure_id,
    procedureName: p.procedures?.name ?? '—',
  }))
}

/** O que a ficha oferece para vender: os ativos, ao alcance da unidade. */
export async function pacotesAVenda(tenantId: string, branchId: string | null): Promise<PacoteAVenda[]> {
  if (!branchId) return []
  return (await catalogoDePacotes(tenantId, { branchId, soAtivos: true })).map(p => ({
    id: p.id, name: p.name, price: p.price, totalSessions: p.totalSessions,
    procedureName: p.procedureName, validityDays: p.validityDays,
  }))
}
