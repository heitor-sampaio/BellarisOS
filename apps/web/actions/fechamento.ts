'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPodeReceber, podeVerFechamento, alcancaUnidade, can, isOwnScope } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { getFechamentoDoDia } from '@/lib/metrics'
import { janelaDoDia } from '@/lib/financeiro/fechamento'
import { fusoValido } from '@/lib/unidades/fuso'
import { conferidoValido } from '@/lib/financeiro/conferencia-do-fechamento'
import { getEstornosDoDia, getFechamentoPorQuemRecebeu, getFechamentoPorBandeira, getTaxasPorMaquininha } from '@/lib/metrics/fechamento-extra'
import { csvDoFechamento } from '@/lib/financeiro/csv-da-contadora'
import { veComissaoDeTodos } from '@/lib/comissoes/quem-ve'

/**
 * Fechar o dia (2026-10-21, decisão do Heitor): quem RECEBE (caixa ou
 * financeiro) confere o dinheiro em espécie da unidade e registra. O resumo
 * é refeito AQUI, no servidor, e guardado como retrato — a tela não manda
 * número nenhum além do que foi contado.
 *
 * Cada fechamento é um registro novo: fechar de novo (recontou, entrou um
 * pagamento atrasado) não apaga o anterior; vale o mais recente.
 *
 * CX4 (o Fechamento no PDV, 2026-11-14): além do dinheiro (obrigatório), o
 * conferido de cada outra forma do dia — OPCIONAL: nulo ou ausente é "não
 * conferido" (princípio 4). Só as formas que o dia tem.
 */
export async function fecharODia(
  branchId: string,
  dia: string,
  contado: number,
  observacao: string,
  conferidos?: Record<string, number | null> | null,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    assertPodeReceber(ctx)
    // Fecha quem recebe E vê a unidade inteira (D6): o financeiro "só os meus" não.
    if (!podeVerFechamento(ctx)) throw semAcesso()
    if (typeof dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { error: 'Dia inválido.' }
    if (!Number.isFinite(contado) || contado < 0) return { error: 'Informe o dinheiro contado.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('branches').select('id, fuso')
      .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'conferir a unidade')
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    // O dia no relógio da unidade (F62).
    const janela = janelaDoDia(dia, new Date(), fusoValido((unidade as { fuso?: string | null }).fuso))
    if (!janela) return { error: 'Dia inválido.' }

    const [resumo, anterior] = await Promise.all([
      getFechamentoDoDia({ tenantId: ctx.tenantId!, branchId, from: janela.from, to: janela.to, dia }),
      // A forma conferida no fechamento anterior e sem movimento agora (estornada) ainda tem a linha.
      ler(admin.from('fechamentos_do_dia').select('conferido')
        .eq('tenant_id', ctx.tenantId!).eq('branch_id', branchId).eq('dia', dia)
        .order('fechado_em', { ascending: false }).limit(1).maybeSingle(), 'ler o fechamento anterior') as Promise<{ conferido: Record<string, number> | null } | null>,
    ])
    const conferencia = conferidoValido(conferidos ?? null,
      [...resumo.formas.map(f => f.forma), ...Object.keys(anterior?.conferido ?? {})])
    if ('error' in conferencia) return { error: conferencia.error }
    await gravar(admin.from('fechamentos_do_dia').insert({
      tenant_id:         ctx.tenantId!,
      branch_id:         branchId,
      dia,
      resumo:            [...resumo.formas, resumo.total],
      esperado_dinheiro: resumo.esperadoDinheiro,
      fundo_de_troco:    resumo.fundoDeTroco,
      contado_dinheiro:  Math.round(contado * 100) / 100,
      conferido:         conferencia.conferido,
      observacao:        observacao.trim().slice(0, 500) || null,
      fechado_por:       ctx.internalUserId,
      fechado_por_nome:  ctx.userName || null,
    }), 'registrar o fechamento do dia')

    // O Fechamento mora no PDV (CX4).
    revalidatePath('/[slug]/pdv', 'page')
    revalidatePath('/admin/pdv')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * O FUNDO DE TROCO do dia (ven-03 da revisão, 2026-11-02 — o Heitor:
 * "flexibilidade, precisamos dar as opções para que a rede possa operar da
 * maneira que melhor lhe convier"): opcional, o dinheiro que já estava na
 * gaveta no começo do dia. Informado, o esperado em espécie é o fundo + o saldo
 * em dinheiro do dia (getFechamentoDoDia). Um por unidade e dia: informar de
 * novo troca o valor; zero é "sem fundo". Quem fecha o dia informa.
 */
export async function informarFundoDeTroco(
  branchId: string, dia: string, valor: number,
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    assertPodeReceber(ctx)
    if (!podeVerFechamento(ctx)) throw semAcesso()
    if (typeof dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { error: 'Dia inválido.' }
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 1_000_000) return { error: 'Informe o fundo de troco (R$ 0,00 ou mais).' }
    if (typeof branchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(branchId)) return { error: 'Unidade não encontrada.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('branches').select('id, fuso')
      .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'conferir a unidade')
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    // O dia no relógio da unidade (F62): o de amanhã dela ainda não se informa.
    if (!janelaDoDia(dia, new Date(), fusoValido((unidade as { fuso?: string | null }).fuso))) return { error: 'Dia inválido.' }

    await gravar(admin.from('fundos_de_troco').upsert({
      tenant_id:          ctx.tenantId!,
      branch_id:          branchId,
      dia,
      valor:              Math.round(valor * 100) / 100,
      informado_por:      ctx.internalUserId,
      informado_por_nome: ctx.userName || null,
      informado_em:       new Date().toISOString(),
    }, { onConflict: 'branch_id,dia' }).select('id').single(), 'registrar o fundo de troco')

    // O Fechamento mora no PDV (CX4).
    revalidatePath('/[slug]/pdv', 'page')
    revalidatePath('/admin/pdv')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * A planilha do Fechamento do dia, agora no FINANCEIRO (CX6 do plano de
 * adaptação, 2026-11-14): o mesmo CSV que o Fechamento exportava — as formas,
 * o total, o esperado em espécie, a situação do dia, as bandeiras, os
 * estornos, "Por quem recebeu" e, só a quem vê o financeiro da rede (D7), a
 * taxa e o líquido por maquininha. Quem vê: quem vê o Financeiro da unidade
 * inteira (o "só os meus" não). O servidor monta; o navegador só baixa.
 */
export async function csvDoFechamentoDoDia(
  branchId: string, dia: string,
): Promise<{ ok: true; csv: string; nome: string } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    if (!can(ctx, 'financial', 'VIEW') || isOwnScope(ctx, 'financial')) throw semAcesso()
    if (typeof dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { error: 'Dia inválido.' }
    if (typeof branchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(branchId)) return { error: 'Unidade não encontrada.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('branches').select('id, name, fuso')
      .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'conferir a unidade') as { id: string; name: string; fuso: string | null } | null
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    const fuso = fusoValido(unidade.fuso)
    const janela = janelaDoDia(dia, new Date(), fuso)
    if (!janela) return { error: 'Dia inválido.' }
    const args = { tenantId: ctx.tenantId!, branchId, from: janela.from, to: janela.to }

    const [resumo, estornos, porQuemRecebeu, bandeiras, ultimo, taxasPorMaquininha] = await Promise.all([
      getFechamentoDoDia({ ...args, dia }),
      getEstornosDoDia(args),
      getFechamentoPorQuemRecebeu(args),
      getFechamentoPorBandeira(args),
      ler(admin.from('fechamentos_do_dia').select('fechado_por_nome, fechado_em, diferenca')
        .eq('tenant_id', ctx.tenantId!).eq('branch_id', branchId).eq('dia', dia)
        .order('fechado_em', { ascending: false }).limit(1).maybeSingle(), 'ler o último fechamento') as
        Promise<{ fechado_por_nome: string | null; fechado_em: string; diferenca: number | string } | null>,
      // A28 da 14ª (D7): a taxa e o líquido por maquininha só a quem vê o financeiro da rede.
      veComissaoDeTodos(ctx) ? getTaxasPorMaquininha(args) : Promise.resolve(null),
    ])
    const csv = csvDoFechamento({
      dia, unidade: unidade.name, fuso,
      formas: resumo.formas, total: resumo.total, esperadoDinheiro: resumo.esperadoDinheiro,
      estornos: estornos.itens, porQuemRecebeu, bandeiras, taxasPorMaquininha,
      fechado: ultimo ? { quem: ultimo.fechado_por_nome, quando: ultimo.fechado_em, diferenca: Number(ultimo.diferenca) } : null,
    })
    return { ok: true, csv, nome: `fechamento-${dia}.csv` }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
