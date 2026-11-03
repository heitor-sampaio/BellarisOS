import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import type { MembroDaVenda } from '@/components/shared/vender'

/**
 * Quem pode aparecer numa venda da unidade: a profissional RESPONSÁVEL do
 * pacote (com-04, só quem atende) e QUEM VENDEU (com-06, qualquer pessoa da
 * equipe). Os membros ativos da rede que alcançam a unidade — os da rede e os
 * dela. O servidor confere de novo na venda.
 */
export async function equipeDaVenda(tenantId: string, branchId: string | null): Promise<MembroDaVenda[]> {
  if (!branchId) return []
  const linhas = await lerTodas((de, ate) => createAdminClient().from('users')
    .select('id, name, provides_services')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .order('name').order('id').range(de, ate), 'carregar a equipe da venda')
  return (linhas ?? []).map(u => ({ id: u.id as string, nome: (u.name as string | null) ?? '—', atende: !!u.provides_services }))
}

/**
 * A pessoa da venda escolhida na tela é da equipe da rede, ativa, alcança a
 * unidade e (para a responsável do pacote) atende? O navegador não decide.
 */
export async function recusaDoMembroDaVenda(
  tenantId: string, membroId: string, branchId: string, opcoes: { atende?: boolean; papel: string },
): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(membroId)) return `${opcoes.papel}: escolha alguém da equipe.`
  const { data, error } = await createAdminClient().from('users')
    .select('id, branch_id, is_active, provides_services')
    .eq('id', membroId).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`Não consegui conferir ${opcoes.papel.toLowerCase()}: ${error.message}`)
  if (!data || data.is_active === false) return `${opcoes.papel}: não é da equipe desta clínica.`
  if (data.branch_id && data.branch_id !== branchId) return `${opcoes.papel}: é de outra unidade.`
  if (opcoes.atende && !data.provides_services) return `${opcoes.papel}: escolha quem atende clientes.`
  return null
}
