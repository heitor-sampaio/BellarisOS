'use server'

/**
 * Pacotes (decisão do Heitor, 2026-09-30): o catálogo, em Procedimentos, e a
 * venda, na ficha do cliente. Até aqui `service_packages` e `client_packages`
 * só existiam no banco de demonstração.
 *
 * Todo export é endpoint público: cada um confere permissão, rede e alcance.
 */

import { revalidatePath, revalidateTag } from 'next/cache'
import { CLIENTE_ARQUIVADA } from '@/lib/clients/arquivada'
import { z } from 'zod'
import { getTenantContext, assertPermission, alcancaUnidade, podeReceber, assertRecurso } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { recusaDoMembroDaVenda, quemVendeu, type QuemVendeuDaTela } from '@/lib/vendas/equipe-da-venda'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { EntradaDoPagamento, lancamentosDoPagamento, recusaDaEntradaDoPagamento, comMotivoDoDesconto } from '@/lib/checkout/lancamentos'
import { recusaDasVezesDaRede } from '@/lib/financeiro/vezes-da-rede'
import { FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { vezesNoCartao } from '@/lib/checkout/pagamento'
import { sessoesDoPacote } from '@/lib/pacotes/rateio'
import { itensParaRateio } from '@/lib/pacotes/leitura'
import { EntradaDoDesconto, descontoEmReais, recusaDoDesconto, motivoDoDesconto } from '@/lib/vendas/desconto'
import { EntradaDaComissaoDoPacote } from '@/lib/comissoes/config'
import { podeMudarComissaoDoProcedimento } from '@/lib/comissoes/gravacao'
import { lerPreviaDoCancelamento, agendamentosCancelados, type PreviaDoCancelamento } from '@/lib/pacotes/cancelamento'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { notifyCancelledAppointment, getUserName } from '@/lib/appointments/avisos'
import { EVENTOS } from '@estetica-os/types'
import { falaDaRede } from '@/lib/unidades/uma-so'
import { BANDEIRAS, bandeiraDoPagamento } from '@/lib/financeiro/bandeiras'

type Resultado = { error?: string; ok?: true }

/** Um pacote é um conjunto de procedimentos, iguais ou não (decisão do Heitor). */
const EntradaDoPacote = z.object({
  id:            z.string().uuid().optional(),
  name:          z.string().trim().min(2, 'Dê um nome ao pacote.').max(120),
  itens:         z.array(z.object({
    procedure_id: z.string().uuid('Escolha o procedimento.'),
    quantity:     z.number().int().min(1, 'Cada procedimento entra pelo menos uma vez.').max(100),
  })).min(1, 'Adicione pelo menos um procedimento ao pacote.').max(30),
  price:         z.number().min(0).max(1_000_000),
  validity_days: z.number().int().min(1).max(3650).nullable(),
  is_active:     z.boolean(),
  /** A comissão do pacote (2026-10-30). Ausente = não mexe nela. */
  comissao:      EntradaDaComissaoDoPacote.optional(),
}).refine(p => p.itens.reduce((s, i) => s + i.quantity, 0) >= 2, 'Um pacote tem pelo menos 2 sessões.')
  .refine(p => p.itens.reduce((s, i) => s + i.quantity, 0) <= 100, 'No máximo 100 sessões num pacote.')

/** Catálogo da REDE: procedimento e configuração são dados da rede (§ Decisões). */
export async function salvarPacote(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'pacotes')
    assertPermission(ctx, 'procedures', 'MANAGE')
    if (ctx.branchId !== null) return { error: await falaDaRede(ctx.tenantId, 'O catálogo de pacotes é da rede: quem muda é quem administra a rede.') }
    const lido = EntradaDoPacote.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const p = lido.data
    // Quanto se paga de comissão é do financeiro (§9.7), como a do procedimento:
    // conferido ANTES de gravar, para a recusa não deixar meio cadastro.
    if (p.comissao && !podeMudarComissaoDoProcedimento(ctx)) return { error: 'Seu cargo não muda a comissão dos pacotes.' }

    // O mesmo procedimento em duas linhas vira uma só, somada.
    const porProcedimento = new Map<string, number>()
    for (const i of p.itens) porProcedimento.set(i.procedure_id, (porProcedimento.get(i.procedure_id) ?? 0) + i.quantity)
    const itens = [...porProcedimento].map(([procedure_id, quantity]) => ({ procedure_id, quantity }))

    // Pacote e itens numa transação; o banco confere que os procedimentos são
    // da rede. Vendido já tem o retrato (preço, sessões e procedimento de cada
    // uma): mudar o catálogo vale para as próximas vendas.
    await gravar(createAdminClient().rpc('pacote_salvar', {
      p_tenant: ctx.tenantId!, p_id: p.id ?? null, p_nome: p.name, p_preco: Math.round(p.price * 100) / 100,
      p_validade: p.validity_days, p_ativo: p.is_active, p_itens: itens,
      p_comissao: p.comissao ?? null,
    }), 'salvar o pacote')
    revalidatePath('/admin/pacotes')
    revalidatePath('/[slug]/pacotes', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Vende um pacote ao cliente: o pacote do cliente (com o retrato do preço), as
 * sessões e o dinheiro, numa transação (`pacote_vender`). Quem recebe dinheiro
 * vende (caixa ou financeiro), como no plano.
 *
 * Com desconto (R$ ou %, sem teto — decisão do Heitor), o preço vendido é o do
 * catálogo menos o desconto: é ele que o pagamento cobre e que as sessões
 * rateiam, então a comissão de cada sessão já sai sobre o vendido.
 */
/** A equipe da venda (com-04/com-06): quem é a profissional responsável do pacote, e a resposta à pergunta de sem ninguém. */
export interface EquipeDaVendaDoPacote extends QuemVendeuDaTela { responsavelId?: string | null; semResponsavel?: boolean }
type ResultadoDaVendaDoPacote = { error?: string; clientPackageId?: string; confirmarSemResponsavel?: string; confirmarSemVendedor?: string }

/** A pergunta quando o pacote paga quem atende sobre o valor dele e ninguém foi marcado (com-04). */
const PERGUNTA_SEM_RESPONSAVEL = 'Ninguém foi marcado como responsável: a comissão de quem atende deste pacote (sobre o valor dele) não vai para ninguém. Vender assim?'

export async function venderPacote(
  clienteId: string, pacoteId: string, branchId: string, pagamento: unknown, desconto?: unknown,
  /** A chave do envio (D10, lib/envio-unico.ts): o mesmo envio vende UMA vez. */
  envio?: string | null,
  equipe?: EquipeDaVendaDoPacote | null,
): Promise<ResultadoDaVendaDoPacote> {
  try {
    const ctx = await getTenantContext()
    // A pergunta (sem responsável) não grava: solta a chave, e a resposta vende.
    return await umaVez(ctx.tenantId!, 'venderPacote', chaveDoEnvio(envio),
      () => venderPacoteUmaVez(clienteId, pacoteId, branchId, pagamento, desconto, equipe ?? null),
      { gravou: r => !!r.clientPackageId })
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

async function venderPacoteUmaVez(
  clienteId: string, pacoteId: string, branchId: string, pagamento: unknown, desconto: unknown,
  equipe: EquipeDaVendaDoPacote | null,
): Promise<ResultadoDaVendaDoPacote> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'pacotes')
    if (!podeReceber(ctx)) throw semAcesso()
    const uuid = /^[0-9a-f-]{36}$/i
    if (![clienteId, pacoteId, branchId].every(v => typeof v === 'string' && uuid.test(v))) return { error: 'Dados inválidos.' }
    const lido = EntradaDoPagamento.safeParse(pagamento)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Pagamento inválido.' }
    // Até quantas vezes a clínica parcela no crédito (D-15): o servidor recusa acima.
    const recusaDasVezes = await recusaDasVezesDaRede(ctx.tenantId!, vezesNoCartao(lido.data))
    if (recusaDasVezes) return { error: recusaDasVezes }
    const d = EntradaDoDesconto.safeParse(desconto)
    if (!d.success) return { error: 'Desconto inválido.' }

    const admin = createAdminClient()
    const [unidade, cliente, pacote] = await Promise.all([
      ler(admin.from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id, is_active').eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente'),
      ler(admin.from('service_packages').select('id, name, price, is_active, comissao_responsavel_tipo')
        .eq('id', pacoteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o pacote'),
    ])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    if (!cliente) return { error: 'Cliente não encontrado.' }
    if (cliente.is_active === false) return { error: CLIENTE_ARQUIVADA }
    if (!pacote) return { error: 'Pacote não encontrado.' }
    if (!pacote.is_active) return { error: 'Este pacote está desativado.' }

    const preco = Number(pacote.price)
    const recusa = recusaDoDesconto(preco, d.data)
    if (recusa) return { error: recusa }
    const reais = descontoEmReais(preco, d.data)
    const vendido = Math.round((preco - reais) * 100) / 100
    const recusaDaEntrada = recusaDaEntradaDoPagamento(lido.data, vendido)
    if (recusaDaEntrada) return { error: recusaDaEntrada }

    // Quem vendeu (com-06): leva a comissão de venda do pacote; vazio, só com a confirmação.
    const vendeu = await quemVendeu(ctx.tenantId!, ctx.internalUserId ?? null, equipe, branchId)
    if ('error' in vendeu) return { error: vendeu.error }
    if ('pergunta' in vendeu) return { confirmarSemVendedor: vendeu.pergunta }

    // com-04: o pacote que paga quem atende sobre o valor dele pede a
    // responsável; sem ninguém, pergunta antes (e confirmado, ninguém recebe).
    const responsavelId = typeof equipe?.responsavelId === 'string' && equipe.responsavelId ? equipe.responsavelId : null
    if (pacote.comissao_responsavel_tipo) {
      if (responsavelId) {
        const recusa = await recusaDoMembroDaVenda(ctx.tenantId!, responsavelId, branchId, { atende: true, papel: 'A profissional responsável' })
        if (recusa) return { error: recusa }
      } else if (equipe?.semResponsavel !== true) {
        return { confirmarSemResponsavel: PERGUNTA_SEM_RESPONSAVEL }
      }
    }

    const lancamentos = comMotivoDoDesconto(lancamentosDoPagamento(vendido, lido.data, `Pacote ${pacote.name as string}`), motivoDoDesconto(d.data, reais))
    // Cada sessão com o seu procedimento e a sua parte do preço VENDIDO (rateio
    // pelo preço de tabela): é a base da comissão dela. O banco confere a soma.
    const sessoes = sessoesDoPacote(await itensParaRateio(ctx.tenantId!, pacoteId), vendido)
    const clientPackageId = await gravar(admin.rpc('pacote_vender_com_equipe', {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_pacote: pacoteId, p_unidade: branchId,
      p_ator: ctx.internalUserId ?? null, p_vendedor: vendeu.vendedor,
      p_responsavel: pacote.comissao_responsavel_tipo ? responsavelId : null,
      p_lancamentos: lancamentos, p_sessoes: sessoes, p_desconto: reais,
    }), 'vender o pacote') as string

    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    revalidatePath('/admin/financeiro')
    revalidatePath('/[slug]/financeiro', 'page')
    return { clientPackageId }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// --- Cancelar pacote (F2b da 5ª simulação, 2026-11-01) ----------------------

/**
 * O pacote da cliente, da rede e com a unidade ao alcance (§11: a abrangência
 * se confere na action). Nulo quando não é.
 */
async function pacoteDaClienteAoAlcance(
  admin: ReturnType<typeof createAdminClient>, ctx: Awaited<ReturnType<typeof getTenantContext>>, id: string,
): Promise<{ id: string; branch_id: string; client_id: string } | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const cp = await ler(admin.from('client_packages')
    .select('id, branch_id, client_id, branches!inner(tenant_id)')
    .eq('id', id).maybeSingle(), 'buscar o pacote da cliente')
  const rede = (cp?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  if (!cp || rede !== ctx.tenantId || !alcancaUnidade(ctx, cp.branch_id as string)) return null
  return { id: cp.id as string, branch_id: cp.branch_id as string, client_id: cp.client_id as string }
}

/**
 * A conta do cancelamento, ANTES de cancelar: as sessões restantes e o valor
 * delas (o rateio do pacote, com o desconto), as parcelas a receber que caem,
 * o que volta e as sessões já agendadas. É a MESMA função que grava
 * (`pacote_cancelar` com `p_simular`): a tela não refaz conta nenhuma.
 */
export async function previaDoCancelamentoDoPacote(
  clientPackageId: string,
): Promise<{ error?: string; previa?: PreviaDoCancelamento }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    const admin = createAdminClient()
    const cp = await pacoteDaClienteAoAlcance(admin, ctx, clientPackageId)
    if (!cp) return { error: 'Pacote não encontrado.' }
    const j = await ler(admin.rpc('pacote_cancelar_devolvendo', {
      p_tenant: ctx.tenantId!, p_pacote: cp.id, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName ?? null,
      p_motivo: null, p_destino: null, p_agendamentos: null, p_esperado: null, p_simular: true,
      p_estorno: null, p_novo: null,
    }), 'calcular o cancelamento do pacote') as Record<string, unknown>
    return { previa: lerPreviaDoCancelamento(j) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

const EntradaDoCancelamento = z.object({
  motivo:       z.string().trim().min(1, 'Diga o motivo do cancelamento.').max(500),
  destino:      z.enum(['ESTORNO', 'CREDITO']).nullable(),
  agendamentos: z.enum(['CANCELAR', 'SOLTAR']).nullable(),
  /** O "a devolver" que a janela mostrou: mudou no meio, o banco recusa. */
  esperado:     z.number().min(0),
  /**
   * Como estornar o pagamento que volta em parte (r2-ven-05): parcial, ou o
   * inteiro com o usado lançado de novo na forma `novo`. No cartão, o banco
   * só aceita o inteiro (r2-fin-03). Ausente: parcial fora do cartão.
   */
  estorno:      z.enum(['PARCIAL', 'INTEIRO']).nullable().optional(),
  novo:         z.object({
    metodo: z.enum(FORMAS_DE_PAGAMENTO),
    vezes:  z.number().int().min(1).max(12),
    /** r3-f13-01: a bandeira do cartão do pagamento novo, opcional. */
    bandeira: z.enum(BANDEIRAS.map(b => b.value) as [string, ...string[]]).nullable().optional(),
  }).nullable().optional(),
})

/**
 * Cancela o pacote: as sessões que sobraram, o crediário que passa do usado,
 * o que volta (estorno ou crédito na clínica), a comissão e os agendamentos
 * — numa transação (`pacote_cancelar`). Quem pode: `financial: MANAGE`, com a
 * unidade do pacote ao alcance.
 */
export async function cancelarPacote(clientPackageId: string, entrada: unknown): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    const lido = EntradaDoCancelamento.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const admin = createAdminClient()
    const cp = await pacoteDaClienteAoAlcance(admin, ctx, clientPackageId)
    if (!cp) return { error: 'Pacote não encontrado.' }
    const novo = lido.data.estorno === 'INTEIRO' ? lido.data.novo ?? null : null
    if (novo && novo.metodo === 'CREDIT_CARD') {
      const recusa = await recusaDasVezesDaRede(ctx.tenantId!, novo.vezes)
      if (recusa) return { error: recusa }
    }
    const userName = ctx.userName || await getUserName(admin, ctx.userId)
    const j = await gravar(admin.rpc('pacote_cancelar_devolvendo', {
      p_tenant: ctx.tenantId!, p_pacote: cp.id, p_ator: ctx.internalUserId ?? null, p_ator_nome: userName,
      p_motivo: lido.data.motivo, p_destino: lido.data.destino, p_agendamentos: lido.data.agendamentos,
      p_esperado: lido.data.esperado, p_simular: false,
      p_estorno: lido.data.estorno ?? null,
      p_novo: novo ? { metodo: novo.metodo, vezes: novo.metodo === 'CREDIT_CARD' ? novo.vezes : 1, bandeira: bandeiraDoPagamento(novo.metodo, novo.bandeira) } : null,
    }), 'cancelar o pacote') as Record<string, unknown>

    // Os agendamentos cancelados com o pacote avisam como qualquer
    // cancelamento (o evento das automações e a cliente/equipe), depois da
    // transação: o banco já gravou o status e o histórico.
    const motivo = `Pacote cancelado: ${lido.data.motivo}`
    for (const id of agendamentosCancelados(j)) {
      await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CANCELADO, id, { ...ctx, userName }, { motivo })
      notifyCancelledAppointment(id, motivo, ctx.internalUserId)
    }

    revalidateTag(`client:${cp.client_id}`, { expire: 0 })
    revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
    revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    revalidatePath('/admin/financeiro')
    revalidatePath('/[slug]/financeiro', 'page')
    revalidatePath('/admin/agenda')
    revalidatePath('/[slug]/agenda', 'page')
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
