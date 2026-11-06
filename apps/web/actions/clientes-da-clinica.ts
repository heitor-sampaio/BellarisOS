'use server'

import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { unitTag } from '@estetica-os/utils'

/**
 * A cliente da CLÍNICA que não está na lista da unidade (A17 da 8ª simulação,
 * 2026-11-06; H5: "A cliente é da clínica"). A lista de Clientes do portal da
 * unidade é de quem tem a tag dela (quem frequenta), e a recepção fixa do
 * Batel não achava a Helena da Água Verde — que ela atende, agenda e edita
 * pela ficha. Estas duas leituras dizem à lista quem é da clínica e não está
 * nela: pela busca (a mesma regra do banco, `buscar_clientes`) e pela ficha
 * aberta na URL. Só o nome e a unidade de cadastro; a ficha abre com as
 * travas dela.
 */

interface DaClinica { id: string; nome: string; unidade: string | null }

async function unidadeDoPortal(slug: string) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'VIEW')
  if (typeof slug !== 'string' || !slug) return null
  const admin = createAdminClient()
  const branch = await ler(admin.from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade') as { id: string; name: string } | null
  if (!branch || !alcancaUnidade(ctx, branch.id)) return null
  return { ctx, admin, branch }
}

async function semATagDaUnidade(
  admin: ReturnType<typeof createAdminClient>, tenantId: string, ids: string[], tag: string,
): Promise<DaClinica[]> {
  if (!ids.length) return []
  const linhas = await ler(admin.from('clients').select('id, name, tags, branches(name)')
    .eq('tenant_id', tenantId).in('id', ids), 'ler as clientes da clínica') as
    { id: string; name: string; tags: string[] | null; branches: { name: string } | null }[] | null
  const porId = new Map((linhas ?? []).map(c => [c.id, c]))
  return ids.map(id => porId.get(id)).filter((c): c is NonNullable<typeof c> => !!c && !(c.tags ?? []).includes(tag))
    .map(c => ({ id: c.id, nome: c.name, unidade: c.branches?.name ?? null }))
}

/** As clientes da clínica que casam com o termo e não estão na lista desta unidade. */
export async function clientesDaClinicaForaDaUnidade(slug: string, termo: string): Promise<{ clientes: DaClinica[] }> {
  const busca = typeof termo === 'string' ? termo.trim() : ''
  if (busca.length < 2) return { clientes: [] }
  const u = await unidadeDoPortal(slug)
  if (!u) return { clientes: [] }
  const { data, error } = await u.admin.rpc('buscar_clientes', { p_tenant: u.ctx.tenantId!, p_termo: busca, p_limite: 20 })
  if (error) return { clientes: [] }
  const ids = ((data ?? []) as { id: string }[]).map(c => c.id)
  return { clientes: (await semATagDaUnidade(u.admin, u.ctx.tenantId!, ids, unitTag(u.branch.name))).slice(0, 5) }
}

/** A ficha aberta pela URL que não está na lista desta unidade (a lista a mostra, marcada). */
export async function clienteAbertaForaDaUnidade(slug: string, clienteId: string): Promise<{ cliente: DaClinica | null }> {
  if (typeof clienteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clienteId)) return { cliente: null }
  const u = await unidadeDoPortal(slug)
  if (!u) return { cliente: null }
  return { cliente: (await semATagDaUnidade(u.admin, u.ctx.tenantId!, [clienteId], unitTag(u.branch.name)))[0] ?? null }
}
