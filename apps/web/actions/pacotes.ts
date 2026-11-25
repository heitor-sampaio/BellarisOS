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
import { recusaDaVendaNaUnidade } from '@/lib/vendas/unidade-da-venda'
import { z } from 'zod'
import { alcancaOCaixaDoTratamento } from '@/lib/tratamento/alcance'
import { getTenantContext, assertPermission, alcancaUnidade, podeReceber, assertRecurso } from '@/lib/auth'
import { veOsDocumentos } from '@/lib/documentos/acesso'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { recusaDoMembroDaVenda, quemVendeu, type QuemVendeuDaTela } from '@/lib/vendas/equipe-da-venda'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { EntradaDoPagamento, lancamentosDoPagamento, recusaDaEntradaDoPagamento, comMotivoDoDesconto, comFidelidadeNaPrimeira } from '@/lib/checkout/lancamentos'
import { fidelidadeDaVenda } from '@/lib/fidelidade/na-venda'
import type { EscolhaDaFidelidade } from '@/lib/fidelidade/conta-na-venda'
import { recusaDasParcelasDaRede } from '@/lib/financeiro/crediario-da-rede'
import { recusaDasVezesDoPagamento } from '@/lib/financeiro/vezes-da-rede'
import { recusaDoPagamentoDoUsado, pagamentoDoUsadoParaOBanco } from '@/lib/financeiro/pagamento-do-usado'
import { sessoesDoPacote } from '@/lib/pacotes/rateio'
import { itensParaRateio } from '@/lib/pacotes/leitura'
import { trazerPacoteCore } from '@/lib/pacotes/trazer'
import { EntradaDoDesconto, descontoEmReais, recusaDoDesconto, motivoDoDesconto } from '@/lib/vendas/desconto'
import { EntradaDaComissaoDoPacote } from '@/lib/comissoes/config'
import { podeMudarComissaoDoProcedimento } from '@/lib/comissoes/gravacao'
import { lerPreviaDoCancelamento, agendamentosCancelados, type PreviaDoCancelamento } from '@/lib/pacotes/cancelamento'
import { EntradaDoCancelamento } from '@/lib/pacotes/entrada-do-cancelamento'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { notifyCancelledAppointment, getUserName } from '@/lib/appointments/avisos'
import { EVENTOS } from '@estetica-os/types'
import { pontosDoConjunto } from '@/lib/pacotes/pontos-do-cancelamento'
import { prepararDocumentosDoPacote, contratoDaVendaDoPacote, type ContratoParaAssinar } from '@/lib/documentos/pacote'
import { rotuloDoQueFalta } from '@/lib/documentos/leitura'
import { oQueFalta } from '@/lib/documentos/o-que-falta'

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
  /**
   * DC1c/PC9b (leva 2): os documentos puxados dos procedimentos que a rede
   * EXCLUIU deste pacote. Ausente = não mexe neles.
   */
  documentos_excluidos: z.array(z.string().uuid()).max(100).optional(),
}).refine(p => p.itens.reduce((s, i) => s + i.quantity, 0) >= 2, 'Um pacote tem pelo menos 2 sessões.')
  .refine(p => p.itens.reduce((s, i) => s + i.quantity, 0) <= 100, 'No máximo 100 sessões num pacote.')

/** Catálogo da REDE: procedimento e configuração são dados da rede (§ Decisões). */
export async function salvarPacote(entrada: unknown): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'pacotes')
    assertPermission(ctx, 'procedures', 'MANAGE')
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
    // O registro do pacote trazido de fora (F35) não é do catálogo: não se edita por aqui.
    if (p.id) {
      const atual = await ler(createAdminClient().from('service_packages').select('de_fora')
        .eq('id', p.id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o pacote')
      if (atual?.de_fora) return { error: 'Este é o registro de um pacote trazido de fora: ele não é do catálogo de venda.' }
    }

    // Pacote e itens numa transação; o banco confere que os procedimentos são
    // da rede. Vendido já tem o retrato (preço, sessões e procedimento de cada
    // uma): mudar o catálogo vale para as próximas vendas.
    await gravar(createAdminClient().rpc('pacote_salvar', {
      p_tenant: ctx.tenantId!, p_id: p.id ?? null, p_nome: p.name, p_preco: Math.round(p.price * 100) / 100,
      p_validade: p.validity_days, p_ativo: p.is_active, p_itens: itens,
      p_comissao: p.comissao ?? null,
      p_documentos_excluidos: p.documentos_excluidos ?? null,
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
export interface EquipeDaVendaDoPacote extends QuemVendeuDaTela {
  responsavelId?: string | null; semResponsavel?: boolean
  /** A resposta à pergunta do contrato assinado com outro pagamento (PC2): troca por um novo, a assinar. */
  substituirContrato?: boolean
}
type ResultadoDaVendaDoPacote = {
  error?: string; clientPackageId?: string; confirmarSemResponsavel?: string; confirmarSemVendedor?: string
  /**
   * PC2 (o Heitor, 2026-11-13: "o ideal era funcionar como no plano"; do plano:
   * "primeiro colhe assinatura, depois paga"): o contrato de pacote a colher
   * ANTES do dinheiro. Veio isto, nada se gravou — colhe, e vende de novo.
   */
  contratoParaAssinar?: ContratoParaAssinar
  /** O contrato foi assinado com outro pagamento: vender assim pede um novo (A45 da 5ª, como no plano). */
  confirmarSubstituirContrato?: string
  /** A 1ª sessão do pacote vendido, para o "Agendar a 1ª sessão agora" (A47 da 7ª simulação). */
  primeiraSessao?: { id: string; procedimento: { id: string; nome: string; duracaoMin: number } } | null
  /**
   * PC2 (leva 2): os termos e os outros documentos que a venda emitiu, para a
   * tela dizer o que ficou para assinar. Esses não seguram o dinheiro — só o
   * contrato de pacote (`contratoParaAssinar`).
   */
  documentos?: DocumentoDaVenda[]
  /**
   * Quem vendeu vê a ficha da cliente (Clientes): o aviso diz que os
   * documentos estão lá. Colher é dela de qualquer jeito (o Heitor,
   * 2026-11-16: colher não pede o módulo Documentos).
   */
  veOsDocumentos?: boolean
}

/** Um documento da venda do pacote, como a tela da venda o mostra (`faltando`: como a pessoa lê, "Endereço"). */
export interface DocumentoDaVenda { id: string; titulo: string; status: string; faltando: string[] }

/** A pergunta quando o pacote paga quem atende sobre o valor dele e ninguém foi marcado (com-04). */
const PERGUNTA_SEM_RESPONSAVEL = 'Ninguém foi marcado como responsável: a comissão de quem atende deste pacote (sobre o valor dele) não vai para ninguém. Vender assim?'

export async function venderPacote(
  clienteId: string, pacoteId: string, branchId: string, pagamento: unknown, desconto?: unknown,
  /** A chave do envio (D10, lib/envio-unico.ts): o mesmo envio vende UMA vez. */
  envio?: string | null,
  equipe?: EquipeDaVendaDoPacote | null,
  /** FD2a: os pontos e o voucher de desconto, no pagamento à vista. */
  fidelidade?: EscolhaDaFidelidade | null,
): Promise<ResultadoDaVendaDoPacote> {
  try {
    const ctx = await getTenantContext()
    // A pergunta (sem responsável) não grava: solta a chave, e a resposta vende.
    return await umaVez(ctx.tenantId!, 'venderPacote', chaveDoEnvio(envio),
      () => venderPacoteUmaVez(clienteId, pacoteId, branchId, pagamento, desconto, equipe ?? null, fidelidade ?? null),
      { gravou: r => !!r.clientPackageId })
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

async function venderPacoteUmaVez(
  clienteId: string, pacoteId: string, branchId: string, pagamento: unknown, desconto: unknown,
  equipe: EquipeDaVendaDoPacote | null,
  fidelidade: EscolhaDaFidelidade | null = null,
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
    // D1 da 18ª: cada forma paga agora (o à vista dividido confere todas).
    const recusaDasVezes = await recusaDasVezesDoPagamento(ctx.tenantId!, lido.data)
    if (recusaDasVezes) return { error: recusaDasVezes }
    const d = EntradaDoDesconto.safeParse(desconto)
    if (!d.success) return { error: 'Desconto inválido.' }

    const admin = createAdminClient()
    const [unidade, cliente, pacote] = await Promise.all([
      ler(admin.from('branches').select('id, is_active').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id, is_active').eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente'),
      ler(admin.from('service_packages').select('id, name, price, is_active, comissao_responsavel_tipo')
        .eq('id', pacoteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o pacote'),
    ])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    // D4 da 30ª (UN-14): a unidade desativada não vende.
    const naDesativada = recusaDaVendaNaUnidade(unidade)
    if (naDesativada) return { error: naDesativada }
    if (!cliente) return { error: 'Cliente não encontrado.' }
    if (cliente.is_active === false) return { error: CLIENTE_ARQUIVADA }
    if (!pacote) return { error: 'Pacote não encontrado.' }
    if (!pacote.is_active) return { error: 'Este pacote está desativado.' }

    const preco = Number(pacote.price)
    const recusa = recusaDoDesconto(preco, d.data)
    if (recusa) return { error: recusa }
    const reais = descontoEmReais(preco, d.data)
    const vendido = Math.round((preco - reais) * 100) / 100
    // FD2a: os pontos e o voucher (à vista), conferidos aqui e de novo no banco.
    const fid = await fidelidadeDaVenda({ tenantId: ctx.tenantId!, clienteId, vendido, escolha: fidelidade, aVista: lido.data.forma === 'AVISTA', admin })
    if ('error' in fid) return { error: fid.error }
    // D1 da 18ª: dividida, a primeira forma leva de volta o que a fidelidade desconta.
    const pagamentoDaVenda = comFidelidadeNaPrimeira(lido.data, fid.dados)
    const recusaDaEntrada = recusaDaEntradaDoPagamento(pagamentoDaVenda, vendido)
    // C38: o crediário até o limite da rede.
    const recusaDasParcelas = await recusaDasParcelasDaRede(ctx.tenantId!, lido.data)
    if (recusaDasParcelas) return { error: recusaDasParcelas }
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
        const recusa = await recusaDoMembroDaVenda(ctx.tenantId!, responsavelId, branchId, { atende: true, papel: 'A pessoa responsável' })
        if (recusa) return { error: recusa }
      } else if (equipe?.semResponsavel !== true) {
        return { confirmarSemResponsavel: PERGUNTA_SEM_RESPONSAVEL }
      }
    }

    // PC2: com o contrato de pacote ativo na rede, "primeiro colhe assinatura,
    // depois paga" (o Heitor, do plano; do pacote: "o ideal era funcionar como
    // no plano de tratamento"). O contrato nasce com ESTE combinado; sem ele
    // assinado (ou dispensado, com o motivo), o dinheiro não entra.
    const contrato = await contratoDaVendaDoPacote({
      tenantId: ctx.tenantId!, clienteId, pacoteId, unidadeId: branchId, ator: ctx.internalUserId ?? null,
      pagamento: lido.data, desconto: reais, substituir: equipe?.substituirContrato === true,
    })
    if (contrato && 'substituir' in contrato) {
      return { confirmarSubstituirContrato: `O contrato “${contrato.substituir.titulo}” já foi assinado para outro pagamento (${contrato.substituir.pagamento}). Vender com este pagamento substitui o contrato: o assinado fica guardado como substituído, e a cliente assina o novo antes do pagamento. Substituir?` }
    }
    if (contrato) return { contratoParaAssinar: contrato.assinar }

    const lancamentos = comMotivoDoDesconto(lancamentosDoPagamento(vendido, pagamentoDaVenda, `Pacote ${pacote.name as string}`), motivoDoDesconto(d.data, reais))
    // Cada sessão com o seu procedimento e a sua parte do preço VENDIDO (rateio
    // pelo preço de tabela): é a base da comissão dela. O banco confere a soma.
    const sessoes = sessoesDoPacote(await itensParaRateio(ctx.tenantId!, pacoteId, branchId), vendido)
    const args = {
      p_tenant: ctx.tenantId!, p_cliente: clienteId, p_pacote: pacoteId, p_unidade: branchId,
      p_ator: ctx.internalUserId ?? null, p_vendedor: vendeu.vendedor,
      p_responsavel: pacote.comissao_responsavel_tipo ? responsavelId : null,
      p_lancamentos: lancamentos, p_sessoes: sessoes, p_desconto: reais,
    }
    const clientPackageId = await gravar(fid.dados
      ? admin.rpc('venda_com_fidelidade', { p_tenant: ctx.tenantId!, p_tipo: 'PACOTE', p_args: args, p_fidelidade: fid.dados })
      : admin.rpc('pacote_vender_com_equipe', args), 'vender o pacote') as string

    // A 1ª sessão (a de número 1, com o procedimento dela): a janela oferece
    // agendá-la agora, como o pré-pago (A47). Agendar passa pelo schedulePackageSession.
    const primeira = await ler(admin.from('package_sessions')
      .select('id, procedure_id, procedures(name, duration_min)')
      .eq('client_package_id', clientPackageId).order('session_number').limit(1).maybeSingle(), 'ler a 1ª sessão do pacote')
    const procDaPrimeira = primeira?.procedures as unknown as { name: string; duration_min: number | null } | null
    const primeiraSessao = primeira && primeira.procedure_id
      ? { id: primeira.id as string, procedimento: { id: primeira.procedure_id as string, nome: procDaPrimeira?.name ?? 'Sessão', duracaoMin: Number(procDaPrimeira?.duration_min ?? 0) } }
      : null

    // PC2: os termos e os outros documentos da venda (o contrato, já assinado,
    // a venda adotou), montados com o pagamento. A venda já está
    // gravada: falhar aqui não a desfaz — os documentos se montam de novo ao
    // abrir (a ficha, o link), e a tela diz que não deu.
    let documentos: DocumentoDaVenda[] = []
    try {
      documentos = (await prepararDocumentosDoPacote(ctx.tenantId!, clientPackageId, lido.data, reais))
        .filter(d => d.status === 'PENDENTE' || d.status === 'INCOMPLETO' || d.status === 'A_GERAR')
        .map(d => ({ id: d.id, titulo: d.title, status: d.status, faltando: oQueFalta((d.missing_fields ?? []).map(rotuloDoQueFalta)) }))
    } catch (e) {
      console.error('[pacote] documentos da venda:', mensagemDoErro(e))
    }
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    revalidatePath('/admin/financeiro')
    revalidatePath('/[slug]/financeiro', 'page')
    return { clientPackageId, primeiraSessao, documentos, veOsDocumentos: veOsDocumentos(ctx) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// --- Trazer pacote de fora (F35, decisão 1 do Heitor, 2026-11-06) ----------

const EntradaDoPacoteDeFora = z.object({
  clientId:    z.string().uuid(),
  /** A unidade do pacote (na ficha da rede com duas ou mais, a escolhida; senão a da sessão). */
  branchId:    z.string().uuid().nullable().optional(),
  procedureId: z.string().uuid('Escolha o procedimento.'),
  total:       z.number().int().min(1, 'O pacote tem pelo menos 1 sessão.').max(100, 'No máximo 100 sessões num pacote.'),
  usadas:      z.number().int().min(0, 'As sessões usadas não podem ser negativas.'),
  /** O valor de referência do pacote inteiro (opcional — sem ele, R$ 0 de comissão de execução). */
  valor:       z.number().min(0, 'O valor de referência não pode ser negativo.').max(10_000_000).nullable(),
  /** aaaa-mm-dd (opcional). */
  validade:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Validade inválida.').nullable(),
  envio:       z.string().nullable().optional(),
}).refine(e => e.usadas < e.total, 'As sessões já usadas têm de ser menos que o total: o pacote precisa ter sessão restante.')

/**
 * "Trazer pacote de fora" (decisão 1 do Heitor sobre a 8ª simulação: "concordo"):
 * o saldo de um pacote que a cliente já tinha no sistema de antes. Sem
 * lançamento, pontos nem comissão de venda; fora do catálogo e das Vendas.
 * Quem traz é quem dá o crédito interno (o Financeiro em Gerenciar) — é o mesmo
 * tipo de saldo trazido de fora (decidido pelo princípio 3: a mesma régua do
 * saldo que a clínica deve à cliente). A unidade: a da sessão; na rede, a
 * escolhida (com uma só, ela).
 */
export async function trazerPacoteDeFora(entrada: unknown): Promise<{ error?: string; ok?: true; clientPackageId?: string }> {
  try {
    const ctx = await getTenantContext()
    if (ctx.permissions.financial !== 'MANAGE') return { error: 'Seu cargo não traz pacote de fora: é de quem tem o Financeiro em Gerenciar.' }
    // C35: o Financeiro em "só os meus" não traz pacote de fora (a tela já esconde).
    const lido = EntradaDoPacoteDeFora.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const e = lido.data
    const admin = createAdminClient()
    // A unidade: a da abrangência vence o pedido; da rede, a pedida — e, sem
    // pedido, a única ativa (com duas ou mais, a tela pergunta).
    let branchId = ctx.branchId ?? e.branchId ?? null
    if (!branchId) {
      const ativas = await ler(admin.from('branches').select('id').eq('tenant_id', ctx.tenantId!).eq('is_active', true).limit(2), 'listar as unidades') as { id: string }[] | null
      if ((ativas ?? []).length === 1) branchId = ativas![0]!.id
    }
    if (!branchId) return { error: 'Escolha a unidade do pacote.' }
    const [unidade, cliente, procedimento] = await Promise.all([
      ler(admin.from('branches').select('id').eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
      ler(admin.from('clients').select('id, is_active').eq('id', e.clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente'),
      ler(admin.from('procedures').select('id').eq('id', e.procedureId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o procedimento'),
    ])
    if (!unidade || !alcancaUnidade(ctx, branchId)) return { error: 'Unidade não encontrada.' }
    if (!cliente) return { error: 'Cliente não encontrado.' }
    if (cliente.is_active === false) return { error: CLIENTE_ARQUIVADA }
    if (!procedimento) return { error: 'Procedimento não encontrado.' }
    // O mesmo envio (a chave da tela) traz UMA vez (convencoes.md).
    const clientPackageId = await umaVez(ctx.tenantId!, 'trazerPacoteDeFora', chaveDoEnvio(e.envio ?? null), () => trazerPacoteCore(admin, ctx.tenantId!, ctx.internalUserId ?? null, {
      clientId: e.clientId, branchId: branchId!, procedureId: e.procedureId, total: e.total, usadas: e.usadas,
      valor: e.valor === null ? null : Math.round(e.valor * 100) / 100, validade: e.validade,
    }))
    // A ficha é cache (client:<id>): expira na hora (CLAUDE.md §14).
    revalidateTag(`client:${e.clientId}`, { expire: 0 })
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/clients/[id]', 'page')
    return { ok: true, clientPackageId }
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
  // Cancelar mexe no dinheiro: é do caixa da unidade da venda (F73). Ver e
  // agendar as sessões, não — é da clínica (actions/appointments.ts).
  if (!cp || !alcancaOCaixaDoTratamento(ctx, rede, cp.branch_id as string)) return null
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
    const previa = lerPreviaDoCancelamento(j)
    return { previa: { ...previa, pontos: previa.fidelidade ? await pontosDoConjunto(ctx.tenantId!, { pacote: cp.id }) : null } }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

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
    // C35: o Financeiro em "só os meus" não cancela (a tela já esconde).
    const lido = EntradaDoCancelamento.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const admin = createAdminClient()
    const cp = await pacoteDaClienteAoAlcance(admin, ctx, clientPackageId)
    if (!cp) return { error: 'Pacote não encontrado.' }
    const novo = lido.data.estorno === 'INTEIRO' ? lido.data.novo ?? null : null
    // C75 (VF-01 da varredura de 18/11): no cartão do usado, as vezes e a maquininha da rede.
    { const recusa = await recusaDoPagamentoDoUsado(ctx.tenantId!, novo); if (recusa) return { error: recusa } }
    const userName = ctx.userName || await getUserName(admin, ctx.userId)
    const j = await gravar(admin.rpc('pacote_cancelar_devolvendo', {
      p_tenant: ctx.tenantId!, p_pacote: cp.id, p_ator: ctx.internalUserId ?? null, p_ator_nome: userName,
      p_motivo: lido.data.motivo, p_destino: lido.data.destino, p_agendamentos: lido.data.agendamentos,
      p_esperado: lido.data.esperado, p_simular: false,
      p_estorno: lido.data.estorno ?? null,
      p_novo: pagamentoDoUsadoParaOBanco(novo),
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
