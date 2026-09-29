'use server'

/**
 * Comissões — a configuração da rede, as taxas da maquininha e as regras de
 * cada profissional (padrão + exceções por procedimento). Decisões do Heitor
 * de 2026-09-30.
 *
 * Tudo pede `financial: MANAGE` (o módulo é "Financeiro e comissões"). A
 * configuração e as taxas valem para a REDE inteira: só quem tem abrangência
 * de rede muda. As regras de um profissional: quem é da rede muda de qualquer
 * um; quem tem unidade fixa, só dos da unidade dele.
 *
 * Todo export é endpoint público: cada um confere a permissão, a rede e o
 * alcance antes de gravar.
 */

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, tentar, mensagemDoErro } from '@/lib/db'
import { EntradaDaConfigDeComissao, EntradaDasTaxas, EntradaDasRegras } from '@/lib/comissoes/config'

type Resultado = { error?: string; ok?: true }

function revalidar() {
  revalidatePath('/admin/settings')
  revalidatePath('/admin/team')
  revalidatePath('/[slug]/team', 'page')
}

export async function salvarConfigDeComissao(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ctx.branchId !== null) return { error: 'A configuração de comissões vale para a rede inteira: quem muda é quem administra a rede.' }
    const lido = EntradaDaConfigDeComissao.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const c = lido.data
    const admin = createAdminClient()
    await gravar(admin.from('commission_configs').upsert({
      tenant_id: ctx.tenantId!, modo: c.modo, desconta_insumos: c.desconta_insumos, desconta_taxa: c.desconta_taxa,
      base_com_pontos: c.base_com_pontos, periodo: c.periodo,
      updated_at: new Date().toISOString(), updated_by: ctx.internalUserId ?? null,
    }, { onConflict: 'tenant_id' }).select('tenant_id').single(), 'salvar a configuração de comissões')
    // O recebimento do atendimento ainda lê a base com pontos da fidelidade
    // (até a fase 2 das comissões): as duas ficam iguais. Rede sem programa de
    // fidelidade não tem a linha — e sem pontos a opção não faz diferença.
    await tentar(admin.from('loyalty_configs').update({ commission_base: c.base_com_pontos })
      .eq('tenant_id', ctx.tenantId!), 'espelhar a base da comissão com pontos na fidelidade')
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

export async function salvarTaxasDaMaquininha(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    if (ctx.branchId !== null) return { error: 'As taxas valem para a rede inteira: quem muda é quem administra a rede.' }
    const lido = EntradaDasTaxas.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    await gravar(createAdminClient().rpc('comissao_taxas_definir', { p_tenant: ctx.tenantId!, p_taxas: lido.data }),
      'salvar as taxas da maquininha')
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

export async function salvarRegrasDoProfissional(profissionalId: string, entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    if (typeof profissionalId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profissionalId)) return { error: 'Profissional não encontrado.' }
    const lido = EntradaDasRegras.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }

    const admin = createAdminClient()
    const membro = await ler(admin.from('users').select('id, branch_id')
      .eq('id', profissionalId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o profissional')
    // De outra rede, ou de uma unidade fora do alcance: como se não existisse.
    if (!membro || !alcancaUnidade(ctx, (membro.branch_id as string | null) ?? null)) return { error: 'Profissional não encontrado.' }

    const { padrao, excecoes } = lido.data
    await gravar(admin.rpc('comissao_regras_definir', {
      p_tenant: ctx.tenantId!, p_profissional: profissionalId,
      p_padrao: padrao, p_excecoes: excecoes, p_ator: ctx.internalUserId ?? null,
    }), 'salvar as regras de comissão')
    revalidar()
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
