'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPodeReceber, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { getFechamentoDoDia } from '@/lib/metrics'
import { janelaDoDia } from '@/lib/financeiro/fechamento'

/**
 * Fechar o dia (2026-10-21, decisão do Heitor): quem RECEBE (caixa ou
 * financeiro) confere o dinheiro em espécie da unidade e registra. O resumo
 * é refeito AQUI, no servidor, e guardado como retrato — a tela não manda
 * número nenhum além do que foi contado.
 *
 * Cada fechamento é um registro novo: fechar de novo (recontou, entrou um
 * pagamento atrasado) não apaga o anterior; vale o mais recente.
 */
export async function fecharODia(
  branchId: string,
  dia: string,
  contado: number,
  observacao: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    assertPodeReceber(ctx)
    const janela = janelaDoDia(dia)
    if (!janela) return { error: 'Dia inválido.' }
    if (!Number.isFinite(contado) || contado < 0) return { error: 'Informe o dinheiro contado.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('branches').select('id')
      .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'conferir a unidade')
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }

    const resumo = await getFechamentoDoDia({ tenantId: ctx.tenantId!, branchId, from: janela.from, to: janela.to })
    await gravar(admin.from('fechamentos_do_dia').insert({
      tenant_id:         ctx.tenantId!,
      branch_id:         branchId,
      dia,
      resumo:            [...resumo.formas, resumo.total],
      esperado_dinheiro: resumo.esperadoDinheiro,
      contado_dinheiro:  Math.round(contado * 100) / 100,
      observacao:        observacao.trim().slice(0, 500) || null,
      fechado_por:       ctx.internalUserId,
      fechado_por_nome:  ctx.userName || null,
    }), 'registrar o fechamento do dia')

    revalidatePath('/[slug]/fechamento', 'page')
    revalidatePath('/admin/fechamento')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
