'use server'

import { pagoParaAgendar } from '@/lib/creditos/pago-no-app'
import { CLIENTE_ARQUIVADA, CLIENTE_ARQUIVADA_NO_APP } from '@/lib/clients/arquivada'
import { NAO_REALIZA, quemRealizaOProcedimento, realiza } from '@/lib/procedimentos/quem-realiza'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { after } from 'next/server'
import { getTenantContext, assertClient, assertPermission, isOwnScope, alcancaUnidade, alcancaOAgendamento, can, temRecurso, podeReceber } from '@/lib/auth'
import { getAReceberVencido, parcelasVencidas } from '@/lib/metrics/vencidas'
import { formatBRL } from '@estetica-os/utils'
import { recusaDasVezesDaRede } from '@/lib/financeiro/vezes-da-rede'
import { bandeiraDoPagamento } from '@/lib/financeiro/bandeiras'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, contar, mensagemDoErro } from '@/lib/db'
import {
  getCachedBranchProfessionals, getCachedBranchProcedures, getCachedRoomsByBranch, filtroDeQuemAtendeNaUnidade, getCachedNetworkBranches,
} from '@/lib/cached-queries'
import { notifyUser } from '@/lib/notifications/notify'
import { createAppointmentCore, computeAvailableSlots, conferirPecasDoAgendamento, horarioOcupado, candidatasDoDia, fimDaOcupacao, CREDITO_JA_USADO } from '@/lib/appointments/core'
import { conferirCredito } from '@/lib/creditos/credito'
import { bloqueiosDoPeriodo } from '@/lib/agenda/bloqueios'
import { juntarHorarios, escolherQuemAtende } from '@/lib/appointments/sem-preferencia'
import { proximoHorarioLivre as procurarHorarioLivre } from '@/lib/agenda/proximo-livre'
import {
  agendamentoAoAlcance, cancelarCore, checkinCore, confirmarCore, remarcarCore, revalidarAgendamento, mudarUnidadeCore,
  deOutroProfissional, DE_OUTRO_PROFISSIONAL,
} from '@/lib/appointments/alteracoes'
import { comNovaTentativa } from '@/lib/estoque/nova-tentativa'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { emitirSessaoDePacoteUsada, emitirComissaoGerada } from '@/lib/events/atendimento-financeiro'
import { emitirEventoClinico } from '@/lib/events/clinico'
import { EVENTOS, type NomeDeEvento } from '@estetica-os/types'
import { garantirClienteRapido } from '@/lib/clients/cliente-rapido'
import type { FichaQueJaExiste } from '@/lib/clients/ja-existe'
import { periodRef, dayKeyTZ, partsInTZ } from '@/lib/datetime'
import { linhasDoAtendimento } from '@/lib/comissoes/leitura'
import { semAcesso } from '@/lib/sem-acesso'
import { configDaRede, saldoDoCliente } from '@/lib/fidelidade/leitura'
import { calcularDescontoComPontos, maximoDePontos } from '@/lib/fidelidade/resgate'
import { descontoDoVoucher, type VoucherParaCalculo } from '@/lib/fidelidade/voucher'
import { insumosPorProduto, montarInsumosDaBaixa } from '@/lib/atendimento/insumos-da-baixa'
import { anamneseDaEquipeParaGravar } from '@/lib/pre-atendimento/ficha'
import { fichaParaConcluir } from '@/lib/atendimento/ficha-do-procedimento'
import { planejamentosDaFicha, perguntaDoPlanejamentoVazio, temPlanejadorSemPlanejamento } from '@/lib/atendimento/retrato-dos-injetaveis'
import type { AnamnesisRow } from '@/lib/anamnesis'
import { retratarInjetaveis, planejamentoAplicadoNoAtendimento } from '@/lib/injetaveis/alcance'
import { oQueFaltaParaSeguir } from '@/lib/atendimento/obrigatorias-no-servidor'
import { perguntaDoInicioAdiantado } from '@/lib/appointments/inicio-adiantado'
import { emitirDocumentosDoInicio } from '@/lib/documentos/inicio'
import { planosComOProcedimento, textoDoPlano } from '@/lib/checkout/plano-e-avulso'
import { nomeParaSaudar } from '@/lib/saudacao'
import { EntradaDoDesconto, descontoEmReais, recusaDoDesconto } from '@/lib/vendas/desconto'
import { lerCredito } from '@/lib/creditos/credito'
import { normalizarHorario, type Horario } from '@/lib/agenda/horario'
import { salasDoAgendar, type SalaParaAgendar } from '@/lib/appointments/salas'
import { avisosDoHorarioCore, type AvisosDoHorario } from '@/lib/appointments/encaixe'
import { avisoDoHorarioPassado } from '@/lib/appointments/horario-passado'
import { ehODiaDoAgendamento } from '@/lib/agenda/chegada'
import { recusaDeQuemNaoAtende, textoDaTroca } from '@/lib/appointments/troca-de-profissional'

import {
  getUserName, logHistory, fmtDateTime, loadApptCtx, notifyNewAppointment, notifyCancelledAppointment, notifyRescheduledAppointment, notifyCheckin, notifyCompleted, notifyPayment,
} from '@/lib/appointments/avisos'

// --- Criar agendamento --------------------------------------------
const AGENDA_SO_PARA_VOCE = 'Com a agenda “só os meus”, você agenda só para você.'

export async function addAppointment(
  _prev: { error?: string; success?: boolean; id?: string; jaExiste?: FichaQueJaExiste } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; id?: string; jaExiste?: FichaQueJaExiste }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')

    const slug = formData.get('_slug') as string
    const branchId = formData.get('_branchId') as string
    const admin = createAdminClient()

    // A "Minha agenda" agenda (A25 da 8ª simulação): com a agenda "só os
    // meus", o agendamento é DELA — a regra do Heitor de 28/10 ("quem tem 'só
    // os meus' vê 'só os meus', em qualquer lugar"), como no bloqueio.
    if (isOwnScope(ctx, 'agenda') && (!ctx.internalUserId || formData.get('professional_id') !== ctx.internalUserId)) {
      return { error: AGENDA_SO_PARA_VOCE }
    }

    // Quem vai ser atendido: um cliente já cadastrado, ou só um nome e um
    // telefone. Exigir ficha completa (CPF e e-mail, que criam o login do
    // portal) para marcar um horário invertia a ordem das coisas — a pessoa que
    // liga perguntando preço não dá documento, e a recepção ficava sem como
    // registrar o horário.
    let clientId = (formData.get('client_id') as string)?.trim() || ''
    if (!clientId) {
      // O choque de horário ANTES de nascer a ficha rápida: recusado depois,
      // o agendamento sumia e a ficha ficava (simulação de 2026-10-20). O
      // núcleo confere de novo — esta é só para não sobrar cadastro.
      const profissional = (formData.get('professional_id') as string) || null
      const quando       = new Date(formData.get('scheduled_at') as string)
      const procedimento = (formData.get('procedure_id') as string) || null
      if (profissional && !Number.isNaN(quando.getTime())) {
        const proc = procedimento
          ? await ler(admin.from('procedures').select('duration_min').eq('id', procedimento).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a duração do procedimento') as { duration_min: number | null } | null
          : null
        if (await horarioOcupado(admin, {
          tenantId: ctx.tenantId!, professionalId: profissional, inicio: quando, duracaoMin: Number(proc?.duration_min) || 60,
        })) return { error: 'Este profissional já tem agendamento nesse horário.' }
      }
      const novo = await garantirClienteRapido(admin, ctx, {
        nome:     (formData.get('client_name')  as string) ?? '',
        telefone: (formData.get('client_phone') as string) ?? '',
        branchId,
        // A resposta a "Já existe a ficha de X" (r2-cli-01).
        jaExiste: (formData.get('_jaExiste') as string | null) ?? null,
        // "Indicada por" (decisão do Heitor, 2026-11-10): a ficha de quem indicou a cliente nova.
        indicadaPor: (formData.get('indicada_por') as string | null) || null,
      })
      // A ficha que já existe: nada se grava — a janela pergunta (r2-cli-01).
      if (novo.jaExiste) return { jaExiste: novo.jaExiste }
      if (novo.error || !novo.clientId) return { error: novo.error ?? 'Não foi possível registrar o cliente.' }
      clientId = novo.clientId
      revalidateTag(`clients:${ctx.tenantId!}`, { expire: 0 })
    }

    const result = await createAppointmentCore(admin, ctx, {
      branchId,
      clientId,
      procedureId:    (formData.get('procedure_id') as string) || null,
      professionalId: formData.get('professional_id') as string,
      scheduledAt:    formData.get('scheduled_at') as string,
      roomId:         (formData.get('room_id') as string) || null,
      notes:          (formData.get('notes') as string)?.trim() || null,
      // "PRE_PAGO:<id>" ou "PACOTE:<id>": usar o que o cliente já pagou.
      credito:        lerCredito(formData.get('credito')),
      source:         'INTERNAL',
    })

    if ('error' in result) return { error: result.error }

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/dashboard`)
    notifyNewAppointment(result.id, ctx.internalUserId)
    return { success: true, id: result.id }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Atualizar status do agendamento -----------------------------
/**
 * O erro vira `{ error }` para a tela (2026-10-21): lançado, chegava trocado
 * em produção, e a janela do agendamento nem o tratava — fechava como se
 * tivesse dado certo. A trava de permissão (`semAcesso`) segue lançando.
 */
export async function updateAppointmentStatus(
  ...args: Parameters<typeof updateAppointmentStatusInterno>
): Promise<{ error?: string; confirmarInicioAdiantado?: boolean; aviso?: string | null }> {
  try {
    await updateAppointmentStatusInterno(...args)
    // D13 da 9ª: a chegada de quem tem parcela vencida avisa (sem recusar).
    if (args[1] === 'ARRIVED') return { aviso: await avisoDasVencidasNaChegada(args[0]) }
    return {}
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    // O início muito antes do horário (A32): a tela pergunta e manda de novo.
    if (e instanceof InicioAdiantado) return { error: e.message, confirmarInicioAdiantado: true }
    return { error: mensagemDoErro(e) }
  }
}

/** O início adiantado sem a confirmação (A32): vira a pergunta da tela, não um erro. */
class InicioAdiantado extends Error {}

/** A pergunta do início adiantado (A32), lida do agendamento; nula quando pode iniciar. */
async function perguntaDoInicio(appointmentId: string): Promise<string | null> {
  const ag = await ler(createAdminClient().from('appointments').select('scheduled_at')
    .eq('id', appointmentId).maybeSingle(), 'buscar o horário do agendamento') as { scheduled_at: string | null } | null
  return perguntaDoInicioAdiantado(ag?.scheduled_at ?? null)
}

async function updateAppointmentStatusInterno(
  appointmentId: string,
  status: 'CONFIRMED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
  slug: string,
  cancellationReason?: string | null,
  /** A resposta à pergunta do início adiantado (A32): só com ela o IN_PROGRESS passa. */
  opcoes: { inicioAdiantadoConfirmado?: boolean } = {},
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  // Quem só gerencia a própria agenda mexe no andamento do atendimento
  // (iniciar/concluir) e, com a agenda em Gerenciar, cancela e marca a falta
  // do DELA (agenda-06, revisão do Heitor de 2026-11-02: em 28/10 ele
  // confirmou que a profissional cancela o que é dela). Confirmar e chegar
  // seguem com a recepção.
  if (isOwnScope(ctx, 'agenda')) {
    const doAndamento = (['IN_PROGRESS', 'COMPLETED'] as string[]).includes(status)
    const doDela = (['CANCELLED', 'NO_SHOW'] as string[]).includes(status) && ctx.permissions.agenda === 'MANAGE'
    if (!doAndamento && !doDela) throw semAcesso()
  }
  // E só no agendamento DELE (D4, 2026-10-28): o iniciar pelo status mexia no
  // de qualquer profissional da unidade, pelo id.
  if (isOwnScope(ctx, 'agenda')) {
    const dono = await ler(createAdminClient().from('appointments').select('professional_id')
      .eq('id', appointmentId).maybeSingle(), 'buscar o agendamento')
    if (deOutroProfissional(ctx, dono?.professional_id as string | null | undefined)) throw new Error(DE_OUTRO_PROFISSIONAL)
  }

  if (status === 'CANCELLED' && !cancellationReason?.trim()) {
    throw new Error('Motivo de cancelamento obrigatório.')
  }

  // Iniciar antes do horário (qualquer tempo, r2-age-06) pede a confirmação (A32 da 5ª
  // simulação: a Tatiane iniciou às 11:07 o das 13:00, sem aviso).
  if (status === 'IN_PROGRESS' && opcoes?.inicioAdiantadoConfirmado !== true) {
    const pergunta = await perguntaDoInicio(appointmentId)
    if (pergunta) throw new InicioAdiantado(pergunta)
  }

  const now = new Date().toISOString()
  const fields: Record<string, unknown> = { status }

  if (status === 'IN_PROGRESS') fields.started_at    = now
  if (status === 'CANCELLED')   { fields.cancelled_at = now; fields.cancellation_reason = cancellationReason }

  const supabase = await createSupabase()

  if (status === 'COMPLETED') {
    await completeAppointment(appointmentId, slug, ctx)
    return
  }

  // Chegou (o check-in) também é núcleo dividido, e avisa a profissional.
  if (status === 'ARRIVED') {
    if (ctx.permissions.agenda !== 'MANAGE') throw semAcesso()
    const r = await checkinCore(createAdminClient(), ctx, appointmentId)
    if ('error' in r) throw new Error(r.error)
    notifyCheckin(appointmentId)
    revalidarAgendamento(ctx, appointmentId, slug)
    return
  }

  // Confirmar é o núcleo que a agenda e o Copilot dividem (lib/appointments/alteracoes.ts).
  if (status === 'CONFIRMED') {
    const r = await confirmarCore(createAdminClient(), ctx, appointmentId)
    if ('error' in r) throw new Error(r.error)
    revalidarAgendamento(ctx, appointmentId, slug)
    return
  }

  // Concluído tem prontuário, baixa de estoque e comissão: não volta a
  // cancelado nem a falta (o gatilho trg_atendimento_concluido_nao_cancela é a
  // segunda linha). Desfazer o dinheiro é estornar o pagamento.
  if (status === 'CANCELLED' || status === 'NO_SHOW') {
    const atual = await ler(createAdminClient().from('appointments').select('status, scheduled_at')
      .eq('id', appointmentId).maybeSingle(), 'buscar o agendamento')
    if (atual?.status === 'COMPLETED') {
      throw new Error('Atendimento concluído não pode ser cancelado nem marcado como falta. Para devolver o dinheiro, estorne o pagamento.')
    }
    // Falta é de quem não veio na hora — antes dela, ainda pode vir.
    if (status === 'NO_SHOW' && atual?.scheduled_at && new Date(atual.scheduled_at as string).getTime() > Date.now()) {
      throw new Error('O horário ainda não chegou: "Não compareceu" só depois do início do agendamento.')
    }
  }

  // O erro deste update era descartado, e o histórico logo abaixo é escrito
  // pelo admin client: quando a escrita falhava, a linha do tempo registrava a
  // mudança, a tela dizia que deu certo e o status continuava o mesmo.
  //
  // Pelo cliente de serviço (2026-10-08), com o alcance conferido antes
  // (resolveBranchId): a sessão de suporte não grava pelo PostgREST
  // (`suporte_sem_escrita`), e o suporte muda status de agendamento pela tela.
  const unidadeDoAgendamento = await resolveBranchId(supabase, appointmentId, ctx)
  // D7 da 9ª: o termo do início nasce ANTES do update (a trava recusa e desfaria a emissão).
  if (status === 'IN_PROGRESS') await emitirDocumentosDoInicio(createAdminClient(), appointmentId)
  const { data: atualizadas, error: updErr } = await createAdminClient()
    .from('appointments')
    .update(fields)
    .eq('id', appointmentId)
    .eq('branch_id', unidadeDoAgendamento)
    .select('id')

  if (updErr) throw new Error(`Não foi possível atualizar o agendamento: ${updErr.message}`)
  if (!atualizadas?.length) throw new Error('Não foi possível atualizar o agendamento.')

  const admin    = createAdminClient()
  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  const actionDescMap: Record<string, string> = {
    CONFIRMED:   'Agendamento confirmado',
    IN_PROGRESS: 'Atendimento iniciado',
    NO_SHOW:     'Cliente não compareceu',
    CANCELLED:   `Cancelado: ${cancellationReason ?? ''}`,
  }
  await logHistory(admin, appointmentId, ctx.internalUserId, userName, status, actionDescMap[status] ?? status)

  // A corrente de eventos, ao lado do histórico. São coisas diferentes: o
  // histórico é a linha do tempo que a tela do agendamento mostra; o evento é
  // o gatilho que a automação escuta, e por isso é nomeado pela intenção e
  // carrega o retrato do agendamento junto.
  const EVENTO_DO_STATUS: Record<string, NomeDeEvento> = {
    CONFIRMED:   EVENTOS.AGENDAMENTO_CONFIRMADO,
    IN_PROGRESS: EVENTOS.AGENDAMENTO_INICIADO,
    CANCELLED:   EVENTOS.AGENDAMENTO_CANCELADO,
    NO_SHOW:     EVENTOS.AGENDAMENTO_NAO_COMPARECEU,
  }
  const evento = EVENTO_DO_STATUS[status]
  if (evento) {
    await emitirEventoDeAgendamento(evento, appointmentId, { ...ctx, userName }, {
      motivo: status === 'CANCELLED' ? cancellationReason ?? null : null,
    })
  }

  // Os dois portais olham a mesma agenda: confirmar pela rede tem de aparecer
  // na unidade, e vice-versa.
  revalidarAgendamento(ctx, appointmentId, slug)
  if (status === 'CANCELLED') notifyCancelledAppointment(appointmentId, cancellationReason, ctx.internalUserId)
}

// Resolve o branchId pelo appointmentId (para validar acesso)
async function resolveBranchId(
  supabase: Awaited<ReturnType<typeof createSupabase>>,
  appointmentId: string,
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
) {
  const data = await ler(supabase
    .from('appointments')
    .select('branch_id, branches!inner(id, tenant_id)')
    .eq('id', appointmentId)
    .single(), 'buscar o agendamento')

  const branch = data?.branches as unknown as { id: string; tenant_id: string } | null
  if (!branch || branch.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, branch.id)) throw new Error('Acesso negado.')
  return data!.branch_id
}

// --- Concluir atendimento (transação completa) --------------------
async function completeAppointment(
  appointmentId: string,
  slug: string,
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
) {
  // Sequencial: cada gravação falha alto, mas não há transação (§10).
  const admin = createAdminClient()

  const appt = await ler(admin
    .from('appointments')
    .select('id, branch_id, client_id, procedure_id, professional_id, price, treatment_plan_id, branches!inner(tenant_id)')
    .eq('id', appointmentId)
    .maybeSingle(), 'buscar o agendamento')
  // Concluir baixa estoque, lança comissão e pontos: até 2026-09-28 o id
  // bastava, de qualquer rede e de qualquer unidade.
  const redeDoAppt = (appt?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  // A do agendamento DELA numa unidade em que atende também (decisão 2 da 8ª).
  if (!appt || redeDoAppt !== ctx.tenantId || !alcancaOAgendamento(ctx, appt.branch_id as string, appt.professional_id as string | null)) {
    throw new Error('Agendamento não encontrado.')
  }

  if (!appt) throw new Error('Agendamento não encontrado.')

  // Garante que finishSession() foi chamado antes (cria prontuário + debita estoque)
  const existingEntry = await ler(admin
    .from('medical_record_entries')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle(), 'conferir a entrada do prontuário')

  if (!existingEntry) {
    throw new Error('O atendimento deve ser finalizado pelo profissional antes de ser concluído. Use a opção "Finalizar Sessão".')
  }

  const now = new Date().toISOString()

  // 1. Atualiza status
  await gravar(admin.from('appointments').update({ status: 'COMPLETED', completed_at: now }).eq('id', appointmentId), 'concluir o agendamento')

  // 2. Cria entrada de prontuário (se não existir)
  await gravar(admin.from('medical_record_entries').upsert(
    { appointment_id: appointmentId, professional_id: appt.professional_id },
    { onConflict: 'appointment_id', ignoreDuplicates: true }
  ), 'abrir a entrada no prontuário')

  await emitirEventoClinico(EVENTOS.PRONTUARIO_ENTRADA_CRIADA, appointmentId, ctx, {
    clientId:      appt.client_id as string | null,
    agendamentoId: appointmentId,
    branchId:      appt.branch_id as string | null,
    chave:         'prontuario.entrada_criada:' + appointmentId,
  })

  // 3. Lança a receita do atendimento como CONTA A RECEBER; confirmPayment
  //    depois dá baixa (is_paid). Comissão, fidelidade, estoque e pacote já
  //    foram gravados por finishSession (obrigatório antes daqui) — repetir
  //    aqui duplicaria. Sessão de plano ou de pacote também não gera receita:
  //    já foi cobrada na venda.
  const pkgSession = await ler(admin
    .from('package_sessions')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle(), 'buscar a sessão do pacote')

  // Procedimento pré-pago: pago na venda (a unidade já foi usada na conclusão).
  const unidadePrePaga = await ler(admin
    .from('procedure_sale_units')
    .select('id')
    .eq('appointment_id', appointmentId)
    .neq('status', 'CANCELADA')
    .maybeSingle(), 'buscar a unidade pré-paga')

  const alreadyCharged = Boolean(appt.treatment_plan_id) || Boolean(pkgSession) || Boolean(unidadePrePaga)

  const existingTx = await ler(admin
    .from('financial_transactions')
    .select('id')
    .eq('appointment_id', appointmentId)
    // O estornado fica no histórico ao lado do lançamento vivo (D6, 2026-10-28).
    .or('notes.is.null,notes.neq.Estornada')
    .maybeSingle(), 'conferir se o atendimento já foi lançado')

  // R$ 0 (a avaliação) não tem o que receber: sem conta a receber de zero (D9).
  const semCobranca = !(Number(appt.price) > 0)

  if (!existingTx && !alreadyCharged && !semCobranca) {
    const { error: txErr } = await admin.from('financial_transactions').insert({
      branch_id:      appt.branch_id,
      appointment_id: appointmentId,
      client_id:      appt.client_id,
      type:           'INCOME',
      category:       'Serviços',
      description:    'Atendimento concluído',
      amount:         appt.price,
      is_paid:        false,
      created_by:     ctx.internalUserId ?? ctx.userId,
    })
    if (txErr) throw new Error(`Erro ao lançar a receita do atendimento: ${txErr.message}`)
  }

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/dashboard`)
  revalidatePath(`/${slug}/financeiro`)
}

// --- Check-in do cliente (Agendado ou Confirmado → Chegou) ---------
/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function checkinAppointment(
  ...args: Parameters<typeof checkinAppointmentInterno>
): ReturnType<typeof checkinAppointmentInterno> {
  try {
    return await checkinAppointmentInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function checkinAppointmentInterno(
  appointmentId: string,
  slug: string,
): Promise<{ error?: string; aviso?: string | null }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')

    // O núcleo que a agenda e o Copilot dividem (lib/appointments/alteracoes.ts).
    const r = await checkinCore(createAdminClient(), ctx, appointmentId)
    if ('error' in r) return { error: r.error }

    revalidarAgendamento(ctx, appointmentId, slug || null)
    notifyCheckin(appointmentId)
    return { aviso: await avisoDasVencidasNaChegada(appointmentId) }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Marcar chegada e iniciar (a profissional, A21 de 2026-10-27) ---
/**
 * A profissional no agendamento que ainda não chegou ("Agendado" ou
 * "Confirmado"): o MESMO check-in (`checkinCore`, com o aviso e os documentos
 * do início que ele emite) e depois o MESMO início (`startAppointment`, com a
 * trava dos documentos). Na simulação a Lívia não via "Iniciar" no "Agendado"
 * e contornou pelo check-in da tela.
 *
 * Com a agenda "só os meus", só no agendamento DELA — o check-in comum não
 * confere o profissional (é da recepção).
 */
export async function chegarEIniciar(
  appointmentId: string, slug: string,
  /** A resposta à pergunta do início adiantado (A32). */
  opcoes: { inicioAdiantadoConfirmado?: boolean } = {},
): Promise<{ error?: string; chegou?: boolean; confirmarInicioAdiantado?: boolean }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    const admin = createAdminClient()
    const ag = await agendamentoAoAlcance(admin, ctx, appointmentId)
    if (!ag) return { error: 'Agendamento não encontrado.' }
    if (isOwnScope(ctx, 'agenda') && ag.professional_id !== ctx.internalUserId) {
      return { error: 'Apenas o profissional responsável pode marcar a chegada e iniciar este atendimento.' }
    }
    // A trava do DIA vem antes da pergunta do horário (D10 da 7ª simulação):
    // numa sessão de amanhã, perguntar "Iniciar mesmo assim?" e recusar no
    // clique não servia de nada. É a mesma regra do checkinCore.
    if (!ehODiaDoAgendamento(ag.scheduled_at)) return { error: 'A chegada só se marca no dia do agendamento.' }
    // O início adiantado pergunta ANTES da chegada (A32): sem a resposta, nem
    // a chegada se marca — senão ficaria "chegou" sem ter começado.
    if (opcoes?.inicioAdiantadoConfirmado !== true) {
      const pergunta = await perguntaDoInicio(appointmentId)
      if (pergunta) return { error: pergunta, confirmarInicioAdiantado: true }
    }

    const chegada = await checkinCore(admin, ctx, appointmentId)
    if ('error' in chegada) return { error: chegada.error }
    // O aviso do check-in é para a profissional: quem marcou foi ela mesma.
    if (ag.professional_id !== ctx.internalUserId) notifyCheckin(appointmentId)
    revalidarAgendamento(ctx, appointmentId, slug || null)

    const inicio = await startAppointmentInterno(appointmentId, slug, { inicioAdiantadoConfirmado: true })
    if (inicio.error) return { error: `Chegada registrada, mas o atendimento não começou: ${inicio.error}`, chegou: true }
    return {}
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    return { error: mensagemDoErro(e) }
  }
}

// --- Iniciar atendimento (Confirmado ou Chegou → Em atendimento) ---
/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function startAppointment(
  ...args: Parameters<typeof startAppointmentInterno>
): ReturnType<typeof startAppointmentInterno> {
  try {
    return await startAppointmentInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function startAppointmentInterno(
  appointmentId: string,
  slug: string,
  /** A resposta à pergunta do início adiantado (A32): só com ela inicia antes do horário (r2-age-06). */
  opcoes: { inicioAdiantadoConfirmado?: boolean } = {},
): Promise<{ error?: string; confirmarInicioAdiantado?: boolean }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'VIEW')

    const admin = createAdminClient()
    const appt = await ler(admin
      .from('appointments')
      .select('id, status, professional_id, scheduled_at, branches!inner(id, tenant_id)')
      .eq('id', appointmentId)
      .single(), 'buscar o agendamento')

    const apptBranch = appt?.branches as unknown as { id: string; tenant_id: string } | null
    // O DELA numa unidade em que atende também (decisão 2 da 8ª simulação).
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId || !alcancaOAgendamento(ctx, apptBranch.id, appt.professional_id as string | null)) return { error: 'Agendamento não encontrado.' }
    if (appt.status !== 'CONFIRMED' && appt.status !== 'ARRIVED') return { error: 'O cliente precisa estar confirmado ou ter chegado (check-in) antes de iniciar.' }

    if (isOwnScope(ctx, 'agenda') && appt.professional_id !== ctx.internalUserId) {
      return { error: 'Apenas o profissional responsável pode iniciar este atendimento.' }
    }

    // Antes do horário, em qualquer tempo: pergunta (A32, r2-age-06). O servidor só inicia com a resposta.
    if (opcoes?.inicioAdiantadoConfirmado !== true) {
      const pergunta = perguntaDoInicioAdiantado(appt.scheduled_at as string | null)
      if (pergunta) return { error: pergunta, confirmarInicioAdiantado: true }
    }

    // Os termos e contratos do início nascem num passo próprio, ANTES do
    // update (D7 da 9ª, regressão da F33): a trava do banco recusa o início sem
    // assinatura no mesmo update e a transação desfazia a emissão — a recepção
    // lia "Falta assinar: …" e o termo não existia para colher.
    await emitirDocumentosDoInicio(admin, appointmentId)
    await gravar(admin
      .from('appointments')
      .update({ status: 'IN_PROGRESS', started_at: new Date().toISOString() })
      .eq('id', appointmentId), 'iniciar o atendimento')

    const userName = ctx.userName || await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'STARTED', 'Atendimento iniciado')
    await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_INICIADO, appointmentId, { ...ctx, userName })

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    return {}
  } catch (e) {
    // mensagemDoErro, e não e.message: a recusa do banco ("Falta assinar: …",
    // o gatilho dos termos) é a frase que a tela tem de mostrar.
    return { error: mensagemDoErro(e) }
  }
}

// --- Trocar a profissional pela janela (A22 da 8ª) -----------------
/**
 * Quem pode receber o agendamento na troca pela janela da agenda: quem ATENDE
 * na unidade dele (a regra de `filtroDeQuemAtendeNaUnidade`), menos a de agora,
 * cada uma dizendo se está livre no horário (`horarioOcupado`). Só leitura;
 * `reassignProfessional` confere tudo de novo.
 */
export async function profissionaisParaTrocar(appointmentId: string): Promise<{ id: string; name: string; livre: boolean }[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return []
  const admin = createAdminClient()
  const a = await ler(admin.from('appointments')
    .select('id, status, branch_id, professional_id, scheduled_at, duration_min, branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o agendamento') as {
      id: string; status: string; branch_id: string; professional_id: string | null; scheduled_at: string; duration_min: number | null
    } | null
  if (!a || !alcancaUnidade(ctx, a.branch_id) || deOutroProfissional(ctx, a.professional_id)) return []
  if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status)) return []
  const equipe = (await getCachedBranchProfessionals(a.branch_id, ctx.tenantId!)) as { id: string; name: string }[]
  const outras = equipe.filter(p => p.id !== a.professional_id)
  const livres = await Promise.all(outras.map(p => horarioOcupado(admin, {
    tenantId: ctx.tenantId!, professionalId: p.id, inicio: new Date(a.scheduled_at),
    duracaoMin: a.duration_min ?? 60, excluir: a.id,
  }).then(ocupado => !ocupado)))
  return outras.map((p, i) => ({ id: p.id, name: p.name, livre: livres[i]! }))
}

// --- Mudar a unidade do agendamento (A33 da 9ª) ---------------------
export interface UnidadeParaMudar {
  id: string; nome: string
  profissionais: { id: string; name: string; livre: boolean }[]
  salas: { id: string; name: string; livre: boolean }[]
}

/**
 * As unidades para onde o agendamento pode ir (A33 da 9ª simulação): as outras
 * ativas que quem muda alcança, cada uma com quem ATENDE lá (livre ou não no
 * horário) e as salas (livres ou não). Só leitura; `mudarUnidadeDoAgendamento`
 * confere tudo de novo (`mudarUnidadeCore`).
 */
export async function opcoesParaMudarDeUnidade(appointmentId: string): Promise<UnidadeParaMudar[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return []
  const admin = createAdminClient()
  const a = await ler(admin.from('appointments')
    .select('id, status, branch_id, professional_id, scheduled_at, duration_min, branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o agendamento') as {
      id: string; status: string; branch_id: string; professional_id: string | null; scheduled_at: string; duration_min: number | null
    } | null
  if (!a || !alcancaUnidade(ctx, a.branch_id) || deOutroProfissional(ctx, a.professional_id)) return []
  if (!['SCHEDULED', 'CONFIRMED'].includes(a.status)) return []
  const inicio = new Date(a.scheduled_at)
  const duracaoMin = a.duration_min ?? 60
  const unidades = ((await getCachedNetworkBranches(ctx.tenantId!)) as { id: string; name: string }[])
    .filter(u => u.id !== a.branch_id && alcancaUnidade(ctx, u.id))
  return Promise.all(unidades.map(async u => {
    const [equipe, salas] = await Promise.all([
      getCachedBranchProfessionals(u.id, ctx.tenantId!) as Promise<{ id: string; name: string }[]>,
      getCachedRoomsByBranch(u.id, ctx.tenantId!) as Promise<{ id: string; name: string }[]>,
    ])
    const [livresP, livresS] = await Promise.all([
      Promise.all(equipe.map(p => horarioOcupado(admin, { tenantId: ctx.tenantId!, professionalId: p.id, inicio, duracaoMin, excluir: a.id }).then(o => !o))),
      Promise.all(salas.map(s => horarioOcupado(admin, { tenantId: ctx.tenantId!, roomId: s.id, branchId: u.id, inicio, duracaoMin, excluir: a.id }).then(o => !o))),
    ])
    return {
      id: u.id, nome: u.name,
      profissionais: equipe.map((p, i) => ({ id: p.id, name: p.name, livre: livresP[i]! })),
      salas: salas.map((s, i) => ({ id: s.id, name: s.name, livre: livresS[i]! })),
    }
  }))
}

const EntradaDaMudancaDeUnidade = z.object({
  branchId: z.string().uuid(), professionalId: z.string().uuid(), roomId: z.string().uuid().nullable().optional(),
})

export async function mudarUnidadeDoAgendamento(appointmentId: string, entrada: unknown): Promise<{ error?: string; de?: string; para?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return { error: 'Agendamento não encontrado.' }
    const lido = EntradaDaMudancaDeUnidade.safeParse(entrada)
    if (!lido.success) return { error: 'Escolha a unidade e a profissional.' }
    const admin = createAdminClient()
    const r = await mudarUnidadeCore(admin, ctx, { appointmentId, ...lido.data })
    if ('error' in r) return { error: r.error }
    revalidarAgendamento(ctx, appointmentId)
    revalidatePath('/[slug]/agenda', 'page')
    // A cliente fica sabendo, com a unidade nova (A48).
    notifyRescheduledAppointment(appointmentId, ctx.internalUserId)
    return { de: r.de, para: r.para }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

// --- Reatribuir profissional --------------------------------------
/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function reassignProfessional(
  ...args: Parameters<typeof reassignProfessionalInterno>
): ReturnType<typeof reassignProfessionalInterno> {
  try {
    return await reassignProfessionalInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function reassignProfessionalInterno(
  appointmentId: string,
  professionalId: string,
  slug: string,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')

    const admin = createAdminClient()
    const appt = await ler(admin
      .from('appointments')
      .select('id, status, professional_id, scheduled_at, duration_min, branches!inner(id, tenant_id)')
      .eq('id', appointmentId)
      .single(), 'buscar o agendamento')

    const apptBranch = appt?.branches as unknown as { id: string; tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, apptBranch.id)) return { error: 'Agendamento não encontrado.' }
    // "Só os meus" não puxa para si o agendamento de outra (D4, 2026-10-28).
    if (deOutroProfissional(ctx, appt.professional_id as string | null)) return { error: DE_OUTRO_PROFISSIONAL }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status as string)) {
      return { error: 'Não é possível reatribuir um atendimento já finalizado.' }
    }

    // O profissional novo tem de ser da rede — vinha do navegador sem conferência.
    const recusaProf = await conferirPecasDoAgendamento(admin, ctx, { professionalId })
    if (recusaProf) return { error: recusaProf }
    // E atender NA UNIDADE do agendamento (decisão 2 da 8ª: o "Atende" por unidade; A22).
    const recusaAtende = await recusaDeQuemNaoAtende(admin, ctx.tenantId!, professionalId, apptBranch.id)
    if (recusaAtende) return { error: recusaAtende }
    // E livre no horário do agendamento (revisão de 2026-10-08: a troca punha
    // o atendimento por cima de outro do profissional novo).
    if (professionalId !== appt.professional_id && await horarioOcupado(admin, {
      tenantId: ctx.tenantId!, professionalId, inicio: new Date(appt.scheduled_at as string),
      duracaoMin: (appt.duration_min as number | null) ?? 60, excluir: appointmentId,
    })) {
      return { error: 'Este profissional já tem agendamento nesse horário.' }
    }

    const oldProfId = (appt.professional_id ?? null) as string | null
    if (oldProfId === professionalId) return {}
    const nomes = await ler(admin.from('users').select('id, name').in('id', [professionalId, ...(oldProfId ? [oldProfId] : [])]), 'buscar os profissionais') as { id: string; name: string }[] | null
    const nomeDe = (id: string | null) => (id && nomes?.find(n => n.id === id)?.name) || null
    await gravar(admin
      .from('appointments')
      .update({ professional_id: professionalId })
      .eq('id', appointmentId), 'trocar o profissional do agendamento')

    // A22 da 8ª simulação: o histórico diz de quem para quem.
    const userName = ctx.userName || await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'REASSIGNED',
      textoDaTroca(nomeDe(oldProfId), nomeDe(professionalId) ?? professionalId),
      { old_professional_id: oldProfId, new_professional_id: professionalId, new_professional_name: nomeDe(professionalId) },
    )

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidatePath('/admin/agenda')
    revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
    after(async () => {
      const a = createAdminClient()
      const c = await loadApptCtx(a, appointmentId)
      if (!c) return
      const when = fmtDateTime(c.scheduledAt)
      const data = { appointment_id: appointmentId }
      if (oldProfId && oldProfId !== professionalId) {
        await notifyUser(a, oldProfId, {
          type: 'appointment_reassigned', title: 'Agendamento reatribuído',
          body: `${c.clientName} — ${c.procedureName} de ${when} passou para outro profissional.`, data,
        })
      }
      await notifyUser(a, professionalId, {
        type: 'appointment_new', title: 'Novo agendamento',
        body: `${c.clientName} — ${c.procedureName} em ${when}.`, data,
      })
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Cancelar atendimento -----------------------------------------
/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function cancelAppointmentSession(
  ...args: Parameters<typeof cancelAppointmentSessionInterno>
): ReturnType<typeof cancelAppointmentSessionInterno> {
  try {
    return await cancelAppointmentSessionInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function cancelAppointmentSessionInterno(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')

    const appointmentId      = (formData.get('appointment_id') as string)?.trim()
    const cancellationReason = (formData.get('cancellation_reason') as string)?.trim()
    const slug               = (formData.get('slug') as string)?.trim()

    if (!cancellationReason) return { error: 'Informe o motivo do cancelamento.' }

    // A desistência NO MEIO (A27 da 8ª simulação): a intercorrência e o insumo
    // já aplicado vão junto do cancelamento, numa transação
    // (`desistir_do_atendimento`). Escrevem o prontuário e o estoque: pedem o
    // Prontuário em Gerenciar, como concluir.
    const intercorrencia = ((formData.get('intercorrencia') as string | null) ?? '').trim()
    const porProduto = insumosPorProduto(formData.get('products_used') as string | null)
    if (formData.get('desistencia') === '1' && (intercorrencia || porProduto.size)) {
      assertPermission(ctx, 'medical_records', 'MANAGE')
      const admin = createAdminClient()
      const existente = await agendamentoAoAlcance(admin, ctx, appointmentId)
      if (!existente) return { error: 'Agendamento não encontrado.' }
      if (deOutroProfissional(ctx, existente.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }
      if (existente.status !== 'IN_PROGRESS') return { error: 'A intercorrência e o insumo se registram só no atendimento em andamento.' }
      const userName = ctx.userName || await getUserName(admin, ctx.userId)
      const resposta = await comNovaTentativa(async () => {
        const m = await montarInsumosDaBaixa(admin, ctx.tenantId!, existente.branch_id, porProduto)
        return admin.rpc('desistir_do_atendimento', {
          p_agendamento: appointmentId, p_tenant: ctx.tenantId!, p_ator: ctx.internalUserId, p_ator_nome: userName,
          p_dados: { motivo: cancellationReason, intercorrencias: intercorrencia || null, insumos: m.insumos },
        })
      })
      await gravar(Promise.resolve(resposta), 'registrar a desistência')
      await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CANCELADO, appointmentId, { ...ctx, userName }, { motivo: cancellationReason })
      revalidarAgendamento(ctx, appointmentId, slug)
      notifyCancelledAppointment(appointmentId, cancellationReason, ctx.internalUserId)
      return {}
    }

    // O núcleo (lib/appointments/alteracoes.ts) é o mesmo do Copilot.
    const r = await cancelarCore(createAdminClient(), ctx, { appointmentId, motivo: cancellationReason })
    if ('error' in r) return { error: r.error }

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
    notifyCancelledAppointment(appointmentId, cancellationReason, ctx.internalUserId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Concluir atendimento (fluxo completo) ------------------------
// -- Profissional finaliza o atendimento (clínico) -----------------------------
// Cria prontuário, baixa estoque e registra a comissão. Os pontos nascem no pagamento.
// NÃO cria transação financeira — isso é responsabilidade de confirmPayment.
/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function finishSession(
  ...args: Parameters<typeof finishSessionInterno>
): ReturnType<typeof finishSessionInterno> {
  try {
    return await finishSessionInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function finishSessionInterno(
  _prev: { error?: string; avisos?: string[]; confirmarPlanejamentoVazio?: boolean } | null,
  formData: FormData,
): Promise<{
  error?: string
  /** Insumos que ficaram com saldo negativo — conclui mesmo assim. */
  avisos?: string[]
  /** O planejamento da ficha não tem ponto: a tela pergunta, e só a resposta conclui (atend-12). */
  confirmarPlanejamentoVazio?: boolean
}> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'VIEW')
    // Concluir grava a evolução no prontuário (concluir_atendimento): é do
    // módulo de prontuário, não da agenda (2026-10-03).
    if (!can(ctx, 'medical_records', 'MANAGE')) {
      return { error: 'Concluir o atendimento grava o prontuário: é preciso ter o módulo Prontuário para gerenciar.' }
    }

    const appointmentId  = (formData.get('appointment_id') as string)?.trim()
    const notes          = (formData.get('notes') as string)?.trim() || null
    const intercurrences = (formData.get('intercurrences') as string)?.trim() || null
    const slug           = (formData.get('slug') as string)?.trim()
    // As dores e a anamnese digitadas na tela (D3 da simulação de 2026-10-28):
    // vão NA MESMA transação da conclusão. Sem o campo no formulário (a tela
    // que não os tem), nada muda no que já estava gravado.
    const temQueixas     = formData.has('queixas')
    const queixas        = ((formData.get('queixas') as string | null) ?? '').trim() || null
    let anamneseDigitada: unknown = null
    try { anamneseDigitada = JSON.parse((formData.get('anamnese') as string | null) ?? 'null') } catch { /* JSON inválido → sem anamnese */ }
    // A ficha própria do procedimento, como está NA TELA (D1 da simulação de
    // 2026-10-29): também vai na transação da conclusão. Sem ela no
    // formulário, a ficha já gravada (o "Salvar ficha") fica como está.
    let fichaDigitada: unknown = null
    try { fichaDigitada = JSON.parse((formData.get('ficha') as string | null) ?? 'null') } catch { /* JSON inválido → sem ficha */ }

    const admin = createAdminClient()

    const appt = await ler(admin
      .from('appointments')
      .select('id, status, branch_id, client_id, procedure_id, professional_id, price, treatment_plan_id, branches!inner(id, tenant_id)')
      .eq('id', appointmentId)
      .single(), 'buscar o agendamento')

    const apptBranch = appt?.branches as unknown as { id: string; tenant_id: string } | null
    // O DELA numa unidade em que atende também (decisão 2 da 8ª simulação).
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId || !alcancaOAgendamento(ctx, apptBranch.id, appt.professional_id as string | null)) return { error: 'Agendamento não encontrado.' }
    if (appt.status === 'COMPLETED')                      return { error: 'Atendimento já concluído.' }
    if (['CANCELLED', 'NO_SHOW'].includes(appt.status as string)) return { error: 'Agendamento já finalizado.' }

    if (isOwnScope(ctx, 'agenda') && appt.professional_id !== ctx.internalUserId) {
      return { error: 'Apenas o profissional responsável pode concluir este atendimento.' }
    }

    const now = new Date().toISOString()

    // ─── Calcula ───────────────────────────────────────────────────────────
    // O app decide os números; `concluir_atendimento` (banco) grava tudo numa
    // transação — status, prontuário, comissão, insumos, pacote e
    // histórico (CLAUDE.md §10). Até 2026-09-28 eram gravações soltas: falhar
    // a quinta deixava as quatro primeiras, e o atendimento ficava concluído
    // com comissão e sem baixa de estoque, sem jeito de refazer.

    // Comissão — uma LINHA por procedimento executado (§9.7), com a regra do
    // profissional (a exceção do procedimento vence o padrão) e a base lida
    // aqui no servidor. O VALOR é conta do banco (`comissao_alvo`): o
    // recebimento do plano, por gatilho, usa a mesma.
    const comissoes = await linhasDoAtendimento(ctx.tenantId!, {
      id:                appointmentId,
      procedure_id:      (appt.procedure_id as string | null) ?? null,
      professional_id:   appt.professional_id as string,
      price:             parseFloat(String(appt.price)),
      treatment_plan_id: (appt.treatment_plan_id as string | null) ?? null,
    })

    // Pontos de fidelidade: NÃO aqui. Desde 2026-09-28 o ponto nasce quando o
    // atendimento é PAGO (gatilho trg_fidelidade_ganho) — atendimento concluído
    // e não pago não é dinheiro que entrou.

    // Insumos
    //
    // Insumo faltando NÃO impede o fechamento — a cliente já foi atendida
    // (decisão do Heitor, 2026-09-27). Mas também não some: o saldo fica
    // NEGATIVO e a tela recebe `avisos` dizendo o que faltou. O mínimo cruzado
    // e a baixa do lote saem dos gatilhos do banco, como qualquer saída.
    // O mesmo produto duas vezes na lista soma, e a conta da baixa é UMA
    // (lib/atendimento/insumos-da-baixa.ts — a desistência no meio também a usa).
    const porProduto = insumosPorProduto(formData.get('products_used') as string | null)
    // Chamada de novo a cada tentativa: se outra saída mudar o saldo no meio, o
    // banco recusa e a conta é refeita sobre o saldo novo (lib/estoque/nova-tentativa.ts).
    const montarInsumos = () => montarInsumosDaBaixa(admin, ctx.tenantId!, appt.branch_id as string, porProduto)

    // A anamnese: montada aqui (a ficha atual, as respostas limpas); nula
    // quando não há resposta ou nada mudou — aí a conclusão não a toca.
    const anamnese = anamneseDigitada && typeof anamneseDigitada === 'object' && appt.client_id
      ? await anamneseDaEquipeParaGravar(admin, {
          tenantId: ctx.tenantId!, clientId: appt.client_id as string, respostas: anamneseDigitada, porUsuario: ctx.internalUserId,
        })
      : null

    // A ficha do procedimento: o retrato da ficha ligada a ELE, da rede (não a
    // que o navegador diz), com só as respostas dos campos dela.
    let ficha: ReturnType<typeof fichaParaConcluir> = null
    if (fichaDigitada && typeof fichaDigitada === 'object' && appt.procedure_id) {
      const proc = await ler(admin.from('procedures').select('form_id')
        .eq('id', appt.procedure_id as string).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o procedimento')
      const form = proc?.form_id
        ? await ler(admin.from('forms').select('id, name, schema')
            .eq('id', proc.form_id as string).eq('tenant_id', ctx.tenantId!).eq('tipo', 'PROCEDIMENTO').maybeSingle(), 'buscar a ficha do procedimento')
        : null
      ficha = fichaParaConcluir(form as { id: string; name: string; schema: unknown } | null, fichaDigitada)
    }
    // O planejador de injetáveis da ficha: o RETRATO do planejamento usado,
    // lido agora do banco (2026-10-29). Sem a ficha na tela, a já salva
    // ganha o retrato de agora — é o "momento em que o atendimento é
    // finalizado" — e o resto dela fica como foi salvo.
    const daTela = !!ficha
    if (!ficha && appt.client_id) {
      const salva = (await ler(admin.from('medical_record_entries').select('form_data')
        .eq('appointment_id', appointmentId).maybeSingle(), 'buscar a ficha salva'))?.form_data as { ficha?: unknown } | null
      const f = salva?.ficha as { formId?: unknown; name?: unknown; rows?: unknown; answers?: unknown } | undefined
      // D6 da 7ª: também a salva com o campo do planejador vazio, quando este
      // atendimento tem aplicação registrada (o retrato a liga a ela).
      if (f && typeof f.formId === 'string' && Array.isArray(f.rows) && f.answers && typeof f.answers === 'object'
        && (planejamentosDaFicha(f.rows as AnamnesisRow[], f.answers as Record<string, unknown>).length > 0
          || (temPlanejadorSemPlanejamento(f.rows as AnamnesisRow[], f.answers as Record<string, unknown>)
            && !!(await planejamentoAplicadoNoAtendimento(admin, appointmentId, appt.client_id as string))))) {
        ficha = { formId: f.formId, name: String(f.name ?? ''), rows: f.rows as AnamnesisRow[], answers: f.answers as Record<string, unknown> }
      }
    }
    if (ficha) {
      const retratadas = await retratarInjetaveis(admin, ctx, {
        rows: ficha.rows, answers: ficha.answers, clientId: (appt.client_id as string | null) ?? null, appointmentId,
      })
      // A da tela com planejamento que não é desta cliente: recusa. A salva
      // antes, cujo planejamento saiu do alcance: fica como foi salva.
      if ('error' in retratadas) {
        if (daTela) return { error: retratadas.error }
        ficha = null
      } else ficha = { ...ficha, answers: retratadas.answers }
    }

    // A obrigatória sem resposta barra o "Finalizar" (revisão do Heitor,
    // 2026-10-29: "tudo que for obrigatório é obrigatório e barra qualquer
    // progressão"). Era o contrário — "a cliente já foi atendida" —, e o
    // prontuário ficava sem o que a clínica marcou como obrigatório. Vale o
    // que FICA gravado: a anamnese e a ficha da tela, senão as já gravadas.
    const falta = await oQueFaltaParaSeguir(admin, {
      tenantId: ctx.tenantId!, appointmentId, procedureId: (appt.procedure_id as string | null) ?? null,
      clientId: (appt.client_id as string | null) ?? null, semInjetaveis: !temRecurso(ctx, 'injetaveis'),
      anamneseNaTela: anamnese, fichaNaTela: daTela && ficha ? ficha.answers : null,
    })
    if (falta) return { error: falta }

    // O planejamento escolhido sem nenhum ponto (atend-12, revisão do Heitor:
    // "avisar e confirmar se deseja continuar"): o servidor só conclui com a
    // confirmação EXPLÍCITA — a tela pergunta com esta resposta.
    const vazio = ficha ? perguntaDoPlanejamentoVazio(ficha.rows, ficha.answers) : null
    if (vazio && formData.get('confirmar_planejamento_vazio') !== '1') return { error: vazio, confirmarPlanejamentoVazio: true }

    // ─── Grava, tudo ou nada ──────────────────────────────────────────────
    const userName = ctx.userName || await getUserName(admin, ctx.userId)
    let avisos: string[] = []
    const resposta = await comNovaTentativa(async () => {
      const m = await montarInsumos()
      avisos = m.avisos
      return admin.rpc('concluir_atendimento', {
        p_agendamento: appointmentId,
        p_tenant:      ctx.tenantId!,
        p_ator:        ctx.internalUserId,
        p_ator_nome:   userName,
        p_dados:       {
          notas: notes, intercorrencias: intercurrences, comissoes, insumos: m.insumos,
          // A conferência das obrigatórias no banco (atend-04): sem o recurso, o planejador não barra.
          sem_injetaveis: !temRecurso(ctx, 'injetaveis'),
          ...(temQueixas ? { queixas } : {}),
          ...(anamnese ? { anamnese } : {}),
          ...(ficha ? { ficha } : {}),
        },
      })
    })
    const gravado = await gravar(Promise.resolve(resposta), 'concluir o atendimento') as {
      comissao_criada: boolean; pacote: string | null
      comissoes: { linha: string; procedure_id: string | null; liberado: number }[]
    } | null

    // ─── Depois: os avisos do que aconteceu ───────────────────────────────
    // Um fato por linha que já nasce devida. Sem o pagamento integral (H4)
    // a linha nasce zerada e é liberada no pagamento.
    for (const linha of gravado?.comissoes ?? []) {
      if (Number(linha.liberado) <= 0) continue
      await emitirComissaoGerada(
        appointmentId, linha.linha, linha.procedure_id, appt.professional_id as string | null,
        Number(linha.liberado), periodRef(now), appt.branch_id as string | null, ctx,
      )
    }
    // Depois do incremento (feito na transação), para `restantes` já refletir
    // esta sessão — é zero que dispara a automação de renovação.
    if (gravado?.pacote) await emitirSessaoDePacoteUsada(gravado.pacote, appointmentId, ctx)
    await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CONCLUIDO, appointmentId, { ...ctx, userName })

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidatePath(`/${slug}/dashboard`)
    revalidatePath(`/${slug}/estoque`)
    revalidateTag(`appointments:${apptBranch!.tenant_id}`, { expire: 0 })
    notifyCompleted(appointmentId)
    return { avisos }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// -- Recepcionista/admin confirma pagamento -------------------------------------
export async function confirmPayment(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'cashier', 'MANAGE')

    const appointmentId = (formData.get('appointment_id') as string)?.trim()
    const paymentMethod = (formData.get('payment_method') as string)?.trim() || null
    const slug          = (formData.get('slug') as string)?.trim()
    const pedido        = Math.trunc(Number(formData.get('pontos') ?? 0) || 0)
    const voucherId     = (formData.get('voucher_id') as string | null)?.trim() || null
    // Cartão de crédito em N vezes (2026-10-20): pago na hora; o banco confere 1–12 e o meio.
    const cartaoVezes   = paymentMethod === 'CREDIT_CARD' ? Math.trunc(Number(formData.get('cartao_vezes') ?? 1) || 1) : 1
    // Até quantas vezes a clínica parcela no crédito (D-15): o servidor recusa acima.
    const recusaDasVezes = await recusaDasVezesDaRede(ctx.tenantId!, cartaoVezes)
    if (recusaDasVezes) return { error: recusaDasVezes }
    // r3-f13-01: a bandeira do cartão, opcional (o banco confere a lista).
    const cartaoBandeira = bandeiraDoPagamento(paymentMethod, (formData.get('cartao_bandeira') as string | null)?.trim() || null)
    // Desconto comercial da recepção (2026-09-30): R$ ou %, sem teto.
    const valorDoDesconto = Number(formData.get('desconto_valor') ?? 0) || 0
    const pedidoDeDesconto = EntradaDoDesconto.safeParse(
      valorDoDesconto > 0 ? { tipo: formData.get('desconto_tipo'), valor: valorDoDesconto } : null,
    )
    if (!pedidoDeDesconto.success) return { error: 'Desconto inválido.' }
    // O porquê do desconto (J-47), opcional: o banco só o grava com desconto.
    const motivoDoDesconto = String(formData.get('desconto_motivo') ?? '').trim().slice(0, 300) || null

    const admin = createAdminClient()

    const appt = await ler(admin
      .from('appointments')
      .select('id, status, branch_id, client_id, procedure_id, price, treatment_plan_id, branches!inner(id, tenant_id)')
      .eq('id', appointmentId)
      .single(), 'buscar o agendamento')

    const apptBranch = appt?.branches as unknown as { id: string; tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, apptBranch.id)) return { error: 'Agendamento não encontrado.' }

    // Pontos como desconto (fidelidade, fase 2): o SERVIDOR calcula a partir
    // dos pontos pedidos — o valor que o navegador mostra não entra. O banco
    // confere de novo (config, teto, saldo) dentro da transação.
    // A ordem: o voucher desconta PRIMEIRO, depois o desconto comercial (sobre o
    // que sobrou), e os pontos valem sobre o que sobra dos dois.
    const preco = parseFloat(String(appt.price))
    let pontos = 0, desconto = 0, descontoVoucher = 0, descontoVenda = 0
    let valorFinal = Math.round(preco * 100) / 100
    const cfg = pedido > 0 || voucherId ? await configDaRede(ctx.tenantId!, admin) : null
    if (cfg && !cfg.enabled) return { error: 'O programa de fidelidade está desligado nesta rede.' }
    {
      if (voucherId) {
        const v = await ler(admin.from('loyalty_vouchers')
          .select('type, status, expires_at, procedure_id, discount_value, client_id')
          .eq('id', voucherId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o voucher')
        if (!v || v.client_id !== appt.client_id) return { error: 'Voucher não encontrado para este cliente.' }
        const dv = descontoDoVoucher(v as VoucherParaCalculo, { procedureId: appt.procedure_id as string | null, preco })
        if (dv.motivo) return { error: dv.motivo }
        descontoVoucher = dv.desconto
        valorFinal = Math.round((preco - descontoVoucher) * 100) / 100
      }

      const recusa = recusaDoDesconto(valorFinal, pedidoDeDesconto.data)
      if (recusa) return { error: recusa }
      descontoVenda = descontoEmReais(valorFinal, pedidoDeDesconto.data)
      valorFinal = Math.round((valorFinal - descontoVenda) * 100) / 100

      if (pedido > 0 && cfg) {
        const saldo = await saldoDoCliente(appt.client_id as string, cfg.scope_per_branch ? apptBranch.id : null, admin)
        const r = calcularDescontoComPontos({
          saldo, preco: valorFinal, pedido,
          regras: { valorDoPonto: cfg.redeem_points_value, minimo: cfg.redeem_min_points, tetoPct: cfg.redeem_max_pct },
        })
        if (r.motivo) return { error: r.motivo }
        pontos = r.pontos; desconto = r.desconto; valorFinal = r.restante
      }
    }
    if (valorFinal > 0 && !paymentMethod) return { error: 'Selecione a forma de pagamento.' }

    // UMA transação no banco: o pagamento (dar baixa no recebível ou lançar),
    // o resgate dos pontos, a comissão (se a rede a quer sobre o valor pago) e a
    // linha do tempo. As travas de plano, pacote e "já pago" moram lá.
    const userName = ctx.userName || await getUserName(admin, ctx.userId)
    try {
      await gravar(admin.rpc('confirmar_pagamento_do_atendimento', {
        p_agendamento: appointmentId,
        p_tenant:      ctx.tenantId!,
        p_ator:        ctx.internalUserId,
        p_ator_nome:   userName,
        p_dados:       {
          metodo: valorFinal > 0 ? paymentMethod : null, pontos, desconto, valor_final: valorFinal,
          voucher_id: voucherId, desconto_voucher: descontoVoucher, desconto_venda: descontoVenda,
          cartao_vezes: valorFinal > 0 ? cartaoVezes : 1,
          cartao_bandeira: valorFinal > 0 ? cartaoBandeira : null,
          desconto_motivo: descontoVenda > 0 ? motivoDoDesconto : null,
        },
      }), 'confirmar o pagamento')
    } catch (e) {
      return { error: mensagemDoErro(e) }
    }

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidatePath(`/${slug}/financeiro`)
    revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
    notifyPayment(appointmentId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/**
 * O que o modal de pagamento precisa para oferecer a fidelidade: o saldo e as
 * regras dos pontos, e os vouchers do cliente que servem NESTE atendimento (com
 * o desconto de cada um). Nulo = nada a oferecer (programa desligado, sem saldo
 * e sem voucher).
 */
export async function previaDoPagamento(appointmentId: string): Promise<{
  saldo:        number
  valorDoPonto: number
  minimo:       number
  tetoPct:      number
  maximo:       number
  vouchers:     { id: string; name: string; desconto: number; expires_at: string }[]
} | null> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'cashier', 'MANAGE')
  const admin = createAdminClient()

  const appt = await ler(admin
    .from('appointments')
    .select('client_id, procedure_id, price, branch_id, branches!inner(tenant_id)')
    .eq('id', appointmentId)
    .maybeSingle(), 'buscar o agendamento')
  const rede = (appt?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  if (!appt || rede !== ctx.tenantId || !alcancaUnidade(ctx, appt.branch_id as string)) return null

  const cfg = await configDaRede(ctx.tenantId!, admin)
  if (!cfg.enabled) return null
  const preco = parseFloat(String(appt.price))
  const [saldoLido, meus] = await Promise.all([
    saldoDoCliente(appt.client_id as string, cfg.scope_per_branch ? appt.branch_id as string : null, admin),
    ler(admin.from('loyalty_vouchers')
      .select('id, name, type, status, expires_at, procedure_id, discount_value, branch_id')
      .eq('client_id', appt.client_id as string).eq('tenant_id', ctx.tenantId!).eq('status', 'ATIVO'),
      'buscar os vouchers do cliente'),
  ])
  const vouchers = ((meus ?? []) as (VoucherParaCalculo & { id: string; name: string; branch_id: string })[])
    .filter(v => !cfg.scope_per_branch || v.branch_id === appt.branch_id)
    .map(v => ({ v, d: descontoDoVoucher(v, { procedureId: appt.procedure_id as string | null, preco }) }))
    .filter(({ d }) => !d.motivo && d.desconto > 0)
    .map(({ v, d }) => ({ id: v.id, name: v.name, desconto: d.desconto, expires_at: v.expires_at }))

  const saldo = cfg.redeem_points_value > 0 ? Math.max(0, saldoLido) : 0
  if (saldo <= 0 && vouchers.length === 0) return null

  const regras = { valorDoPonto: cfg.redeem_points_value, minimo: cfg.redeem_min_points, tetoPct: cfg.redeem_max_pct }
  return { saldo, ...regras, maximo: maximoDePontos(saldo, preco, regras), vouchers }
}

// --- Salvar rascunho de notas (sem concluir) ---------------------
/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function saveDraftNotes(
  ...args: Parameters<typeof saveDraftNotesInterno>
): ReturnType<typeof saveDraftNotesInterno> {
  try {
    return await saveDraftNotesInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function saveDraftNotesInterno(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'VIEW')
    if (!can(ctx, 'medical_records', 'MANAGE')) {
      return { error: 'A evolução é prontuário: é preciso ter o módulo Prontuário para gerenciar.' }
    }

    const appointmentId  = (formData.get('appointment_id') as string)?.trim()
    const notes          = (formData.get('notes') as string)?.trim() || null
    const intercurrences = (formData.get('intercurrences') as string)?.trim() || null

    const admin = createAdminClient()
    const appt = await ler(admin
      .from('appointments')
      .select('id, status, client_id, professional_id, branches!inner(id, tenant_id)')
      .eq('id', appointmentId)
      .single(), 'buscar o agendamento')

    const apptBranch = appt?.branches as unknown as { id: string; tenant_id: string } | null
    // O DELA numa unidade em que atende também (decisão 2 da 8ª simulação).
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId || !alcancaOAgendamento(ctx, apptBranch.id, appt.professional_id as string | null)) return { error: 'Agendamento não encontrado.' }
    // A evolução do atendimento de OUTRA, com a agenda "só os meus" (D4, 2026-10-28).
    if (deOutroProfissional(ctx, appt.professional_id as string | null)) return { error: DE_OUTRO_PROFISSIONAL }

    // Profissional não pode editar registro já finalizado
    const isFinalised = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status as string)
    const isAdmin     = ctx.permissions.agenda === 'MANAGE'
    if (isFinalised && !isAdmin) return { error: 'Registro finalizado. Apenas gerentes podem editar.' }

    // Get or create medical_records
    let medRecord = await ler(admin
      .from('medical_records')
      .select('id')
      .eq('client_id', appt.client_id)
      .maybeSingle(), 'buscar o prontuário do cliente')

    if (!medRecord) {
      const newRecord = await ler(admin
        .from('medical_records')
        .insert({ client_id: appt.client_id })
        .select('id')
        .single(), 'abrir o prontuário do cliente')
      medRecord = newRecord
    }

    if (medRecord) {
      await gravar(admin.from('medical_record_entries').upsert({
        medical_record_id: medRecord.id,
        appointment_id:    appointmentId,
        professional_id:   appt.professional_id,
        notes,
        intercurrences,
      }, { onConflict: 'appointment_id' }), 'salvar o rascunho do prontuário')
    }

    // Log quando admin edita pós-conclusão
    if (isFinalised && isAdmin) {
      const userName = ctx.userName || await getUserName(admin, ctx.userId)
      await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'EDITED',
        'Observações do atendimento editadas pelo gerente')
    }

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Reagendar ----------------------------------------------------
export async function rescheduleAppointment(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')

    const appointmentId  = formData.get('_appointmentId') as string
    const scheduledAt    = formData.get('scheduled_at') as string
    const professionalId = formData.get('professional_id') as string
    const slug           = formData.get('_slug') as string

    if (!appointmentId || !scheduledAt) return { error: 'Dados inválidos.' }

    // O núcleo (lib/appointments/alteracoes.ts) é o mesmo do Copilot — e
    // agora confere o conflito do profissional, que a remarcação não conferia.
    const r = await remarcarCore(createAdminClient(), ctx, { appointmentId, scheduledAt, professionalId: professionalId || null })
    if ('error' in r) return { error: r.error }

    if (slug) revalidatePath(`/${slug}/agenda`)
    revalidatePath('/admin/agenda')
    revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
    notifyRescheduledAppointment(appointmentId, ctx.internalUserId)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// -- Dados de agendamento pelo checkout ---------------------------------------

export async function getSchedulingBranchProfessionals(
  branchId: string,
): Promise<{ professionals: { id: string; name: string }[] }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  const branch = await ler(admin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a unidade')
  if (!branch || !alcancaUnidade(ctx, branchId)) return { professionals: [] }

  const data = await getCachedBranchProfessionals(branchId, ctx.tenantId!)

  return { professionals: data as { id: string; name: string }[] }
}

// --- Sessões de pacote --------------------------------------------

export async function getPlannedSessionAppointments(planId: string): Promise<{
  sessions: Array<{
    id:               string
    sessionNumber:    number
    status:           string
    appointmentId:    string | null
    scheduledAt:      string | null
    apptStatus:       string | null
    professionalName: string | null
    procedureName:    string | null
    procedureId:      string
    /** A duração DELA (a soma dos procedimentos — D5 da 9ª): a grade do agendar mede o horário com ela. */
    durationMin:      number
  }>
}> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  const plan = await ler(admin
    .from('treatment_plans')
    .select('branch_id')
    .eq('id', planId)
    .maybeSingle(), 'buscar o plano de tratamento')
  if (!plan) return { sessions: [] }

  const branch = await ler(admin
    .from('branches')
    .select('tenant_id')
    .eq('id', (plan as { branch_id: string }).branch_id)
    .maybeSingle(), 'buscar a unidade')
  if ((branch as { tenant_id: string } | null)?.tenant_id !== ctx.tenantId
    || !alcancaUnidade(ctx, (plan as { branch_id: string }).branch_id)) return { sessions: [] }

  // Busca treatment_plan_sessions com appointment vinculado
  const rawSessions = await ler(admin
    .from('treatment_plan_sessions')
    .select(`
      id, sort_order, appointment_id,
      treatment_plan_session_procedures(procedure_id, sort_order, procedures(name, duration_min)),
      appointments:appointment_id(id, status, scheduled_at, professional:users!professional_id(name))
    `)
    .eq('plan_id', planId)
    .order('sort_order'), 'carregar as sessões do plano')

  type RawSessProc = { procedure_id: string; sort_order: number; procedures: { name: string; duration_min: number | null } | null }
  type RawAppt = { id: string; status: string; scheduled_at: string; professional: { name: string } | null } | null
  type RawSess = { id: string; sort_order: number; appointment_id: string | null; treatment_plan_session_procedures: RawSessProc[]; appointments: RawAppt }

  const sessions = ((rawSessions ?? []) as unknown as RawSess[]).map((s, i) => {
    const procs = (s.treatment_plan_session_procedures ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
    const firstProc  = procs[0]
    const procNames  = procs.map(p => (p.procedures as { name?: string } | null)?.name ?? '—').join(' + ')
    const appt       = s.appointments
    const apptStatus = appt?.status ?? null
    const status     = apptStatus ?? 'AVAILABLE'

    return {
      id:               s.id,
      sessionNumber:    i + 1,
      status,
      appointmentId:    s.appointment_id ?? null,
      scheduledAt:      appt?.scheduled_at ?? null,
      apptStatus,
      professionalName: appt?.professional?.name ?? null,
      procedureName:    procNames || '—',
      procedureId:      firstProc?.procedure_id ?? '',
      durationMin:      procs.reduce((t, p) => t + ((p.procedures as { duration_min?: number | null } | null)?.duration_min ?? 60), 0),
    }
  })

  return { sessions }
}

/** Linha de `package_sessions` com o agendamento embutido, como o select a pede. */
interface SessaoDePacoteLida {
  id: string
  session_number: number
  status: string
  appointment_id: string | null
  procedure_id: string | null
  procedures: { name: string; duration_min: number | null } | null
  appointments: { status: string; scheduled_at: string; professional: { name: string } | null } | null
}

export async function getClientPackageSessions(clientPackageId: string): Promise<{
  sessions: Array<{
    id:             string
    sessionNumber:  number
    status:         string
    appointmentId:  string | null
    scheduledAt:    string | null
    apptStatus:     string | null
    professionalName: string | null
    /** O procedimento DESTA sessão: o pacote é um conjunto de procedimentos. */
    procedureId:    string | null
    procedureName:  string | null
  }>
}> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  // Valida que o client_package pertence ao tenant
  const pkg = await ler(admin
    .from('client_packages')
    .select('id, branch_id, branches!inner(id, tenant_id)')
    .eq('id', clientPackageId)
    .maybeSingle(), 'buscar o pacote do cliente')
  if (!pkg) return { sessions: [] }
  const branch = (pkg as unknown as { branches: { tenant_id: string } | null }).branches
  if (branch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, pkg.branch_id as string)) return { sessions: [] }

  const data = await ler(admin
    .from('package_sessions')
    .select('id, session_number, status, appointment_id, procedure_id, procedures(name, duration_min), appointments(status, scheduled_at, professional:users!professional_id(name))')
    .eq('client_package_id', clientPackageId)
    .order('session_number'), 'buscar as sessões do pacote')

  return {
    sessions: ((data ?? []) as unknown as SessaoDePacoteLida[]).map(s => ({
      id:              s.id,
      sessionNumber:   s.session_number,
      status:          s.status,
      appointmentId:   s.appointment_id,
      scheduledAt:     s.appointments?.scheduled_at ?? null,
      apptStatus:      s.appointments?.status ?? null,
      professionalName: s.appointments?.professional?.name ?? null,
      procedureId:     s.procedure_id,
      procedureName:   s.procedures?.name ?? null,
    })),
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
export async function schedulePackageSession(
  ...args: Parameters<typeof schedulePackageSessionInterno>
): ReturnType<typeof schedulePackageSessionInterno> {
  try {
    return await schedulePackageSessionInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function schedulePackageSessionInterno(params: {
  packageSessionId: string
  branchId:         string
  professionalId:   string
  scheduledAt:      string
  clientId:         string
  procedureId:      string
  /** Ignorados: o preço e a duração são os da sessão (lidos no servidor). */
  price:            number
  durationMin:      number
  slug:             string
  /** A sala, opcional (A24 da 6ª simulação): o núcleo confere a unidade, o procedimento e o horário. */
  roomId?:          string | null
}): Promise<{ error?: string; appointmentId?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  const admin = createAdminClient()

  // Valida sessão pertence ao tenant
  const sess = await ler(admin
    .from('package_sessions')
    .select('id, appointment_id, client_package_id, procedure_id, preco, procedures(duration_min), client_packages!inner(branch_id, client_id, branches!inner(tenant_id))')
    .eq('id', params.packageSessionId)
    .maybeSingle(), 'buscar a sessão do plano')
  if (!sess) return { error: 'Sessão não encontrada.' }
  type SessWithJoins = {
    appointment_id: string | null; procedure_id: string | null; preco: number | null
    procedures: { duration_min: number | null } | null
    client_packages: { branch_id: string; client_id: string; branches: { tenant_id: string } | null } | null
  }
  const typedSess = sess as unknown as SessWithJoins
  const pacote = typedSess.client_packages
  if (pacote?.branches?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, pacote.branch_id)) return { error: 'Sem permissão.' }
  if (typedSess.appointment_id) return { error: 'Sessão já está agendada.' }
  // O cliente é o DO PACOTE, e unidade, profissional e procedimento são da
  // rede: até 2026-09-28 os quatro iam do navegador direto para o insert.
  if (params.clientId !== pacote.client_id) return { error: 'Cliente não confere com o pacote.' }
  // O pacote é um conjunto de procedimentos: a sessão já diz de qual é, e o
  // navegador não escolhe outro.
  if (typedSess.procedure_id && params.procedureId !== typedSess.procedure_id) {
    return { error: 'Esta sessão do pacote é de outro procedimento.' }
  }

  // Pelo NÚCLEO, com a sessão como crédito (2026-09-30). Antes era um insert
  // direto: a tela escondia o horário ocupado, mas só olhava o INÍCIO (uma
  // sessão de 60 min às 10:00 passava por cima de outra às 10:30), e o
  // servidor não conferia nada — duas recepções ao mesmo tempo, ou a action
  // chamada direto, encavalavam. O núcleo confere a sobreposição com a
  // duração, grava o histórico e emite o evento; o preço e a duração são os
  // da sessão (a parte dela na venda), e a ligação é compare-and-swap.
  const res = await createAppointmentCore(admin, ctx, {
    branchId:       params.branchId,
    clientId:       params.clientId,
    procedureId:    typedSess.procedure_id ?? params.procedureId,
    professionalId: params.professionalId,
    scheduledAt:    params.scheduledAt,
    roomId:         params.roomId ?? null,
    credito:        { tipo: 'PACOTE', id: params.packageSessionId },
    source:         'INTERNAL',
  })
  if ('error' in res) return { error: res.error }
  const appt = { id: res.id }

  revalidatePath(`/${params.slug}/clients/${params.clientId}`)
  revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
  notifyNewAppointment(appt.id, ctx.internalUserId)
  return { appointmentId: appt.id }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function schedulePlanSession(
  ...args: Parameters<typeof schedulePlanSessionInterno>
): ReturnType<typeof schedulePlanSessionInterno> {
  try {
    return await schedulePlanSessionInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function schedulePlanSessionInterno(params: {
  planId:         string
  sessionId:      string
  branchId:       string
  professionalId: string
  scheduledAt:    string
  clientId:       string
  procedureId:    string
  /** Ignorados (D5 da 9ª): o preço e a duração são os da sessão, lidos no servidor. */
  price:          number
  durationMin:    number
  slug:           string
  /** A sala, opcional (A24 da 6ª simulação): da unidade, que serve ao procedimento, livre no horário. */
  roomId?:        string | null
}): Promise<{ error?: string; appointmentId?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  const admin = createAdminClient()

  const plan = await ler(admin
    .from('treatment_plans')
    .select('id, branch_id, client_id, branches!inner(id, tenant_id)')
    .eq('id', params.planId)
    .maybeSingle(), 'buscar o plano de tratamento')
  if (!plan) return { error: 'Plano não encontrado.' }
  if ((plan as unknown as { branches: { tenant_id: string } | null }).branches?.tenant_id !== ctx.tenantId
    || !alcancaUnidade(ctx, plan.branch_id as string)) return { error: 'Sem permissão.' }
  // A sessão é DESTE plano e ainda não foi marcada; o cliente é o do plano; e
  // unidade, profissional e procedimento são da rede. Até 2026-09-28 qualquer
  // sessão servia, e os ids iam do navegador direto para o insert.
  const sessao = await ler(admin.from('treatment_plan_sessions').select('id, appointment_id')
    .eq('id', params.sessionId).eq('plan_id', params.planId).maybeSingle(), 'buscar a sessão do plano')
  if (!sessao) return { error: 'Sessão não encontrada neste plano.' }
  if (sessao.appointment_id) return { error: 'Sessão já está agendada.' }
  if (params.clientId !== plan.client_id) return { error: 'Cliente não confere com o plano.' }

  // Pelo NÚCLEO, com a sessão do plano como crédito (D5 e A18 da 9ª simulação,
  // 2026-11-07), como a sessão do pacote: o procedimento, o PREÇO e a DURAÇÃO
  // são os da SESSÃO, lidos no servidor (o modal mandava os da sessão vizinha —
  // a drenagem nasceu a R$ 585 e 60 min da criolipólise); o procedimento que o
  // navegador manda tem de ser o dela. O núcleo confere as peças, a sala, o
  // conflito com a duração, grava o histórico e o evento, e liga a sessão por
  // compare-and-swap.
  const res = await createAppointmentCore(admin, ctx, {
    branchId:       params.branchId,
    clientId:       params.clientId,
    procedureId:    params.procedureId,
    professionalId: params.professionalId,
    scheduledAt:    params.scheduledAt,
    roomId:         params.roomId || null,
    credito:        { tipo: 'PLANO', id: params.sessionId },
    source:         'INTERNAL',
  })
  if ('error' in res) return { error: res.error }
  const appt = { id: res.id }

  revalidatePath(`/${params.slug}/clients/${params.clientId}`)
  revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
  notifyNewAppointment(appt.id, ctx.internalUserId)
  return { appointmentId: appt.id }
}

// --- Portal do cliente: slots disponíveis ------------------------
export async function getClientAvailableSlots(
  branchId: string,
  /** Nulo = "Sem preferência" (D-16): os horários de todas as que atendem na unidade, juntos. */
  professionalId: string | null,
  date: string,
  durationMin: number,
  /** O procedimento: o "Sem preferência" junta só quem o realiza (por-01). */
  procedureId?: string | null,
): Promise<{ slots: string[] }> {
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  // O cliente final não tem rede no JWT (§5): a rede é a da ficha dele. Sem
  // isto, a agenda ocupada de qualquer unidade de qualquer rede respondia.
  const cliente = await ler(admin
    .from('clients').select('tenant_id').eq('id', ctx.clientId!).maybeSingle(), 'buscar o cliente')
  const branch = await ler(admin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', cliente?.tenant_id ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle(), 'buscar a unidade')
  if (!branch) return { slots: [] }

  if (!professionalId) {
    const candidatas = await candidatasDoDia(admin, cliente!.tenant_id as string, branchId, date, durationMin, procedureId)
    return { slots: juntarHorarios(candidatas.map(c => c.livres)) }
  }
  const slots = await computeAvailableSlots(admin, branchId, professionalId, date, durationMin)
  return { slots }
}

// --- Portal do cliente: criar agendamento self-service ------------
export async function createClientAppointment(params: {
  branchId:       string
  procedureId:    string
  /** Nulo = "Sem preferência" (D-16): o sistema escolhe quem está livre, com menos atendimentos no dia. */
  professionalId: string | null
  scheduledAt:    string
  slug:           string
}): Promise<{ error?: string; id?: string; documentosParaAssinar?: number; /** Quem ficou com o horário (A48: o "Sem preferência" não dizia). */ quemAtende?: string }> {
  try {
    const ctx = await getTenantContext()
    assertClient(ctx)

    const admin = createAdminClient()

    // A action confere o MESMO que a tela oferece — ela é endpoint público e o
    // cliente pode chamá-la com o que quiser. Até 2026-09-27 ela aceitava
    // unidade de outra rede, procedimento inativo ou de outra unidade, e
    // qualquer instante: no passado, de madrugada, fora da grade.
    //
    // O cliente final não tem rede no JWT (§5): a rede é a da ficha dele.
    const cliente = await ler(admin
      .from('clients').select('tenant_id, is_active').eq('id', ctx.clientId!).maybeSingle(), 'buscar o cliente')
    if (!cliente) return { error: 'Cadastro não encontrado.' }
    // A arquivada não agenda pelo app (o Heitor: "concordo", F6 da 5ª
    // simulação): a tela já mostra "Fale com a clínica", e a action recusa.
    if (cliente.is_active === false) return { error: CLIENTE_ARQUIVADA_NO_APP }

    // A unidade é QUALQUER ativa da clínica da ficha, não só a de cadastro (H5).
    const branch = await ler(admin
      .from('branches')
      .select('tenant_id')
      .eq('id', params.branchId)
      .eq('tenant_id', cliente.tenant_id as string)
      .eq('is_active', true)
      .maybeSingle(), 'buscar a unidade')
    if (!branch) return { error: 'Unidade não encontrada.' }

    // Catálogo da rede (branch_id nulo) ou local da unidade, ativo e marcado
    // para o app — a mesma consulta da página.
    const procedure = await ler(admin
      .from('procedures')
      .select('id, price, duration_min')
      .eq('id', params.procedureId)
      .eq('tenant_id', branch.tenant_id as string)
      .eq('is_active', true)
      .eq('visible_on_client_app', true)
      .or(`branch_id.is.null,branch_id.eq.${params.branchId}`)
      .maybeSingle(), 'buscar o procedimento')
    if (!procedure) return { error: 'Procedimento não disponível.' }

    // O que ela JÁ PAGOU deste procedimento (2026-10-21, decisão do Heitor): a
    // sessão livre de um plano vendido, ou o crédito de pacote/pré-pago. Sem
    // isso, o agendamento nascia avulso e o checkout cobraria de novo. Vem
    // ANTES da grade (sobra da F41): a sessão do plano dura a soma dos
    // procedimentos dela, e é essa a duração que tem de caber no horário.
    const pago = await pagoParaAgendar(admin, cliente.tenant_id as string, ctx.clientId!, params.procedureId)
    const creditoDoPago = pago?.tipo === 'CREDITO' ? pago.credito
      : pago?.tipo === 'PLANO' ? { tipo: 'PLANO' as const, id: pago.sessionId } : null
    let duracao = Number(procedure.duration_min)
    if (creditoDoPago?.tipo === 'PLANO') {
      const c = await conferirCredito(admin, cliente.tenant_id as string, ctx.clientId!, creditoDoPago)
      if (!('error' in c) && c.duracaoMin) duracao = c.duracaoMin
    }

    // O horário tem de ser um dos que a tela ofereceu: futuro e livre na grade
    // de `computeAvailableSlots` — que já desconta os agendamentos existentes,
    // e por isso também é a guarda contra dois clientes no mesmo horário.
    const inicio = new Date(params.scheduledAt)
    if (Number.isNaN(inicio.getTime()) || inicio.getTime() <= Date.now()) {
      return { error: 'Escolha um horário a partir de agora.' }
    }
    const p = partsInTZ(inicio)
    const hora = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    if (p.second !== 0) return { error: 'Este horário não está mais disponível. Escolha outro.' }

    // "Sem preferência" (D-16): quem está livre neste horário, com menos
    // atendimentos no dia — entre as que atendem na unidade, a mesma lista e
    // os mesmos livres da tela. Depois, a escolhida passa pelas MESMAS
    // conferências de quem foi escolhida pela cliente.
    let professionalId = params.professionalId
    if (!professionalId) {
      const candidatas = await candidatasDoDia(admin, branch.tenant_id as string, params.branchId, dayKeyTZ(inicio), duracao, params.procedureId)
      professionalId = escolherQuemAtende(candidatas, hora)
      if (!professionalId) return { error: 'Este horário não está mais disponível. Escolha outro.' }
    }

    // Quem atende é marcado por `provides_services`, e a da REDE atende em
    // toda unidade (D1, 2026-10-28): é a lista que a tela ofereceu.
    const { data: prof, error: profErr } = await admin
      .from('users')
      .select('id, name')
      .eq('id', professionalId)
      .eq('tenant_id', branch.tenant_id as string)
      .or(filtroDeQuemAtendeNaUnidade(params.branchId))
      .eq('provides_services', true)
      .eq('is_active', true)
      .maybeSingle()
    if (profErr) return { error: `Erro ao validar o profissional: ${profErr.message}` }
    if (!prof)   return { error: 'Profissional não disponível.' }
    // Só quem REALIZA o procedimento (por-01; sem ninguém marcado, todas).
    if (!realiza(await quemRealizaOProcedimento(admin, params.procedureId), professionalId)) return { error: NAO_REALIZA }

    const livres = await computeAvailableSlots(
      admin, params.branchId, professionalId, dayKeyTZ(inicio), duracao,
    )
    if (!livres.includes(hora)) {
      return { error: 'Este horário não está mais disponível. Escolha outro.' }
    }

    // O NÚCLEO da agenda da clínica grava (por-05, revisão do Heitor de
    // 2026-11-02: "passar pelas mesmas regras da agenda da clínica"): as peças
    // da rede e a arquivada (`conferirPecasDoAgendamento`), o conflito de
    // profissional (`horarioOcupado`), o preço, o crédito pré-pago/pacote, a
    // oportunidade aberta e o evento "agendamento criado" — que o app não
    // emitia. A cliente não tem rede no JWT (§5): a rede é a da ficha.
    //
    // A sessão do plano passa pelo MESMO crédito `PLANO` da equipe (sobra da
    // F41, 9ª simulação): o núcleo grava o preço, a DURAÇÃO e o plano da
    // sessão e a liga por compare-and-swap. Ligava-se depois, à mão, com a
    // duração do procedimento. Quem perde a disputa pelo crédito (outro
    // agendamento o pegou no meio) agenda sem ele — como antes, avulso.
    const agendar = (credito: typeof creditoDoPago) => createAppointmentCore(admin, { ...ctx, tenantId: cliente.tenant_id as string, branchId: null }, {
      branchId:       params.branchId,
      clientId:       ctx.clientId!,
      procedureId:    params.procedureId,
      professionalId: professionalId!,
      scheduledAt:    params.scheduledAt,
      source:         'CLIENT_APP',
      credito,
      // "Sem preferência" (A59): o remarcar do app começa por aí.
      semPreferencia: !params.professionalId,
    })
    let criado = await agendar(creditoDoPago)
    if ('error' in criado && creditoDoPago && criado.error === CREDITO_JA_USADO) criado = await agendar(null)
    if ('error' in criado) return { error: criado.error === CLIENTE_ARQUIVADA ? CLIENTE_ARQUIVADA_NO_APP : criado.error }
    const appt = criado

    revalidatePath(`/${params.slug}/cliente/agendamentos`)
    // Marcado pelo proprio cliente no portal: nao ha ator da equipe a excluir.
    notifyNewAppointment(appt.id as string)
    // O gatilho já emitiu os documentos que nascem ao agendar (§9.4.1): o
    // portal leva o cliente direto a eles.
    const documentosParaAssinar = await contar(admin.from('issued_documents').select('id', { count: 'exact', head: true })
      .eq('appointment_id', appt.id as string).in('status', ['A_GERAR', 'PENDENTE', 'INCOMPLETO']), 'contar os documentos do agendamento')
    return { id: appt.id as string, documentosParaAssinar, quemAtende: (prof.name as string | null) ?? undefined }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

export async function getSchedulingDaySlots(
  branchId: string,
  professionalId: string,
  date: string,
  /**
   * A sala escolhida (A17 da 9ª): o bloqueio DELA também risca a grade — o da
   * profissional riscava, e a sala bloqueada o dia inteiro parecia livre.
   */
  roomId?: string | null,
): Promise<{
  slots: { scheduledAt: string; durationMin: number; clientName: string | null }[]
  /** Os bloqueios da profissional no dia (D5 da 8ª): a grade não os oferece. */
  bloqueios?: { inicio: string; fim: string; motivo: string }[]
  /** Os horários de funcionamento: a grade do checkout e das sessões do plano cobre a janela da unidade e marca a do profissional (D8). */
  horarioDaUnidade?: Horario | null
  horarioDoProfissional?: Horario | null
}> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  const branch = await ler(admin
    .from('branches')
    .select('id, horario')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a unidade')
  if (!branch || !alcancaUnidade(ctx, branchId)) return { slots: [] }

  // Brazil UTC-3
  const dayStart = new Date(`${date}T00:00:00-03:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59-03:00`).toISOString()
  // Desde a véspera: o atendimento da noite anterior pode atravessar a meia-noite.
  const desdeAVespera = new Date(new Date(dayStart).getTime() - 86_400_000).toISOString()

  // D5 da 8ª simulação: os agendamentos DELA em qualquer unidade da rede (a
  // da rede atende em todas — o servidor recusa o choque em qualquer uma, a
  // regra de `horarioOcupado`) e os bloqueios dela. A grade testa o intervalo
  // inteiro contra os dois (`ocupanteDoHorario`, lib/agenda/horario-livre).
  const sala = roomId && /^[0-9a-f-]{36}$/i.test(roomId)
    ? await ler(admin.from('rooms').select('id, name').eq('id', roomId).eq('branch_id', branchId).maybeSingle(), 'buscar a sala') as { id: string; name: string } | null
    : null
  const [data, prof, bloqueios] = await Promise.all([
    ler(admin
      .from('appointments')
      .select('scheduled_at, duration_min, status, completed_at, branch_id, clients(name), branches!inner(tenant_id)')
      .eq('branches.tenant_id', ctx.tenantId!)
      .eq('professional_id', professionalId)
      .gte('scheduled_at', desdeAVespera)
      .lte('scheduled_at', dayEnd)
      .not('status', 'in', '("CANCELLED","NO_SHOW")')
      .order('scheduled_at'), 'carregar os agendamentos'),
    // O horário do profissional (da rede): sem ele, segue a unidade.
    ler(admin.from('users').select('horario')
      .eq('id', professionalId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o horário do profissional') as Promise<{ horario: unknown } | null>,
    bloqueiosDoPeriodo(ctx.tenantId!, { de: dayStart, ate: dayEnd, profissionais: [professionalId], salas: sala ? [sala.id] : [] }, admin),
  ])

  type Linha = { scheduled_at: string; duration_min: number; status: string; completed_at: string | null; branch_id: string; clients: { name: string } | null }
  return {
    slots: ((data ?? []) as unknown as Linha[]).map(d => ({
      scheduledAt: d.scheduled_at,
      // Até quando OCUPA (o concluído adiantado libera o resto — A31).
      durationMin: Math.max(0, Math.round((fimDaOcupacao(d) - new Date(d.scheduled_at).getTime()) / 60_000)),
      // O nome da cliente só da agenda desta unidade; o de outra unidade diz só que está ocupado.
      clientName:  d.branch_id === branchId ? (d.clients?.name ?? null) : null,
    })),
    // O da sala diz que é da sala ("Sala Rosa: Manutenção").
    bloqueios: bloqueios.map(b => ({ inicio: b.inicio, fim: b.fim, motivo: b.roomId && sala ? `${sala.name}: ${b.motivo}` : b.motivo })),
    horarioDaUnidade:      normalizarHorario((branch as { horario?: unknown }).horario),
    horarioDoProfissional: normalizarHorario(prof?.horario),
  }
}

// --- Cliente confirma o atendimento (substitui a ficha de papel) + avalia -------
//
// F17-3 (o Heitor: "a ser configurado pela clínica, mas, a princípio,
// avaliação do atendimento e avaliação por procedimento também"): a nota do
// ATENDIMENTO (`professionalRating`, o client_rating — vale para a
// profissional) e uma para CADA procedimento feito nele
// (`notasDosProcedimentos`), conforme a clínica pede
// (`tenants.avaliacao_o_que`). `procedureRating` é o caminho de antes: a nota
// do procedimento do agendamento. Tudo grava numa transação
// (`avaliar_atendimento`), com o agendamento travado.
export async function confirmAndRateAppointment(params: {
  appointmentId:      string
  slug:               string
  professionalRating?: number | null
  procedureRating?:    number | null
  notasDosProcedimentos?: { procedureId: string; nota: number }[] | null
  feedback?:           string | null
}): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertClient(ctx)

    const admin = createAdminClient()

    const appt = await ler(admin
      .from('appointments')
      .select('id, client_id, professional_id, procedure_id, status, client_confirmed_at, procedures(name)')
      .eq('id', params.appointmentId)
      .maybeSingle(), 'buscar o agendamento')

    if (!appt || appt.client_id !== ctx.clientId) return { error: 'Atendimento não encontrado.' }
    if (appt.status !== 'COMPLETED')               return { error: 'Este atendimento ainda não foi concluído.' }
    if (appt.client_confirmed_at)                  return { error: 'Você já confirmou este atendimento.' }

    // Notas são opcionais; quando enviadas, precisam estar entre 1 e 5.
    const clean = (r?: number | null): number | null => {
      if (r == null) return null
      const n = Math.round(Number(r))
      if (!Number.isFinite(n) || n < 1 || n > 5) return null
      return n
    }
    const professionalRating = clean(params.professionalRating)
    const pedidas = [
      ...(params.notasDosProcedimentos ?? []),
      // O caminho de antes: a nota do procedimento do agendamento.
      ...(params.procedureRating != null && appt.procedure_id ? [{ procedureId: appt.procedure_id as string, nota: params.procedureRating }] : []),
    ]
    const notas: { procedure_id: string; nota: number }[] = []
    for (const p of pedidas) {
      const nota = clean(p.nota)
      if (nota == null || typeof p.procedureId !== 'string') continue
      if (notas.some(n => n.procedure_id === p.procedureId)) continue
      notas.push({ procedure_id: p.procedureId, nota })
    }
    const feedback = params.feedback?.trim() ? params.feedback.trim().slice(0, 1000) : null

    // A transação recusa o procedimento que não foi feito no atendimento e
    // grava só o que a clínica pede (a configuração é lida lá dentro).
    const { error } = await admin.rpc('avaliar_atendimento', {
      p_appointment: params.appointmentId, p_client: ctx.clientId!, p_nota_atendimento: professionalRating,
      p_comentario: feedback, p_notas: notas,
    })
    if (error) {
      if (error.code === 'P0001') return { error: error.message }
      return { error: 'Não consegui confirmar o atendimento. Tente de novo.' }
    }

    revalidatePath(`/${params.slug}/cliente/home`)
    revalidatePath(`/${params.slug}/cliente/historico`)

    // Avisa o profissional que o cliente confirmou/avaliou (não bloqueia a resposta).
    const professionalId = (appt.professional_id ?? null) as string | null
    const procedureName  = ((appt.procedures as unknown as { name?: string } | null)?.name ?? 'Atendimento')
    if (professionalId) {
      after(async () => {
        const a = createAdminClient()
        const stars = professionalRating ? ` (${professionalRating}★)` : ''
        await notifyUser(a, professionalId, {
          type: 'appointment_completed',
          title: 'Atendimento confirmado',
          body: `O cliente confirmou o ${procedureName}${stars}.`,
          data: { appointment_id: params.appointmentId },
        })
      })
    }

    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Apoio ao modal de agendamento --------------------------------
//
// A agenda da REDE não tem "a filial atual": a unidade é escolhida na hora, e
// procedimentos, profissionais e salas mudam com ela. Por isso estes dados vêm
// sob demanda, em vez de virem prontos da página como no portal da unidade.

export interface DadosParaAgendar {
  /** `realizam`: quem realiza (por-01; vazio = todas). */
  procedures:    { id: string; name: string; category: string; duration_min: number; price: number; realizam?: string[] }[]
  professionals: { id: string; name: string }[]
  rooms:         { id: string; name: string }[]
  slug:          string
}

export async function dadosParaAgendar(branchId: string): Promise<DadosParaAgendar> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')

  const vazio: DadosParaAgendar = { procedures: [], professionals: [], rooms: [], slug: '' }
  if (!branchId) return vazio

  const admin = createAdminClient()
  const branch = await ler(admin
    .from('branches')
    .select('id, slug')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a unidade')
  if (!branch || !alcancaUnidade(ctx, branchId)) return vazio

  const [procedures, professionals, rooms] = await Promise.all([
    getCachedBranchProcedures(branchId, ctx.tenantId!),
    getCachedBranchProfessionals(branchId, ctx.tenantId!),
    getCachedRoomsByBranch(branchId, ctx.tenantId!),
  ])

  type Proc = { id: string; name: string; category: string; duration_min: number; price: number; realizam?: string[] }
  return {
    procedures: (procedures as Proc[]).map(p => ({
      id: p.id, name: p.name, category: p.category,
      duration_min: p.duration_min, price: Number(p.price), realizam: p.realizam ?? [],
    })),
    professionals: (professionals as { id: string; name: string }[]).map(p => ({ id: p.id, name: p.name })),
    rooms:         (rooms as { id: string; name: string }[]).map(r => ({ id: r.id, name: r.name })),
    slug:          branch.slug as string,
  }
}

/**
 * O próximo horário livre da profissional (A20, 2026-10-27): o novo
 * agendamento abria com a hora de agora, ocupada ou não. Hoje, a partir de
 * agora; sem vaga hoje (ou fechado), o primeiro livre dos dias seguintes — a
 * mesma conta da agenda (`computeAvailableSlots`: horário da unidade ∩ dela,
 * sem os ocupados). Devolve o horário como a tela o escreve (AAAA-MM-DDTHH:mm,
 * Brasília) ou `null`.
 */
export async function proximoHorarioLivre(
  branchId: string, professionalId: string, durationMin: number,
  /**
   * A partir de QUANDO (ISO): o choque do modal oferece o próximo livre depois
   * do horário escolhido (A21 da 8ª simulação), não o de agora.
   */
  aPartirDe?: string | null,
): Promise<string | null> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  if (!branchId || !professionalId) return null
  const admin = createAdminClient()
  if (!alcancaUnidade(ctx, branchId)) return null
  const recusa = await conferirPecasDoAgendamento(admin, ctx, { branchId, professionalId })
  if (recusa) return null
  const duracao = Number.isFinite(durationMin) && durationMin > 0 ? Math.min(Math.round(durationMin), 480) : 30
  const desde = typeof aPartirDe === 'string' && !Number.isNaN(new Date(aPartirDe).getTime()) && new Date(aPartirDe).getTime() > Date.now()
    ? new Date(aPartirDe) : null
  const diaDeInicio = dayKeyTZ(desde ?? new Date())
  const p = desde ? partsInTZ(desde) : null
  const horaDeInicio = p ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : null
  const achou = await procurarHorarioLivre(diaDeInicio, async data => {
    const livres = await computeAvailableSlots(admin, branchId, professionalId, data, duracao)
    return data === diaDeInicio && horaDeInicio ? livres.filter(h => h >= horaDeInicio) : livres
  })
  return achou ? `${achou.data}T${achou.hora}` : null
}

/**
 * As salas que o agendar oferece (D5, 2026-10-30): as da unidade que servem ao
 * procedimento (as ligadas a ele ali, ou todas), cada uma dizendo se está livre
 * no horário, e a sugerida — a primeira livre. A duração é a do procedimento
 * (a da tela só vale sem procedimento). O servidor confere de novo ao gravar.
 */
export async function salasParaAgendar(
  branchId: string, procedureId: string | null, scheduledAt: string | null, durationMin: number,
): Promise<{ salas: SalaParaAgendar[]; sugerida: string | null }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  return salasDoAgendar(ctx, branchId, procedureId, scheduledAt, durationMin)
}

/**
 * O que o modal avisa antes de confirmar (J-30, 2026-10-30): o encaixe fora do
 * horário da profissional e o choque com outro atendimento dela. Só aviso — o
 * encaixe é permitido, e o choque o núcleo recusa ao gravar.
 */
export async function avisosDoHorario(
  branchId: string, professionalId: string, scheduledAt: string, procedureId: string | null, durationMin: number,
  /** A sala escolhida (decisão 3 da 7ª): o bloqueio dela também avisa. */
  roomId?: string | null,
): Promise<AvisosDoHorario> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  return avisosDoHorarioCore(ctx, { branchId, professionalId, scheduledAt, procedureId, durationMin, roomId: typeof roomId === 'string' ? roomId : null })
}

/**
 * O que a janela da agenda avisa ANTES de remarcar (A25 e cli-01, 2026-11-02):
 * o horário novo fora do expediente da profissional e o choque com outro
 * atendimento dela (a conta do agendar, `avisosDoHorarioCore`, sem contar o
 * próprio agendamento), e a cliente ARQUIVADA ("avisar ao remarcar, sem
 * recusar" — revisão do Heitor). Só aviso: `remarcarCore` decide.
 */
export async function avisosDoRemarcar(appointmentId: string, scheduledAt: string): Promise<AvisosDoHorario & { clienteArquivada: string | null; passado?: string | null }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  const nada = { foraDoHorario: null, conflito: null, clienteArquivada: null }
  if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return nada
  const admin = createAdminClient()
  const a = await ler(admin.from('appointments')
    .select('branch_id, professional_id, procedure_id, duration_min, client_id, branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o agendamento') as {
      branch_id: string; professional_id: string | null; procedure_id: string | null; duration_min: number | null; client_id: string
    } | null
  if (!a || !alcancaOAgendamento(ctx, a.branch_id, a.professional_id) || deOutroProfissional(ctx, a.professional_id)) return nada
  const [avisos, ficha] = await Promise.all([
    a.professional_id
      ? avisosDoHorarioCore(ctx, {
          branchId: a.branch_id, professionalId: a.professional_id, scheduledAt, procedureId: a.procedure_id,
          durationMin: a.duration_min ?? 60, excluir: appointmentId,
        })
      : Promise.resolve({ foraDoHorario: null, conflito: null }),
    ler(admin.from('clients').select('name, is_active').eq('id', a.client_id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente') as Promise<{ name: string; is_active: boolean } | null>,
  ])
  return {
    ...avisos,
    // A24 da 11ª: o horário novo que já passou avisa (princípio 2: não recusa).
    passado: avisoDoHorarioPassado(scheduledAt),
    clienteArquivada: ficha && ficha.is_active === false
      ? `${ficha.name} está arquivada. Remarcar é permitido; para agendar de novo, reative a ficha (em "Mais ações").`
      : null,
  }
}

/**
 * Clientes que casam com o termo — nome ou telefone.
 *
 * A busca acontece no banco (`buscar_clientes`) porque o telefone precisa ser
 * comparado por dígitos: o cadastro guarda "(47) 99123-4567" e quem procura
 * digita "47991234567". E porque carregar a rede inteira na tela para filtrar
 * em JavaScript para de funcionar assim que a base cresce.
 */
/**
 * O cliente que chega pela URL do novo agendamento (`?cliente=`, a busca
 * universal e a ficha). O id é do navegador: o nome sai daqui, da rede da
 * sessão — nunca da URL. O agendamento confere de novo ao gravar.
 */
export async function clienteParaAgendar(clienteId: string): Promise<{ cliente: { id: string; name: string; phone: string } | null }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  if (typeof clienteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clienteId)) return { cliente: null }
  const c = await ler(createAdminClient().from('clients').select('id, name, phone')
    .eq('id', clienteId).eq('tenant_id', ctx.tenantId!).eq('is_active', true).maybeSingle(), 'buscar o cliente') as
    { id: string; name: string; phone: string | null } | null
  return { cliente: c ? { id: c.id, name: c.name, phone: c.phone ?? '' } : null }
}

export async function buscarClientesParaAgendar(termo: string): Promise<{
  clientes: { id: string; name: string; phone: string }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  const busca = termo?.trim() ?? ''
  if (busca.length < 2) return { clientes: [] }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('buscar_clientes', {
    p_tenant: ctx.tenantId!,
    p_termo:  busca,
    p_limite: 10,
  })
  if (error) return { clientes: [] }

  return {
    clientes: ((data ?? []) as { id: string; name: string; phone: string | null }[]).map(c => ({
      id: c.id, name: c.name, phone: c.phone ?? '',
    })),
  }
}

/**
 * O aviso do plano ao AGENDAR (D-18, "Reforça" item 12 da 5ª simulação): a
 * cliente tem plano proposto ou fechado com o MESMO procedimento — "A Rosana
 * tem um plano com Bioestimulador; agendar pelo plano?". Só aviso: o agendar
 * continua.
 */
export async function avisoDoPlanoAoAgendar(clientId: string, procedureId: string): Promise<{ texto: string; planId: string } | null> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')
    const uuid = /^[0-9a-f-]{36}$/i
    if (typeof clientId !== 'string' || !uuid.test(clientId) || typeof procedureId !== 'string' || !uuid.test(procedureId)) return null
    const admin = createAdminClient()
    const [planos, cli] = await Promise.all([
      planosComOProcedimento(admin, ctx.tenantId!, clientId, procedureId),
      ler(admin.from('clients').select('name').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a cliente') as Promise<{ name: string } | null>,
    ])
    const plano = planos[0]
    if (!plano || !cli) return null
    return { texto: textoDoPlano(nomeParaSaudar(cli.name), plano), planId: plano.id }
  } catch (e) {
    console.error('[agenda] aviso do plano:', mensagemDoErro(e))
    return null
  }
}

/**
 * D13 da 9ª simulação (decidido pelo princípio 3): o check-in de quem tem
 * parcela VENCIDA avisa — "Mariana tem 1 parcela vencida (R$ 1.294,00, desde
 * 05/11): receba no Financeiro." —, sem recusar a chegada. Só para quem recebe
 * (a A39 da 7ª: o saldo é de quem cuida do dinheiro). A conta é a de
 * `getAReceberVencido` (a do cartão "A receber da cliente"). Acessório: se a
 * leitura falha, a chegada vale e o motivo vai ao log.
 */
async function avisoDasVencidasNaChegada(appointmentId: string): Promise<string | null> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) return null
    const admin = createAdminClient()
    const ag = await ler(admin.from('appointments')
      .select('client_id, clients(name), branches!inner(tenant_id)').eq('id', appointmentId).maybeSingle(), 'buscar a cliente do agendamento')
    const tenant = (ag?.branches as unknown as { tenant_id: string } | null)?.tenant_id
    if (!ag?.client_id || tenant !== ctx.tenantId) return null
    const { total } = await getAReceberVencido({ tenantId: ctx.tenantId!, clientId: ag.client_id as string })
    if (total.quantidade <= 0) return null
    const nome = ((ag.clients as unknown as { name: string } | null)?.name ?? 'A cliente').split(' ')[0]
    const desde = total.maisAntiga
      ? `, desde ${new Date(total.maisAntiga).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}` : ''
    return `${nome} tem ${parcelasVencidas(total.quantidade)} (${formatBRL(total.valor)}${desde}): receba no Financeiro.`
  } catch (e) {
    console.error('[agenda] aviso das parcelas vencidas na chegada:', e)
    return null
  }
}
