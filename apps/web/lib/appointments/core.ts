// Núcleo de agendamento reutilizável — usado pela agenda (addAppointment) e
// pelo agendamento do comercial no CRM (createCrmAppointment).
// Contém a REGRA de negócio (preço/duração, conflito de sala E de profissional,
// insert, histórico) desacoplada de FormData/cookies. Sem 'use server'.

import { after } from 'next/server'
import { recusaDoProcedimentoNaUnidade } from '@/lib/procedimentos/disponivel-na-unidade'
import { revalidateTag } from 'next/cache'
import { CLIENTE_ARQUIVADA } from '@/lib/clients/arquivada'
import { intervalosDoDia, normalizarHorario, slotsDoDia, diaDaSemana } from '@/lib/agenda/horario'
import { instanteNoFuso } from '@/lib/datetime'
import { fusoValido } from '@/lib/unidades/fuso'
import { lerFusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import type { TenantContext } from '@estetica-os/types'
import { alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarEventoCapi } from '@/lib/ads/capi'
import { cliqueDoCliente, contatoDoCliente } from '@/lib/ads/atribuicao'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { EVENTOS } from '@estetica-os/types'
import { ler, lerTodas, tentar } from '@/lib/db'
import { conferirCredito, ligarCredito, type CreditoDeAgendamento } from '@/lib/creditos/credito'
import { oportunidadeDoAgendamento, ligarAgendamentoAOportunidade } from '@/lib/crm/liga-agendamento'
import { filtroDeQuemAtendeNaUnidade } from '@/lib/cached-queries'
import type { CandidataDoHorario } from '@/lib/appointments/sem-preferencia'
import { recusaDaSala } from '@/lib/appointments/salas'
import { quemRealizaOProcedimento, realiza } from '@/lib/procedimentos/quem-realiza'
import { bloqueiosQueBatem } from '@/lib/agenda/bloqueios'
import { avisoDoBloqueioDaProfissional, avisoDoBloqueioDaSala, recusaDoHorarioBloqueado } from '@/lib/agenda/bloqueio'
import { precosDaUnidade, precoNaUnidade } from '@/lib/procedimentos/preco-na-unidade'
import { fimDaOcupacao, bateNaOcupacao } from '@/lib/appointments/ocupacao'
import { recusaDoHorarioPassado } from '@/lib/appointments/horario-passado'
import { O_ATENDE_NA_FICHA } from '@/lib/equipe/atende'

type Admin = ReturnType<typeof createAdminClient>

export interface CreateAppointmentInput {
  branchId:       string
  clientId:       string
  procedureId:    string | null
  professionalId: string
  scheduledAt:    string                 // ISO UTC
  roomId?:        string | null
  notes?:         string | null
  source?:        'INTERNAL' | 'ONLINE' | 'CLIENT_APP' | 'COMMERCIAL'
  /**
   * Usar o que o cliente JÁ PAGOU (unidade pré-paga ou sessão de pacote): o
   * crédito decide o procedimento e o preço, e fica ligado ao agendamento.
   */
  credito?:       CreditoDeAgendamento | null
  /**
   * A oportunidade de onde o agendamento saiu (o card). Já conferida por quem
   * chama (`leadAoAlcance`). Sem ela, vale a oportunidade ABERTA da cliente.
   */
  leadId?:        string | null
  /** A cliente agendou pelo app em "Sem preferência" (A59): o remarcar começa por aí. */
  semPreferencia?: boolean
}

const IGNORED_STATUS = '("CANCELLED","NO_SHOW")'

/**
 * A duração comum de um agendamento, em minutos (12 h): a régua da leitura,
 * não um teto. Até 25/11 a conferência só olhava 12 h para trás (a janela
 * fixa da "duração máxima") — o procedimento não tem duração máxima, e o atendimento
 * de 14 h das 08:00 deixava de bloquear quem começava depois das 20:00 dele,
 * calado (princípio 3).
 */
export const DURACAO_COMUM_MIN = 12 * 60

/**
 * O filtro (`.or()` do PostgREST) dos agendamentos que podem ocupar algum
 * instante a partir de `desdeMs`, qualquer que seja a duração: os que começaram
 * até 12 h antes (a duração comum) OU os mais longos que isso, de qualquer data.
 * Junto do `scheduled_at < fim`, é sobreposição de verdade sem ler a história
 * inteira — os longos são raros. A conta exata é a de sempre (`fimDaOcupacao`,
 * `bateNaOcupacao`). A tabela não grava o fim: ele é `scheduled_at + duration_min`.
 */
export function podemOcuparDesde(desdeMs: number): string {
  return `scheduled_at.gt.${new Date(desdeMs - DURACAO_COMUM_MIN * 60_000).toISOString()},duration_min.gt.${DURACAO_COMUM_MIN}`
}

/**
 * O horário [inicio, inicio + duracaoMin) bate com outro agendamento ativo do
 * PROFISSIONAL (em qualquer unidade da rede — o profissional da rede atende em
 * várias) ou da SALA (na unidade dela)?
 *
 * Sobreposição de verdade, com a duração de CADA agendamento: até 2026-10-08 a
 * janela usava a duração do novo dos dois lados — um atendimento de 2 h às
 * 09:00 não bloqueava um novo às 10:00, e um de 30 min às 09:00 bloqueava um
 * longo às 10:00 —, e olhava só a unidade.
 */
export async function horarioOcupado(admin: Admin, a: ConsultaDeHorario): Promise<boolean> {
  return !!(await primeiroConflito(admin, a))
}

interface ConsultaDeHorario {
  tenantId: string
  inicio: Date
  duracaoMin: number
  professionalId?: string | null
  roomId?: string | null
  /** A unidade da sala (obrigatória com `roomId`). */
  branchId?: string | null
  /** O próprio agendamento, na remarcação. */
  excluir?: string | null
}

/**
 * O agendamento que bate com o horário (a MESMA conta de `horarioOcupado`),
 * com início e fim — é o que o modal mostra ANTES de confirmar (J-30:
 * "já tem atendimento das 11:00 às 12:00"). Nulo = livre.
 */
// A régua de até quando um agendamento ocupa, e de quando ele bate, mora
// pura em ./ocupacao: a grade, a recusa e os livres dividem (D3 da 11ª).
export { fimDaOcupacao }

export interface ConflitoDeHorario {
  inicio: Date; fim: Date
  /** A unidade do outro atendimento (A30): o da rede atende em várias, e a recepção de uma não vê a agenda da outra. */
  unidadeId: string; unidade: string
}

export async function primeiroConflito(admin: Admin, a: ConsultaDeHorario): Promise<ConflitoDeHorario | null> {
  return (await conflitosDoHorario(admin, a))[0] ?? null
}

/**
 * TODOS os agendamentos que batem com o horário, do mais cedo ao mais tarde
 * (A28 da 7ª simulação: o aviso citava só um dos dois que bloqueavam). A
 * mesma conta de `primeiroConflito`.
 */
export async function conflitosDoHorario(admin: Admin, a: ConsultaDeHorario): Promise<ConflitoDeHorario[]> {
  if (!a.professionalId && !a.roomId) return []
  const ini = a.inicio.getTime()
  const fim = ini + Math.max(1, a.duracaoMin) * 60000
  // Qualquer duração (`podemOcuparDesde`), em páginas: nada se corta calado.
  const candidatos = await lerTodas((de, ate) => {
    let q = admin.from('appointments')
      .select('id, scheduled_at, duration_min, status, completed_at, branch_id, branches!inner(tenant_id, name)')
      .eq('branches.tenant_id', a.tenantId)
      .not('status', 'in', IGNORED_STATUS)
      .lt('scheduled_at', new Date(fim).toISOString())
      .or(podemOcuparDesde(ini))
    if (a.professionalId) q = q.eq('professional_id', a.professionalId)
    else q = q.eq('room_id', a.roomId!).eq('branch_id', a.branchId!)
    if (a.excluir) q = q.neq('id', a.excluir)
    return q.order('scheduled_at', { ascending: false }).order('id').range(de, ate)
  }, 'conferir o horário') as unknown as {
    scheduled_at: string; duration_min: number | null; status: string; completed_at: string | null
    branch_id: string; branches: { name: string } | null
  }[]
  const batem: ConflitoDeHorario[] = []
  for (const c of candidatos) {
    const oIni = new Date(c.scheduled_at).getTime()
    const oFim = fimDaOcupacao(c)
    if (bateNaOcupacao(ini, fim, oIni, oFim)) batem.push({ inicio: new Date(oIni), fim: new Date(oFim), unidadeId: c.branch_id, unidade: c.branches?.name ?? '' })
  }
  return batem.sort((x, y) => x.inicio.getTime() - y.inicio.getTime())
}

/**
 * A recusa do conflito de PROFISSIONAL, dizendo a unidade quando o outro
 * atendimento é de OUTRA (A30): "…nesse horário, na unidade Moinhos.".
 */
export function recusaDoConflito(conflito: { unidadeId: string; unidade: string }, unidadeDoAgendamento: string | null | undefined): string {
  return conflito.unidadeId && unidadeDoAgendamento && conflito.unidadeId !== unidadeDoAgendamento && conflito.unidade
    ? `Este profissional já tem agendamento nesse horário, na unidade ${conflito.unidade}.`
    : 'Este profissional já tem agendamento nesse horário.'
}

/**
 * O horário [inicio, inicio + duracaoMin) cai num BLOQUEIO da pessoa que atende
 * ou da sala (o do dia inteiro também)? Então não se marca: R07 (o Heitor, 26/11,
 * no chat: "r07 se ta bloqueado não dá pra marcar"; era o encaixe avisado,
 * decisão 3 da 7ª). A recusa diz o bloqueio — "Bruna está com o horário
 * bloqueado das 12:00 às 13:00 (Almoço). Escolha outro horário." —, no relógio
 * da unidade. Nulo: nenhum bloqueio. Mora aqui para servir a TODO caminho que
 * cria ou move agendamento (o núcleo, o remarcar, o mudar de unidade, a troca e
 * o repasse de quem atende, o checkout do plano, o Copilot). Fora do horário de
 * quem atende ou da unidade NÃO é bloqueio: segue encaixe.
 */
export async function recusaDoBloqueioNoHorario(admin: Admin, a: {
  professionalId?: string | null; roomId?: string | null; inicio: Date; duracaoMin: number
  /** A unidade do agendamento: o fuso do texto. */
  branchId?: string | null
}): Promise<string | null> {
  if (!a.professionalId && !a.roomId) return null
  const fim = new Date(a.inicio.getTime() + Math.max(1, a.duracaoMin) * 60_000)
  const [daPessoa, daSala] = await Promise.all([
    a.professionalId ? bloqueiosQueBatem(admin, { professionalId: a.professionalId, inicio: a.inicio, fim }) : Promise.resolve([]),
    a.roomId ? bloqueiosQueBatem(admin, { roomId: a.roomId, inicio: a.inicio, fim }) : Promise.resolve([]),
  ])
  if (!daPessoa.length && !daSala.length) return null
  const [fuso, pessoa, sala] = await Promise.all([
    a.branchId ? lerFusoDaUnidade(admin, a.branchId) : Promise.resolve(undefined),
    daPessoa.length
      ? ler(admin.from('users').select('name').eq('id', a.professionalId!).maybeSingle(), 'buscar quem atende') as Promise<{ name: string } | null>
      : Promise.resolve(null),
    daSala.length
      ? ler(admin.from('rooms').select('name').eq('id', a.roomId!).maybeSingle(), 'buscar a sala') as Promise<{ name: string } | null>
      : Promise.resolve(null),
  ])
  return recusaDoHorarioBloqueado([
    ...daPessoa.map(b => avisoDoBloqueioDaProfissional(pessoa?.name || 'Quem atende', b, fuso)),
    ...daSala.map(b => avisoDoBloqueioDaSala(sala?.name || 'A sala', b, fuso)),
  ])
}

/**
 * As peças de um agendamento que vêm do navegador são DA REDE, e a unidade
 * está ao alcance de quem agenda (§11). Devolve a mensagem de recusa, ou null.
 *
 * Mora aqui para servir a TODO caminho que cria ou move agendamento: o núcleo
 * (agenda e comercial), o checkout do plano, a sessão de pacote e de plano, a
 * remarcação e a troca de profissional. Até 2026-09-28 só o núcleo conferia —
 * os outros gravavam a unidade e o profissional que o navegador mandasse.
 * Campo ausente não é conferido (quem chama decide o que é obrigatório).
 */
export async function conferirPecasDoAgendamento(
  admin: Admin,
  ctx: TenantContext,
  pecas: {
    branchId?: string | null; professionalId?: string | null; clientId?: string | null; roomId?: string | null
    /** Com a sala: o procedimento, para conferir que a sala serve a ele (D5). */
    procedureId?: string | null
  },
): Promise<string | null> {
  if (pecas.branchId && !alcancaUnidade(ctx, pecas.branchId)) {
    return 'Você só pode agendar na sua unidade.'
  }
  const [unidade, profissional, cliente, recusaSala, procedimentoNaoFeito] = await Promise.all([
    pecas.branchId
      ? ler(admin.from('branches').select('id, is_active')
          .eq('id', pecas.branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade') as Promise<{ id: string; is_active: boolean } | null>
      : Promise.resolve({ id: null, is_active: true }),
    pecas.professionalId
      ? ler(admin.from('users').select('id, name, atende_em')
          .eq('id', pecas.professionalId).eq('tenant_id', ctx.tenantId!).eq('is_active', true).maybeSingle(), 'buscar o profissional') as Promise<{ id: string; name: string; atende_em: string[] | null } | null>
      : Promise.resolve({ id: null, name: '', atende_em: null }),
    pecas.clientId
      ? ler(admin.from('clients').select('id, is_active')
          .eq('id', pecas.clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente')
      : Promise.resolve({ id: null, is_active: true }),
    // A sala ATIVA da unidade e, com o procedimento ligado a salas ali, uma
    // das dele (D5, 2026-10-30). Sala sem unidade não se confere: não há onde.
    pecas.roomId && pecas.branchId
      ? recusaDaSala(admin, { branchId: pecas.branchId, roomId: pecas.roomId, procedureId: pecas.procedureId })
      : Promise.resolve(pecas.roomId ? 'Sala não encontrada nesta unidade.' : null),
    // O procedimento é FEITO na unidade (D7 da 13ª, F65): o da rede restrito a
    // outras unidades não se agenda aqui, por caminho nenhum.
    pecas.branchId && pecas.procedureId
      ? recusaDoProcedimentoNaUnidade(admin, ctx.tenantId!, pecas.procedureId, pecas.branchId)
      : Promise.resolve(null),
  ])
  if (!unidade)      return 'Unidade não encontrada.'
  // F72 (H6): a unidade desativada fica alcançável pelo que ficou nela, mas
  // não recebe agendamento novo nem horário novo — é para onde se marca, e só
  // as ativas recebem (`unidadesParaCriar`).
  if (unidade.is_active === false) return 'Esta unidade foi desativada. Escolha uma unidade ativa.'
  if (!profissional) return 'Profissional não encontrado.'
  if (!cliente)      return 'Cliente não encontrado.'
  // Arquivada não se agenda (J-23): só quem cria passa o cliente por aqui.
  if (cliente.is_active === false) return CLIENTE_ARQUIVADA
  if (recusaSala)    return recusaSala
  // Quem atende NA UNIDADE (C10, F65; o "Atende" por unidade, decisão 2 da 8ª):
  // até 2026-11-12 o núcleo gravava a profissional que não atende ali. O
  // encaixe fora do horário dela segue valendo — isto é a unidade, não a hora.
  if (pecas.branchId && pecas.professionalId && !(profissional.atende_em ?? []).includes(pecas.branchId)) {
    return `${profissional.name || 'Esta profissional'} não atende nesta unidade: marque ${O_ATENDE_NA_FICHA} no lápis dela, na Equipe.`
  }
  if (procedimentoNaoFeito) return procedimentoNaoFeito
  return null
}

/**
 * Cria um agendamento aplicando toda a regra de negócio. Recebe o contexto já
 * resolvido (de cookies OU de token) — não depende de FormData nem de cookies.
 * Não dispara notificação nem revalida as TELAS (o caminho): isso fica a cargo
 * de quem chama. O cache dos agendamentos da rede, sim (D9 da 7ª simulação):
 * a ficha da cliente (`getCachedClientProfileData`, tag `appointments:<rede>`)
 * dizia "Nenhum agendamento futuro" por até 60 s depois do agendar da agenda
 * e do "Reagendar" — são cinco caminhos, e expirar em cada um é esquecer o
 * sexto.
 */
/** A recusa de quem perdeu a disputa pelo crédito (o app tenta de novo sem ele). */
export const CREDITO_JA_USADO = 'Este crédito acabou de ser usado em outro agendamento.'

export async function createAppointmentCore(
  admin: Admin,
  ctx: TenantContext,
  input: CreateAppointmentInput,
): Promise<{ id: string } | { error: string }> {
  if (!input.branchId)                              return { error: 'Unidade não identificada.' }
  if (!input.clientId)                              return { error: 'Selecione um cliente.' }

  // O crédito vem primeiro: é ele que diz o procedimento e o preço. Um
  // procedimento diferente do crédito é recusado (o navegador não escolhe).
  let doCredito: { procedureId: string; preco: number; duracaoMin?: number; planoId?: string } | null = null
  if (input.credito) {
    const c = await conferirCredito(admin, ctx.tenantId!, input.clientId, input.credito)
    if ('error' in c) return { error: c.error }
    if (input.procedureId && input.procedureId !== c.procedureId) return { error: 'Este crédito é de outro procedimento.' }
    doCredito = c
    input = { ...input, procedureId: c.procedureId }
  }
  // Não há mais agendamento sem procedimento. A avaliação era a exceção que
  // permitia isso — e virou um procedimento como outro qualquer (2026-09-25).
  if (!input.procedureId)                          return { error: 'Selecione um procedimento.' }
  if (!input.professionalId)                        return { error: 'Selecione um profissional.' }
  if (!input.scheduledAt)                           return { error: 'Informe data e hora.' }
  // Não se agenda no passado (o Heitor, 25/11: "recusa, não dá pra agendar no passado"). A tela já antecipa
  // ("Escolha a partir de…"); a trava é esta, para todo caminho que agenda (a equipe, as sessões, o app, o CRM,
  // o Copilot). O minuto de agora vale: a cliente que chegou sem horário (decisão do Claude, 25/11).
  const passou = recusaDoHorarioPassado(input.scheduledAt)
  // O fuso só se lê na recusa (a mensagem diz o dia e a hora no relógio da unidade).
  if (passou) return { error: recusaDoHorarioPassado(input.scheduledAt, new Date(), await lerFusoDaUnidade(admin, input.branchId)) ?? passou }

  // As leituras que não dependem uma da outra vão JUNTAS (A33 da 5ª
  // simulação: "Agendando…" passou de 3,5 s com 9 a 12 idas ao banco em
  // série). A ordem das recusas é a de antes: as peças, depois o procedimento.
  //  - Tudo que vem do navegador tem de ser DA REDE, e a unidade ao alcance de
  //    quem agenda (§11). Até 2026-09-27 só o procedimento era conferido.
  //  - O preço e a duração do procedimento.
  //  - A cliente tem oportunidade aberta? Então o agendamento é do comercial
  //    (D11, 2026-10-27): a origem não depende de quem agenda nem de por onde —
  //    o SDR de unidade e a recepção que agenda pela ficha também contam. A
  //    cliente que agenda sozinha pelo app segue CLIENT_APP.
  //  - O nome de quem agenda (o histórico). A cliente pelo app (por-05) não é
  //    membro: o nome não se busca em `users`.
  //  - O preço DA UNIDADE, quando ela tem um (D2 da 9ª: era salvo e ignorado).
  const [recusa, doProcedimento, daUnidade, oportunidade, userName] = await Promise.all([
    conferirPecasDoAgendamento(admin, ctx, input),
    admin.from('procedures').select('price, duration_min')
      .eq('id', input.procedureId).eq('tenant_id', ctx.tenantId!).single(),
    precosDaUnidade(admin, input.branchId),
    oportunidadeDoAgendamento(admin, ctx, input.clientId, input.leadId),
    // A cliente pelo app: o nome DELA, "(app)" — a linha do histórico (C15).
    ctx.userName ? Promise.resolve(ctx.userName) : ctx.isClient ? nomeDaClienteNoApp(admin, input.clientId) : getUserName(admin, ctx.userId),
  ])
  if (recusa) return { error: recusa }
  if (doProcedimento.error || !doProcedimento.data) return { error: 'Procedimento não encontrado.' }
  const procedure = doProcedimento.data as { price: number; duration_min: number }

  // A sessão do plano dura o que a sessão dura (D5 da 9ª: a soma dos procedimentos dela).
  const durationMin = doCredito?.duracaoMin ?? procedure?.duration_min ?? 60
  const start       = new Date(input.scheduledAt)

  // O conflito de SALA (quando há sala) e o de PROFISSIONAL (sempre — impede o
  // duplo agendamento, e diz a unidade quando o outro é de outra: A30), juntos.
  // E o BLOQUEIO da pessoa que atende ou da sala (R07, o Heitor, 26/11: "r07 se
  // ta bloqueado não dá pra marcar"): todo caminho que agenda passa por aqui.
  const [salaOcupada, choque, bloqueado] = await Promise.all([
    input.roomId
      ? horarioOcupado(admin, { tenantId: ctx.tenantId!, roomId: input.roomId, branchId: input.branchId, inicio: start, duracaoMin: durationMin })
      : Promise.resolve(false),
    primeiroConflito(admin, { tenantId: ctx.tenantId!, professionalId: input.professionalId, inicio: start, duracaoMin: durationMin }),
    recusaDoBloqueioNoHorario(admin, {
      professionalId: input.professionalId, roomId: input.roomId ?? null, inicio: start, duracaoMin: durationMin, branchId: input.branchId,
    }),
  ])
  if (salaOcupada) return { error: 'Esta sala já está ocupada nesse horário.' }
  if (choque) return { error: recusaDoConflito(choque, input.branchId) }
  if (bloqueado) return { error: bloqueado }

  const origem = oportunidade?.aberta && (input.source ?? 'INTERNAL') === 'INTERNAL' ? 'COMMERCIAL' : (input.source ?? 'INTERNAL')

  const { data, error } = await admin
    .from('appointments')
    .insert({
      branch_id:       input.branchId,
      client_id:       input.clientId,
      procedure_id:    input.procedureId || null,
      professional_id: input.professionalId,
      room_id:         input.roomId ?? null,
      scheduled_at:    input.scheduledAt,
      duration_min:    durationMin,
      // Com crédito, o preço é a parte dele na venda (já paga); sem, o da unidade.
      price:           doCredito ? doCredito.preco : precoNaUnidade(procedure?.price, daUnidade.get(input.procedureId)),
      notes:           input.notes ?? null,
      status:          'SCHEDULED',
      source:          origem,
      created_by_id:   ctx.internalUserId,
      sem_preferencia: input.semPreferencia ?? false,
      // A sessão do plano nasce no plano (o gatilho dos documentos não emite o
      // do avulso para ela — o plano tem os dele).
      ...(doCredito?.planoId ? { treatment_plan_id: doCredito.planoId } : {}),
    })
    .select('id')
    .single()

  if (error || !data) return { error: `Erro ao criar agendamento: ${error?.message ?? 'desconhecido'}` }

  // Liga o crédito, só se ainda estiver livre. Perdeu a corrida (outro
  // agendamento o pegou no meio): o agendamento sai, antes de virar fato.
  if (input.credito && !(await ligarCredito(admin, input.credito, data.id as string))) {
    await tentar(admin.from('appointments').delete().eq('id', data.id as string), 'desfazer o agendamento sem crédito')
    return { error: CREDITO_JA_USADO }
  }

  await logAppointmentHistory(admin, data.id as string, ctx.internalUserId, userName, 'CREATED', 'Agendamento criado')

  // Depois da resposta (A33): o card do CRM e a corrente de eventos não
  // seguram o "Agendando…". O agendamento JÁ EXISTE — os dois só registram
  // (`ligarAgendamentoAOportunidade` e o emissor não lançam).
  //  - A linha do tempo do card diz o que houve — o card NÃO anda (crm-05: o
  //    movimento é da automação, e o evento leva o card a ela no `leadId`).
  //  - A corrente de eventos sai daqui, e não das actions que chamam este
  //    core, porque são quatro caminhos de criação (agenda, inbox, checkout de
  //    plano, portal do cliente) e o fato é o mesmo — emitir em cada um seria
  //    esquecer o quinto.
  const agendamentoId = data.id as string
  after(async () => {
    if (oportunidade) {
      await ligarAgendamentoAOportunidade(admin, ctx, oportunidade, { procedureId: input.procedureId, scheduledAt: input.scheduledAt, branchId: input.branchId })
    }
    const leadId = oportunidade?.aberta ? oportunidade.leadId : null
    await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CRIADO, agendamentoId, { ...ctx, userName },
      ctx.isClient ? { ator: { tipo: 'cliente', id: input.clientId }, origem: 'app', leadId } : { leadId })
  })

  // Meta: agendar é o primeiro compromisso real de quem veio de um anúncio, e
  // é o evento pelo qual a campanha é otimizada. Vai em `after()` para não
  // somar a latência da Graph API ao tempo de criar o agendamento, e nunca
  // lança: anúncio não pode derrubar agenda.
  after(async () => {
    const clique = await cliqueDoCliente(ctx.tenantId!, input.clientId!)
    if (!clique) return
    const contato = await contatoDoCliente(ctx.tenantId!, input.clientId!)
    await enviarEventoCapi({
      tenantId: ctx.tenantId!,
      event:    'Schedule',
      // Determinístico: o mesmo agendamento nunca conta duas vezes, mesmo se
      // este caminho rodar de novo.
      eventId:  `schedule:${data.id}`,
      ctwaClid: clique.ctwaClid,
      adId:     clique.adId,
      phone:    contato.phone,
      email:    contato.email,
      customData: { procedure_id: input.procedureId ?? null },
    })
  })

  revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
  return { id: data.id as string }
}

/**
 * Slots livres de 30 min de um profissional num dia, dentro do HORÁRIO da
 * unidade e do dele (`lib/agenda/horario.ts`, 2026-10-21 — eram fixos em
 * 08–20, domingo inclusive), descontando os já ocupados e, hoje, o que já
 * passou (o app oferecia horários vencidos e só recusava no último passo).
 * Reutilizável por qualquer role — o caller valida acesso.
 */
export async function computeAvailableSlots(
  admin: Admin,
  branchId: string,
  professionalId: string,
  date: string,
  durationMin: number,
  /** Ao REMARCAR, o próprio agendamento não ocupa o horário que vai deixar (A44). */
  ignorarAgendamentoId?: string,
): Promise<string[]> {
  const [unidade, prof] = await Promise.all([
    ler(admin.from('branches').select('horario, fuso').eq('id', branchId).maybeSingle(), 'buscar o horário da unidade'),
    ler(admin.from('users').select('horario').eq('id', professionalId).maybeSingle(), 'buscar o horário do profissional'),
  ])
  const intervalos = intervalosDoDia(
    normalizarHorario((unidade as { horario?: unknown } | null)?.horario),
    normalizarHorario((prof as { horario?: unknown } | null)?.horario),
    diaDaSemana(date),
  )
  if (!intervalos.length) return []
  // O dia e as horas são os do RELÓGIO da unidade (F62): o 08:00 de Manaus é 12:00 UTC.
  const fuso = fusoValido((unidade as { fuso?: string | null } | null)?.fuso)
  const dayStart = instanteNoFuso(date, '00:00', fuso).toISOString()
  const dayEnd   = instanteNoFuso(date, '23:59:59', fuso).toISOString()

  // O profissional em QUALQUER unidade (o da rede atende em várias; o id do
  // profissional já é de uma rede só), e o que começou antes e ainda ocupa o
  // começo do dia (2026-10-08) — com qualquer duração (`podemOcuparDesde`, 25/11:
  // o de 30 h de ontem ainda ocupa a manhã de hoje), em páginas.
  // E os BLOQUEIOS da profissional (decisão 3 da 7ª simulação): o livre não
  // oferece o horário bloqueado — é a conta do app da cliente, do Copilot e do
  // CRM. E ninguém marca nele (R07: `recusaDoBloqueioNoHorario`).
  const [booked, bloqueios] = await Promise.all([
    lerTodas((de, ate) => admin
      .from('appointments')
      .select('id, scheduled_at, duration_min, status, completed_at')
      .eq('professional_id', professionalId)
      .lt('scheduled_at', dayEnd)
      .or(podemOcuparDesde(new Date(dayStart).getTime()))
      .not('status', 'in', IGNORED_STATUS)
      .order('scheduled_at').order('id').range(de, ate), 'carregar os agendamentos'),
    bloqueiosQueBatem(admin, { professionalId, inicio: new Date(dayStart), fim: new Date(dayEnd) }),
  ])

  const occupied = (booked ?? []).filter((b) => b.id !== ignorarAgendamentoId).map((b) => ({
    start: new Date(b.scheduled_at as string).getTime(),
    // O concluído adiantado ocupa só até a conclusão (A31).
    end:   fimDaOcupacao(b as { scheduled_at: string; duration_min: number | null; status: string; completed_at: string | null }),
  })).concat(bloqueios.map(b => ({ start: new Date(b.inicio).getTime(), end: new Date(b.fim).getTime() })))
  const agora = Date.now()

  return slotsDoDia(intervalos, durationMin).filter((slot) => {
    const slotStart = instanteNoFuso(date, slot, fuso).getTime()
    const slotEnd   = slotStart + durationMin * 60000
    if (slotStart <= agora) return false
    return !occupied.some((o) => bateNaOcupacao(slotStart, slotEnd, o.start, o.end))
  })
}

/**
 * Quem atende na unidade (ativa, "Atende" marcado nela) e realiza o
 * procedimento (por-01) — a equipe das candidatas do dia, e a lista do "Com
 * quem?" do Remarcar do app (22ª A42). Por nome.
 */
export async function quemRealizaNaUnidade(
  admin: Admin, tenantId: string, branchId: string, procedureId?: string | null,
): Promise<{ id: string; name: string }[]> {
  const [todas, realizam] = await Promise.all([
    ler(admin.from('users').select('id, name')
      .eq('tenant_id', tenantId)
      .or(filtroDeQuemAtendeNaUnidade(branchId))
      .eq('provides_services', true)
      .eq('is_active', true)
      .order('name'), 'carregar quem atende na unidade'),
    procedureId ? quemRealizaOProcedimento(admin, procedureId) : Promise.resolve([] as string[]),
  ])
  return ((todas ?? []) as { id: string; name: string }[]).filter(p => realiza(realizam, p.id))
}

/**
 * As profissionais que atendem na unidade (a da rede atende em todas:
 * `filtroDeQuemAtendeNaUnidade`), cada uma com os livres do dia e quantos
 * atendimentos já tem nele — a base do "Sem preferência" do app (D-16). Os
 * livres são os de `computeAvailableSlots`, a mesma conta da escolhida.
 */
export async function candidatasDoDia(
  admin: Admin, tenantId: string, branchId: string, date: string, durationMin: number,
  /** Com o procedimento, só quem o REALIZA (por-01, `lib/procedimentos/quem-realiza.ts`). */
  procedureId?: string | null,
  /** Ao REMARCAR, o próprio agendamento não ocupa o horário (A59). */
  ignorarAgendamentoId?: string,
): Promise<CandidataDoHorario[]> {
  const equipe = await quemRealizaNaUnidade(admin, tenantId, branchId, procedureId)
  if (!equipe.length) return []

  const fuso = await lerFusoDaUnidade(admin, branchId)
  const dayStart = instanteNoFuso(date, '00:00', fuso).toISOString()
  const dayEnd   = instanteNoFuso(date, '23:59:59', fuso).toISOString()
  // A56 da 11ª: ao remarcar, o próprio agendamento não conta como atendimento
  // do dia de quem o tem — senão a escolha pendia para a outra (a Bruna virou
  // Carla no mesmo dia, com a Bruna livre).
  let doDiaQ = admin.from('appointments').select('professional_id')
    .in('professional_id', equipe.map(p => p.id))
    .gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd)
    .not('status', 'in', IGNORED_STATUS)
  if (ignorarAgendamentoId) doDiaQ = doDiaQ.neq('id', ignorarAgendamentoId)
  const [livres, doDia] = await Promise.all([
    Promise.all(equipe.map(p => computeAvailableSlots(admin, branchId, p.id, date, durationMin, ignorarAgendamentoId))),
    ler(doDiaQ, 'contar os atendimentos do dia'),
  ])
  const conta = new Map<string, number>()
  for (const a of (doDia ?? []) as { professional_id: string }[]) conta.set(a.professional_id, (conta.get(a.professional_id) ?? 0) + 1)
  return equipe.map((p, i) => ({ id: p.id, nome: p.name, livres: livres[i] ?? [], atendimentosNoDia: conta.get(p.id) ?? 0 }))
}

// ─── helpers ──────────────────────────────────────────────────────
export async function getUserName(admin: Admin, authId: string): Promise<string> {
  const data = await ler(admin.from('users').select('name').eq('auth_id', authId).maybeSingle(), 'buscar o usuário')
  return data?.name ?? 'Usuário'
}

async function nomeDaClienteNoApp(admin: Admin, clientId: string): Promise<string> {
  const c = await ler(admin.from('clients').select('name').eq('id', clientId).maybeSingle(), 'buscar o nome da cliente') as { name: string } | null
  return c?.name ? `${c.name} (app)` : ''
}

async function logAppointmentHistory(
  admin: Admin,
  appointmentId: string,
  internalUserId: string | null,
  userName: string,
  action: string,
  description: string,
): Promise<void> {
  // A cliente pelo app não é membro (C15, F65): a linha vale com o nome dela
  // ("Fulana (app)") e sem o id. Sem nome nenhum, não há quem registrar.
  if (!internalUserId && !userName.trim()) return
  await tentar(admin.from('appointment_history').insert({
    appointment_id:  appointmentId,
    changed_by_id:   internalUserId,
    changed_by_name: userName,
    action,
    description,
    metadata: null,
  }), 'registrar no histórico do agendamento')
}
