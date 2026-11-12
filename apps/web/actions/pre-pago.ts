'use server'

/**
 * Procedimento pré-pago (decisão do Heitor, 2026-09-30): o cliente compra N
 * unidades de UM procedimento, paga (ou fica a receber) e agenda depois.
 * Separado do pacote. Quem recebe dinheiro vende e cancela (caixa ou
 * financeiro), como no pacote.
 *
 * Todo export é endpoint público: cada um confere permissão, rede e alcance.
 */

import { revalidatePath, revalidateTag } from 'next/cache'
import { recusaDoProcedimentoNaUnidade } from '@/lib/procedimentos/disponivel-na-unidade'
import { z } from 'zod'
import { CLIENTE_ARQUIVADA } from '@/lib/clients/arquivada'
import { getTenantContext, alcancaUnidade, podeReceber, assertPermission, assertRecurso } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { quemVendeu, type QuemVendeuDaTela } from '@/lib/vendas/equipe-da-venda'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { EntradaDoPagamento, lancamentosDoPagamento, recusaDaEntradaDoPagamento, comMotivoDoDesconto } from '@/lib/checkout/lancamentos'
import { recusaDasParcelasDaRede } from '@/lib/financeiro/crediario-da-rede'
import { recusaDasVezesDaRede } from '@/lib/financeiro/vezes-da-rede'
import { vezesNoCartao } from '@/lib/checkout/pagamento'
import { EntradaDoDesconto, descontoEmReais, recusaDoDesconto, ratear, motivoDoDesconto } from '@/lib/vendas/desconto'
import { createAppointmentCore, notifyAppointmentCreated } from '@/lib/appointments/core'
import { FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { BANDEIRAS, bandeiraDoPagamento } from '@/lib/financeiro/bandeiras'
import { lerPreviaDaUnidade, type PreviaDoCancelamentoDaUnidade } from '@/lib/pre-pago/cancelamento'
import { precoDoProcedimentoNaUnidade } from '@/lib/procedimentos/preco-na-unidade'

const UUID = /^[0-9a-f-]{36}$/i

function revalidarFicha() {
  revalidatePath('/admin/clients/[id]', 'page')
  revalidatePath('/[slug]/clients/[id]', 'page')
  revalidatePath('/admin/financeiro')
  revalidatePath('/[slug]/financeiro', 'page')
}

/**
 * Vende N unidades de um procedimento: a venda (com o retrato do preço e do
 * desconto), as unidades (cada uma com a sua parte do preço vendido, rateio
 * igual em centavos) e o dinheiro, numa transação (`procedimento_vender`).
 */
export async function venderProcedimento(
  clienteId: string, procedimentoId: string, branchId: string,
  quantidade: unknown, validadeDias: unknown, pagamento: unknown, desconto?: unknown,
  /** A chave do envio (D10, lib/envio-unico.ts): o mesmo envio vende UMA vez. */
  envio?: string | null,
  /** "Quem vendeu" (com-06); sem o objeto, quem registra. */
  equipe?: QuemVendeuDaTela | null,
): Promise<ResultadoDaVendaDoPrePago> {
  try {
    const ctx = await getTenantContext()
    // A pergunta (sem quem vendeu) não grava: solta a chave, e a resposta vende.
    return await umaVez(ctx.tenantId!, 'venderProcedimento', chaveDoEnvio(envio),
      () => venderProcedimentoUmaVez(clienteId, procedimentoId, branchId, quantidade, validadeDias, pagamento, desconto, equipe),
      { gravou: r => !!r.saleId })
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

type ResultadoDaVendaDoPrePago = { error?: string; saleId?: string; primeiraUnidadeId?: string; confirmarSemVendedor?: string }

async function venderProcedimentoUmaVez(
  clienteId: string, procedimentoId: string, branchId: string,
  quantidade: unknown, validadeDias: unknown, pagamento: unknown, desconto: unknown, equipe: QuemVendeuDaTela | null | undefined,
): Promise<ResultadoDaVendaDoPrePago> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'pre_pago')
    if (!podeReceber(ctx)) throw semAcesso()
    if (![clienteId, procedimentoId, branchId].every(v => typeof v === 'string' && UUID.test(v))) return { error: 'Dados inválidos.' }
    const qtd = Number(quantidade)
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 100) return { error: 'Quantidade inválida (de 1 a 100).' }
    const validade = validadeDias == null || validadeDias === '' ? null : Number(validadeDias)
    if (validade != null && (!Number.isInteger(validade) || validade < 1 || validade > 3650)) return { error: 'Validade inválida.' }
    const lido = EntradaDoPagamento.safeParse(pagamento)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Pagamento inválido.' }
    // Até quantas vezes a clínica parcela no crédito (D-15): o servidor recusa acima.
    const recusaDasVezes = await recusaDasVezesDaRede(ctx.tenantId!, vezesNoCartao(lido.data))
    if (recusaDasVezes) return { error: recusaDasVezes }
    const d = EntradaDoDesconto.safeParse(desconto)
    if (!d.success) return { error: 'Desconto inválido.' }

    const admin = createAdminClient()
    const [unidade, cliente, proc] = await Promise.all([
      ler(admin.from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id, is_active').eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente'),
      ler(admin.from('procedures').select('id, name, price, is_active, branch_id')
        .eq('id', procedimentoId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o procedimento'),
    ])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    if (!cliente) return { error: 'Cliente não encontrado.' }
    if (cliente.is_active === false) return { error: CLIENTE_ARQUIVADA }
    if (!proc) return { error: 'Procedimento não encontrado.' }
    if (proc.is_active === false) return { error: 'Este procedimento está desativado.' }
    if (proc.branch_id && proc.branch_id !== branchId) return { error: 'Este procedimento é de outra unidade.' }
    // E a unidade OFERECE o procedimento (D7 da 13ª, F65): o da rede restrito a outras não se vende aqui.
    const naoFeito = await recusaDoProcedimentoNaUnidade(admin, ctx.tenantId!, procedimentoId, branchId)
    if (naoFeito) return { error: naoFeito }

    // O preço DA UNIDADE da venda, quando ela tem um (D2 da 9ª); o banco confere
    // pela mesma regra (`private.preco_na_unidade`).
    const unitario = await precoDoProcedimentoNaUnidade(admin, procedimentoId, branchId, proc.price as number | null)
    const tabela = Math.round(unitario * 100) * qtd / 100
    const recusa = recusaDoDesconto(tabela, d.data)
    if (recusa) return { error: recusa }
    const reais = descontoEmReais(tabela, d.data)
    const vendido = Math.round((tabela - reais) * 100) / 100
    const recusaDaEntrada = recusaDaEntradaDoPagamento(lido.data, vendido)
    // C38: o crediário até o limite da rede.
    const recusaDasParcelas = await recusaDasParcelasDaRede(ctx.tenantId!, lido.data)
    if (recusaDasParcelas) return { error: recusaDasParcelas }
    if (recusaDaEntrada) return { error: recusaDaEntrada }

    // Quem vendeu (com-06): aparece nas Vendas; vazio, só com a confirmação.
    const vendeu = await quemVendeu(ctx.tenantId!, ctx.internalUserId ?? null, equipe, branchId)
    if ('error' in vendeu) return { error: vendeu.error }
    if ('pergunta' in vendeu) return { confirmarSemVendedor: vendeu.pergunta }

    const rotulo = `${qtd}× ${proc.name as string}`
    const saleId = await gravar(admin.rpc('procedimento_vender_com_equipe', {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_procedimento: procedimentoId, p_unidade: branchId,
      p_ator: ctx.internalUserId ?? null, p_vendedor: vendeu.vendedor, p_quantidade: qtd, p_desconto: reais, p_validade_dias: validade,
      p_lancamentos: comMotivoDoDesconto(lancamentosDoPagamento(vendido, lido.data, rotulo), motivoDoDesconto(d.data, reais)),
      // Cada unidade com a sua parte do vendido: a base da comissão dela.
      p_unidades: ratear(Array.from({ length: qtd }, () => 1), vendido).map(preco => ({ preco })),
    }), 'vender o procedimento') as string

    // A primeira unidade: é por ela que o "Agendar agora" começa.
    const primeira = await ler(admin.from('procedure_sale_units').select('id')
      .eq('sale_id', saleId).order('numero').limit(1).maybeSingle(), 'buscar a primeira unidade')

    revalidarFicha()
    return { saleId, primeiraUnidadeId: (primeira?.id as string | undefined) ?? undefined }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** A unidade pré-paga da rede, com a unidade da clínica ao alcance (§11). Nula quando não é. */
async function unidadeAoAlcance(
  admin: ReturnType<typeof createAdminClient>, ctx: Awaited<ReturnType<typeof getTenantContext>>, unidadeId: unknown,
): Promise<{ clientId: string } | null> {
  if (typeof unidadeId !== 'string' || !UUID.test(unidadeId)) return null
  const unidade = await ler(admin.from('procedure_sale_units')
    .select('id, procedure_sales!inner(tenant_id, branch_id, client_id)')
    .eq('id', unidadeId).maybeSingle(), 'buscar a unidade')
  const venda = unidade?.procedure_sales as unknown as { tenant_id: string; branch_id: string; client_id: string } | undefined
  if (!unidade || venda?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, venda.branch_id)) return null
  return { clientId: venda.client_id }
}

/**
 * A conta do cancelamento de uma unidade, ANTES de cancelar (D1 da 6ª
 * simulação, o fluxo do pacote): o que a venda passa a valer, o a receber que
 * cai e o que volta. É a MESMA função que grava, simulando: a tela não refaz
 * conta nenhuma.
 */
export async function previaDoCancelamentoDaUnidade(
  unidadeId: string,
): Promise<{ error?: string; previa?: PreviaDoCancelamentoDaUnidade }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) throw semAcesso()
    const admin = createAdminClient()
    if (!await unidadeAoAlcance(admin, ctx, unidadeId)) return { error: 'Unidade não encontrada.' }
    const j = await ler(admin.rpc('procedimento_cancelar_unidade_devolvendo', {
      p_tenant: ctx.tenantId!, p_unidade: unidadeId, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName ?? null,
      p_motivo: null, p_destino: null, p_esperado: null, p_simular: true, p_estorno: null, p_novo: null,
    }), 'calcular o cancelamento da unidade') as Record<string, unknown>
    return { previa: lerPreviaDaUnidade(j) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

const EntradaDoCancelamentoDaUnidade = z.object({
  motivo:   z.string().trim().min(1, 'Informe o motivo do cancelamento.').max(500, 'Motivo longo demais.'),
  destino:  z.enum(['ESTORNO', 'CREDITO']).nullable(),
  /** O "a devolver" que a janela mostrou: mudou no meio, o banco recusa. */
  esperado: z.number().min(0),
  /** Como estornar o pagamento que volta em parte; no cartão, só o inteiro. */
  estorno:  z.enum(['PARCIAL', 'INTEIRO']).nullable().optional(),
  novo:     z.object({
    metodo:   z.enum(FORMAS_DE_PAGAMENTO),
    vezes:    z.number().int().min(1).max(12),
    bandeira: z.enum(BANDEIRAS.map(b => b.value) as [string, ...string[]]).nullable().optional(),
  }).nullable().optional(),
})

/**
 * Cancela uma unidade ainda disponível, pelo fluxo do pacote (D1 da 6ª
 * simulação): o a receber que passa do que a venda vale cai antes, e o pago
 * além disso volta como a recepção escolher — ESTORNO (no cartão, o pagamento
 * inteiro estornado e o que fica lançado de novo; os recebíveis da operadora
 * caem juntos) ou CRÉDITO NA CLÍNICA. Era uma "Devolução" a pagar, sem forma
 * — `procedimento_cancelar_unidade_devolvendo`, numa transação.
 */
export async function cancelarUnidadePrePaga(
  unidadeId: string, entrada: unknown,
): Promise<{ error?: string; devolver?: number; reduzido?: number; destino?: 'ESTORNO' | 'CREDITO' | null }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) throw semAcesso()
    const lido = EntradaDoCancelamentoDaUnidade.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const admin = createAdminClient()
    const unidade = await unidadeAoAlcance(admin, ctx, unidadeId)
    if (!unidade) return { error: 'Unidade não encontrada.' }
    const novo = lido.data.estorno === 'INTEIRO' ? lido.data.novo ?? null : null
    if (novo && novo.metodo === 'CREDIT_CARD') {
      const recusa = await recusaDasVezesDaRede(ctx.tenantId!, novo.vezes)
      if (recusa) return { error: recusa }
    }
    const r = await gravar(admin.rpc('procedimento_cancelar_unidade_devolvendo', {
      p_tenant: ctx.tenantId!, p_unidade: unidadeId, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName ?? null,
      p_motivo: lido.data.motivo, p_destino: lido.data.destino, p_esperado: lido.data.esperado, p_simular: false,
      p_estorno: lido.data.estorno ?? null,
      p_novo: novo ? { metodo: novo.metodo, vezes: novo.metodo === 'CREDIT_CARD' ? novo.vezes : 1, bandeira: bandeiraDoPagamento(novo.metodo, novo.bandeira) } : null,
    }), 'cancelar a unidade') as Record<string, unknown>

    revalidarFicha()
    revalidateTag(`client:${unidade.clientId}`, { expire: 0 })
    return {
      devolver: Number(r.devolver ?? 0), reduzido: Number(r.reduzido ?? 0),
      destino: (r.destino as 'ESTORNO' | 'CREDITO' | null | undefined) ?? null,
    }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Agenda uma unidade pré-paga (fase 3): pelo núcleo do agendamento, com o
 * crédito — o procedimento e o preço são os da unidade, e ela fica ligada ao
 * agendamento. Conflito de horário, histórico e evento como qualquer agendamento.
 */
export async function agendarUnidadePrePaga(p: {
  unidadeId: string; branchId: string; professionalId: string; scheduledAt: string
}): Promise<{ error?: string; appointmentId?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    if (![p?.unidadeId, p?.branchId, p?.professionalId].every(v => typeof v === 'string' && UUID.test(v))) return { error: 'Dados inválidos.' }
    if (typeof p.scheduledAt !== 'string' || Number.isNaN(Date.parse(p.scheduledAt))) return { error: 'Informe data e hora.' }

    const admin = createAdminClient()
    const unidade = await ler(admin.from('procedure_sale_units')
      .select('id, procedure_sales!inner(tenant_id, client_id)')
      .eq('id', p.unidadeId).maybeSingle(), 'buscar a unidade')
    const venda = unidade?.procedure_sales as unknown as { tenant_id: string; client_id: string } | undefined
    if (!unidade || venda?.tenant_id !== ctx.tenantId) return { error: 'Unidade não encontrada.' }

    const res = await createAppointmentCore(admin, ctx, {
      branchId: p.branchId, clientId: venda.client_id, procedureId: null,
      professionalId: p.professionalId, scheduledAt: p.scheduledAt,
      credito: { tipo: 'PRE_PAGO', id: p.unidadeId }, source: 'INTERNAL',
    })
    if ('error' in res) return { error: res.error }

    notifyAppointmentCreated(res.id)
    revalidarFicha()
    revalidatePath('/admin/agenda')
    revalidatePath('/[slug]/agenda', 'page')
    return { appointmentId: res.id }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
