import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import type { MembroDaVenda } from '@/components/shared/vender'
import { PERGUNTA_SEM_VENDEDOR } from '@/lib/vendas/pergunta-sem-vendedor'

/**
 * Quem pode aparecer numa venda da unidade: a profissional RESPONSÁVEL do
 * pacote (com-04, só quem atende NESTA unidade) e QUEM VENDEU (com-06,
 * qualquer pessoa da equipe). Os membros ativos da rede que alcançam a unidade
 * — os da rede e os dela — e quem é de fora e atende aqui (o "Atende" por
 * unidade, decisão 2 da 8ª simulação). O servidor confere de novo na venda.
 */
export async function equipeDaVenda(tenantId: string, branchId: string | null, euId?: string | null): Promise<MembroDaVenda[]> {
  if (!branchId) return []
  const linhas = await lerTodas((de, ate) => createAdminClient().from('users')
    .select('id, name, atende_em')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .or(`branch_id.is.null,branch_id.eq.${branchId},atende_em.cs.{${branchId}}`)
    .order('name').order('id').range(de, ate), 'carregar a equipe da venda')
  return (linhas ?? []).map(u => ({
    id: u.id as string, nome: (u.name as string | null) ?? '—',
    atende: ((u.atende_em as string[] | null) ?? []).includes(branchId),
    eu: !!euId && u.id === euId,
  }))
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
    .select('id, branch_id, is_active, atende_em')
    .eq('id', membroId).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`Não consegui conferir ${opcoes.papel.toLowerCase()}: ${error.message}`)
  if (!data || data.is_active === false) return `${opcoes.papel}: não é da equipe desta clínica.`
  // Quem é de outra unidade e atende AQUI (decisão 2 da 8ª) também entra.
  const atendeAqui = ((data.atende_em as string[] | null) ?? []).includes(branchId)
  if (data.branch_id && data.branch_id !== branchId && !atendeAqui) return `${opcoes.papel}: é de outra unidade.`
  if (opcoes.atende && !atendeAqui) return `${opcoes.papel}: escolha quem atende clientes nesta unidade.`
  return null
}

/** "Quem vendeu" da venda (com-06): o que a tela mandou. Sem `vendedorId` (um chamador de antes), é quem registra. */
export interface QuemVendeuDaTela { vendedorId?: string | null; semVendedor?: boolean }

/** A pergunta quando "Quem vendeu" fica vazio (com-06): o texto mora num módulo puro, que a tela também lê. */
export { PERGUNTA_SEM_VENDEDOR }

/**
 * Quem vendeu, conferido (com-06, decisão do Heitor: "campo vazio não gera
 * comissão para ninguém"): a pessoa escolhida, da equipe e ao alcance da
 * unidade; vazio (`vendedorId: null`) só com a confirmação (`semVendedor`),
 * senão a pergunta. Sem a chave `vendedorId` — um caminho que não tem o campo —,
 * quem registrou, como antes.
 */
export async function quemVendeu(
  tenantId: string, registrou: string | null, equipe: QuemVendeuDaTela | null | undefined, branchId: string,
): Promise<{ vendedor: string | null } | { error: string } | { pergunta: string }> {
  if (equipe == null || (!('vendedorId' in equipe) && equipe.semVendedor !== true)) return { vendedor: registrou }
  const id = typeof equipe.vendedorId === 'string' && equipe.vendedorId ? equipe.vendedorId : null
  if (id) {
    const recusa = await recusaDoMembroDaVenda(tenantId, id, branchId, { papel: 'Quem vendeu' })
    return recusa ? { error: recusa } : { vendedor: id }
  }
  return equipe.semVendedor === true ? { vendedor: null } : { pergunta: PERGUNTA_SEM_VENDEDOR }
}
