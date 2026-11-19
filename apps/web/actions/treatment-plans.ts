'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { planoCriado, planoProposto, planoAceito } from '@/lib/events/plano'
import { avisarDoPlanoProposto } from '@/lib/plano-de-tratamento/aviso-do-proposto'
import { alcancaOTratamento, alcancaOCaixaDoTratamento } from '@/lib/tratamento/alcance'
import { getTenantContext, assertPermission, assertPodeReceber, podeReceber, can, alcancaUnidade, alcancaOAgendamento, podeVerClinico, assertRecurso, isOwnScope, ownerFilter, temRecurso } from '@/lib/auth'
import { recusaDoPagamentoDoUsado, pagamentoDoUsadoParaOBanco } from '@/lib/financeiro/pagamento-do-usado'
import { recusaDasVezesDaRede, recusaDasVezesDoPagamento } from '@/lib/financeiro/vezes-da-rede'
import { bandeiraDoPagamento } from '@/lib/financeiro/bandeiras'
import { conferirPecasDoAgendamento, horarioOcupado } from '@/lib/appointments/core'
import { salaUnicaDoHorario } from '@/lib/appointments/salas'
import { clienteAtendidaPor } from '@/lib/clientes/atendida-por'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, tentar, contar, mensagemDoErro, lerTodas } from '@/lib/db'
import { montarCheckoutPlan } from '@/lib/checkout/plano-para-checkout'
import { unidadesDosInsumos, procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
import { sessoesDoPlanoParaCheckout } from '@/lib/checkout/sessoes-do-plano'
import { recusaDosProcedimentosDoPlano } from '@/lib/procedimentos/disponivel-na-unidade'
import { planoCasaComBusca } from '@/lib/busca/cliente'
import { emAbertoDoPlano } from '@/lib/checkout/em-aberto-do-plano'
import { recusaDaEntradaAcimaDoTotal } from '@/lib/checkout/entrada'
import { recusaDaEntradaDoPagamento, comFidelidadeNaPrimeira } from '@/lib/checkout/lancamentos'
import { recusaDasParcelasDaRede } from '@/lib/financeiro/crediario-da-rede'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { getFinanceiroDoPlano, type FinanceiroDoPlano } from '@/lib/metrics/plano'
import { atendimentoDeHojeDoPlano } from '@/lib/checkout/atendimento-de-hoje'
import type { CheckoutPlan } from '@/components/branch/checkout-wizard'
import { semAcesso } from '@/lib/sem-acesso'
import { catalogoDePacotes } from '@/lib/pacotes/leitura'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import type { PacoteParaComparar } from '@/lib/checkout/pacote-equivalente'
import { lerPreviaDoCancelamento, agendamentosCancelados, type PreviaDoCancelamento } from '@/lib/pacotes/cancelamento'
import { EntradaDoCancelamento } from '@/lib/pacotes/entrada-do-cancelamento'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { notifyCancelledAppointment } from '@/lib/appointments/avisos'
import { quemDesfazNoCaixa, quemRecebeNoPdv } from '@/lib/equipe/quem-desfaz'
import { retratoDoCancelamento, type RetratoDoCancelamento } from '@/lib/plano-de-tratamento/retrato-do-cancelamento'
import { montaPlano, RECUSA_QUEM_MONTA, RECUSA_QUEM_ATENDE } from '@/lib/plano-de-tratamento/quem-monta'
import { recusaDoDesconto } from '@/lib/vendas/desconto'
import { combinadoDoPlano, totalDoPlanoNaLista } from '@/lib/plano-de-tratamento/desconto-combinado'
import { recusaDaSessaoVazia } from '@/lib/plano-de-tratamento/textos'
import { planoFechado, RECUSA_DO_PLANO_FECHADO } from '@/lib/plano-de-tratamento/fechado'
import { EntradaDoCancelamentoProposto, recusaDoCancelamentoSemDinheiro, RECUSA_DO_PLANO_CANCELADO } from '@/lib/plano-de-tratamento/cancelar-proposto'
import { situacoesDosPlanos, andamentoDosPlanos, type DocumentosDoPlano, type SituacaoDoContrato } from '@/lib/plano-de-tratamento/andamento-do-plano'
import { SITUACOES_COMERCIAIS, situacaoComercialDoPlano, type SituacaoComercial } from '@/lib/plano-de-tratamento/situacao'

/**
 * Quem pode o quê, neste arquivo.
 *
 * Tudo aqui exigia `procedures: MANAGE` — o módulo do CATÁLOGO de procedimentos
 * da rede. O efeito era que ninguém operava o fluxo: a profissional (catálogo em
 * "Ver") não conseguia gerar o plano da avaliação, e a recepção (caixa, mas
 * catálogo em "Ver") não conseguia fechar o checkout. Só quem podia editar preço
 * da rede vendia.
 *
 * Agora cada gesto exige a permissão do que ele é:
 *
 * - montar, salvar e propor o plano → quem ATENDE na unidade do plano (PT2,
 *   2026-11-14: o "Atende" da Equipe, `montaPlano` — não é permissão; a
 *   Admin da rede tem tudo). Na avaliação ABERTA, gerar o plano grava também
 *   o registro do atendimento: ali segue o Prontuário em Gerenciar.
 * - a anotação clínica do plano ("Observações da profissional") → o
 *   Prontuário em Gerenciar (`anotaNoPlano`); sem ele, a anotação fica como está
 * - aceitar o plano e colher termos  → quem monta OU quem recebe
 * - receber dinheiro                 → caixa ou financeiro (`assertPodeReceber`)
 * - agendar as sessões do plano      → `agenda: MANAGE`, conferido na hora
 * - ler plano e sessões              → `agenda: VIEW`
 *
 * Aceitar deixou de exigir caixa quando o pagamento saiu do aceite: a
 * profissional fecha o plano na sala e o valor fica em aberto, recebido no
 * check-in. Exigir caixa para aceitar era o que empurrava o plano para uma fila
 * de checkout que ficava parada.
 */

/**
 * Pode transformar um plano em venda — aceitar, colher termos, abrir o wizard.
 *
 * ⚠️ Não é export: todo export de arquivo `'use server'` vira endpoint público.
 */
function assertPodeFecharPlano(ctx: TenantContext): void {
  // Sem a unidade (antes de ler o plano): atender em alguma basta; quem chama
  // confere a unidade do plano depois (`podeFecharEstePlano`).
  if (!montaPlano(ctx) && !podeReceber(ctx)) throw semAcesso()
}

/** Fecha (aceita, colhe termos) quem monta o plano DESTA unidade ou quem recebe. */
function podeFecharEstePlano(ctx: TenantContext, unidadeId: string | null | undefined): boolean {
  return montaPlano(ctx, unidadeId ?? null) || podeReceber(ctx)
}

/**
 * Quem atende a avaliação ABERTA de onde o plano nasceu gera e aceita o plano
 * ali (PT2: "quem monta o plano é quem atende, nem precisa de permissão pra
 * isso pq isso é proprio atendimento"). Com o módulo do Atendimento
 * (2026-11-18), "quem atende" é o Atendimento em Gerenciar, com o atendimento
 * ao alcance e, no "só os meus", o dela.
 *
 * ⚠️ Não é export: todo export de arquivo `'use server'` vira endpoint público.
 */
async function atendeAAvaliacaoAberta(
  admin: ReturnType<typeof createAdminClient>, ctx: TenantContext, avaliacaoId: string | null,
): Promise<boolean> {
  if (!avaliacaoId || !can(ctx, 'atendimento', 'MANAGE')) return false
  const a = await agendamentoDoTenant(admin, avaliacaoId, ctx)
  if (!a || a.status === 'COMPLETED' || a.status === 'CANCELLED' || a.status === 'NO_SHOW') return false
  return !deOutroProfissional(ctx, a.professional_id) && !deOutroNoAtendimento(ctx, a.professional_id)
}

/**
 * Escreve a anotação clínica do plano (as "Observações da profissional")?
 * É prontuário (PT2: "a anotação clínica dentro do plano continua pedindo o
 * Prontuário"): o módulo em Gerenciar e, no "só os meus" do prontuário, o
 * plano dela. Sem isso, a anotação que está gravada fica como está.
 *
 * ⚠️ Não é export: todo export de arquivo `'use server'` vira endpoint público.
 */
function anotaNoPlano(ctx: TenantContext, responsavelId: string | null | undefined): boolean {
  return can(ctx, 'medical_records', 'MANAGE') && podeVerClinico(ctx, responsavelId ?? null)
}

// -- Tipos ---------------------------------------------------------------------

export interface PlanSessionProduct {
  productId: string
  name:      string
  unit:      string
  quantity:  number
}

export interface PlanSessionProcedure {
  procedureId: string
  price:       number
  sortOrder?:  number
  products?:   PlanSessionProduct[]
}

export interface PlanSessionInput {
  procedures: PlanSessionProcedure[]
  sortOrder?: number
}

/**
 * 22ª A20: o desconto do plano combinado no editor → as colunas do plano.
 * `undefined` = a tela não mandou (não mexe); nulo = sem desconto. Recusa só o
 * impossível (princípio 2): mais de 100% ou acima do total das sessões.
 */
function colunasDoCombinado(entrada: unknown, sessions: PlanSessionInput[], ator: string | null):
  { colunas: Record<string, unknown> } | { error: string } | null {
  if (entrada === undefined) return null
  const lido = EntradaDoDesconto.safeParse(entrada)
  if (!lido.success) return { error: 'Desconto do plano inválido.' }
  const d = lido.data ?? null
  const subtotal = sessions.reduce((t, s) => t + s.procedures.reduce((x, p) => x + (Number(p.price) || 0), 0), 0)
  const recusa = recusaDoDesconto(subtotal, d)
  if (recusa) return { error: recusa.replace('valor da venda', 'total do plano') }
  const com = !!d && d.valor > 0
  return { colunas: {
    desconto_combinado_tipo:  com ? d!.tipo : null,
    desconto_combinado_valor: com ? Math.round(d!.valor * 100) / 100 : 0,
    desconto_combinado_por:   com ? ator : null,
  } }
}

export interface PlanSessionForCheckout {
  id:              string
  sortOrder:       number
  totalPrice:      number
  mainProcedureId: string
  mainDurationMin: number
  procedures:      {
    procedureId: string
    name:        string
    price:       number
    durationMin: number
    products:    { productId: string; name: string; unit: string; quantity: number }[]
  }[]
  appointmentId:   string | null
  /**
   * D3 da 15ª simulação: a sessão que já tem agendamento vivo ANTES do
   * checkout (a cliente marca pelo app antes de pagar — PT1d/PT3), com o
   * início dele. O checkout a mostra como "já agendada" e não a agenda de novo.
   */
  agendada:        string | null
}


/**
 * Regrava as sessões de um plano.
 *
 * Só com o procedimento que a unidade DO PLANO faz (D4 da 14ª, F73): o editor
 * já lista só esses, e a conferência mora aqui — antes de `plano_gravar_sessoes`
 * apagar as antigas —, porque toda gravação de sessões de plano passa por esta função
 * (a da avaliação, `gerar_plano_da_avaliacao`, confere antes do rpc).
 *
 * ⚠️ Não é export: todo export de arquivo `'use server'` vira endpoint público,
 * e esta função não autoriza nada — quem chama já conferiu.
 */
async function gravarSessoes(
  admin: ReturnType<typeof createAdminClient>,
  /** Nulo: o rascunho do plano da avaliação (`cabecalho.avaliacao`), criado ou reaberto pela função. */
  planId: string | null,
  sessions: PlanSessionInput[],
  plano: { tenantId: string; unidadeId: string },
  /**
   * O cabeçalho vai na MESMA transação (A20d da 25ª): `notas` e `combinado` só
   * quando mudam (sem a chave, o gravado fica); `avaliacao` e `profissional` no rascunho.
   */
  cabecalho: {
    avaliacao?: string
    profissional?: string | null
    notas?: string | null
    combinado?: Record<string, unknown>
  } = {},
): Promise<{ planId?: string; error?: string }> {
  // A1(b) da 25ª: a sessão vazia não se grava (quem chama já recusou antes).
  const vazia = recusaDaSessaoVazia(sessions)
  if (vazia) return { error: vazia }
  const naoFeito = await recusaDosProcedimentosDoPlano(admin, plano.tenantId, plano.unidadeId,
    sessions.flatMap(s => s.procedures.map(p => p.procedureId)))
  if (naoFeito) return { error: naoFeito }

  // A20d da 25ª (CLAUDE.md §14): apagar as antigas e inserir as novas vale junto. Eram chamadas
  // separadas — a que falhasse no meio deixava o plano sem sessões. O app monta; a função grava
  // numa transação só, conferindo de novo a rede, o plano fechado e os procedimentos
  // (migration 20261124950001). O cabeçalho do plano vai junto, com o plano travado.
  const { data, error } = await admin.rpc('plano_gravar_sessoes', {
    p_tenant:    plano.tenantId,
    p_plano:     planId,
    p_cabecalho: cabecalho,
    p_sessoes: sessions.map(s => ({
      procedimentos: s.procedures.map((p, j) => ({
        procedure_id: p.procedureId,
        price:        p.price,
        sort_order:   p.sortOrder ?? j,
        products:     (p.products ?? []).map(pr => ({
          product_id: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
        })),
      })),
    })),
  })
  if (error) {
    // A recusa da função (o plano fechado, por exemplo) chega como está.
    return { error: /fechado|não encontrad/.test(error.message) ? error.message : `Erro ao salvar o plano: ${error.message}` }
  }
  if (!data) return { error: 'Não foi possível salvar o plano.' }
  return { planId: data as string }
}

/**
 * Com a agenda "só os meus", o plano é DELA? "O plano é da cliente, não da
 * profissional" (revisão do Heitor, 2026-10-29): é dela o plano de toda
 * cliente que ela atende — um agendamento com ela, qualquer um, inclusive
 * futuro (`clienteAtendidaPor`, a regra do prontuário OWN) —, quem quer que o
 * tenha montado; e o plano que ELA montou (`professional_id`), mesmo de cliente
 * sem agendamento com ela. Quem cobre uma sessão precisa ver o que foi feito e
 * o que falta. O escopo vale pelo id (§11). Sem o OWN, todo plano ao alcance.
 */
async function planoDaProfissional(
  admin: ReturnType<typeof createAdminClient>,
  ctx: TenantContext,
  plano: { professional_id?: unknown; client_id?: unknown },
): Promise<boolean> {
  if (!isOwnScope(ctx, 'atendimento')) return true
  if (!ctx.internalUserId) return false
  if (plano.professional_id === ctx.internalUserId) return true
  const cliente = (plano.client_id as string | null | undefined) ?? null
  return !!cliente && clienteAtendidaPor(admin, ctx.internalUserId, cliente)
}

/**
 * Confere que o plano é do tenant de quem chama, da unidade ao alcance e, com
 * a agenda "só os meus", dela; devolve o essencial dele.
 */
async function planoDoTenant(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
  ctx: TenantContext,
) {
  const data = await ler(admin
    .from('treatment_plans')
    .select('id, status, client_id, branch_id, professional_id, evaluation_appointment_id, branches!branch_id(slug, tenant_id)')
    .eq('id', planId)
    .maybeSingle(), 'buscar o plano')
  const branch = data?.branches as unknown as { slug: string; tenant_id: string } | null
  // A rede, e a unidade ao alcance de quem age (§11): o plano da unidade B não
  // se mexe pela recepção da A.
  if (!data || branch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, data.branch_id as string)) return null
  if (!(await planoDaProfissional(admin, ctx, data))) return null
  return { ...data, slug: branch!.slug }
}

/**
 * O plano para VER as sessões (a ficha de tratamento): da rede de quem chama,
 * em qualquer unidade — o tratamento é da clínica (H5; F73, D3 da 14ª) —, e,
 * com a agenda "só os meus", dela. Editar, fechar e cancelar seguem pelo
 * `planoDoTenant` / `planoFechadoAoAlcance` (a unidade do plano ao alcance).
 */
async function planoDaRede(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
  ctx: TenantContext,
) {
  const data = await ler(admin
    .from('treatment_plans')
    .select('id, client_id, branch_id, professional_id, branches!branch_id(tenant_id)')
    .eq('id', planId)
    .maybeSingle(), 'buscar o plano')
  const branch = data?.branches as unknown as { tenant_id: string } | null
  if (!data || !alcancaOTratamento(ctx, branch?.tenant_id)) return null
  if (!(await planoDaProfissional(admin, ctx, data))) return null
  return data
}

/** O agendamento é desta rede, e ao alcance (a unidade dele, ou o agendamento DELA numa unidade em que ela atende — §11)? O essencial dele, ou null. */
async function agendamentoDoTenant(
  admin: ReturnType<typeof createAdminClient>,
  appointmentId: string,
  ctx: TenantContext,
) {
  const data = await ler(admin
    .from('appointments')
    .select('id, status, branch_id, client_id, professional_id, procedure_id, branches!inner(tenant_id)')
    .eq('id', appointmentId)
    .maybeSingle(), 'buscar o agendamento')
  const rede = (data?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  // A profissional que ATENDE na unidade alcança o agendamento DELA lá (§11,
  // o "Atende" por unidade): o plano da avaliação que ela faz na outra unidade.
  if (!data || rede !== ctx.tenantId || !alcancaOAgendamento(ctx, data.branch_id as string, data.professional_id as string | null)) return null
  return {
    id: data.id as string, status: data.status as string, branch_id: data.branch_id as string, client_id: data.client_id as string,
    professional_id: data.professional_id as string, procedure_id: (data.procedure_id as string | null) ?? null,
  }
}

// -- Salvar rascunho do plano (profissional) -----------------------------------

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function saveTreatmentPlan(
  ...args: Parameters<typeof saveTreatmentPlanInterno>
): ReturnType<typeof saveTreatmentPlanInterno> {
  try {
    return await saveTreatmentPlanInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function saveTreatmentPlanInterno(
  appointmentId: string,
  sessions: PlanSessionInput[],
  notes: string,
  slug: string,
  /** 22ª A20: o desconto do plano do editor (sem ele, não mexe). */
  desconto?: unknown,
): Promise<{ planId?: string; error?: string }> {
  const ctx   = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()
  // A1(b) da 25ª: a sessão sem procedimento não entra no plano.
  const vazia = recusaDaSessaoVazia(sessions)
  if (vazia) return { error: vazia }

  // Agendamento de outra rede responde como inexistente — senão o plano
  // nasceria no cliente e na unidade de lá.
  const appt = await agendamentoDoTenant(admin, appointmentId, ctx)
  if (!appt) return { error: 'Agendamento não encontrado.' }
  // PT2: o rascunho do plano da avaliação é de quem monta (quem atende na unidade).
  if (!montaPlano(ctx, appt.branch_id as string)) return { error: RECUSA_QUEM_MONTA }
  const anota = anotaNoPlano(ctx, ctx.internalUserId)
  const combinado = colunasDoCombinado(desconto, sessions, ctx.internalUserId ?? null)
  if (combinado && 'error' in combinado) return combinado

  // A20d da 25ª: o plano fechado (aceito, concluído, cancelado, recusado) não volta a rascunho.
  // O upsert punha DRAFT sem olhar o status; a recusa vem antes de qualquer gravação (e a
  // função confere de novo, com o plano travado).
  const existente = await ler(admin
    .from('treatment_plans')
    .select('status')
    .eq('evaluation_appointment_id', appointmentId)
    .maybeSingle(), 'buscar o plano da avaliação')
  if (planoFechado(existente?.status as string | undefined)) return { error: RECUSA_DO_PLANO_FECHADO }

  // O cabeçalho (cliente e unidade do agendamento, quem monta, a anotação, o desconto) e as
  // sessões numa transação só (§14). A anotação é prontuário: sem ele, a que existe fica (PT2).
  const cabecalho = {
    avaliacao:    appointmentId,
    profissional: ctx.internalUserId ?? null,
    ...(anota ? { notas: notes } : {}),
    ...(combinado ? { combinado: combinado.colunas } : {}),
  }
  const res = await gravarSessoes(admin, null, sessions, { tenantId: ctx.tenantId!, unidadeId: appt.branch_id as string }, cabecalho)
  if (res.error || !res.planId) return { error: res.error ?? 'Não foi possível salvar o plano.' }
  // DC4: os documentos do plano nascem na criação (e acompanham o que se salva).
  await emitirDocumentosDoPlano(ctx.tenantId!, res.planId)

  revalidatePath(`/${slug}/agenda/${appointmentId}`)
  return { planId: res.planId }
}

// -- Planejamento do CLIENTE ---------------------------------------------------
//
// O plano nascia sempre dentro de uma consulta de avaliação e só existia ali:
// não dava para planejar antes, revisar depois nem abrir durante outro
// atendimento. `evaluation_appointment_id` continua, agora como "atendimento de
// origem" — opcional.

/** Planos de um cliente, do mais recente para o mais antigo. */
export async function getPlanosDoCliente(clientId: string): Promise<{
  planos: {
    id: string; status: string; notes: string | null; criadoEm: string
    total: number; sessoes: number; origemId: string | null
  }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()

  // Agenda "só os meus" (`planoDaProfissional`): a cliente que ela atende tem
  // todos os planos à vista, de quem quer que seja; a outra, só os que ela montou.
  const ownerAgenda = ownerFilter(ctx, 'atendimento')
  if (isOwnScope(ctx, 'atendimento') && !ownerAgenda) return { planos: [] }
  const dela = ownerAgenda && !(await clienteAtendidaPor(admin, ownerAgenda, clientId)) ? ownerAgenda : null

  let consulta = admin
    .from('treatment_plans')
    .select(`
      id, status, professional_notes, professional_id, created_at, evaluation_appointment_id,
      desconto_combinado_tipo, desconto_combinado_valor,
      clients!inner(tenant_id),
      treatment_plan_sessions(treatment_plan_session_procedures(price))
    `)
    .eq('client_id', clientId)
  if (dela) consulta = consulta.eq('professional_id', dela)
  const data = await ler(consulta.order('created_at', { ascending: false }), 'carregar os planos do cliente')

  type RawSess = { treatment_plan_session_procedures: { price: number }[] }

  const planos = (data ?? [])
    .filter(p => (p.clients as unknown as { tenant_id: string } | null)?.tenant_id === ctx.tenantId)
    .map(p => {
      const sessoes = (p.treatment_plan_sessions as unknown as RawSess[]) ?? []
      return {
        id:       p.id as string,
        status:   p.status as string,
        // A anotação do profissional é prontuário (2026-10-03).
        notes:    podeVerClinico(ctx, (p.professional_id as string | null) ?? null) ? ((p.professional_notes as string | null) ?? null) : null,
        criadoEm: p.created_at as string,
        sessoes:  sessoes.length,
        // D2 da 25ª: antes do aceite, com o combinado — o valor do contrato.
        total:    totalDoPlanoNaLista(p.status as string, sessoes.reduce(
          (s, sess) => s + (sess.treatment_plan_session_procedures ?? []).reduce((t, pr) => t + Number(pr.price), 0),
          0,
        ), combinadoDoPlano(p as unknown as { desconto_combinado_tipo?: string | null; desconto_combinado_valor?: number | string | null })),
        origemId: (p.evaluation_appointment_id as string | null) ?? null,
      }
    })
  // A anotação clínica foi à tela: fica no registro (lib/prontuario/acessos.ts).
  if (planos.some(p => p.notes)) await registrarAcessoAoProntuario(ctx, clientId, 'plano')

  return { planos }
}

/**
 * Abre um plano novo.
 *
 * `clientId` é opcional: `appointments.client_id` é NOT NULL, então toda
 * avaliação já obrigava a cadastrar cliente (com CPF e e-mail, porque o
 * cadastro cria login) antes mesmo de existir um plano. Aqui a profissional
 * nomeia o plano e liga a um cliente quando houver um — o aceite é que exige.
 *
 * `appointmentId` é só a origem: de qual atendimento a conversa saiu.
 */
export async function criarPlanoDoCliente(
  clientId: string | null,
  branchId: string,
  appointmentId?: string | null,
  nome?: string,
): Promise<{ planId?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  // Ver planos é da Agenda; montar é de quem atende (PT2), conferido na unidade abaixo.
  assertPermission(ctx, 'atendimento', 'VIEW')
  if (!montaPlano(ctx)) return { error: RECUSA_QUEM_MONTA }
  const admin = createAdminClient()

  // A unidade do plano é a de onde ele está sendo feito (a do endereço, ou a
  // escolhida na ficha da rede) — nunca a de cadastro da cliente: a ficha é da
  // REDE (H16; atendimento.md, "O plano nasce na unidade em que se cria").
  // É o que o aceite usa depois para o caixa e os agendamentos.
  const unidadePedida = branchId || ctx.branchId || ''

  if (clientId) {
    const cliente = await ler(admin
      .from('clients')
      .select('id, tenant_id')
      .eq('id', clientId)
      .maybeSingle(), 'buscar o cliente')
    if (!cliente || cliente.tenant_id !== ctx.tenantId) return { error: 'Cliente não encontrado.' }
  }

  if (!unidadePedida) return { error: 'Selecione a unidade do plano.' }
  // Da rede e ao alcance: até 2026-09-28 a unidade do plano era gravada como
  // chegava — inclusive a de outra clínica.
  const unidadeDoPlano = await ler(admin.from('branches').select('id')
    .eq('id', unidadePedida).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidadeDoPlano || !alcancaUnidade(ctx, unidadePedida)) return { error: 'Unidade não encontrada.' }
  // PT2: monta quem ATENDE na unidade do plano.
  if (!montaPlano(ctx, unidadePedida)) return { error: RECUSA_QUEM_MONTA }
  // "Montar plano desta avaliação": a avaliação é da rede, do mesmo cliente e
  // ao alcance de quem monta (o id vem do navegador).
  if (appointmentId) {
    const aval = await agendamentoDoTenant(admin, appointmentId, ctx)
    if (!aval || (clientId && aval.client_id !== clientId)) return { error: 'Agendamento não encontrado.' }
    if (deOutroProfissional(ctx, aval.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }
  }

  const { data, error } = await admin
    .from('treatment_plans')
    .insert({
      client_id:                 clientId,
      branch_id:                 unidadePedida,
      professional_id:           ctx.internalUserId!,
      evaluation_appointment_id: appointmentId ?? null,
      name:                      nome?.trim() || 'Plano de tratamento',
      status:                    'DRAFT',
    })
    .select('id')
    .single()

  if (error || !data) return { error: `Erro ao criar o plano: ${error?.message}` }
  await planoCriado(data.id as string, ctx)

  return { planId: data.id as string }
}

/**
 * O primeiro "Salvar plano" de um plano novo (2026-10-21, decisão do Heitor):
 * o "Novo plano" abre o editor sem gravar nada, e o plano nasce aqui, já com
 * as sessões. Antes ele nascia vazio no clique, e quem desistia deixava um
 * rascunho de zero sessões na ficha.
 *
 * Se as sessões não gravarem, o plano recém-criado (vazio, sem nada que
 * dependa dele) é desfeito: não sobra o rascunho que esta mudança veio tirar.
 */
export async function salvarPlanoNovo(
  clientId: string | null,
  branchId: string,
  appointmentId: string | null,
  sessions: PlanSessionInput[],
  notes: string,
  /** 22ª A20: o desconto do plano do editor. */
  desconto?: unknown,
): Promise<{ planId?: string; error?: string }> {
  const criado = await criarPlanoDoCliente(clientId, branchId, appointmentId)
  if (criado.error || !criado.planId) return { error: criado.error ?? 'Não foi possível criar o plano.' }
  const salvo = await salvarPlanoDoCliente(criado.planId, sessions, notes, desconto)
  if (salvo.error) {
    const admin = createAdminClient()
    await tentar(admin.from('treatment_plan_sessions').delete().eq('plan_id', criado.planId), 'desfazer as sessões do plano novo')
    await tentar(admin.from('treatment_plans').delete().eq('id', criado.planId).eq('status', 'DRAFT'), 'desfazer o plano novo')
    return { error: salvo.error }
  }
  return { planId: criado.planId }
}

/**
 * Liga um plano a um cliente — na criação ou depois.
 *
 * É o gesto que transforma um planejamento feito "para a Marina que veio por
 * indicação" no plano de uma pessoa cadastrada, sem refazer nada.
 */
export async function vincularClienteAoPlano(
  planId: string,
  clientId: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()

  const plan = await planoDoTenant(admin, planId, ctx)
  if (!plan) return { error: 'Plano não encontrado.' }
  if (!montaPlano(ctx, plan.branch_id as string)) return { error: RECUSA_QUEM_MONTA }

  const cliente = await ler(admin
    .from('clients')
    .select('id, tenant_id')
    .eq('id', clientId)
    .maybeSingle(), 'buscar o cliente')
  if (!cliente || cliente.tenant_id !== ctx.tenantId) return { error: 'Cliente não encontrado.' }

  const { error } = await admin
    .from('treatment_plans')
    .update({ client_id: clientId, updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) return { error: error.message }
  // DC4: o plano feito sem cliente ganha os documentos ao ganhar a cliente.
  await emitirDocumentosDoPlano(ctx.tenantId!, planId)

  revalidatePath(`/${plan.slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  return {}
}

/**
 * Clientes para ligar a um plano.
 *
 * Busca por nome, telefone ou CPF — os três jeitos de reencontrar alguém no
 * balcão. Devolve poucos: é um seletor, não uma listagem.
 */
export async function buscarClientesParaPlano(termo: string): Promise<{
  clientes: { id: string; name: string; phone: string | null; document: string | null }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'VIEW')

  const busca = termo.trim()
  if (busca.length < 2) return { clientes: [] }

  const admin = createAdminClient()
  const digitos = busca.replace(/\D/g, '')

  // O nome e o telefone pela regra ÚNICA da busca de cliente (D6 da 8ª; C5,
  // F70): sem acento, as palavras em qualquer ordem, o telefone pelos dígitos
  // com o 55 e o nono dígito tolerados. Era `ilike` no nome e no telefone cru.
  // O CPF segue à parte (a regra única não olha o documento).
  type Achado = { id: string; name: string; phone: string | null; document: string | null }
  const [daRegra, peloCpf] = await Promise.all([
    ler(admin.rpc('buscar_clientes', { p_tenant: ctx.tenantId!, p_termo: busca, p_limite: 8 }), 'carregar os clientes') as
      Promise<{ id: string }[] | null>,
    digitos.length >= 3 && !/\p{L}/u.test(busca)
      ? ler(admin.from('clients').select('id').eq('tenant_id', ctx.tenantId!).eq('is_active', true)
          .ilike('document', `%${digitos}%`).order('name').limit(8), 'carregar os clientes pelo CPF') as Promise<{ id: string }[] | null>
      : Promise.resolve(null),
  ])
  const ids = [...new Set([...(daRegra ?? []), ...(peloCpf ?? [])].map(c => c.id))].slice(0, 8)
  if (!ids.length) return { clientes: [] }
  const fichas = (await ler(admin.from('clients').select('id, name, phone, document')
    .eq('tenant_id', ctx.tenantId!).in('id', ids), 'carregar os clientes') as Achado[] | null) ?? []
  // A ordem da regra (quem começa com o termo primeiro), depois o CPF.
  return { clientes: ids.map(id => fichas.find(f => f.id === id)).filter((f): f is Achado => !!f) }
}

/** Renomeia o plano. */
export async function renomearPlano(planId: string, nome: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()

  const plan = await planoDoTenant(admin, planId, ctx)
  if (!plan) return { error: 'Plano não encontrado.' }
  if (!montaPlano(ctx, plan.branch_id as string)) return { error: RECUSA_QUEM_MONTA }
  if (!nome.trim()) return { error: 'Dê um nome ao plano.' }

  const { error } = await admin
    .from('treatment_plans')
    .update({ name: nome.trim(), updated_at: new Date().toISOString() })
    .eq('id', planId)
  return error ? { error: error.message } : {}
}

/**
 * O cabeçalho de um plano: o que a tela dele precisa antes do editor.
 *
 * Existe porque o plano aberto virou uma rota própria: a página precisa saber
 * de quem é e como se chama para desenhar o topo, e `getPlanoParaEditar` traz
 * sessões e preços, que é o outro assunto.
 */
export async function getCabecalhoDoPlano(planId: string): Promise<{
  plano?: {
    id: string; nome: string; status: string
    cliente: { id: string; name: string } | null
    unidade: string | null
    /** A unidade DO plano: o catálogo do editor é o dela (D4 da 14ª). */
    unidadeId: string | null
    slug:    string
  }
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()

  const plan = await planoDoTenant(admin, planId, ctx)
  if (!plan) return { error: 'Plano não encontrado.' }

  const { data, error } = await admin
    .from('treatment_plans')
    .select('id, name, status, branch_id, clients(id, name), branches!branch_id(name, slug)')
    .eq('id', planId)
    .maybeSingle()
  // Erro de consulta não é "plano não existe": sem checar, a tela mandaria de
  // volta para a lista como se o plano tivesse sumido.
  if (error) return { error: `Falha ao carregar o plano: ${error.message}` }
  if (!data) return { error: 'Plano não encontrado.' }

  const cli    = data.clients  as unknown as { id: string; name: string } | null
  const branch = data.branches as unknown as { name: string; slug: string } | null

  return {
    plano: {
      id:      data.id as string,
      nome:    (data.name as string | null) ?? 'Plano de tratamento',
      status:  data.status as string,
      cliente: cli ? { id: cli.id, name: cli.name } : null,
      unidade: branch?.name ?? null,
      unidadeId: (data.branch_id as string | null) ?? null,
      slug:    branch?.slug ?? '',
    },
  }
}

/**
 * Todos os planejamentos da rede/unidade, com busca e filtro.
 *
 * A busca acha pelo NOME DO PLANO (o único jeito enquanto não há cliente) e
 * pelos dados de quem já está ligado: nome, CPF ou telefone.
 */
export async function listarPlanejamentos(opcoes?: {
  status?: string
  /** PT1f: a situação do plano (Proposto, Aceito (falta assinar), Falta pagar…). */
  situacao?: SituacaoComercial
  busca?:  string
  branchId?: string | null
}): Promise<{
  planos: {
    id: string; nome: string; status: string; criadoEm: string
    /** PT1f: onde o plano está — aceitar → assinar → pagar → agendar. */
    situacao: SituacaoComercial
    total: number; sessoes: number
    cliente: { id: string; name: string; phone: string | null } | null
    unidade: string | null
  }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()

  // `treatment_plans` não tem tenant_id: o recorte é pela unidade.
  const unidadesDaRede = await ler(admin
    .from('branches')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId!), 'carregar as unidades')
  // Quem tem unidade fixa lista só a dele, qualquer que seja o pedido (§11).
  const doTenant = ((unidadesDaRede ?? []) as { id: string; name: string }[]).filter(b => alcancaUnidade(ctx, b.id))
  const alcance  = opcoes?.branchId
    ? doTenant.filter(b => b.id === opcoes.branchId)
    : doTenant

  // Agenda "só os meus" (`planoDaProfissional`), no banco — a lista cresce, o
  // filtro não pode vir depois de ler: os planos das clientes que ela atende
  // (o `!inner` em cadeia plano → cliente → agendamento com ela) e os que ela
  // montou, juntos.
  const dela = ownerFilter(ctx, 'atendimento')
  if (isOwnScope(ctx, 'atendimento') && !dela) return { planos: [] }

  const situacaoPedida = opcoes?.situacao && (SITUACOES_COMERCIAIS as readonly string[]).includes(opcoes.situacao)
    ? opcoes.situacao : null
  const statusDaSituacao: string[] | null = !situacaoPedida ? null
    : situacaoPedida === 'RASCUNHO' ? ['DRAFT']
    : situacaoPedida === 'PROPOSTO' ? ['PROPOSED']
    : situacaoPedida === 'CONCLUIDO' ? ['COMPLETED']
    : situacaoPedida === 'CANCELADO' ? ['CANCELLED', 'REJECTED']
    : ['ACCEPTED']

  // Todos, em páginas (2026-10-22): tinha teto de 200, sem "ver mais" — os
  // planejamentos mais antigos sumiam da lista.
  type Recorte = 'todos' | 'daCliente' | 'montadoPorEla'
  const pagina = (recorte: Recorte) => lerTodas((de, ate) => {
    let query = admin
      .from('treatment_plans')
      .select(recorte === 'daCliente'
        // O agendamento vem limitado a um, só para existir.
        ? `id, name, status, created_at, branch_id, desconto_combinado_tipo, desconto_combinado_valor,
           clients!inner(id, name, phone, document, appointments!inner(id)),
           treatment_plan_sessions(treatment_plan_session_procedures(price))`
        : `id, name, status, created_at, branch_id, desconto_combinado_tipo, desconto_combinado_valor,
           clients(id, name, phone, document),
           treatment_plan_sessions(treatment_plan_session_procedures(price))`)
      .in('branch_id', alcance.map(b => b.id))
    if (recorte === 'daCliente') {
      // eq-02: o agendamento CANCELADO não faz a cliente ser dela (a regra do dashboard).
      query = query.eq('clients.appointments.professional_id', dela!).neq('clients.appointments.status', 'CANCELLED')
        .limit(1, { referencedTable: 'clients.appointments' })
    }
    if (recorte === 'montadoPorEla') query = query.eq('professional_id', dela!)
    if (opcoes?.status) query = query.eq('status', opcoes.status)
    // A situação recorta primeiro pela situação do banco; o resto (documentos,
    // contrato, recebido) se confere abaixo, só nos aceitos.
    if (statusDaSituacao) query = query.in('status', statusDaSituacao)
    return query.order('created_at', { ascending: false }).order('id').range(de, ate)
  }, 'carregar os planejamentos')

  let data: Awaited<ReturnType<typeof pagina>>
  if (!dela) data = await pagina('todos')
  else {
    const [daCliente, montados] = await Promise.all([pagina('daCliente'), pagina('montadoPorEla')])
    // As duas já vêm na ordem da tela; aqui se juntam sem repetir.
    const vistos = new Set<string>()
    data = [...daCliente, ...montados]
      .filter(p => !vistos.has(p.id as string) && !!vistos.add(p.id as string))
      .sort((a, b) => (b.created_at as string).localeCompare(a.created_at as string) || (a.id as string).localeCompare(b.id as string))
  }

  type RawCli  = { id: string; name: string; phone: string | null; document: string | null }
  type RawSess = { treatment_plan_session_procedures: { price: number }[] }

  // A busca pela regra única da busca de cliente (F73; sem acento, telefone e documento por dígitos).
  const termo = (opcoes?.busca ?? '').trim()

  const situacoes = await situacoesDosPlanos(ctx.tenantId!,
    (data ?? []).map(p => ({ id: p.id as string, status: p.status as string })))

  const planos = (data ?? [])
    .filter(p => !situacaoPedida || situacoes.get(p.id as string) === situacaoPedida)
    .map(p => {
      const cli     = p.clients as unknown as RawCli | null
      const sessoes = (p.treatment_plan_sessions as unknown as RawSess[]) ?? []
      // Documento e telefone só servem à busca abaixo — não vão para a tela.
      const plano = {
        id:       p.id as string,
        nome:     (p.name as string | null) ?? 'Plano de tratamento',
        status:   p.status as string,
        situacao: situacoes.get(p.id as string) ?? 'RASCUNHO',
        criadoEm: p.created_at as string,
        sessoes:  sessoes.length,
        // D2 da 25ª: antes do aceite, com o combinado — o valor do contrato.
        total:    totalDoPlanoNaLista(p.status as string, sessoes.reduce(
          (s, sess) => s + (sess.treatment_plan_session_procedures ?? []).reduce((t, pr) => t + Number(pr.price), 0),
          0,
        ), combinadoDoPlano(p as unknown as { desconto_combinado_tipo?: string | null; desconto_combinado_valor?: number | string | null })),
        cliente:  cli ? { id: cli.id, name: cli.name, phone: cli.phone } : null,
        unidade:  doTenant.find(b => b.id === p.branch_id)?.name ?? null,
      }
      return { plano, doc: cli?.document ?? '' }
    })
    .filter(({ plano: p, doc }) => planoCasaComBusca({ nome: p.nome, cliente: p.cliente, documento: doc }, termo))
    .map(({ plano }) => plano)

  return { planos }
}

/** Um plano no formato que o editor entende. */
/**
 * O dinheiro e as sessões do plano, para a tela dele (J-42, 2026-10-30): o
 * valor, o recebido e o a receber contados no banco, a entrada e as parcelas,
 * e as sessões feitas. O mesmo público que já via o saldo do plano na tela do
 * atendimento: quem vê a agenda, com o alcance do plano (planoDoTenant).
 */
export async function getResumoDoPlano(planId: string): Promise<{
  resumo?: FinanceiroDoPlano
  /**
   * Quem tem o Financeiro em Gerenciar (a quem pedir o cancelamento do plano,
   * A27 da 10ª). Nulo: quem lê já o tem.
   */
  quemRecebe?: string[] | null
  /**
   * A28 da 9ª, desde o PDV (CX1): a quem pedir o que falta receber — quem tem
   * o PDV ou o Financeiro em Gerenciar (`quemRecebeNoPdv`). Nulo: quem lê recebe.
   */
  quemRecebeNoPdv?: string[] | null
  /** Quem lê recebe: o PDV da unidade do plano com a cliente (as parcelas dela, CX1). */
  receberNoPdv?: { unidadeId: string; clienteId: string } | null
  /**
   * A27 da 10ª: o "Cancelar plano" também na página do plano — quem tem o
   * Financeiro em Gerenciar (a permissão do pacote) e o plano fechado (ACCEPTED).
   * Quem não pode lê a quem pedir (os mesmos nomes do `quemRecebe`).
   */
  podeCancelar?: boolean
  /** O plano está fechado e ainda se cancela (ACCEPTED). */
  cancelavel?: boolean
  /** PT1b: aceito e ainda não recebido — a comanda do plano no PDV. */
  faltaReceber?: { comandaId: string | null; branchId: string; podeReceber: boolean } | null
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()
  const plan = await planoDoTenant(admin, planId, ctx)
  if (!plan) return { error: 'Plano não encontrado.' }
  const gerencia = can(ctx, 'financial', 'MANAGE')
  const recebe = podeReceber(ctx)
  const [resumo, quemRecebe, quemNoPdv] = await Promise.all([
    getFinanceiroDoPlano(ctx.tenantId!, planId),
    gerencia ? Promise.resolve(null) : quemDesfazNoCaixa(ctx.tenantId!, plan.branch_id as string),
    recebe ? Promise.resolve(null) : quemRecebeNoPdv(ctx.tenantId!, plan.branch_id as string),
  ])
  const receberNoPdv = recebe && plan.client_id ? { unidadeId: plan.branch_id as string, clienteId: plan.client_id as string } : null
  const cancelavel = plan.status === 'ACCEPTED'
  let faltaReceber: { comandaId: string | null; branchId: string; podeReceber: boolean } | null = null
  if (plan.status === 'ACCEPTED') {
    const [vivo, comanda] = await Promise.all([
      ler(admin.from('financial_transactions').select('id').eq('treatment_plan_id', planId).eq('type', 'INCOME')
        .is('estorno_de', null).or('notes.is.null,notes.neq.Estornada').limit(1), 'conferir se o plano foi recebido'),
      ler(admin.from('comandas').select('id').eq('treatment_plan_id', planId).is('cancelada_em', null).maybeSingle(), 'buscar a comanda do plano'),
    ])
    if (!(vivo ?? []).length) faltaReceber = { comandaId: (comanda?.id as string | undefined) ?? null, branchId: plan.branch_id as string, podeReceber: podeReceber(ctx) }
  }
  return { resumo, quemRecebe, quemRecebeNoPdv: quemNoPdv, receberNoPdv, cancelavel, podeCancelar: cancelavel && gerencia, faltaReceber }
}

export async function getPlanoParaEditar(planId: string): Promise<{
  plano?: {
    id: string; status: string; notes: string | null
    sessions: { procedures: { procedureId: string; name: string; price: number; products?: { productId: string; name: string; unit: string; quantity: number }[] }[] }[]
    /** D4 da 12ª: o retrato do cancelado (a data, o motivo, o dinheiro), para a tela só de leitura. */
    cancelamento?: RetratoDoCancelamento | null
    /** 22ª A20: o desconto do plano combinado (só no rascunho e no proposto: depois, o checkout já o tem). */
    descontoCombinado?: { tipo: 'VALOR' | 'PERCENTUAL'; valor: number } | null
    /**
     * D4 da 14ª (F73): o catálogo da unidade DO plano — o editor lista só o
     * que ela faz, em qualquer portal e unidade em que o plano é aberto.
     */
    catalogo: Awaited<ReturnType<typeof procedimentosParaPlano>>['procedures']
  }
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()

  const plan = await planoDoTenant(admin, planId, ctx)
  if (!plan) return { error: 'Plano não encontrado.' }

  const data = await ler(admin
    .from('treatment_plans')
    .select(`
      id, status, professional_notes, professional_id, client_id, cancelado_em, cancelamento_motivo, cancelamento,
      desconto_combinado_tipo, desconto_combinado_valor,
      treatment_plan_sessions(sort_order, treatment_plan_session_procedures(procedure_id, price, sort_order, products, procedures(name)))
    `)
    .eq('id', planId)
    .maybeSingle(), 'buscar o plano')
  if (!data) return { error: 'Plano não encontrado.' }

  type RawProd = { product_id: string; name: string; unit: string; quantity: number }
  type RawProc = { procedure_id: string; price: number; sort_order: number; products: RawProd[]; procedures: { name: string } | null }
  type RawSess = { sort_order: number; treatment_plan_session_procedures: RawProc[] }

  // A unidade do insumo é a de consumo do produto, lida agora (D9): o plano
  // gravado guarda a da embalagem ("frasco") para quantidades em ml.
  const brutas = (data.treatment_plan_sessions as unknown as RawSess[]) ?? []
  const unidades = await unidadesDosInsumos(ctx.tenantId!,
    brutas.flatMap(s => (s.treatment_plan_session_procedures ?? []).flatMap(p => (p.products ?? []).map(pr => pr.product_id))))

  const sessions = brutas
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => ({
      procedures: (s.treatment_plan_session_procedures ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(p => ({
          procedureId: p.procedure_id,
          name:        p.procedures?.name ?? '—',
          price:       Number(p.price),
          products:    (p.products ?? []).map(pr => ({
            productId: pr.product_id, name: pr.name, unit: unidades.get(pr.product_id) ?? pr.unit, quantity: Number(pr.quantity),
          })),
        })),
    }))

  const notes = podeVerClinico(ctx, (data.professional_id as string | null) ?? null) ? ((data.professional_notes as string | null) ?? null) : null
  // A anotação clínica foi à tela: fica no registro (lib/prontuario/acessos.ts).
  if (notes && data.client_id) await registrarAcessoAoProntuario(ctx, data.client_id as string, 'plano', data.id as string)
  const { procedures: catalogo } = await procedimentosParaPlano(ctx.tenantId!, plan.branch_id as string)
  return {
    plano: {
      id:       data.id as string,
      status:   data.status as string,
      notes,
      sessions,
      catalogo,
      descontoCombinado: ['DRAFT', 'PROPOSED'].includes(data.status as string)
        ? combinadoDoPlano(data as { desconto_combinado_tipo?: string | null; desconto_combinado_valor?: number | string | null })
        : null,
      cancelamento: retratoDoCancelamento(data as { cancelado_em?: string | null; cancelamento_motivo?: string | null; cancelamento?: unknown },
        await fusoDaUnidade(ctx.tenantId, plan.branch_id as string)),
    },
  }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function salvarPlanoDoCliente(
  ...args: Parameters<typeof salvarPlanoDoClienteInterno>
): ReturnType<typeof salvarPlanoDoClienteInterno> {
  try {
    return await salvarPlanoDoClienteInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/** Salva sessões e observações de um plano que já existe. */
async function salvarPlanoDoClienteInterno(
  planId: string,
  sessions: PlanSessionInput[],
  notes: string,
  /** 22ª A20: o desconto do plano do editor (sem ele, não mexe). */
  desconto?: unknown,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()
  // A1(b) da 25ª: a sessão sem procedimento não entra no plano.
  const vazia = recusaDaSessaoVazia(sessions)
  if (vazia) return { error: vazia }

  const plan = await planoDoTenant(admin, planId, ctx)
  if (!plan) return { error: 'Plano não encontrado.' }
  // PT2: monta quem ATENDE na unidade do plano — sem o Prontuário em Gerenciar.
  if (!montaPlano(ctx, plan.branch_id as string)) return { error: RECUSA_QUEM_MONTA }
  // A20d da 25ª: fechado é também o cancelado e o recusado (retrato só de leitura; o editor os trava).
  if (planoFechado(plan.status as string | null)) return { error: RECUSA_DO_PLANO_FECHADO }

  // A anotação clínica é do Prontuário: quem não a escreve não a apaga (PT2).
  const anota = anotaNoPlano(ctx, (plan.professional_id as string | null) ?? null)
  const combinado = colunasDoCombinado(desconto, sessions, ctx.internalUserId ?? null)
  if (combinado && 'error' in combinado) return combinado
  // As observações e o desconto vão com as sessões, numa transação só (A20d da 25ª; §14).
  const cabecalho = {
    ...(anota ? { notas: notes || null } : {}),
    ...(combinado ? { combinado: combinado.colunas } : {}),
  }
  const res = await gravarSessoes(admin, planId, sessions, { tenantId: ctx.tenantId!, unidadeId: plan.branch_id as string }, cabecalho)
  if (res.error) return { error: res.error }
  // DC4: os documentos do plano nascem na criação (o primeiro "Salvar plano") e
  // acompanham as sessões: o que saiu é cancelado, o que entrou nasce.
  await emitirDocumentosDoPlano(ctx.tenantId!, planId)

  revalidatePath(`/${plan.slug}/clients/${plan.client_id}`)
  revalidatePath(`/admin/clients/${plan.client_id}`)
  if (plan.evaluation_appointment_id) {
    revalidatePath(`/${plan.slug}/agenda/${plan.evaluation_appointment_id}`)
    revalidatePath(`/admin/agenda/${plan.evaluation_appointment_id}`)
  }
  return {}
}

// -- Buscar sessões do plano (para checkout wizard) ----------------------------


export async function getTreatmentPlanSessions(planId: string): Promise<{
  sessions: PlanSessionForCheckout[]
  total:    number
}> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'atendimento', 'VIEW')
  const admin = createAdminClient()

  const plan = await ler(admin
    .from('treatment_plans')
    .select('branch_id, professional_id, client_id')
    .eq('id', planId)
    .maybeSingle(), 'buscar o plano')
  if (!plan || !(await planoDaProfissional(admin, ctx, plan))) return { sessions: [], total: 0 }

  const branch = await ler(admin
    .from('branches')
    .select('tenant_id')
    .eq('id', plan.branch_id)
    .maybeSingle(), 'buscar a unidade')
  if (branch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, plan.branch_id as string)) return { sessions: [], total: 0 }

  const sessions = await sessoesDoPlanoParaCheckout(ctx.tenantId!, planId)
  const total = sessions.reduce((sum, s) => sum + s.totalPrice, 0)
  return { sessions, total }
}

// -- Enviar plano para recepção (DRAFT → PROPOSED) -----------------------------

export async function proposeTreatmentPlan(planId: string, slug: string) {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  assertPermission(ctx, 'atendimento', 'VIEW')

  const admin = createAdminClient()

  const alvo = await planoDoTenant(admin, planId, ctx)
  if (!alvo) return { error: 'Plano não encontrado.' }
  if (!montaPlano(ctx, alvo.branch_id as string)) return { error: RECUSA_QUEM_MONTA }

  const plan = await ler(admin
    .from('treatment_plans')
    .select('id, status, evaluation_appointment_id, branch_id, professional_notes, client_id')
    .eq('id', planId)
    .single(), 'buscar o plano')

  if (!plan)               return { error: 'Plano não encontrado.' }
  if (plan.status !== 'DRAFT') return { error: 'Apenas planos em rascunho podem ser enviados.' }

  const recusa = await recusaDoEnvioDoPlano(admin, plan, anotaNoPlano(ctx, alvo.professional_id as string | null))
  if (recusa) return { error: recusa }

  const { error } = await admin
    .from('treatment_plans')
    .update({ status: 'PROPOSED', updated_at: new Date().toISOString() })
    .eq('id', planId)

  if (error) return { error: error.message }

  await planoProposto(planId, ctx)
  // A12 da 20ª: a cliente é avisada no sino e no celular (uma vez por plano).
  await avisarDoPlanoProposto(ctx.tenantId!, planId)

  revalidatePath(`/${slug}/agenda`)
  if (plan.evaluation_appointment_id) {
    revalidatePath(`/${slug}/agenda/${plan.evaluation_appointment_id}`)
  }
  return {}
}

/**
 * O que o plano precisa ter para sair do rascunho — mandado à cliente ("vai
 * pensar") ou aceito (PT1b): as observações, uma sessão, e, vindo de uma
 * avaliação, as dores e a anamnese.
 */
async function recusaDoEnvioDoPlano(
  admin: ReturnType<typeof createAdminClient>,
  plan: { id: string; evaluation_appointment_id: string | null; professional_notes: string | null; client_id: string | null },
  /**
   * Quem age escreve a anotação clínica? Só a ela se pede a observação (PT2):
   * quem monta sem o Prontuário nem vê o campo — pedir o que ela não pode
   * escrever trancaria o plano dela.
   */
  anota = true,
): Promise<string | null> {
  const planId = plan.id
  // 1. Observações da profissional
  if (anota && !plan.professional_notes?.trim()) {
    // A29 da 12ª: o botão é "Aceitar plano" (ou "Cliente vai pensar") — a frase diz os dois.
    return 'Preencha as observações da profissional antes de aceitar o plano ou mandá-lo à cliente.'
  }

  // 2. Pelo menos 1 sessão
  const itemCount = await contar(admin
    .from('treatment_plan_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId), 'contar as sessões do plano')
  if (itemCount === 0) {
    return 'Adicione ao menos uma sessão ao plano antes de enviar.'
  }

  // 3. Dores do cliente: no prontuário do atendimento (desde o D3 de
  //    2026-10-28); a observação do agendamento continua valendo, como antes.
  if (plan.evaluation_appointment_id) {
    const [appt, entrada] = await Promise.all([
      ler(admin.from('appointments').select('notes').eq('id', plan.evaluation_appointment_id).single(), 'buscar o agendamento'),
      ler(admin.from('medical_record_entries').select('queixas').eq('appointment_id', plan.evaluation_appointment_id).maybeSingle(),
        'buscar as dores do atendimento'),
    ])
    if (!entrada?.queixas?.trim() && !appt?.notes?.trim()) {
      return 'Registre as dores/queixas do cliente antes de enviar.'
    }
  }

  // 4. Anamnese preenchida — só quando o plano saiu de uma avaliação.
  //
  // A exigência foi escrita para a tela da avaliação, onde a aba de anamnese
  // está ali do lado. Num plano criado direto em Planejamentos ela virava um
  // beco sem saída: a tela não tem onde preencher, e o plano pode nem ter
  // cliente ainda. O que protege a venda em si é o termo de consentimento, que
  // o aceite colhe de qualquer jeito.
  if (plan.evaluation_appointment_id) {
    const medRecord = await ler(admin
      .from('medical_records')
      .select('general_anamnesis')
      .eq('client_id', plan.client_id)
      .maybeSingle(), 'abrir o prontuário do cliente')
    if (!medRecord?.general_anamnesis) {
      return 'Preencha a ficha de saúde do cliente antes de enviar.'
    }
  }
  return null
}

// -- Os documentos do plano (DC1c/PC9b, DC4) -----------------------------------

/** O que o bloco "Documentos" do plano precisa — nulo sem o recurso de documentos no plano da rede. */
export interface DocumentosDoPlanoNaTela {
  /** O contrato de plano ativo da rede (nulo: nenhum) — nasce no PDV, com o pagamento. */
  contrato: string | null
  modelos: { id: string; nome: string; tipo: string }[]
  procedimentos: { id: string; nome: string; termo: string | null; contrato: string | null; outros: string[] }[]
  /** Os puxados que a rede tirou deste plano. */
  excluidos: string[]
}

/**
 * Os documentos que o plano puxa dos procedimentos (DC1c/PC9b no plano, a
 * revisão do Heitor de 2026-11-13): o catálogo da rede (os modelos ativos e os
 * procedimentos com termo ou outros documentos) e o que este plano excluiu. A
 * conta (`documentosPuxadosDoPlano`) é da tela, sobre as sessões que estão no
 * editor; o banco aplica a mesma ao salvar o plano (`private.modelos_do_plano`:
 * DC4, os documentos nascem na criação).
 * Sem plano (o novo, ainda sem id): o catálogo, sem exclusões.
 */
export async function getDocumentosDoPlano(planId: string | null): Promise<DocumentosDoPlanoNaTela | null> {
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  assertPermission(ctx, 'atendimento', 'VIEW')
  if (planId && !/^[0-9a-f-]{36}$/i.test(planId)) return null
  if (!(await redeTemRecurso(ctx.tenantId!, 'documentos'))) return null
  const admin = createAdminClient()
  let excluidos: string[] = []
  if (planId) {
    const plan = await planoDaRede(admin, planId, ctx)
    if (!plan) return null
    const linha = await ler(admin.from('treatment_plans').select('documentos_excluidos').eq('id', planId).maybeSingle(),
      'ler os documentos excluídos do plano') as { documentos_excluidos: string[] | null } | null
    excluidos = linha?.documentos_excluidos ?? []
  }
  const [modelos, procedimentos] = await Promise.all([
    ler(admin.from('document_templates').select('id, name, kind')
      .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'), 'carregar os modelos de documento'),
    lerTodas((de, ate) => admin.from('procedures')
      .select('id, name, consent_template_id, contract_template_id, outros_documentos')
      .eq('tenant_id', ctx.tenantId!).order('id').range(de, ate), 'carregar os documentos dos procedimentos'),
  ])
  const lista = (modelos ?? []) as { id: string; name: string; kind: string }[]
  type Linha = { id: string; name: string; consent_template_id: string | null; contract_template_id: string | null; outros_documentos: string[] | null }
  return {
    contrato: lista.find(m => m.kind === 'CONTRATO_PLANO')?.name ?? null,
    modelos: lista.map(m => ({ id: m.id, nome: m.name, tipo: m.kind })),
    procedimentos: (procedimentos as Linha[])
      .filter(p => p.consent_template_id || (p.outros_documentos ?? []).length)
      .map(p => ({ id: p.id, nome: p.name, termo: p.consent_template_id, contrato: p.contract_template_id, outros: p.outros_documentos ?? [] })),
    excluidos,
  }
}

/**
 * "Excluir" e "Incluir de novo" num documento puxado (DC1c/PC9b): grava a
 * lista no plano e sincroniza os documentos (DC4: eles já nasceram na criação —
 * o excluído é cancelado, o incluído de novo nasce). Quem pode é quem monta o
 * plano (PT2, `montaPlano`), e só antes do aceite. Os ids passam pelos modelos
 * da rede: o que não é dela não entra.
 */
export async function salvarDocumentosExcluidosDoPlano(planId: string, excluidos: string[]): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'planos_de_tratamento')
    assertPermission(ctx, 'atendimento', 'VIEW')
    const admin = createAdminClient()
    const plan = await planoDoTenant(admin, planId, ctx)
    if (!plan) return { error: 'Plano não encontrado.' }
    if (!montaPlano(ctx, plan.branch_id as string)) return { error: RECUSA_QUEM_MONTA }
    if (plan.status !== 'DRAFT' && plan.status !== 'PROPOSED') {
      return { error: 'Este plano já foi aceito: os documentos dele não mudam mais por aqui.' }
    }
    const pedidos = [...new Set((Array.isArray(excluidos) ? excluidos : []).filter(x => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))]
    const daRede = pedidos.length
      ? ((await ler(admin.from('document_templates').select('id').eq('tenant_id', ctx.tenantId!).in('id', pedidos),
          'conferir os documentos excluídos')) ?? []).map(t => t.id as string)
      : []
    await gravar(admin.from('treatment_plans').update({ documentos_excluidos: pedidos.filter(id => daRede.includes(id)), updated_at: new Date().toISOString() })
      .eq('id', planId), 'gravar os documentos excluídos do plano')
    // DC4: o excluído sai (cancelado), o incluído de novo nasce.
    await emitirDocumentosDoPlano(ctx.tenantId!, planId)
    revalidatePath(`/${plan.slug}/planejamentos/${planId}`)
    revalidatePath(`/admin/planejamentos/${planId}`)
    return {}
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// -- Aceitar (PT1b) -------------------------------------------------------------

/**
 * O aceite do plano (PT1b, a revisão do Heitor de 2026-11-13): só "quero
 * fazer" — sem pergunta de dinheiro ("pode ser intimidador e levar a
 * desistencia"). O plano vira aceito (os termos e os outros documentos já nasceram na
 * criação, DC4), o desconto
 * combinado no editor se aplica aos preços (22ª A20, na mesma transação) e a
 * comanda do plano nasce no PDV com o valor do plano. O dinheiro é no PDV: a forma, o
 * contrato com ela, e só então o recebimento ("primeiro colhe assinatura,
 * depois paga").
 */
export async function aceitarPlano(planId: string): Promise<{ error?: string; comandaId?: string | null }> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'planos_de_tratamento')
    // Na avaliação aberta, aceita também quem atende ESTE atendimento (PT2; o
    // Atendimento em Gerenciar desde 2026-11-18) — conferido abaixo, pelo plano.
    if (!can(ctx, 'atendimento', 'MANAGE')) assertPodeFecharPlano(ctx)
    const admin = createAdminClient()
    const alvo = await planoDoTenant(admin, planId, ctx)
    if (!alvo) return { error: 'Plano não encontrado.' }
    // Aceita quem monta o plano (quem atende na unidade DELE), quem recebe, ou
    // quem atende a avaliação aberta de onde ele nasceu.
    if (!podeFecharEstePlano(ctx, alvo.branch_id as string)
      && !(await atendeAAvaliacaoAberta(admin, ctx, alvo.evaluation_appointment_id as string | null))) {
      return { error: RECUSA_QUEM_MONTA }
    }
    // A1a da 25ª: o plano cancelado (pelo "Cancelar plano" do proposto, ou o recusado antigo) não se aceita.
    if (alvo.status === 'CANCELLED' || alvo.status === 'REJECTED') return { error: RECUSA_DO_PLANO_CANCELADO }
    if (alvo.status === 'DRAFT') {
      const plan = await ler(admin.from('treatment_plans')
        .select('id, evaluation_appointment_id, professional_notes, client_id').eq('id', planId).single(), 'buscar o plano')
      const recusa = plan ? await recusaDoEnvioDoPlano(admin, plan, anotaNoPlano(ctx, alvo.professional_id as string | null)) : 'Plano não encontrado.'
      if (recusa) return { error: recusa }
    }
    const { data, error } = await admin.rpc('plano_aceitar', { p_tenant: ctx.tenantId, p_plano: planId })
    if (error) return { error: error.message }
    // Plano aceito é o fato comercial mais forte do sistema: virou venda.
    await planoAceito(planId, ctx)
    revalidatePath(`/${alvo.slug}/pdv`)
    revalidatePath('/admin/pdv')
    revalidatePath(`/${alvo.slug}/planejamentos/${planId}`)
    if (alvo.evaluation_appointment_id) {
      revalidatePath(`/${alvo.slug}/agenda/${alvo.evaluation_appointment_id}`)
      revalidatePath(`/admin/agenda/${alvo.evaluation_appointment_id}`)
    }
    return { comandaId: (data as string | null) ?? null }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// -- Cancelar checkout (PROPOSED → DRAFT) -------------------------------------

export async function cancelCheckout(
  planId: string,
  reason: string,
  slug:   string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPodeFecharPlano(ctx)
  const admin = createAdminClient()

  const plan = await ler(admin
    .from('treatment_plans')
    .select('id, status, branch_id, evaluation_appointment_id')
    .eq('id', planId)
    .maybeSingle(), 'buscar o plano')
  if (!plan) return { error: 'Plano não encontrado.' }

  const branch = await ler(admin
    .from('branches')
    .select('tenant_id')
    .eq('id', plan.branch_id)
    .maybeSingle(), 'buscar a unidade')
  if (branch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, plan.branch_id as string)) return { error: 'Acesso negado.' }
  if (!podeFecharEstePlano(ctx, plan.branch_id as string)) return { error: RECUSA_QUEM_MONTA }

  if (plan.status === 'ACCEPTED') return { error: 'Plano já foi aprovado e não pode ser cancelado.' }

  const { error } = await admin
    .from('treatment_plans')
    .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) return { error: error.message }

  if (plan.evaluation_appointment_id) {
    await tentar(admin.from('appointment_history').insert({
      appointment_id:  plan.evaluation_appointment_id,
      changed_by_id:   ctx.internalUserId,
      changed_by_name: ctx.userName || ctx.roleLabel || 'Equipe',
      action:          'CHECKOUT_CANCELLED',
      description:     reason.trim() ? `Checkout cancelado: ${reason.trim()}` : 'Checkout cancelado',
    }), 'registrar no histórico do agendamento')
  }

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/checkout/${planId}`)
  return {}
}

// -- Cancelar o plano fechado (D4 da 9ª simulação, decisão 2 do Heitor) -------

/**
 * O plano fechado da cliente, da rede e com a unidade ao alcance (§11: a
 * abrangência se confere na action). Nulo quando não é.
 */
async function planoFechadoAoAlcance(
  admin: ReturnType<typeof createAdminClient>, ctx: TenantContext, id: string,
): Promise<{ id: string; branch_id: string; client_id: string | null } | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const tp = await ler(admin.from('treatment_plans')
    .select('id, branch_id, client_id, branches!branch_id(tenant_id)')
    .eq('id', id).maybeSingle(), 'buscar o plano')
  const rede = (tp?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  // Cancelar o plano mexe no dinheiro: é do caixa da unidade do plano (F73).
  if (!tp || !alcancaOCaixaDoTratamento(ctx, rede, tp.branch_id as string)) return null
  return { id: tp.id as string, branch_id: tp.branch_id as string, client_id: (tp.client_id as string | null) ?? null }
}

/**
 * A conta do cancelamento do plano, ANTES de cancelar — a MESMA função que
 * grava (`plano_cancelar_devolvendo` com `p_simular`), no formato da janela do
 * pacote: "sim usa a mesma coisa do pacote" (decisão 2 do Heitor, 2026-11-07).
 * Quem cancela o plano é quem cancela o pacote: o Financeiro em Gerenciar.
 */
export async function previaDoCancelamentoDoPlano(
  planId: string,
): Promise<{ error?: string; previa?: PreviaDoCancelamento }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    const admin = createAdminClient()
    const plano = await planoFechadoAoAlcance(admin, ctx, planId)
    if (!plano) return { error: 'Plano não encontrado.' }
    const j = await ler(admin.rpc('plano_cancelar_devolvendo', {
      p_tenant: ctx.tenantId!, p_plano: plano.id, p_ator: ctx.internalUserId ?? null, p_ator_nome: ctx.userName ?? null,
      p_motivo: null, p_destino: null, p_agendamentos: null, p_esperado: null, p_simular: true,
      p_estorno: null, p_novo: null,
    }), 'calcular o cancelamento do plano') as Record<string, unknown>
    const previa = lerPreviaDoCancelamento(j)
    return { previa: { ...previa, pontos: previa.fidelidade ? await pontosDoConjunto(ctx.tenantId!, { plano: plano.id }) : null } }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Cancela o plano fechado com a regra do pacote: o usado vale o preço das
 * sessões feitas no plano (com o desconto), sem multa; o crediário que passa do
 * usado cai antes; o resto volta como estorno ou crédito na clínica, a
 * escolher; as sessões agendadas se cancelam ou ficam avulsas; a comissão de
 * venda volta na proporção — numa transação (`plano_cancelar_devolvendo`).
 * Era `cancelTreatmentPlan`, que não mexia nas parcelas e dava de crédito o
 * preço dos agendamentos futuros, pago ou não.
 */
export async function cancelarPlano(planId: string, entrada: unknown): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'financial', 'MANAGE')
    // C35: o Financeiro em "só os meus" não cancela (a tela já esconde).
    { const soOsMeus = recusaDoSoOsMeus(ctx); if (soOsMeus) return { error: soOsMeus } }
    const lido = EntradaDoCancelamento.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    const admin = createAdminClient()
    const plano = await planoFechadoAoAlcance(admin, ctx, planId)
    if (!plano) return { error: 'Plano não encontrado.' }
    const novo = lido.data.estorno === 'INTEIRO' ? lido.data.novo ?? null : null
    // C75 (VF-01 da varredura de 18/11): no cartão do usado, as vezes e a maquininha da rede.
    { const recusa = await recusaDoPagamentoDoUsado(ctx.tenantId!, novo); if (recusa) return { error: recusa } }
    const userName = ctx.userName || ctx.roleLabel || 'Equipe'
    const j = await gravar(admin.rpc('plano_cancelar_devolvendo', {
      p_tenant: ctx.tenantId!, p_plano: plano.id, p_ator: ctx.internalUserId ?? null, p_ator_nome: userName,
      p_motivo: lido.data.motivo, p_destino: lido.data.destino, p_agendamentos: lido.data.agendamentos,
      p_esperado: lido.data.esperado, p_simular: false,
      p_estorno: lido.data.estorno ?? null,
      p_novo: pagamentoDoUsadoParaOBanco(novo),
    }), 'cancelar o plano') as Record<string, unknown>

    // Os agendamentos cancelados com o plano avisam como qualquer cancelamento
    // (o evento das automações e a cliente/equipe), depois da transação.
    const motivo = `Plano cancelado: ${lido.data.motivo}`
    for (const id of agendamentosCancelados(j)) {
      await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CANCELADO, id, { ...ctx, userName }, { motivo })
      notifyCancelledAppointment(id, motivo, ctx.internalUserId)
    }

    if (plano.client_id) revalidateTag(`client:${plano.client_id}`, { expire: 0 })
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

// -- Cancelar o plano ainda não aceito (A1a da 25ª) ---------------------------

/**
 * O "Cancelar plano" do rascunho e do PROPOSTO (A1a da 25ª simulação; o Heitor,
 * 18/11, à pergunta "o plano proposto e ainda não aceito não tem um botão
 * 'Cancelar'. Entra?": "sim"). Sem dinheiro — a comanda do plano nasce no
 * aceite, e "Uma coisa só foi vendida se foi paga." —: o plano fica cancelado,
 * com o motivo e o retrato, e os documentos dele que esperavam assinatura caem
 * (o gatilho `documentos_do_plano_cancelado`, na transação de
 * `plano_cancelar_proposto`). Cancela quem MONTA o plano (`montaPlano`, PT2),
 * como quem o edita e o manda à cliente; o aceito segue com `cancelarPlano`
 * (o Financeiro em Gerenciar). A oportunidade não se move (R12).
 */
export async function cancelarPlanoProposto(planId: string, entrada: unknown): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'planos_de_tratamento')
    assertPermission(ctx, 'atendimento', 'VIEW')
    const lido = EntradaDoCancelamentoProposto.safeParse(entrada)
    if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
    if (typeof planId !== 'string' || !/^[0-9a-f-]{36}$/i.test(planId)) return { error: 'Plano não encontrado.' }
    const admin = createAdminClient()
    // A rede, a unidade ao alcance e, no "só os meus" do Atendimento, o plano dela.
    const plan = await planoDoTenant(admin, planId, ctx)
    if (!plan) return { error: 'Plano não encontrado.' }
    if (!montaPlano(ctx, plan.branch_id as string)) return { error: RECUSA_QUEM_MONTA }
    const recusa = recusaDoCancelamentoSemDinheiro(plan.status as string | null)
    if (recusa) return { error: recusa }

    await gravar(admin.rpc('plano_cancelar_proposto', {
      p_tenant: ctx.tenantId!, p_plano: planId, p_ator: ctx.internalUserId ?? null,
      p_ator_nome: ctx.userName || ctx.roleLabel || 'Equipe', p_motivo: lido.data.motivo,
    }), 'cancelar o plano')

    if (plan.client_id) revalidateTag(`client:${plan.client_id}`, { expire: 0 })
    revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
    revalidatePath(`/${plan.slug}/planejamentos/${planId}`)
    revalidatePath(`/admin/planejamentos/${planId}`)
    revalidatePath(`/${plan.slug}/planejamentos`)
    revalidatePath('/admin/planejamentos')
    revalidatePath('/[slug]/clients/[id]', 'page')
    revalidatePath('/admin/clients/[id]', 'page')
    revalidatePath('/[slug]/cliente/home', 'page')
    if (plan.evaluation_appointment_id) {
      revalidatePath(`/${plan.slug}/agenda/${plan.evaluation_appointment_id}`)
      revalidatePath(`/admin/agenda/${plan.evaluation_appointment_id}`)
    }
    return { ok: true }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// -- Gerar plano completo de uma só vez (avaliação) ----------------------------

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function generateEvaluationPlan(
  ...args: Parameters<typeof generateEvaluationPlanInterno>
): ReturnType<typeof generateEvaluationPlanInterno> {
  try {
    return await generateEvaluationPlanInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function generateEvaluationPlanInterno(
  appointmentId:         string,
  complaints:            string,
  /** As respostas da ficha de pré-atendimento (2026-10-20); null não mexe na anamnese. */
  anamnesis:             Record<string, unknown> | null,
  sessions:              PlanSessionInput[],
  planNotes:             string,
  sessionNotes:          string,
  sessionIntercurrences: string,
  slug:                  string,
  /**
   * As respostas da ficha do PROCEDIMENTO na tela (revisão do Heitor,
   * 2026-10-29): vão na MESMA gravação do plano. Nulas = a salva antes fica.
   */
  fichaDaTela:           Record<string, unknown> | null = null,
  /** A resposta à pergunta do planejamento sem ponto (atend-12): só com ela o plano nasce. */
  opcoes:                { confirmarPlanejamentoVazio?: boolean; descontoDoPlano?: unknown } = {},
): Promise<{ error?: string; planId?: string; confirmarPlanejamentoVazio?: boolean }> {
  const ctx   = await getTenantContext()
  // A tela do atendimento (o módulo do Atendimento, 2026-11-18).
  assertPermission(ctx, 'atendimento', 'VIEW')
  // A avaliação monta o plano: é do plano de tratamento.
  assertRecurso(ctx, 'planos_de_tratamento')
  const admin = createAdminClient()

  if (sessions.length === 0) return { error: 'Adicione ao menos uma sessão ao plano antes de enviar.' }
  // A1(b) da 25ª: a sessão sem procedimento não entra no plano.
  const vazia = recusaDaSessaoVazia(sessions)
  if (vazia) return { error: vazia }

  // Grava anamnese e prontuário do cliente DESTE agendamento: de outra rede,
  // seria escrever no prontuário de uma clínica alheia.
  const appt = await agendamentoDoTenant(admin, appointmentId, ctx)
  if (!appt) return { error: 'Agendamento não encontrado.' }
  // A agenda "só os meus" vale pelo id (D4 de 2026-10-28).
  if (deOutroProfissional(ctx, appt.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }

  // A avaliação CONCLUÍDA também gera o plano ("é preciso avaliar primeiro pra
  // depois decidir o que fazer" — revisão do Heitor, 2026-10-29), mas o
  // registro dela está travado (A30): as dores, a evolução, a ficha e a
  // anamnese daquele dia ficam como estão — só o plano nasce, ligado a ela.
  // Por isso nada do registro é lido da tela nem conferido de novo.
  const concluida = appt.status === 'COMPLETED'
  // Quem gera (PT2, 2026-11-14): na avaliação concluída só o plano nasce —
  // monta quem atende na unidade ("Montar plano desta avaliação"). Na ABERTA,
  // gera quem atende ESTE atendimento (PT2: "quem monta o plano é quem atende,
  // nem precisa de permissão pra isso pq isso é proprio atendimento"; com o
  // módulo do Atendimento, 2026-11-18: o Atendimento em Gerenciar, com o "só os
  // meus" dele). Saiu o Prontuário em Gerenciar da trava: o que a mesma
  // gravação escreve de CLÍNICO (as dores, a ficha, a ficha de saúde, a
  // evolução) só vai com ele — sem ele, só o plano.
  const atendeEste = can(ctx, 'atendimento', 'MANAGE') && !deOutroNoAtendimento(ctx, appt.professional_id)
  if (concluida ? !montaPlano(ctx, appt.branch_id as string) : !atendeEste) {
    return { error: concluida ? RECUSA_QUEM_MONTA : RECUSA_QUEM_ATENDE }
  }
  const registraClinico = can(ctx, 'medical_records', 'MANAGE')
  // A anotação clínica do plano (as "Observações da profissional") é do Prontuário.
  const anota = anotaNoPlano(ctx, ctx.internalUserId)

  let anamnese: AnamneseGeral | null = null
  let pendente: Record<string, unknown> | null = null
  let ficha: ReturnType<typeof fichaParaConcluir> = null
  if (!concluida) {
    if (registraClinico && !complaints.trim()) return { error: 'Registre as dores/queixas do cliente.' }
    // A anamnese no formato da ficha ATUAL (nula sem mudança: a que a cliente
    // respondeu não vira "pela equipe"); as respostas, limpas, fecham o
    // pré-atendimento pendente — a equipe a revisou.
    if (anamnesis && registraClinico) {
      const fichaDeSaude = await fichaDePreAtendimento(admin, ctx.tenantId!)
      const limpas = respostasDaFicha(fichaDeSaude.rows, anamnesis)
      pendente = Object.keys(limpas).length ? limpas : null
      anamnese = await anamneseDaEquipeParaGravar(admin, {
        tenantId: ctx.tenantId!, clientId: appt.client_id, respostas: anamnesis, porUsuario: ctx.internalUserId,
      })
    }
    // A ficha do procedimento da tela: o retrato da ficha ligada a ELE (não a
    // que o navegador diz), com o planejador retratado no servidor.
    if (registraClinico && fichaDaTela && appt.procedure_id) {
      const proc = await ler(admin.from('procedures').select('form_id')
        .eq('id', appt.procedure_id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o procedimento')
      const form = proc?.form_id
        ? await ler(admin.from('forms').select('id, name, schema')
            .eq('id', proc.form_id as string).eq('tenant_id', ctx.tenantId!).eq('tipo', 'PROCEDIMENTO').maybeSingle(), 'buscar a ficha de atendimento')
        : null
      ficha = fichaParaConcluir(form as { id: string; name: string; schema: unknown } | null, fichaDaTela)
      if (ficha) {
        const retratadas = await retratarInjetaveis(admin, ctx, { rows: ficha.rows, answers: ficha.answers, clientId: appt.client_id, appointmentId })
        if ('error' in retratadas) return { error: retratadas.error }
        ficha = { ...ficha, answers: retratadas.answers }
      }
    }
    // A obrigatória sem resposta (anamnese ou ficha do procedimento) barra o
    // plano, como barra o "Finalizar" (revisão do Heitor, 2026-10-29). Vale o
    // que fica gravado: o da tela, senão o gravado.
    const falta = await oQueFaltaParaSeguir(admin, {
      tenantId: ctx.tenantId!, appointmentId, procedureId: appt.procedure_id, clientId: appt.client_id,
      semInjetaveis: !temRecurso(ctx, 'injetaveis'), anamneseNaTela: anamnese, fichaNaTela: ficha?.answers ?? null,
      aQuemPedirAFicha: aQuemPedirAFichaDeSaude(ctx, (appt.branch_id as string | null) ?? null),
    })
    if (falta) return { error: falta }
    // O planejamento escolhido sem nenhum ponto pede a confirmação explícita (atend-12).
    const vazio = ficha ? perguntaDoPlanejamentoVazio(ficha.rows, ficha.answers) : null
    if (vazio && opcoes.confirmarPlanejamentoVazio !== true) return { error: vazio, confirmarPlanejamentoVazio: true }
  } else {
    // A avaliação CONCLUÍDA também confere (atend-04, revisão do Heitor:
    // "regras de negócio devem ser sempre validadas em backend"): vale o que
    // ficou gravado — a função do banco confere de novo.
    const falta = await oQueFaltaParaSeguir(admin, {
      tenantId: ctx.tenantId!, appointmentId, procedureId: appt.procedure_id, clientId: appt.client_id,
      semInjetaveis: !temRecurso(ctx, 'injetaveis'), anamneseNaTela: null, fichaNaTela: null,
      aQuemPedirAFicha: aQuemPedirAFichaDeSaude(ctx, (appt.branch_id as string | null) ?? null),
    })
    if (falta) return { error: falta }
  }

  // 22ª A20: o desconto do plano do editor vai na mesma gravação.
  const combinado = colunasDoCombinado(opcoes.descontoDoPlano, sessions, ctx.internalUserId ?? null)
  if (combinado && 'error' in combinado) return combinado

  // Só o que a unidade do atendimento (a do plano que nasce) faz (D4 da 14ª, F73).
  const naoFeito = await recusaDosProcedimentosDoPlano(admin, ctx.tenantId!, appt.branch_id as string,
    sessions.flatMap(s => s.procedures.map(p => p.procedureId)))
  if (naoFeito) return { error: naoFeito }

  // ─── Grava, tudo ou nada ──────────────────────────────────────────────
  // A ficha, a anamnese, o plano com as sessões, as dores, a evolução e o
  // histórico numa transação só (`gerar_plano_da_avaliacao`). Eram passos
  // soltos — e a ficha numa action à parte, antes —: o plano que falhava
  // deixava a ficha e a anamnese gravadas e um plano proposto sem procedimento.
  const comEvolucao = !!(sessionNotes.trim() || sessionIntercurrences.trim())
  const userName = ctx.userName || ctx.roleLabel || 'Profissional'
  const planId = await gravar(admin.rpc('gerar_plano_da_avaliacao', {
    p_agendamento: appointmentId,
    p_tenant:      ctx.tenantId!,
    p_ator:        ctx.internalUserId,
    p_ator_nome:   userName,
    p_dados: {
      profissional:   ctx.internalUserId,
      // Sem a chave, a função mantém a anotação que já havia (migration 20261115500001).
      ...(anota ? { notas_do_plano: planNotes } : {}),
      // A conferência das obrigatórias no banco (atend-04): sem o recurso, o planejador não barra.
      sem_injetaveis: !temRecurso(ctx, 'injetaveis'),
      // Sem a chave, o combinado que havia fica (migration 20261123100001).
      ...(combinado ? { desconto_combinado: { tipo: combinado.colunas.desconto_combinado_tipo, valor: combinado.colunas.desconto_combinado_valor } } : {}),
      sessoes: sessions.map(s => ({
        procedimentos: s.procedures.map((p, j) => ({
          procedure_id: p.procedureId,
          price:        p.price,
          sort_order:   p.sortOrder ?? j,
          products:     (p.products ?? []).map(pr => ({ product_id: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity })),
        })),
      })),
      // O clínico só com o Prontuário em Gerenciar (sem a chave, o gravado fica).
      ...(!concluida && registraClinico ? {
        queixas: complaints.trim(),
        ...(comEvolucao ? { notas: sessionNotes.trim() || null, intercorrencias: sessionIntercurrences.trim() || null } : {}),
        ...(anamnese ? { anamnese } : {}),
        ...(pendente ? { pendente } : {}),
        ...(ficha ? { ficha } : {}),
      } : {}),
    },
  }), 'gerar o plano da avaliação') as string | null
  if (!planId) return { error: 'Não foi possível gerar o plano.' }

  // Depois: o aviso de que a ficha foi preenchida (o que o "Salvar ficha" emitia).
  if (ficha) {
    await emitirEventoClinico(EVENTOS.ANAMNESE_RESPONDIDA, appointmentId, ctx, {
      clientId: appt.client_id, agendamentoId: appointmentId, referencia: 'form_data',
    })
  }
  // DC4: os documentos do plano nascem na criação.
  await emitirDocumentosDoPlano(ctx.tenantId!, planId)
  // A12 da 20ª: o plano gerado nasce proposto — a cliente é avisada (uma vez por plano).
  await avisarDoPlanoProposto(ctx.tenantId!, planId)

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/agenda/${appointmentId}`)
  revalidatePath(`/${slug}/checkout`)
  return { planId }
}

/**
 * Dados do checkout de um plano, para abrir o wizard fora da página dele.
 *
 * É o que permite fechar a venda dentro da tela do atendimento: quem acabou de
 * montar o plano, se puder receber, não precisa mandar o cliente para a
 * recepção nem trocar de tela.
 */
export async function getCheckoutPlan(planId: string): Promise<{ plan?: CheckoutPlan; error?: string }> {
  const ctx = await getTenantContext()
  assertPodeFecharPlano(ctx)

  const admin = createAdminClient()
  const plan = await ler(admin
    .from('treatment_plans')
    .select('branch_id, branches!branch_id(name, tenant_id)')
    .eq('id', planId)
    .maybeSingle(), 'buscar o plano')

  const branch = plan?.branches as unknown as { name: string; tenant_id: string } | null
  if (!plan?.branch_id || !branch || branch.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, plan.branch_id as string)) {
    return { error: 'Plano não encontrado.' }
  }
  if (!podeFecharEstePlano(ctx, plan.branch_id as string)) return { error: RECUSA_QUEM_MONTA }

  const { plan: checkout, error } = await montarCheckoutPlan(
    planId, plan.branch_id as string, branch.name, ctx.tenantId!, prof => podeVerClinico(ctx, prof), ctx.internalUserId ?? null,
    veComissaoDeTodos(ctx),
  )
  // A anotação clínica foi à tela: fica no registro (lib/prontuario/acessos.ts).
  if (checkout?.professionalNotes) await registrarAcessoAoProntuario(ctx, checkout.clientId, 'plano', planId)
  if (!checkout) return { error: error ?? 'Plano não encontrado.' }
  // FD2a/FD2b na comanda do plano: o saldo e os vouchers de desconto dela.
  const fidelidade = checkout.clientId ? await fidelidadeParaAVenda(ctx.tenantId!, checkout.clientId, admin) : null
  return { plan: { ...checkout, fidelidade } }
}

// -- Finalizar checkout (pagamento + agendamento de execução) ------------------

export type SessionScheduleInput = {
  planSessionId:  string
  scheduledAt:    string
  professionalId: string
  branchId:       string
}

// O pagamento do plano mora em lib/checkout/pagamento.ts: o contrato de plano
// (lib/documentos) também o lê, e aqui todo export é endpoint público.
export type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { rotuloDoPagamento, vezesNoCartao, maquininhaDoPagamento, metodoQuePagaAgora, partesQuePagamAgora, temOutrasFormas, type PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { recusaDosDocumentosDoPlano, emitirDocumentosDoPlano } from '@/lib/documentos/plano'
import { precosDoPlano, descontoDoPlano, precosComDesconto } from '@/lib/checkout/desconto-do-plano'
import { EntradaDoDesconto, motivoDoDesconto } from '@/lib/vendas/desconto'
import { quemVendeu, type QuemVendeuDaTela } from '@/lib/vendas/equipe-da-venda'
import { veComissaoDeTodos } from '@/lib/comissoes/quem-ve'
import { recusaDoSoOsMeus } from '@/lib/financeiro/so-os-meus'
import { dividirEmParcelas, rotuloDaParcela } from '@/lib/checkout/parcelas'
import { paraAnamneseGeral, respostasDaFicha, type AnamneseGeral } from '@/lib/anamnese-geral'
import { fichaDePreAtendimento, anamneseDaEquipeParaGravar } from '@/lib/pre-atendimento/ficha'
import { fichaParaConcluir } from '@/lib/atendimento/ficha-do-procedimento'
import { retratarInjetaveis } from '@/lib/injetaveis/alcance'
import { perguntaDoPlanejamentoVazio } from '@/lib/atendimento/retrato-dos-injetaveis'
import { avulsosDoPlano, textoDoAvulso } from '@/lib/checkout/plano-e-avulso'
import { deOutroProfissional, deOutroNoAtendimento, DE_OUTRO_PROFISSIONAL } from '@/lib/appointments/alteracoes'
import { emitirEventoClinico } from '@/lib/events/clinico'
import { EVENTOS } from '@estetica-os/types'
import { oQueFaltaParaSeguir } from '@/lib/atendimento/obrigatorias-no-servidor'
import { aQuemPedirAFichaDeSaude } from '@/lib/atendimento/quem-responde-a-ficha'
import { registrarAcessoAoProntuario } from '@/lib/prontuario/acessos'
import { pontosDoConjunto } from '@/lib/pacotes/pontos-do-cancelamento'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { fidelidadeDaVenda, fidelidadeParaAVenda } from '@/lib/fidelidade/na-venda'
import type { EscolhaDaFidelidade } from '@/lib/fidelidade/conta-na-venda'

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function checkoutTreatmentPlan(
  ...args: Parameters<typeof checkoutTreatmentPlanInterno>
): ReturnType<typeof checkoutTreatmentPlanInterno> {
  try {
    return await checkoutTreatmentPlanInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function checkoutTreatmentPlanInterno(
  planId:           string,
  /**
   * Como foi pago. `null` = **nada agora**: o plano é aceito e o valor fica em
   * aberto, para ser recebido no check-in do primeiro atendimento. Aceitar e
   * receber são dois gestos: o que ficava parado na fila de checkout era
   * decisão do cliente, não tarefa da recepção.
   */
  pagamento:        PagamentoDoPlano | null,
  sessionSchedules: SessionScheduleInput[],
  slug:             string,
  /**
   * O desconto do fechamento (R$ ou %), sobre a soma dos procedimentos do plano.
   * Por último na lista para as chamadas de antes (e os testes) seguirem valendo.
   */
  desconto?:        unknown,
  /**
   * "Quem vendeu" (decisão 4 da 7ª simulação): a comissão de VENDA do plano
   * vai para essa pessoa. Nasce vazio, como nas outras vendas; vazio, a venda
   * pergunta (`confirmarSemVendedor`) e só segue com `semVendedor`. Sem o
   * argumento (um chamador de antes), o plano sai sem comissão de venda.
   */
  equipe?:          QuemVendeuDaTela | null,
  /**
   * FD2a/FD2b na comanda do PLANO (2026-11-14): os pontos e o voucher de
   * desconto, no pagamento à vista — a mesma regra das outras vendas
   * (`fidelidadeDaVenda` aqui, `private.fidelidade_na_venda` no banco).
   */
  fidelidade?:      EscolhaDaFidelidade | null,
) {
  const ctx   = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  // É o RECEBER do plano (no PDV): o aceite é outro gesto (`aceitarPlano`).
  assertPodeReceber(ctx)
  if (!pagamento) return { error: 'Escolha como vai ser pago.' }
  const admin = createAdminClient()

  // Aceitar o plano lança receita, cria agendamentos e muda o status: com o id
  // de um plano de outra rede, tudo isso acontecia lá.
  if (!(await planoDoTenant(admin, planId, ctx))) return { error: 'Plano não encontrado.' }
  // Até quantas vezes a clínica parcela no crédito (D-15): o servidor recusa acima.
  // D1 da 18ª: cada forma paga agora (o à vista dividido confere todas).
  const recusaDasVezes = await recusaDasVezesDoPagamento(ctx.tenantId!, pagamento)
  if (recusaDasVezes) return { error: recusaDasVezes }
  // C38: o crediário até o limite da rede (era `Math.min(…, 48)`, calado).
  const recusaDasParcelas = await recusaDasParcelasDaRede(ctx.tenantId!, pagamento)
  if (recusaDasParcelas) return { error: recusaDasParcelas }
  // A37: o que se recebe agora pede a forma (a tela a deixa nascer vazia).
  if (pagamento && pagamento.forma !== 'A_RECEBER' && !pagamento.metodo) return { error: 'Escolha a forma de pagamento.' }

  const plan = await ler(admin
    .from('treatment_plans')
    .select('id, status, client_id, branch_id, evaluation_appointment_id')
    .eq('id', planId)
    .single(), 'buscar o plano')

  if (!plan) return { error: 'Plano não encontrado.' }
  if (plan.status === 'DRAFT' || plan.status === 'PROPOSED') return { error: 'Aceite o plano antes de receber.' }
  if (plan.status !== 'ACCEPTED') return { error: 'Este plano não está aberto para receber.' }

  // Quem vendeu, conferido ANTES do dinheiro (com-06): da equipe, ativa e ao
  // alcance da unidade; vazio só com a confirmação.
  let vendedor: string | null = null
  if (equipe != null) {
    const vendeu = await quemVendeu(ctx.tenantId!, ctx.internalUserId ?? null, equipe, plan.branch_id as string)
    if ('error' in vendeu) return { error: vendeu.error }
    if ('pergunta' in vendeu) return { confirmarSemVendedor: vendeu.pergunta }
    vendedor = vendeu.vendedor
  }

  // Os documentos do plano (§9.4.1), ANTES do primeiro lançamento: nada de
  // dinheiro com termo ou contrato que bloqueia sem assinatura, nem com um
  // contrato assinado para outro pagamento. O gatilho no plano é a segunda
  // linha — mas ele só barra o status, com os lançamentos já feitos.
  const entradaDoDesconto = EntradaDoDesconto.safeParse(desconto)
  if (!entradaDoDesconto.success) return { error: 'Desconto inválido.' }
  const precos = await precosDoPlano(planId)
  const doDesconto = descontoDoPlano(precos, entradaDoDesconto.data)
  if ('error' in doDesconto) return { error: doDesconto.error }
  // A entrada acima do total é recusada, não cortada (ven-02): "o plano custa
  // R$ 900 e a Bruna digita entrada de R$ 1.000; grava R$ 900 sem dizer nada".
  // D1 da 18ª: o dividido se confere depois da fidelidade (a primeira forma leva de volta o que ela desconta).
  const recusaDaEntrada = temOutrasFormas(pagamento) ? null : recusaDaEntradaDoPagamento(pagamento, Math.round((precos.subtotal - doDesconto.reais) * 100) / 100, 'do plano')
  if (recusaDaEntrada) return { error: recusaDaEntrada }

  const recusaDosDocumentos = await recusaDosDocumentosDoPlano(ctx.tenantId!, planId, pagamento, doDesconto.reais)
  if (recusaDosDocumentos) return { error: recusaDosDocumentos }

  // Busca sessões com procedimentos (D3 da 25ª: sem a trava do Atendimento —
  // quem recebe é `podeReceber`, conferido acima, e o plano já é da rede e do alcance).
  const sessions = await sessoesDoPlanoParaCheckout(ctx.tenantId!, planId)
  if (sessions.length === 0) return { error: 'Plano sem sessões cadastradas.' }
  // O total é o do plano DEPOIS do desconto: o rateio (`precosComDesconto`)
  // fecha exatamente nele, e é o que `plano_checkout` confere.
  const total = Math.round((precos.subtotal - doDesconto.reais) * 100) / 100

  // Os pontos e o voucher (FD2a/FD2b): conferidos aqui, sobre o total do plano
  // depois do desconto, e de novo no banco. O lançamento nasce com o total; a
  // função abate a fidelidade e o marca pago. O contrato cita o plano: os
  // pontos são um meio de pagar.
  const daFidelidade = await fidelidadeDaVenda({
    tenantId: ctx.tenantId!, clienteId: plan.client_id as string, vendido: total,
    escolha: fidelidade, aVista: pagamento.forma === 'AVISTA', admin,
  })
  if ('error' in daFidelidade) return { error: daFidelidade.error }
  // D1 da 18ª: o plano dividido em mais de uma forma — a soma fecha o total (com a fidelidade na primeira).
  const pagamentoDoPlano = comFidelidadeNaPrimeira(pagamento, daFidelidade.dados)
  const recusaDasFormas = recusaDaEntradaDoPagamento(pagamentoDoPlano, total, 'do plano')
  if (recusaDasFormas) return { error: recusaDasFormas }

  // A47 da 6ª simulação: a descrição chega à cliente (o app, o recibo): sem
  // texto interno ("checkout novo paciente"). "Plano de tratamento — parcela 1/2".
  const descricao = 'Plano de tratamento'

  // O motivo do desconto (fin-01) vai no PRIMEIRO lançamento do plano.
  let motivoDoDescontoAinda = motivoDoDesconto(entradaDoDesconto.data, doDesconto.reais)
  const lancamentos: Record<string, unknown>[] = []
  /** Um lançamento do plano, montado aqui e gravado por `plano_checkout`. */
  function lancar(campos: Record<string, unknown>) {
    const motivo = motivoDoDescontoAinda
    motivoDoDescontoAinda = null
    lancamentos.push({ description: descricao, ...(motivo ? { desconto_motivo: motivo } : {}), ...campos })
  }

  // Cada horário escolhido é conferido ANTES de o dinheiro e o primeiro agendamento nascerem:
  // até 2026-09-28 a unidade e o profissional iam direto para o insert —
  // inclusive os de outra clínica.
  if (can(ctx, 'agenda', 'MANAGE')) {
    for (const sched of sessionSchedules) {
      // D3 da 15ª: a já agendada não se agenda de novo (o laço de baixo a pula).
      if (sessions.find(s => s.id === sched.planSessionId)?.agendada) continue
      const recusa = await conferirPecasDoAgendamento(admin, ctx, {
        branchId: sched.branchId, professionalId: sched.professionalId,
      })
      if (recusa) return { error: recusa }
      // E o horário livre (revisão de 2026-10-08) — aqui, antes do dinheiro.
      const sess = sessions.find(s => s.id === sched.planSessionId)
      if (sess?.mainProcedureId && await horarioOcupado(admin, {
        tenantId: ctx.tenantId!, professionalId: sched.professionalId,
        inicio: new Date(sched.scheduledAt), duracaoMin: sess.mainDurationMin || 60,
      })) {
        return { error: 'Este profissional já tem agendamento nesse horário.' }
      }
    }
  }

  // 1. Dinheiro.
  //
  // O que foi RECEBIDO agora e o que ficou A RECEBER são transações separadas:
  // `revenueCash` conta INCOME pago com eixo em `paid_at`, então uma transação
  // única marcada como não paga faria a entrada sumir do caixa do dia.
  if (temOutrasFormas(pagamentoDoPlano)) {
    // D1 da 18ª: um lançamento PAGO por forma, cada um com as vezes, a bandeira e a maquininha dele.
    for (const parte of partesQuePagamAgora(pagamentoDoPlano)) {
      lancar({
        amount:          Math.round(parte.valor * 100) / 100,
        payment_method:  parte.metodo,
        is_paid:         true,
        ...(parte.vezes > 1 ? { cartao_vezes: parte.vezes } : {}),
        cartao_bandeira: bandeiraDoPagamento(parte.metodo, parte.bandeira),
        maquininha_id:   parte.maquininha && (parte.metodo === 'CREDIT_CARD' || parte.metodo === 'DEBIT_CARD') ? parte.maquininha : null,
      })
    }
  } else if (pagamento.forma === 'AVISTA') {
    // No cartão de crédito em N vezes a maquininha paga a clínica: pago na
    // hora, e as vezes ficam no lançamento para a taxa da comissão.
    const vezes = vezesNoCartao(pagamento)
    lancar({
      amount:          total,
      payment_method:  pagamento.metodo,
      is_paid:         true,
      ...(vezes > 1 ? { cartao_vezes: vezes } : {}),
      // r3-f13-01: a bandeira do cartão, opcional. C75: a maquininha.
      cartao_bandeira: bandeiraDoPagamento(pagamento.metodo, pagamento.bandeira),
      maquininha_id:   maquininhaDoPagamento(pagamento),
    })

  } else if (pagamento.forma === 'PARCELADO') {
    const entrada = Math.max(0, Math.min(pagamento.entrada, total))
    const saldo   = Math.round((total - entrada) * 100) / 100
    const vezes   = Math.max(1, pagamento.parcelas)

    if (entrada > 0) {
      // D5: a entrada no crédito também em N vezes na maquininha.
      const vezesDaEntrada = vezesNoCartao(pagamento)
      lancar({
        amount:          entrada,
        payment_method:  pagamento.metodo,
        is_paid:         true,
        description:     `${descricao} — entrada`,
        notes:           'Entrada do plano de tratamento',
        ...(vezesDaEntrada > 1 ? { cartao_vezes: vezesDaEntrada } : {}),
        cartao_bandeira: bandeiraDoPagamento(pagamento.metodo, pagamento.bandeira),
        maquininha_id:   maquininhaDoPagamento(pagamento),
      })
    }

    // Cada parcela, um lançamento com o seu vencimento (2026-09-30): o saldo
    // inteiro num lançamento só aparecia no mês da venda e se quitava de uma vez.
    if (saldo > 0) {
      const grupo = crypto.randomUUID()
      for (const parcela of dividirEmParcelas(saldo, vezes, pagamento.primeiroVencimento)) {
        // D6: o crediário da CLÍNICA nasce sem meio (escolhe-se ao receber) —
        // não é o cartão da entrada.
        lancar({
          amount:         parcela.amount,
          is_paid:        false,
          due_date:       parcela.due_date,
          description:    `${descricao} — ${rotuloDaParcela(parcela)}`,
          notes:          `Saldo do plano em ${vezes}x`,
          parcela_numero: parcela.numero,
          parcela_total:  parcela.total,
          parcela_grupo:  grupo,
        })
      }
    }

  } else {
    lancar({ amount: total, payment_method: pagamento.metodo, is_paid: false, due_date: pagamento.vencimento })
  }

  // 2. Para cada sessão: o agendamento (se agendado)
  //
  // Marcar horário na agenda é gesto de agenda: quem recebe mas não gerencia
  // agenda fecha a venda e as sessões ficam para marcar depois, em vez de a tela
  // inteira ser negada.
  const podeAgendar = can(ctx, 'agenda', 'MANAGE')
  // D8 da 12ª: a sala única do procedimento, livre, vem; ocupada, a sessão vai
  // sem sala (a sala é opcional — H1) e a tela diz.
  const avisosDaSala: string[] = []
  const agendamentos: Record<string, unknown>[] = []
  for (const sess of sessions) {
    const sched = podeAgendar ? sessionSchedules.find(s => s.planSessionId === sess.id) ?? null : null
    // D3 da 15ª: a sessão já agendada antes do checkout fica com o agendamento dela.
    if (!sched || !sess.mainProcedureId || sess.agendada) continue
    const sala = await salaUnicaDoHorario(admin, {
      tenantId: ctx.tenantId!, branchId: sched.branchId, procedureId: sess.mainProcedureId,
      inicio: new Date(sched.scheduledAt), duracaoMin: sess.mainDurationMin || 60,
    })
    if (sala.ocupada) {
      const quando = new Date(sched.scheduledAt).toLocaleString('pt-BR', { timeZone: await fusoDaUnidade(ctx.tenantId, sched.branchId), day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(', ', ' às ')
      avisosDaSala.push(`A ${sala.ocupada} está ocupada em ${quando}: essa sessão vai sem sala.`)
    }
    agendamentos.push({
      sessao:          sess.id,
      branch_id:       sched.branchId,
      procedure_id:    sess.mainProcedureId,
      professional_id: sched.professionalId,
      scheduled_at:    sched.scheduledAt,
      duration_min:    sess.mainDurationMin,
      room_id:         sala.salaId,
    })
  }

  // 3. Tudo numa transação só (C32 do levantamento, 2026-11-12): o desconto,
  // o dinheiro, os agendamentos que vierem e a comissão de VENDA (decisão 4
  // da 7ª: à vista libera na hora, o crediário espera a última parcela — H4).
  // A função trava o plano e confere que está aceito e ainda não recebido: a
  // segunda aba ouve "Este plano já foi recebido", e uma falha no meio não
  // deixa nada gravado pela metade.
  const argsDoFechamento = {
    p_tenant:       ctx.tenantId,
    p_plano:        planId,
    p_ator:         ctx.internalUserId ?? null,
    p_desconto:     doDesconto.reais,
    p_precos:       precosComDesconto(precos, doDesconto.reais),
    p_lancamentos:  lancamentos,
    p_agendamentos: agendamentos,
    p_com_comissao: equipe != null,
    p_vendedor:     vendedor,
  }
  const fechado = await gravar(daFidelidade.dados
    ? admin.rpc('plano_checkout_com_fidelidade', { ...argsDoFechamento, p_fidelidade: daFidelidade.dados })
    : admin.rpc('plano_checkout', argsDoFechamento), 'fechar o plano') as { transacao: string | null; agendamento: string | null } | null
  const transactionId    = fechado?.transacao ?? null
  const newAppointmentId = fechado?.agendamento ?? null

  // 4. Log no appointment de avaliação
  if (plan.evaluation_appointment_id) {
    await tentar(admin.from('appointment_history').insert({
      appointment_id:    plan.evaluation_appointment_id,
      changed_by_id:     ctx.internalUserId,
      changed_by_name:   ctx.userName || ctx.roleLabel || 'Equipe',
      action:            'CHECKOUT_COMPLETED',
      description:       `Checkout concluído — R$ ${total.toFixed(2).replace('.', ',')}${doDesconto.reais > 0 ? ` (desconto de R$ ${doDesconto.reais.toFixed(2).replace('.', ',')})` : ''} — ${rotuloDoPagamento(pagamento)}`,
    }), 'registrar o checkout no histórico')
  }

  // 5. O atendimento de hoje (o que GEROU o plano), se tem preço e não foi
  //    recebido: vai junto, pelo caminho do avulso — com o appointment_id, a
  //    comissão e as métricas o leem como sempre. Só quando algo é recebido
  //    agora; "a receber" e "no atendimento" o deixam para a tela dele.
  let aviso: string | undefined
  if (pagamento && pagamento.forma !== 'A_RECEBER') {
    const hoje = await atendimentoDeHojeDoPlano(admin, planId)
    if (hoje) {
      const { error } = await admin.rpc('confirmar_pagamento_do_atendimento', {
        p_agendamento: hoje.appointmentId, p_tenant: ctx.tenantId, p_ator: ctx.internalUserId,
        p_ator_nome:   ctx.userName || ctx.roleLabel || 'Equipe',
        p_dados:       { metodo: pagamento.metodo, pontos: 0, desconto: 0, valor_final: hoje.preco, cartao_vezes: vezesNoCartao(pagamento), cartao_bandeira: bandeiraDoPagamento(pagamento.metodo, pagamento.bandeira), maquininha_id: maquininhaDoPagamento(pagamento) },
      })
      if (error) aviso = `O plano foi fechado, mas o atendimento de hoje não foi recebido (${error.message}). Receba pela tela do atendimento.`
    }
  }

  if (slug) {
    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/checkout`)
    revalidatePath(`/${slug}/dashboard`)
  }
  revalidatePath('/admin/checkout')
  revalidatePath('/admin/dashboard')

  // A tela do atendimento de origem também muda: o plano deixa de estar
  // "aguardando checkout". Sem isto, fechar a venda ali mesmo não atualizava
  // nada — a pessoa continuava vendo o convite para fechar o que acabara de
  // fechar.
  if (plan.evaluation_appointment_id) {
    if (slug) revalidatePath(`/${slug}/agenda/${plan.evaluation_appointment_id}`)
    revalidatePath(`/admin/agenda/${plan.evaluation_appointment_id}`)
  }

  return { transactionId, newAppointmentId, ...(aviso ? { aviso } : {}), ...(avisosDaSala.length ? { avisoDaSala: avisosDaSala.join(' ') } : {}) }
}

// -- Receber no check-in -------------------------------------------------------

/**
 * Como a recepção recebe o que ficou em aberto de um plano.
 *
 * Não tem `A_RECEBER`: o valor JÁ está a receber — é disto que se trata. Aqui só
 * cabe quitar tudo agora ou receber uma entrada e parcelar o resto.
 */
export type RecebimentoDoPlano =
  /** `vezes`: o cartão de crédito em N vezes, pago na hora (2026-10-20). */
  | { forma: 'AVISTA';    metodo: string; vezes?: number; bandeira?: string; maquininha?: string }
  /**
   * `metodo`, `vezes`, `bandeira` e `maquininha` são da entrada (D5); as
   * parcelas são da clínica, sem meio (D6). PDV8: sem entrada, sem meio (nulo).
   */
  | { forma: 'PARCELADO'; metodo: string | null; entrada: number; parcelas: number; primeiroVencimento: string; bandeira?: string; vezes?: number; maquininha?: string }

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function receberDoPlano(
  planId:        string,
  recebimento:   RecebimentoDoPlano,
  appointmentId: string | null,
  slug:          string,
  /** A chave do envio (D10, lib/envio-unico.ts): o duplo clique recebe UMA vez. */
  envio?:        string | null,
): ReturnType<typeof receberDoPlanoInterno> {
  try {
    const ctx = await getTenantContext()
    return await umaVez(ctx.tenantId!, 'receberDoPlano', chaveDoEnvio(envio),
      () => receberDoPlanoInterno(planId, recebimento, appointmentId, slug))
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Recebe o saldo em aberto de um plano, no balcão.
 *
 * O gesto é o do check-in: a pessoa chega para a primeira sessão, paga, e segue
 * para o procedimento. Por isso ele mora na tela do atendimento e não numa fila
 * de checkout — a fila era uma tarefa que ninguém tinha, esperando uma decisão
 * que já tinha sido tomada quando o plano foi aceito.
 */
async function receberDoPlanoInterno(
  planId:        string,
  recebimento:   RecebimentoDoPlano,
  appointmentId: string | null,
  slug:          string,
): Promise<{ error?: string; recebido?: number }> {
  const ctx = await getTenantContext()
  // Quem recebe é `podeReceber` em todo caminho do recebimento (o PDV, ou o
  // Financeiro em Gerenciar) — a régua de `confirmPayment` e do banner do plano
  // na tela do atendimento (VF-04 da varredura de 18/11: era só o PDV).
  if (!podeReceber(ctx)) throw semAcesso()

  const admin = createAdminClient()

  // Confere a rede antes de escrever: o id sozinho não pode bastar.
  const plan = await ler(admin
    .from('treatment_plans')
    .select('id, branch_id, client_id, branches!inner(tenant_id)')
    .eq('id', planId)
    .maybeSingle(), 'buscar o plano')

  const planTenant = (plan?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  if (!plan || planTenant !== ctx.tenantId || !alcancaUnidade(ctx, plan.branch_id as string)) return { error: 'Plano não encontrado.' }
  // Até quantas vezes a clínica parcela no crédito (D-15): o servidor recusa acima.
  const recusaDasVezes = await recusaDasVezesDaRede(ctx.tenantId!, vezesNoCartao(recebimento), maquininhaDoPagamento(recebimento), metodoQuePagaAgora(recebimento))
  if (recusaDasVezes) return { error: recusaDasVezes }
  // A37: a forma nasce vazia na tela; sem ela, não se recebe. PDV8: no
  // crediário a forma é o crediário, e o meio é só o da ENTRADA — sem entrada,
  // nada se recebe agora (as parcelas pedem a forma quando forem pagas).
  if (recebimento.forma === 'AVISTA' && !recebimento.metodo) return { error: 'Escolha a forma de pagamento.' }
  if (recebimento.forma === 'PARCELADO' && recebimento.entrada > 0 && !recebimento.metodo) return { error: 'Escolha a forma da entrada.' }
  if (recebimento.forma === 'PARCELADO' && !(recebimento.entrada > 0)) recebimento = { ...recebimento, metodo: null, vezes: undefined, bandeira: undefined, maquininha: undefined }

  // O agendamento só serve para registrar o recebimento no histórico dele — e
  // tem de ser DESTE plano (uma sessão dele ou a avaliação que o gerou). Antes
  // qualquer id servia, e o histórico de um atendimento de outra rede ganhava
  // a linha "Plano de tratamento recebido".
  if (appointmentId) {
    const doPlano = await ler(admin
      .from('appointments').select('id')
      .eq('id', appointmentId)
      .eq('treatment_plan_id', planId)
      .maybeSingle(), 'conferir o agendamento do recebimento')
    const avaliacao = doPlano ? null : await ler(admin
      .from('treatment_plans').select('id')
      .eq('id', planId).eq('evaluation_appointment_id', appointmentId)
      .maybeSingle(), 'conferir a avaliação do plano')
    if (!doPlano && !avaliacao) return { error: 'Agendamento não pertence a este plano.' }
  }

  const saldo = await emAbertoDoPlano(planId)
  if (!saldo || saldo.emAberto <= 0) return { error: 'Não há valor em aberto neste plano.' }

  // O app calcula; `plano_receber` grava tudo numa transação, com o plano
  // TRAVADO e o saldo conferido de novo (F11): duas chegadas ao mesmo tempo
  // liam os mesmos R$ 300, e cada uma gravava a sua entrada e as suas parcelas.
  // A47: a descrição chega à cliente — sem texto interno.
  const descricao = 'Plano de tratamento'
  let lancamentos: Record<string, unknown>[] = []
  if (recebimento.forma === 'PARCELADO') {
    // A entrada acima do que está em aberto é recusada, não cortada (ven-02).
    const recusaDaEntrada = recusaDaEntradaAcimaDoTotal(recebimento.entrada, saldo.emAberto, 'em aberto do plano')
    if (recusaDaEntrada) return { error: recusaDaEntrada }
    const entrada = Math.max(0, Math.round(recebimento.entrada * 100) / 100)
    const resto   = Math.round((saldo.emAberto - entrada) * 100) / 100
    const vezes   = Math.max(1, recebimento.parcelas)
    // C38: o crediário até o limite da rede (era `Math.min(…, 48)`, calado).
    const recusaDasParcelas = await recusaDasParcelasDaRede(ctx.tenantId!, recebimento)
    if (recusaDasParcelas) return { error: recusaDasParcelas }
    if (entrada <= 0 && resto <= 0) return { error: 'Informe o valor da entrada.' }

    // O saldo anterior sai de cena inteiro e volta partido: o que foi recebido
    // agora e o que ficou parcelado são lançamentos diferentes, porque o caixa
    // conta pelo `paid_at` e uma transação só não pode estar nos dois lugares.
    if (entrada > 0) {
      lancamentos.push({ amount: entrada, is_paid: true, description: `${descricao} — entrada`, notes: 'Entrada do plano de tratamento' })
    }
    // Cada parcela, um lançamento com o seu vencimento (2026-09-30).
    if (resto > 0) {
      const grupo = crypto.randomUUID()
      lancamentos = lancamentos.concat(dividirEmParcelas(resto, vezes, recebimento.primeiroVencimento).map(parcela => ({
        amount:         parcela.amount,
        is_paid:        false,
        due_date:       parcela.due_date,
        description:    `${descricao} — ${rotuloDaParcela(parcela)}`,
        notes:          `Saldo do plano em ${vezes}x`,
        parcela_numero: parcela.numero,
        parcela_total:  parcela.total,
        parcela_grupo:  grupo,
      })))
    }
  }

  const { error: erroDoRecebimento } = await admin.rpc('plano_receber', {
    p_tenant:      ctx.tenantId!,
    p_plano:       planId,
    p_pendentes:   saldo.pendentes,
    p_esperado:    saldo.emAberto,
    p_forma:       recebimento.forma,
    p_metodo:      recebimento.metodo,
    // D5: as vezes do que é pago agora no crédito — o à vista ou a entrada.
    p_vezes:       vezesNoCartao(recebimento),
    p_lancamentos: lancamentos,
    p_ator:        ctx.internalUserId ?? 'sistema',
    // r3-f13-01 e C75: a bandeira e a maquininha do que é pago agora, na MESMA
    // transação (VF2-04 da varredura de 18/11: iam num UPDATE depois).
    p_bandeira:    bandeiraDoPagamento(recebimento.metodo, recebimento.bandeira),
    p_maquininha:  maquininhaDoPagamento(recebimento),
  })
  if (erroDoRecebimento) {
    // A recusa do banco (o saldo já recebido, o crédito sem saldo) é para a tela.
    if (erroDoRecebimento.code === 'P0001') return { error: erroDoRecebimento.message }
    throw new Error(`Não consegui registrar o recebimento: ${erroDoRecebimento.message}`)
  }

  if (appointmentId) {
    await tentar(admin.from('appointment_history').insert({
      appointment_id:  appointmentId,
      changed_by_id:   ctx.internalUserId,
      changed_by_name: ctx.userName || ctx.roleLabel || 'Equipe',
      action:          'PAYMENT_CONFIRMED',
      // A forma pelo nome da tela (D18, 2026-10-29: dizia "PIX à vista").
      description:     `Plano de tratamento recebido — R$ ${saldo.emAberto.toFixed(2).replace('.', ',')} — ${
        recebimento.forma === 'AVISTA'
          ? (vezesNoCartao(recebimento) > 1 ? rotuloDaForma(recebimento.metodo, vezesNoCartao(recebimento)) : `${rotuloDaForma(recebimento.metodo)} à vista`)
          : rotuloDoPagamento(recebimento)
      }`,
    }), 'registrar no histórico do agendamento')
  }

  if (slug) {
    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/financeiro`)
    revalidatePath(`/${slug}/dashboard`)
    revalidatePath(`/${slug}/planejamentos`)
    if (appointmentId) revalidatePath(`/${slug}/agenda/${appointmentId}`)
  }
  revalidatePath('/admin/financeiro')
  revalidatePath('/admin/dashboard')
  revalidatePath('/admin/planejamentos')
  if (appointmentId) revalidatePath(`/admin/agenda/${appointmentId}`)

  return { recebido: saldo.emAberto }
}

// -- Ficha de tratamento -------------------------------------------------------

export interface TreatmentFileSession {
  id:          string
  sortOrder:   number
  procedures:  Array<{ name: string; durationMin: number; price: number }>
  appointment: {
    id:           string
    scheduledAt:  string
    status:       string
    completedAt:  string | null
    notes:        string | null
  } | null
}

export interface TreatmentFileDetails {
  id:                   string
  status:               string
  professionalNotes:    string | null
  createdAt:            string
  professionalName:     string | null
  evaluationDate:       string | null
  evaluationComplaints: string | null
  evaluationNotes:      string | null
  sessions:             TreatmentFileSession[]
  anamnesis:            AnamneseGeral | null
}

export async function getTreatmentPlanDetails(planId: string, clientId: string): Promise<{ data?: TreatmentFileDetails; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'atendimento', 'VIEW')

    const admin = createAdminClient()
    // Ver as sessões é da clínica (H5; F73): a recepção de outra unidade abre a ficha de tratamento.
    if (!(await planoDaRede(admin, planId, ctx))) return { error: 'Plano não encontrado.' }

    // 1. Busca o plano (sem joins — evita erro de FK alias no PostgREST)
    const { data: plan, error: planErr } = await admin
      .from('treatment_plans')
      .select('id, status, professional_notes, created_at, professional_id, evaluation_appointment_id')
      .eq('id', planId)
      .eq('client_id', clientId)
      .single()

    if (planErr || !plan) return { error: 'Plano não encontrado.' }

    // 2. Busca em paralelo: profissional, avaliação, sessões, agendamentos e anamnese
    // `maybeSingle` onde era `single`: profissional ou avaliação apagados
    // continuam sendo "sem nome"/"sem avaliação", como antes; falha de leitura
    // é que deixou de virar ficha em branco.
    const [professional, evalAppt, sessionsRaw, appts, medRecord] = await Promise.all([
      plan.professional_id
        ? ler(admin.from('users').select('name').eq('id', plan.professional_id).maybeSingle(), 'buscar o profissional')
        : Promise.resolve(null),

      plan.evaluation_appointment_id
        ? ler(admin.from('appointments').select('id, scheduled_at, notes').eq('id', plan.evaluation_appointment_id).maybeSingle(), 'buscar a avaliação')
        : Promise.resolve(null),

      ler(admin.from('treatment_plan_sessions')
        .select('id, sort_order, treatment_plan_session_procedures(procedure_id, price, procedures(name, duration_min))')
        .eq('plan_id', planId)
        .order('sort_order'), 'carregar as sessões do plano'),

      ler(admin.from('appointments')
        .select('id, scheduled_at, status, completed_at, notes')
        .eq('treatment_plan_id', planId)
        .order('scheduled_at'), 'carregar os agendamentos do plano'),

      ler(admin.from('medical_records')
        .select('general_anamnesis')
        .eq('client_id', clientId)
        .maybeSingle(), 'buscar a ficha de saúde do cliente'),
    ])

    // 3. Zipa sessões com agendamentos pela ordem (sort_order ↔ scheduled_at asc)
    const sortedAppts = (appts ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const sessions: TreatmentFileSession[] = (sessionsRaw ?? []).map((s, i) => {
      type RawProc = { procedure_id: string; price: number; procedures: { name: string; duration_min: number } | null }
      const procs = (s.treatment_plan_session_procedures as unknown as RawProc[] | null) ?? []
      const appt  = sortedAppts[i] ?? null
      return {
        id:        s.id,
        sortOrder: s.sort_order,
        procedures: procs.map(p => ({
          name:        p.procedures?.name ?? '—',
          durationMin: p.procedures?.duration_min ?? 60,
          price:       Number(p.price ?? 0),
        })),
        appointment: appt ? {
          id:          appt.id,
          scheduledAt: appt.scheduled_at,
          status:      appt.status,
          completedAt: appt.completed_at ?? null,
          notes:       appt.notes ?? null,
        } : null,
      }
    })

    // A anotação e a anamnese vão à tela: fica no registro (lib/prontuario/acessos.ts).
    if (podeVerClinico(ctx, plan.professional_id ?? null)) await registrarAcessoAoProntuario(ctx, clientId, 'plano', plan.id)
    return {
      data: {
        id:                   plan.id,
        status:               plan.status,
        professionalNotes:    podeVerClinico(ctx, plan.professional_id ?? null) ? (plan.professional_notes ?? null) : null,
        createdAt:            plan.created_at,
        professionalName:     (professional as { name?: string } | null)?.name ?? null,
        evaluationDate:       (evalAppt as { scheduled_at?: string } | null)?.scheduled_at ?? null,
        evaluationComplaints: (evalAppt as { notes?: string } | null)?.notes ?? null,
        evaluationNotes:      null,
        sessions,
        // Anamnese é prontuário: o arquivo do tratamento abre com agenda (2026-10-03).
        anamnesis:            podeVerClinico(ctx, plan.professional_id ?? null)
          ? paraAnamneseGeral(medRecord?.general_anamnesis ?? null, await fichaDePreAtendimento(admin, ctx.tenantId!))
          : null,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/**
 * Os pacotes à venda na unidade, para a DICA do plano (A28 da simulação de
 * 2026-10-27): o plano continua por procedimento (decisão do Heitor de 21/10 —
 * quem aplica o pacote é o checkout), mas diz quando as sessões batem com um
 * pacote. O catálogo é o MESMO do checkout (`catalogoDePacotes`, ativos e ao
 * alcance da unidade), e a conta é a dele (`pacoteEquivalente`), feita no
 * editor. Só preço e composição — nada clínico.
 */
export async function pacotesParaODicaDoPlano(branchId: string): Promise<PacoteParaComparar[]> {
  const ctx = await getTenantContext()
  if (!can(ctx, 'medical_records', 'VIEW') && !can(ctx, 'atendimento', 'VIEW') && !can(ctx, 'agenda', 'VIEW') && !can(ctx, 'procedures', 'VIEW')) return []
  if (!branchId || !alcancaUnidade(ctx, branchId)) return []
  const unidade = await ler(createAdminClient().from('branches').select('id')
    .eq('id', branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'conferir a unidade do plano')
  if (!unidade) return []
  if (!(await redeTemRecurso(ctx.tenantId!, 'pacotes'))) return []
  return (await catalogoDePacotes(ctx.tenantId!, { branchId, soAtivos: true })).map(p => ({
    id: p.id, name: p.name, price: p.price,
    itens: p.itens.map(i => ({ procedureId: i.procedureId, quantidade: i.quantidade })),
  }))
}

/**
 * Os agendamentos AVULSOS da cliente, ainda por vir, de um procedimento do
 * plano (A68 da 5ª simulação: o plano de 2× Bioestimulador e o Bioestimulador
 * agendado à parte, sem ligação — "a cliente não sabe se paga os dois"). O
 * checkout AVISA; quem fecha decide (cancelar o avulso ou ajustar o plano).
 */
export async function avulsosDoPlanoNoCheckout(planId: string): Promise<{ id: string; texto: string }[]> {
  try {
    const ctx = await getTenantContext()
    assertPodeFecharPlano(ctx)
    if (typeof planId !== 'string' || !/^[0-9a-f-]{36}$/i.test(planId)) return []
    const admin = createAdminClient()
    const plano = await ler(admin.from('treatment_plans').select('branch_id, branches!branch_id(tenant_id)')
      .eq('id', planId).maybeSingle(), 'buscar o plano') as { branch_id: string; branches: { tenant_id: string } | null } | null
    if (!plano || plano.branches?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, plano.branch_id)) return []
    if (!podeFecharEstePlano(ctx, plano.branch_id)) return []
    const fuso = await fusoDaUnidade(ctx.tenantId, plano.branch_id)
    return (await avulsosDoPlano(admin, ctx.tenantId!, planId)).map(a => ({ id: a.id, texto: textoDoAvulso(a, fuso) }))
  } catch (e) {
    console.error('[checkout] avulsos do plano:', mensagemDoErro(e))
    return []
  }
}

// ─── Os passos do plano (PT1a, Bloco Plano de tratamento, leva 1) ────────────

/** Uma sessão do plano no passo ④ (sem dado clínico: procedimento e horário). */
export interface SessaoDoPasso {
  id:            string
  numero:        number
  procedimentos: string
  procedureId:   string
  /** A duração DELA (a soma dos procedimentos — D5 da 9ª). */
  duracaoMin:    number
  appointmentId: string | null
  scheduledAt:   string | null
  /** O status do agendamento (nulo: sem agendamento). */
  apptStatus:    string | null
  profissional:  string | null
}

export interface PassosDoPlano {
  status:      string
  situacao:    SituacaoComercial
  aceitoEm:    string | null
  clienteId:   string | null
  unidadeId:   string
  documentos:  DocumentosDoPlano
  contrato:    SituacaoDoContrato
  recebido:    boolean
  /** A comanda do plano no PDV (nasce no aceite). */
  comandaId:   string | null
  podeReceber: boolean
  /** Agendar a sessão é da Agenda em Gerenciar (o `schedulePlanSession`). */
  podeAgendar: boolean
  /** As contagens da fonte única (`metrics_financeiro_do_plano`). */
  contagem:    { total: number; agendadas: number; feitas: number }
  sessoes:     SessaoDoPasso[]
}

/**
 * A página do plano é o centro (PT1a, a revisão do Heitor de 2026-11-13):
 * ① Aceite ② Documentos ③ Contrato e pagamento ④ Sessões — cada passo diz o
 * estado e leva aonde se faz. Quem lê é quem vê o plano (a Agenda, com o
 * alcance e o "só os meus" do `planoDoTenant`). Sem dado clínico.
 */
export async function getPassosDoPlano(planId: string): Promise<{ passos?: PassosDoPlano; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'planos_de_tratamento')
    assertPermission(ctx, 'atendimento', 'VIEW')
    const admin = createAdminClient()
    const plan = await planoDoTenant(admin, planId, ctx)
    if (!plan) return { error: 'Plano não encontrado.' }

    const [extra, andamento, financeiro, comanda, brutas] = await Promise.all([
      ler(admin.from('treatment_plans').select('aceito_em').eq('id', planId).maybeSingle(), 'buscar o aceite do plano'),
      andamentoDosPlanos(ctx.tenantId!, [planId]),
      getFinanceiroDoPlano(ctx.tenantId!, planId),
      ler(admin.from('comandas').select('id').eq('treatment_plan_id', planId).is('cancelada_em', null).maybeSingle(), 'buscar a comanda do plano'),
      ler(admin.from('treatment_plan_sessions')
        .select(`id, sort_order, appointment_id,
          treatment_plan_session_procedures(procedure_id, sort_order, procedures(name, duration_min)),
          appointments:appointment_id(id, status, scheduled_at, professional:users!professional_id(name))`)
        .eq('plan_id', planId).order('sort_order').order('id'), 'carregar as sessões do plano'),
    ])
    const a = andamento.get(planId)!

    type Proc = { procedure_id: string; sort_order: number; procedures: { name: string; duration_min: number | null } | null }
    type Ag   = { id: string; status: string; scheduled_at: string; professional: { name: string } | null } | null
    type Sess = { id: string; appointment_id: string | null; treatment_plan_session_procedures: Proc[]; appointments: Ag }
    const sessoes: SessaoDoPasso[] = ((brutas ?? []) as unknown as Sess[]).map((s, i) => {
      const procs = [...(s.treatment_plan_session_procedures ?? [])].sort((x, y) => x.sort_order - y.sort_order)
      return {
        id:            s.id,
        numero:        i + 1,
        procedimentos: procs.map(p => p.procedures?.name ?? '—').join(' + ') || '—',
        procedureId:   procs[0]?.procedure_id ?? '',
        duracaoMin:    procs.reduce((t, p) => t + (p.procedures?.duration_min ?? 60), 0),
        appointmentId: s.appointment_id ?? null,
        scheduledAt:   s.appointments?.scheduled_at ?? null,
        apptStatus:    s.appointments?.status ?? null,
        profissional:  s.appointments?.professional?.name ?? null,
      }
    })

    return {
      passos: {
        status:      plan.status as string,
        situacao:    situacaoComercialDoPlano({
          status: plan.status as string, recebido: a.recebido, documentosAbertos: a.documentos.abertos,
          contratoFalta: a.contrato === 'NO_PDV' || a.contrato === 'FALTA_ASSINAR',
        }),
        aceitoEm:    (extra?.aceito_em as string | null) ?? null,
        clienteId:   (plan.client_id as string | null) ?? null,
        unidadeId:   plan.branch_id as string,
        documentos:  a.documentos,
        contrato:    a.contrato,
        recebido:    a.recebido,
        comandaId:   (comanda?.id as string | undefined) ?? null,
        podeReceber: podeReceber(ctx),
        podeAgendar: can(ctx, 'agenda', 'MANAGE'),
        contagem:    { total: financeiro.sessoes.total, agendadas: financeiro.sessoes.agendadas, feitas: financeiro.sessoes.feitas },
        sessoes,
      },
    }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}
