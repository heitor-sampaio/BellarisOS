'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { recusaDaConfigDaClinica } from '@/lib/configuracao-da-rede'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { origensDaRede } from '@/lib/crm/origens'

/**
 * As origens do lead da clínica (A14 da 7ª simulação, 2026-11-05; princípio 1:
 * "a clínica decide"), em "Configurar funis", ao lado dos motivos de perda:
 * quem configura o funil (Configurações em Gerenciar, D-1; da rede, H7) cria e
 * desativa. Desativar tira da escolha sem apagar: o lead que já tem a origem
 * continua com ela, e o relatório também.
 */

type Resultado = { ok: true } | { error: string }

async function contextoDeQuemConfigura() {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'oportunidades')
  assertPermission(ctx, 'settings', 'MANAGE')
  assertPermission(ctx, 'crm', 'VIEW')
  return ctx
}

function revalidar() {
  revalidatePath('/admin/oportunidades')
  revalidatePath('/[slug]/oportunidades', 'page')
}

export async function criarOrigemDoLead(nome: string): Promise<Resultado> {
  try {
    const ctx = await contextoDeQuemConfigura()
    const daClinica = recusaDaConfigDaClinica(ctx)
    if (daClinica) return { error: daClinica }
    const limpo = (nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    if (!limpo) return { error: 'Dê um nome à origem.' }
    const admin = createAdminClient()
    const ultima = await ler(admin.from('crm_origens').select('posicao').eq('tenant_id', ctx.tenantId!)
      .order('posicao', { ascending: false }).limit(1).maybeSingle(), 'ler as origens') as { posicao: number } | null
    const { error } = await admin.from('crm_origens')
      .insert({ tenant_id: ctx.tenantId!, nome: limpo, posicao: (ultima?.posicao ?? 0) + 1 })
    if (error?.code === '23505') return { error: 'Já existe uma origem com esse nome.' }
    if (error) return { error: 'Não consegui criar a origem.' }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

export async function alternarOrigemDoLead(id: string, ativo: boolean): Promise<Resultado> {
  try {
    const ctx = await contextoDeQuemConfigura()
    const daClinica = recusaDaConfigDaClinica(ctx)
    if (daClinica) return { error: daClinica }
    if (!z.string().uuid().safeParse(id).success) return { error: 'Origem não encontrada.' }
    const feitas = await gravar(createAdminClient().from('crm_origens').update({ ativo: !!ativo })
      .eq('id', id).eq('tenant_id', ctx.tenantId!).select('id'), 'mudar a origem') as { id: string }[] | null
    if (!feitas?.length) return { error: 'Origem não encontrada.' }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** As origens ativas, para escolher no lead (quem vê o CRM). */
export async function listarOrigensDoLead(): Promise<string[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')
  return (await origensDaRede(createAdminClient(), ctx.tenantId!)).map(o => o.nome)
}
