import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

/**
 * Quem DESFAZ no caixa — estorna, devolve a venda de produto, cancela o pacote
 * (A33 da 8ª simulação, 2026-11-06; princípio 1 — a regra de cargo fica: é o
 * Financeiro em Gerenciar). A recepção (Recebimentos em Gerenciar) não via
 * nenhum dos três, e a tela não dizia a quem pedir: aqui, os nomes de quem
 * pode, ativos e ao alcance da unidade (os da rede e os dela). A Admin da rede
 * (o cargo de sistema) entra sempre.
 */
export async function quemDesfazNoCaixa(tenantId: string, branchId: string | null): Promise<string[]> {
  const admin = createAdminClient()
  const [perms, admins] = await Promise.all([
    lerTodas((de, ate) => admin.from('role_permissions').select('role_id')
      .eq('tenant_id', tenantId).eq('module', 'financial').eq('level', 'MANAGE')
      .order('role_id').range(de, ate), 'carregar os cargos que desfazem no caixa'),
    lerTodas((de, ate) => admin.from('tenant_roles').select('id')
      .eq('tenant_id', tenantId).eq('key', 'NETWORK_ADMIN').eq('is_system', true)
      .order('id').range(de, ate), 'carregar o cargo de Admin da rede'),
  ])
  const cargos = [...new Set([...(perms ?? []).map(p => p.role_id as string), ...(admins ?? []).map(a => a.id as string)])]
  if (cargos.length === 0) return []
  const membros = await lerTodas((de, ate) => {
    let q = admin.from('users').select('id, name')
      .eq('tenant_id', tenantId).eq('is_active', true).in('role_id', cargos)
    q = branchId ? q.or(`branch_id.is.null,branch_id.eq.${branchId}`) : q.is('branch_id', null)
    return q.order('name').order('id').range(de, ate)
  }, 'carregar quem desfaz no caixa')
  return (membros ?? []).map(m => (m.name as string | null) ?? '—').filter(n => n !== '—')
}
