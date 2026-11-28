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
import { recusaDoPagamentoDoUsado, pagamentoDoUsadoParaOBanco } from '@/lib/financeiro/pagamento-do-usado'
import { z } from 'zod'
import { getTenantContext, alcancaUnidade, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, lerTodas, mensagemDoErro } from '@/lib/db'
import { FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { BANDEIRAS } from '@/lib/financeiro/bandeiras'
import { LIMITE_DE_VEZES_NO_CARTAO, acimaDeCemAnos } from '@/lib/acima-do-comum'
import { recusaDaQuantidadeQueVolta } from '@/lib/vendas/quantidades'
import { lerPreviaDaDevolucao, type PontosDaDevolucaoNaTela, type PreviaDaDevolucao, type VendaParaDevolver } from '@/lib/produtos/devolucao'
import { pontosDaDevolucao, textoDosPontosDaDevolucao } from '@/lib/fidelidade/pontos-da-devolucao'
import { textoDosPontosDoEstorno } from '@/lib/fidelidade/pontos-do-estorno'

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
    // Sem o teto de 20 produtos, a venda pode passar das 1000 linhas que o PostgREST devolve.
    const itens = await lerTodas((de, ate) => admin.from('product_sale_items')
      .select('id, quantity, devolvidas, sort_order, products(name)')
      .eq('sale_id', venda.id).order('sort_order').order('id').range(de, ate), 'ler os itens da venda')
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

// A devolução segue a venda (o Heitor, 25/11: "Se não for impossível, ainda que
// improvável, pode ser feito."): sem o teto de 100 de cada e de 20 linhas — o
// impossível é o registro, e o que passa do que a cliente ainda tem o banco recusa.
const Itens = z.array(z.object({
  item: z.string().regex(UUID),
  quantidade: z.number().superRefine((q, c) => {
    const recusa = recusaDaQuantidadeQueVolta(q)
    if (recusa) c.addIssue({ code: 'custom', message: recusa })
  }),
}))

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
    const ligada = previa.fidelidade
    // A40 da 9ª: "os pontos dele saem do saldo" só quando a venda PONTUOU (a
    // venda de produto só pontua com a opção da clínica ligada).
    if (previa.fidelidade && !await vendaPontuou(admin, vendaId)) previa.fidelidade = false
    // CI-04 (A7 da 41ª): pago com crédito interno, o "Estorno" diz que volta ao crédito — as formas em que ela pagou.
    const pagamentos = await ler(admin.from('financial_transactions')
      .select('id, payment_method, notes, category, amount, paid_at, created_at, branches!inner(tenant_id)')
      .eq('branches.tenant_id', ctx.tenantId!).eq('product_sale_id', vendaId).eq('type', 'INCOME').eq('is_paid', true)
      .limit(100), 'ler as formas da venda') as {
        id: string; payment_method: string | null; notes: string | null; category: string | null; amount: number | string
        paid_at: string | null; created_at: string
      }[] | null
    const vivos = (pagamentos ?? []).filter(p => p.notes !== 'Estornada' && p.category !== 'Estorno' && Number(p.amount) > 0)
    previa.formas = [...new Set(vivos.filter(p => p.payment_method).map(p => p.payment_method!))]
    previa.pontos = ligada && previa.devolver > 0 ? await pontosDaDevolucaoNaTela(admin, ctx.tenantId!, vivos, previa.devolver) : null
    return { previa }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * ES-02 (D7 da 42ª): os pontos que o estorno da devolução tira, com o saldo de antes e de depois — cada
 * pagamento pela conta do estorno inteiro (`fidelidade_pontos_do_estorno`), na ordem e na proporção de
 * `produto_devolver_itens` (`pontosDaDevolucao`). O voucher usado e o prêmio de indicação do pagamento
 * estornado inteiro seguem o estorno inteiro (`textoDosPontosDoEstorno`).
 */
async function pontosDaDevolucaoNaTela(
  admin: ReturnType<typeof createAdminClient>, tenantId: string,
  vivos: { id: string; amount: number | string; paid_at: string | null; created_at: string }[], devolver: number,
): Promise<PontosDaDevolucaoNaTela | null> {
  type Linha = {
    ligada: boolean; cliente: string | null; ganhos: number; usados: number; saldo: number
    indicadora: string | null; premio_pontos: number; premio_voucher: string | null; premio_voucher_status: string | null; premio_passa: boolean
  }
  const lidos = await Promise.all(vivos.map(async p => {
    const l = ((await ler(admin.rpc('fidelidade_pontos_do_estorno', { p_tenant: tenantId, p_transacao: p.id }),
      'ler os pontos do estorno')) as Linha[] | null ?? [])[0]
    return { p, l }
  }))
  const primeira = lidos.find(x => x.l)?.l
  if (!primeira) return null
  const cfg = await ler(admin.from('loyalty_configs').select('points_per_real, pontua_venda_de_produto')
    .eq('tenant_id', tenantId).maybeSingle(), 'ler a configuração da fidelidade')
  const pontosPorReal = cfg?.pontua_venda_de_produto ? Number(cfg.points_per_real) : null
  const contas = pontosDaDevolucao(lidos.map(({ p, l }) => ({
    id: p.id, valor: Number(p.amount), pagoEm: p.paid_at, criadoEm: p.created_at,
    ganhos: Number(l?.ganhos ?? 0), usados: Number(l?.usados ?? 0),
  })), devolver, pontosPorReal)
  const cliente = primeira.cliente ?? 'a cliente'
  const saldo = Number(primeira.saldo)
  // O voucher usado e o prêmio de indicação de cada pagamento que sai inteiro: as frases do estorno inteiro.
  const vouchers = await ler(admin.from('loyalty_vouchers').select('name, used_transaction_id')
    .eq('tenant_id', tenantId).in('used_transaction_id', vivos.map(p => p.id)).eq('status', 'USADO'), 'ler os vouchers dos pagamentos')
  const doInteiro = (id: string) => {
    const l = lidos.find(x => x.p.id === id)?.l
    if (!l) return null
    const temPremio = !!l.indicadora && (Number(l.premio_pontos) > 0 || (!!l.premio_voucher && l.premio_voucher_status !== 'CANCELADO'))
    return textoDosPontosDoEstorno({
      ligada: !!l.ligada, cliente, ganhos: 0, usados: 0, saldo,
      premio: temPremio ? {
        indicadora: l.indicadora!, pontos: Number(l.premio_pontos), voucher: l.premio_voucher,
        voucherUsado: l.premio_voucher_status === 'USADO', passaParaOutro: !!l.premio_passa,
      } : null,
      voucherDoPagamento: ((vouchers ?? []).find(v => v.used_transaction_id === id)?.name as string | undefined) ?? null,
    })
  }
  const texto = (modo: 'PARCIAL' | 'INTEIRO') => {
    const c = contas[modo]
    const partes = [textoDosPontosDaDevolucao({ ligada: !!primeira.ligada, cliente, saldo, conta: c }), ...c.inteiros.map(doInteiro)]
      .filter((t): t is string => !!t)
    return partes.length ? partes.join(' ') : null
  }
  return { PARCIAL: texto('PARCIAL'), INTEIRO: texto('INTEIRO') }
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
    // O Heitor, 25/11: acima de 12 vezes avisa; só o impossível (acima de 1.200, decisão do Claude) se recusa.
    vezes:    z.number().int().min(1).max(LIMITE_DE_VEZES_NO_CARTAO, acimaDeCemAnos(LIMITE_DE_VEZES_NO_CARTAO, 'vezes')),
    bandeira: z.enum(BANDEIRAS.map(b => b.value) as [string, ...string[]]).nullable().optional(),
    /** C75: a maquininha do cartão do usado. */
    maquininha: z.string().uuid().nullable().optional(),
  }).nullable().optional(),
})

/** Devolve parte da venda — `produto_devolver_itens`, numa transação. */
export async function devolverParteDaVenda(
  vendaId: string, entrada: unknown,
): Promise<{ error?: string; devolver?: number; reduzido?: number; destino?: 'ESTORNO' | 'CREDITO' | null; devolvido?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    // C35: o Financeiro em "só os meus" não devolve (a tela já esconde).
    const lido = EntradaDaDevolucao.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const admin = createAdminClient()
    const venda = await vendaAoAlcance(admin, ctx, vendaId)
    if (!venda) return { error: 'Venda não encontrada.' }
    const novo = lido.data.estorno === 'INTEIRO' ? lido.data.novo ?? null : null
    // C75 (VF-01 da varredura de 18/11): no cartão do usado, as vezes e a maquininha da rede.
    { const recusa = await recusaDoPagamentoDoUsado(ctx.tenantId!, novo); if (recusa) return { error: recusa } }
    const r = await gravar(admin.rpc('produto_devolver_itens', {
      p_tenant: ctx.tenantId!, p_venda: vendaId, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName ?? null,
      p_motivo: lido.data.motivo, p_itens: lido.data.itens, p_voltou: lido.data.voltou,
      p_destino: lido.data.destino, p_esperado: lido.data.esperado, p_simular: false,
      p_estorno: lido.data.estorno ?? null,
      p_novo: pagamentoDoUsadoParaOBanco(novo),
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
