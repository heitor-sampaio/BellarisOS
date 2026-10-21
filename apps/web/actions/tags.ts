'use server'

import { revalidateTag } from 'next/cache'
import { getTenantContext, assertAnyPermission, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { tagsAtivasDaRede } from '@/lib/tags/vocabulario'
import { validarNomeDeTag } from '@/lib/tags/escolha'

/**
 * As tags da rede (2026-10-13), Configurações → Tags. Um vocabulário só para a
 * ficha e o CRM: gerencia quem cadastra clientes OU trabalha o CRM (a mesma
 * regra da aba). Renomear troca em todo lugar numa transação só
 * (\`renomear_tag\`), e junta as duas se o nome novo já existe.
 */

const QUEM_GERENCIA = ['clients', 'crm'] as const

export interface TagDaRede {
  id: string; nome: string; arquivada: boolean
  clientes: number; contatos: number; oportunidades: number
}

/** As opções das telas (ficha, cadastro, card, campanha) — só as ativas. */
export async function listarTagsAtivas(): Promise<string[]> {
  const ctx = await getTenantContext()
  if (!(['clients', 'crm', 'marketing', 'automations'] as const).some(m => can(ctx, m, 'VIEW'))) return []
  return tagsAtivasDaRede(ctx.tenantId!)
}

/** A lista da aba, com o uso de cada uma. */
export async function listarTagsComUso(): Promise<TagDaRede[]> {
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, [...QUEM_GERENCIA], 'MANAGE')
  const { data, error } = await createAdminClient().rpc('tags_da_rede', { p_tenant: ctx.tenantId! })
  if (error) throw new Error(`Ler as tags da rede: ${error.message}`)
  return ((data ?? []) as { id: string; nome: string; arquivada_em: string | null; clientes: number; contatos: number; oportunidades: number }[])
    .map(t => ({
      id: t.id, nome: t.nome, arquivada: !!t.arquivada_em,
      clientes: Number(t.clientes), contatos: Number(t.contatos), oportunidades: Number(t.oportunidades),
    }))
}

export async function criarTag(bruto: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, [...QUEM_GERENCIA], 'MANAGE')
  const v = validarNomeDeTag(String(bruto ?? ''))
  if ('error' in v) return { ok: false, error: v.error }
  const { error } = await createAdminClient().from('tags').insert({ tenant_id: ctx.tenantId!, nome: v.nome })
  if (error?.code === '23505') return { ok: false, error: `A tag "${v.nome}" já existe.` }
  if (error) return { ok: false, error: `Não foi possível criar a tag: ${error.message}` }
  return { ok: true }
}

export async function renomearTag(id: string, bruto: string): Promise<
  { ok: true; nome: string; registros: number; juntou: boolean; automacoes: string[] } | { ok: false; error: string }
> {
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, [...QUEM_GERENCIA], 'MANAGE')
  const v = validarNomeDeTag(String(bruto ?? ''))
  if ('error' in v) return { ok: false, error: v.error }
  const admin = createAdminClient()
  const atual = await ler(admin.from('tags').select('id, nome').eq('id', String(id ?? '')).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'buscar a tag') as { id: string; nome: string } | null
  if (!atual) return { ok: false, error: 'Tag não encontrada nesta rede.' }
  if (atual.nome === v.nome) return { ok: true, nome: v.nome, registros: 0, juntou: false, automacoes: [] }

  // Já existe outra com o nome novo (sem caixa)? Então as duas viram uma.
  const todas = await ler(admin.from('tags').select('id, nome').eq('tenant_id', ctx.tenantId!), 'ler as tags da rede') as { id: string; nome: string }[] | null
  const juntou = (todas ?? []).some(t => t.id !== atual.id && t.nome.toLowerCase() === v.nome.toLowerCase())
  // O fluxo publicado não se reescreve sozinho: avisa quem cita o nome antigo.
  const { data: citam } = await admin.rpc('automacoes_que_citam_tag', { p_tenant: ctx.tenantId!, p_nome: atual.nome })
  const { data, error } = await admin.rpc('renomear_tag', { p_tenant: ctx.tenantId!, p_tag: atual.id, p_novo: v.nome })
  if (error) return { ok: false, error: `Não foi possível renomear: ${error.message}` }
  const r = ((data ?? []) as { nome_final: string; registros: number }[])[0]
  // A lista de clientes guarda as tags no cache.
  revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
  return {
    ok: true, nome: r?.nome_final ?? v.nome, registros: Number(r?.registros ?? 0),
    juntou,
    automacoes: ((citam ?? []) as { nome: string }[]).map(a => a.nome),
  }
}

/** Arquivar tira das opções; quem já tem continua com ela. */
export async function arquivarTag(id: string, arquivar: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, [...QUEM_GERENCIA], 'MANAGE')
  const { data, error } = await createAdminClient().from('tags')
    .update({ arquivada_em: arquivar ? new Date().toISOString() : null })
    .eq('id', String(id ?? '')).eq('tenant_id', ctx.tenantId!).select('id')
  if (error) return { ok: false, error: `Não foi possível ${arquivar ? 'arquivar' : 'reativar'}: ${error.message}` }
  if (!data?.length) return { ok: false, error: 'Tag não encontrada nesta rede.' }
  return { ok: true }
}
