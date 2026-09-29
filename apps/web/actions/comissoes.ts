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
import { getTenantContext, assertPermission, alcancaUnidade, ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { EntradaDaConfigDeComissao, EntradaDasTaxas, EntradaDasRegras } from '@/lib/comissoes/config'
import { configDeComissaoDaRede } from '@/lib/comissoes/leitura'
import { periodoDaChave } from '@/lib/comissoes/periodo'

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

const METODOS_DO_FECHAMENTO = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const

/**
 * Fecha e paga o que está a pagar a um profissional numa unidade, até o fim
 * do período (ou até agora, se o período ainda corre). Uma função no banco
 * (`comissao_fechar`) grava tudo junto — o fechamento, a DESPESA paga no
 * financeiro e os lançamentos marcados pagos — e dois cliques fecham uma vez.
 */
export async function fecharComissoes(
  profissionalId: string, branchId: string, periodoChave: string, metodo: string,
): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    // Quem só vê as próprias não fecha nem as próprias.
    if (ownerFilter(ctx, 'financial')) return { error: 'Seu cargo vê só as próprias comissões: quem fecha é o financeiro.' }
    const uuid = /^[0-9a-f-]{36}$/i
    if (!uuid.test(profissionalId) || !uuid.test(branchId)) return { error: 'Profissional ou unidade inválidos.' }
    if (!(METODOS_DO_FECHAMENTO as readonly string[]).includes(metodo)) return { error: 'Escolha a forma de pagamento.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('branches').select('id')
      .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }

    const { periodo: tipo } = await configDeComissaoDaRede(ctx.tenantId!)
    const periodo = periodoDaChave(periodoChave, tipo)
    if (!periodo) return { error: 'Período inválido.' }
    const agora = new Date()
    const fim = periodo.fim.getTime() < agora.getTime() ? periodo.fim : agora

    await gravar(admin.rpc('comissao_fechar', {
      p_tenant: ctx.tenantId!, p_profissional: profissionalId, p_unidade: branchId,
      p_fim: fim.toISOString(), p_ator: ctx.internalUserId ?? null, p_metodo: metodo,
    }), 'fechar as comissões')

    revalidatePath('/admin/financeiro')
    revalidatePath('/admin/financeiro/comissoes')
    revalidatePath('/[slug]/financeiro', 'page')
    revalidatePath('/[slug]/financeiro/comissoes', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
