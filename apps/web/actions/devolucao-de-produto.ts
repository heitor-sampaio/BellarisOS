'use server'

/**
 * A devolução de PARTE de uma venda de produto (A34 da 8ª simulação,
 * 2026-11-06; decidido pelo princípio 3): por linha, com o estoque e o
 * dinheiro proporcionais. No cartão, o pagamento inteiro volta e o que fica é
 * lançado de novo (r2-fin-03). A mesma permissão do estorno da venda inteira
 * (`reverseTransaction`): o Financeiro em Gerenciar, com a unidade da venda ao
 * alcance.
 *
 * Todo export é endpoint público: confere permissão, rede e alcance.
 */

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getTenantContext, alcancaUnidade, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { recusaDasVezesDaRede } from '@/lib/financeiro/vezes-da-rede'
import { FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { BANDEIRAS, bandeiraDoPagamento } from '@/lib/financeiro/bandeiras'
import { lerPreviaDaDevolucao, type PreviaDaDevolucao, type VendaParaDevolver } from '@/lib/produtos/devolucao'

const UUID = /^[0-9a-f-]{36}$/i

async function vendaAoAlcance(
  admin: ReturnType<typeof createAdminClient>, ctx: Awaited<ReturnType<typeof getTenantContext>>, vendaId: unknown,
): Promise<{ id: string; clientId: string; descricao: string } | null> {
  if (typeof vendaId !== 'string' || !UUID.test(vendaId)) return null
  const v = await ler(admin.from('product_sales')
    .select('id, tenant_id, branch_id, client_id, descricao, estornada_em, products(name)')
    .eq('id', vendaId).maybeSingle(), 'buscar a venda')
  if (!v || v.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, v.branch_id as string) || v.estornada_em) return null
  const nome = (v.products as unknown as { name: string } | null)?.name ?? 'Produto'
  return { id: v.id as string, clientId: v.client_id as string, descricao: (v.descricao as string | null) ?? nome }
}

/** A venda deu pontos (algum pagamento dela tem o GANHO no extrato)? */
async function vendaPontuou(admin: ReturnType<typeof createAdminClient>, vendaId: string): Promise<boolean> {
  const txs = await ler(admin.from('financial_transactions').select('id').eq('product_sale_id', vendaId), 'buscar os pagamentos da venda')
  const ids = (txs ?? []).map(t => t.id as string)
  if (!ids.length) return false
  const ganhos = await ler(admin.from('loyalty_transactions').select('id').in('transaction_id', ids).eq('kind', 'GANHO').limit(1), 'conferir os pontos da venda')
  return (ganhos ?? []).length > 0
}

/** A venda do lançamento e os itens dela, para a janela perguntar quantas voltam. */
export async function vendaParaDevolver(transacaoId: string): Promise<{ error?: string; venda?: VendaParaDevolver }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    if (typeof transacaoId !== 'string' || !UUID.test(transacaoId)) return { error: 'Lançamento não encontrado.' }
    const admin = createAdminClient()
    const tx = await ler(admin.from('financial_transactions').select('product_sale_id')
      .eq('id', transacaoId).maybeSingle(), 'buscar o lançamento')
    const venda = await vendaAoAlcance(admin, ctx, tx?.product_sale_id)
    if (!venda) return { error: 'Venda não encontrada.' }
    const itens = await ler(admin.from('product_sale_items')
      .select('id, quantity, devolvidas, sort_order, products(name)')
      .eq('sale_id', venda.id).order('sort_order'), 'ler os itens da venda')
    return {
      venda: {
        id: venda.id, descricao: venda.descricao,
        itens: (itens ?? []).map(i => ({
          id: i.id as string, quantidade: Number(i.quantity), devolvidas: Number(i.devolvidas ?? 0),
          produto: (i.products as unknown as { name: string } | null)?.name ?? 'Produto',
        })),
      },
    }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

const Itens = z.array(z.object({ item: z.string().regex(UUID), quantidade: z.number().int().min(0).max(100) })).max(20)

/** A conta da devolução ANTES de devolver: a MESMA função que grava, simulando. */
export async function previaDaDevolucao(vendaId: string, itens: unknown): Promise<{ error?: string; previa?: PreviaDaDevolucao }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    const lidos = Itens.safeParse(itens)
    if (!lidos.success) return { error: 'Diga quantas unidades de cada produto voltam.' }
    const admin = createAdminClient()
    if (!await vendaAoAlcance(admin, ctx, vendaId)) return { error: 'Venda não encontrada.' }
    const j = await ler(admin.rpc('produto_devolver_itens', {
      p_tenant: ctx.tenantId!, p_venda: vendaId, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName ?? null,
      p_motivo: null, p_itens: lidos.data, p_voltou: null, p_destino: null, p_esperado: null, p_simular: true,
      p_estorno: null, p_novo: null,
    }), 'calcular a devolução') as Record<string, unknown>
    const previa = lerPreviaDaDevolucao(j)
    // A40 da 9ª: "os pontos dele saem do saldo" só quando a venda PONTUOU (a
    // venda de produto só pontua com a opção da clínica ligada).
    if (previa.fidelidade && !await vendaPontuou(admin, vendaId)) previa.fidelidade = false
    return { previa }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

const EntradaDaDevolucao = z.object({
  itens:    Itens,
  voltou:   z.boolean({ message: 'Diga se o produto voltou ao estoque.' }),
  motivo:   z.string().trim().min(1, 'Diga o motivo da devolução.').max(500, 'Motivo longo demais.'),
  destino:  z.enum(['ESTORNO', 'CREDITO']).nullable(),
  /** O "a devolver" que a janela mostrou: mudou no meio, o banco recusa. */
  esperado: z.number().min(0),
  estorno:  z.enum(['PARCIAL', 'INTEIRO']).nullable().optional(),
  novo:     z.object({
    metodo:   z.enum(FORMAS_DE_PAGAMENTO),
    vezes:    z.number().int().min(1).max(12),
    bandeira: z.enum(BANDEIRAS.map(b => b.value) as [string, ...string[]]).nullable().optional(),
  }).nullable().optional(),
})

/** Devolve parte da venda — `produto_devolver_itens`, numa transação. */
export async function devolverParteDaVenda(
  vendaId: string, entrada: unknown,
): Promise<{ error?: string; devolver?: number; reduzido?: number; destino?: 'ESTORNO' | 'CREDITO' | null; devolvido?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    const lido = EntradaDaDevolucao.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const admin = createAdminClient()
    const venda = await vendaAoAlcance(admin, ctx, vendaId)
    if (!venda) return { error: 'Venda não encontrada.' }
    const novo = lido.data.estorno === 'INTEIRO' ? lido.data.novo ?? null : null
    if (novo && novo.metodo === 'CREDIT_CARD') {
      const recusa = await recusaDasVezesDaRede(ctx.tenantId!, novo.vezes)
      if (recusa) return { error: recusa }
    }
    const r = await gravar(admin.rpc('produto_devolver_itens', {
      p_tenant: ctx.tenantId!, p_venda: vendaId, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName ?? null,
      p_motivo: lido.data.motivo, p_itens: lido.data.itens, p_voltou: lido.data.voltou,
      p_destino: lido.data.destino, p_esperado: lido.data.esperado, p_simular: false,
      p_estorno: lido.data.estorno ?? null,
      p_novo: novo ? { metodo: novo.metodo, vezes: novo.metodo === 'CREDIT_CARD' ? novo.vezes : 1, bandeira: bandeiraDoPagamento(novo.metodo, novo.bandeira) } : null,
    }), 'devolver parte da venda') as Record<string, unknown>

    revalidatePath('/admin/financeiro')
    revalidatePath('/[slug]/financeiro', 'page')
    revalidatePath('/admin/estoque')
    revalidatePath('/[slug]/estoque', 'page')
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    revalidateTag(`client:${venda.clientId}`, { expire: 0 })
    return {
      devolver: Number(r.devolver ?? 0), reduzido: Number(r.reduzido ?? 0),
      destino: (r.destino as 'ESTORNO' | 'CREDITO' | null | undefined) ?? null,
      devolvido: String(r.devolvido ?? ''),
    }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
