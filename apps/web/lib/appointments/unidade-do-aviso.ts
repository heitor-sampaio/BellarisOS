import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler, contar } from '@/lib/db'

/**
 * O nome da unidade do agendamento, para o aviso à cliente — só quando a
 * clínica tem mais de uma unidade ativa (A28). Com uma, nulo (o aviso não diz).
 */
export async function unidadeParaOAviso(admin: ReturnType<typeof createAdminClient>, branchId: string | null): Promise<string | null> {
  if (!branchId) return null
  const unidade = await ler(admin.from('branches').select('name, tenant_id').eq('id', branchId).maybeSingle(), 'buscar a unidade do aviso') as
    { name: string; tenant_id: string } | null
  if (!unidade) return null
  const ativas = await contar(admin.from('branches').select('id', { count: 'exact', head: true })
    .eq('tenant_id', unidade.tenant_id).eq('is_active', true), 'contar as unidades da clínica')
  return (ativas ?? 0) > 1 ? unidade.name : null
}
