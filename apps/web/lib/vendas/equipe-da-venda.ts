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
 *
 * A ordem (A15 da 8ª simulação: "Quem vendeu" trazia a Contadora, que só vê,
 * no meio da lista): quem ATENDE aqui, depois quem RECEBE (o caixa ou o
 * financeiro em Gerenciar — `podeReceber`), depois quem tem VENDAS no cargo.
 *
 * A42 da 11ª: a lista trazia a estoquista, e dava para pôr comissão de venda em
 * quem nem entra em Vendas. Só fica quem VENDE: atende aqui, recebe, ou tem o
 * grupo Vendas no cargo (`crm` ou `procedures` — Oportunidades, Inbox,
 * Procedimentos, Pacotes) — e a Admin. O servidor confere o mesmo
 * (`quemVendeu`). A clínica decide quem vende pelo cargo (princípio 1).
 */
export async function equipeDaVenda(tenantId: string, branchId: string | null, euId?: string | null): Promise<MembroDaVenda[]> {
  if (!branchId) return []
  const admin = createAdminClient()
  const [linhas, quemRecebe, quemVende] = await Promise.all([
    lerTodas((de, ate) => admin.from('users')
      .select('id, name, role_id, atende_em')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`branch_id.is.null,branch_id.eq.${branchId},atende_em.cs.{${branchId}}`)
      .order('name').order('id').range(de, ate), 'carregar a equipe da venda'),
    cargosQueRecebem(tenantId),
    cargosQueVendem(tenantId),
  ])
  const grupo = (m: MembroDaVenda) => (m.atende ? 0 : m.recebe ? 1 : 2)
  return (linhas ?? []).map(u => ({
    id: u.id as string, nome: (u.name as string | null) ?? '—',
    atende: ((u.atende_em as string[] | null) ?? []).includes(branchId),
    recebe: !!u.role_id && quemRecebe.has(u.role_id as string),
    vende: !!u.role_id && quemVende.has(u.role_id as string),
    eu: !!euId && u.id === euId,
  })).filter(m => m.atende || m.recebe || m.vende).sort((a, b) => grupo(a) - grupo(b))
}

/**
 * A42 da 11ª: os cargos da rede com o grupo VENDAS (`crm` ou `procedures`
 * abertos), mais os que recebem (o `podeReceber`) e a Admin — quem vende.
 */
export async function cargosQueVendem(tenantId: string): Promise<Set<string>> {
  const [perms, recebem] = await Promise.all([
    lerTodas((de, ate) => createAdminClient().from('role_permissions').select('role_id')
      .eq('tenant_id', tenantId).in('module', ['crm', 'procedures']).neq('level', 'NONE')
      .order('role_id').range(de, ate), 'carregar os cargos que vendem'),
    cargosQueRecebem(tenantId),
  ])
  return new Set([...(perms ?? []).map(p => p.role_id as string), ...recebem])
}

/**
 * A42 da 11ª: a pessoa VENDE nesta unidade? Atende aqui, recebe, ou tem Vendas
 * no cargo (a mesma régua da lista "Quem vendeu").
 */
async function vendeNaUnidade(tenantId: string, membroId: string, branchId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('users').select('role_id, atende_em')
    .eq('id', membroId).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`Não consegui conferir quem vendeu: ${error.message}`)
  if (!data) return false
  if (((data.atende_em as string[] | null) ?? []).includes(branchId)) return true
  return !!data.role_id && (await cargosQueVendem(tenantId)).has(data.role_id as string)
}

/** Os cargos da rede que RECEBEM (caixa ou financeiro em Gerenciar, ou a Admin da rede) — o `podeReceber`. */
async function cargosQueRecebem(tenantId: string): Promise<Set<string>> {
  const admin = createAdminClient()
  const [perms, admins] = await Promise.all([
    lerTodas((de, ate) => admin.from('role_permissions').select('role_id')
      .eq('tenant_id', tenantId).in('module', ['cashier', 'financial']).eq('level', 'MANAGE')
      .order('role_id').range(de, ate), 'carregar os cargos que recebem'),
    lerTodas((de, ate) => admin.from('tenant_roles').select('id')
      .eq('tenant_id', tenantId).eq('key', 'NETWORK_ADMIN').eq('is_system', true)
      .order('id').range(de, ate), 'carregar o cargo de Admin da rede'),
  ])
  return new Set([...(perms ?? []).map(p => p.role_id as string), ...(admins ?? []).map(a => a.id as string)])
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
    if (recusa) return { error: recusa }
    // A42 da 11ª: só quem vende (atende aqui, recebe ou tem Vendas no cargo).
    if (!(await vendeNaUnidade(tenantId, id, branchId))) {
      return { error: 'Quem vendeu: escolha quem vende — quem atende aqui, quem recebe ou quem tem Vendas no cargo.' }
    }
    return { vendedor: id }
  }
  return equipe.semVendedor === true ? { vendedor: null } : { pergunta: PERGUNTA_SEM_VENDEDOR }
}
