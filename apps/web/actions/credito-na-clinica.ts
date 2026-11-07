'use server'

/**
 * Crédito na clínica VENDIDO em dinheiro — o "vale" (decisão 1 do Heitor
 * sobre a 9ª simulação, 2026-11-07: "concordo"). A Rosana pagou R$ 300 no Pix
 * para usar depois em qualquer coisa; só havia o "Conceder crédito", fora do
 * caixa. Agora:
 * - "Crédito na clínica" no Vender, para quem recebe (`podeReceber`), com a
 *   forma de pagamento — à vista (Pix, dinheiro, débito, crédito em N vezes);
 * - entra no caixa, no fechamento e no faturamento no dia em que o dinheiro
 *   entrou (é um lançamento de receita PAGO: a regra única o conta);
 * - o uso depois não é receita de novo (F7) nem pontua; os pontos saem na
 *   venda, pelo dinheiro pago; sem comissão de venda;
 * - o estorno devolve o que ela ainda não usou (o usado fica pago).
 * A conta e a gravação moram no banco (`credito_vender`, `credito_estornar_venda`).
 *
 * Todo export é endpoint público: confere permissão, rede e alcance.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseDinheiro, DINHEIRO_INVALIDO } from '@estetica-os/utils'
import { getTenantContext, alcancaUnidade, assertPermission, podeReceber } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { recusaDasVezesDaRede } from '@/lib/financeiro/vezes-da-rede'
import { BANDEIRAS } from '@/lib/financeiro/bandeiras'
import { CLIENTE_ARQUIVADA } from '@/lib/clients/arquivada'
import { lerPreviaDoEstornoDoCredito, type PreviaDoEstornoDoCredito } from '@/lib/creditos/venda-de-credito'

const UUID = /^[0-9a-f-]{36}$/i
const FORMAS: ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD']

/** O pagamento do crédito: sempre agora (o crédito é o dinheiro que entrou). */
const PagamentoDoCredito = z.object({
  forma:    z.literal('AVISTA', { message: 'O crédito na clínica é pago na hora: escolha "À vista".' }),
  metodo:   z.enum(FORMAS, { message: 'Escolha a forma de pagamento (Pix, dinheiro ou cartão): crédito na clínica não se paga com crédito.' }),
  vezes:    z.number().int().min(1).max(12).optional(),
  bandeira: z.enum(BANDEIRAS.map(b => b.value) as [string, ...string[]]).optional().nullable(),
})

function revalidar() {
  revalidatePath('/admin/clients/[id]', 'page')
  revalidatePath('/[slug]/clients/[id]', 'page')
  revalidatePath('/admin/financeiro')
  revalidatePath('/[slug]/financeiro', 'page')
  revalidatePath('/[slug]/fechamento', 'page')
  revalidatePath('/admin/fechamento')
}

type ResultadoDaVenda = { error?: string; vendaId?: string }

/** Vende `valor` de crédito na clínica à cliente, pago agora. */
export async function venderCredito(
  clienteId: string, branchId: string, valor: unknown, pagamento: unknown,
  /** A chave do envio (D10, lib/envio-unico.ts): o mesmo envio vende UMA vez. */
  envio?: string | null,
): Promise<ResultadoDaVenda> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) throw semAcesso()
    return await umaVez(ctx.tenantId!, 'venderCredito', chaveDoEnvio(envio),
      () => venderUmaVez(ctx, clienteId, branchId, valor, pagamento), { gravou: r => !!r.vendaId })
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

async function venderUmaVez(
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
  clienteId: string, branchId: string, valor: unknown, pagamento: unknown,
): Promise<ResultadoDaVenda> {
  try {
    if (typeof clienteId !== 'string' || !UUID.test(clienteId)) return { error: 'Escolha a cliente.' }
    if (typeof branchId !== 'string' || !UUID.test(branchId)) return { error: 'Dados inválidos.' }
    const reais = typeof valor === 'number' ? valor : parseDinheiro(String(valor ?? ''))
    if (!Number.isFinite(reais)) return { error: DINHEIRO_INVALIDO }
    if (reais <= 0) return { error: 'Informe um valor maior que zero.' }
    const lido = PagamentoDoCredito.safeParse(pagamento)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Pagamento inválido.' }
    const vezes = lido.data.metodo === 'CREDIT_CARD' ? lido.data.vezes ?? 1 : 1
    const recusaDasVezes = await recusaDasVezesDaRede(ctx.tenantId!, vezes)
    if (recusaDasVezes) return { error: recusaDasVezes }

    const admin = createAdminClient()
    const [unidade, cliente] = await Promise.all([
      ler(admin.from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id, is_active').eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a cliente'),
    ])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    if (!cliente) return { error: 'Cliente não encontrada.' }
    if (cliente.is_active === false) return { error: CLIENTE_ARQUIVADA }

    const { data, error } = await admin.rpc('credito_vender', {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_unidade: branchId,
      p_valor: Math.round(reais * 100) / 100, p_metodo: lido.data.metodo, p_vezes: vezes,
      p_bandeira: lido.data.bandeira ?? null, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName || null,
    })
    if (error) {
      if (error.code === 'P0001') return { error: error.message }
      throw new Error(`Não consegui vender o crédito: ${error.message}`)
    }
    revalidar()
    return { vendaId: data as string }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** A venda do crédito de um lançamento, se a pessoa a alcança. */
async function vendaDoLancamento(transacaoId: unknown) {
  const ctx = await getTenantContext()
  // A mesma permissão do estorno (reverseTransaction): o Financeiro em Gerenciar.
  assertPermission(ctx, 'financial', 'MANAGE')
  if (typeof transacaoId !== 'string' || !UUID.test(transacaoId)) return { ctx, venda: null }
  const admin = createAdminClient()
  const tx = await ler(admin.from('financial_transactions').select('credito_vendido_id').eq('id', transacaoId).maybeSingle(), 'buscar o lançamento')
  if (!tx?.credito_vendido_id) return { ctx, venda: null }
  const venda = await ler(admin.from('creditos_vendidos').select('id, tenant_id, branch_id')
    .eq('id', tx.credito_vendido_id as string).maybeSingle(), 'buscar a venda do crédito')
  if (!venda || venda.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, venda.branch_id as string)) return { ctx, venda: null }
  return { ctx, venda: { id: venda.id as string } }
}

/** A conta do estorno (o banco simulando): o vendido, o saldo dela, o que volta e o usado. */
export async function previaDoEstornoDoCredito(transacaoId: string): Promise<{ error?: string; previa?: PreviaDoEstornoDoCredito }> {
  try {
    const { ctx, venda } = await vendaDoLancamento(transacaoId)
    if (!venda) return { error: 'Venda de crédito não encontrada.' }
    const { data, error } = await createAdminClient().rpc('credito_estornar_venda', {
      p_tenant: ctx.tenantId!, p_venda: venda.id, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName || null,
      p_motivo: null, p_esperado: null, p_simular: true, p_estorno: null, p_novo: null,
    })
    if (error) return { error: error.code === 'P0001' ? error.message : mensagemDoErro(error) }
    return { previa: lerPreviaDoEstornoDoCredito(data) }
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

const EntradaDoEstorno = z.object({
  motivo:   z.string().trim().min(1, 'Diga o motivo do estorno.').max(500),
  estorno:  z.enum(['PARCIAL', 'INTEIRO']).nullable().optional(),
  novo:     z.object({ metodo: z.enum(FORMAS), vezes: z.number().int().min(1).max(12).optional(), bandeira: z.string().nullable().optional() }).nullable().optional(),
  esperado: z.number().min(0),
})

/** Estorna a venda do crédito: volta o saldo que ela ainda não usou (até o vendido). */
export async function estornarVendaDeCredito(transacaoId: string, entrada: unknown): Promise<{ error?: string; volta?: number }> {
  try {
    const { ctx, venda } = await vendaDoLancamento(transacaoId)
    if (!venda) return { error: 'Venda de crédito não encontrada.' }
    const lido = EntradaDoEstorno.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    if (lido.data.novo?.metodo === 'CREDIT_CARD') {
      const recusa = await recusaDasVezesDaRede(ctx.tenantId!, lido.data.novo.vezes ?? 1)
      if (recusa) return { error: recusa }
    }
    const { data, error } = await createAdminClient().rpc('credito_estornar_venda', {
      p_tenant: ctx.tenantId!, p_venda: venda.id, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName || null,
      p_motivo: lido.data.motivo, p_esperado: lido.data.esperado, p_simular: false,
      p_estorno: lido.data.estorno ?? null, p_novo: lido.data.novo ?? null,
    })
    if (error) return { error: error.code === 'P0001' ? error.message : mensagemDoErro(error) }
    revalidar()
    return { volta: lerPreviaDoEstornoDoCredito(data).volta }
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}
