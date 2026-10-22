'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'

/**
 * Os motivos de perda da rede (2026-10-21), editados em "Configurar funis":
 * quem configura o funil (crm: MANAGE) cria e desativa. Desativar tira da
 * escolha, sem apagar: os leads já perdidos por ele continuam com o motivo.
 */

type Resultado = { ok: true } | { error: string }

export async function criarMotivoDePerda(nome: string): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'oportunidades')
    assertPermission(ctx, 'crm', 'MANAGE')
    const limpo = (nome ?? '').trim().slice(0, 60)
    if (!limpo) return { error: 'Dê um nome ao motivo.' }
    const admin = createAdminClient()
    const ultimo = await ler(admin.from('crm_motivos_perda').select('posicao').eq('tenant_id', ctx.tenantId!)
      .order('posicao', { ascending: false }).limit(1).maybeSingle(), 'ler os motivos') as { posicao: number } | null
    const { error } = await admin.from('crm_motivos_perda')
      .insert({ tenant_id: ctx.tenantId!, nome: limpo, posicao: (ultimo?.posicao ?? 0) + 1 })
    if (error?.code === '23505') return { error: 'Já existe um motivo com esse nome.' }
    if (error) return { error: 'Não consegui criar o motivo.' }
    revalidatePath('/admin/oportunidades')
    revalidatePath('/[slug]/oportunidades', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

export async function alternarMotivoDePerda(id: string, ativo: boolean): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'oportunidades')
    assertPermission(ctx, 'crm', 'MANAGE')
    if (!z.string().uuid().safeParse(id).success) return { error: 'Motivo não encontrado.' }
    const feitas = await gravar(createAdminClient().from('crm_motivos_perda').update({ ativo: !!ativo })
      .eq('id', id).eq('tenant_id', ctx.tenantId!).select('id'), 'mudar o motivo') as { id: string }[] | null
    if (!feitas?.length) return { error: 'Motivo não encontrado.' }
    revalidatePath('/admin/oportunidades')
    revalidatePath('/[slug]/oportunidades', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** Os motivos ativos, para a pergunta "Por que perdeu?" (quem mexe no CRM). */
export async function listarMotivosDePerda(): Promise<{ id: string; nome: string }[]> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'oportunidades')
  assertPermission(ctx, 'crm', 'VIEW')
  const { motivosDaRede } = await import('@/lib/crm/motivos-perda')
  return (await motivosDaRede(createAdminClient(), ctx.tenantId!)).map(x => ({ id: x.id, nome: x.nome }))
}
