'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { getTenantContext, assertClient, assertPermission, isOwnScope, alcancaUnidade, can } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, contar, mensagemDoErro } from '@/lib/db'
import {
  getCachedBranchProfessionals, getCachedBranchProcedures, getCachedRoomsByBranch,
} from '@/lib/cached-queries'
import { notifyUser } from '@/lib/notifications/notify'
import { createAppointmentCore, computeAvailableSlots, conferirPecasDoAgendamento, horarioOcupado } from '@/lib/appointments/core'
import { cancelarCore, checkinCore, confirmarCore, remarcarCore, revalidarAgendamento } from '@/lib/appointments/alteracoes'
import { comNovaTentativa } from '@/lib/estoque/nova-tentativa'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { emitirSessaoDePacoteUsada, emitirComissaoGerada } from '@/lib/events/atendimento-financeiro'
import { emitirEventoClinico } from '@/lib/events/clinico'
import { EVENTOS, type NomeDeEvento } from '@estetica-os/types'
import { garantirClienteRapido } from '@/lib/clients/cliente-rapido'
import { periodRef, dayKeyTZ, partsInTZ } from '@/lib/datetime'
import { linhasDoAtendimento } from '@/lib/comissoes/leitura'
import { semAcesso } from '@/lib/sem-acesso'
import { configDaRede, saldoDoCliente } from '@/lib/fidelidade/leitura'
import { calcularDescontoComPontos, maximoDePontos } from '@/lib/fidelidade/resgate'
import { descontoDoVoucher, type VoucherParaCalculo } from '@/lib/fidelidade/voucher'
import { saldoDepoisDaSaida } from '@/lib/estoque/baixa'
import { EntradaDoDesconto, descontoEmReais, recusaDoDesconto } from '@/lib/vendas/desconto'
import { lerCredito } from '@/lib/creditos/credito'

import {
  getUserName, logHistory, fmtDateTime, loadApptCtx, notifyNewAppointment, notifyCancelledAppointment, notifyRescheduledAppointment, notifyCheckin, notifyCompleted, notifyPayment,
} from '@/lib/appointments/avisos'

// --- Criar agendamento --------------------------------------------
export async function addAppointment(
  _prev: { error?: string; success?: boolean; id?: string } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')

    const slug = formData.get('_slug') as string
    const branchId = formData.get('_branchId') as string
    const admin = createAdminClient()

    // Quem vai ser atendido: um cliente já cadastrado, ou só um nome e um
    // telefone. Exigir ficha completa (CPF e e-mail, que criam o login do
    // portal) para marcar um horário invertia a ordem das coisas — a pessoa que
    // liga perguntando preço não dá documento, e a recepção ficava sem como
    // registrar o horário.
    let clientId = (formData.get('client_id') as string)?.trim() || ''
    if (!clientId) {
      const novo = await garantirClienteRapido(admin, ctx, {
        nome:     (formData.get('client_name')  as string) ?? '',
        telefone: (formData.get('client_phone') as string) ?? '',
        branchId,
      })
      if (novo.error || !novo.clientId) return { error: novo.error ?? 'Não foi possível registrar o cliente.' }
      clientId = novo.clientId
      revalidateTag(`clients:${ctx.tenantId!}`, 'max')
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
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Atualizar status do agendamento -----------------------------
export async function updateAppointmentStatus(
  appointmentId: string,
  status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
  slug: string,
  cancellationReason?: string,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  // Profissional só pode iniciar (IN_PROGRESS) ou concluir (COMPLETED)
  // Quem só gerencia a própria agenda mexe no andamento do atendimento
  // (iniciar/concluir), não no ciclo de vida do agendamento.
  if (isOwnScope(ctx, 'agenda') && !(['IN_PROGRESS', 'COMPLETED'] as string[]).includes(status)) {
    throw semAcesso()
  }

  if (status === 'CANCELLED' && !cancellationReason?.trim()) {
    throw new Error('Motivo de cancelamento obrigatório.')
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
    const atual = await ler(createAdminClient().from('appointments').select('status')
      .eq('id', appointmentId).maybeSingle(), 'buscar o agendamento')
    if (atual?.status === 'COMPLETED') {
      throw new Error('Atendimento concluído não pode ser cancelado nem marcado como falta. Para devolver o dinheiro, estorne o pagamento.')
    }
  }

  // O erro deste update era descartado, e o histórico logo abaixo é escrito
  // pelo admin client: quando a escrita falhava, a linha do tempo registrava a
  // mudança, a tela dizia que deu certo e o status continuava o mesmo.
  //
  // Pelo cliente de serviço (2026-10-08), com o alcance conferido antes
  // (resolveBranchId): a sessão de suporte não grava pelo PostgREST
  // (`suporte_sem_escrita`), e o suporte muda status de agendamento pela tela.
  const { data: atualizadas, error: updErr } = await createAdminClient()
    .from('appointments')
    .update(fields)
    .eq('id', appointmentId)
    .eq('branch_id', await resolveBranchId(supabase, appointmentId, ctx))
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

/** O procedimento é da rede? A mensagem de recusa, ou null. */
async function procedimentoDaRedeOuRecusa(
  admin: ReturnType<typeof createAdminClient>, procedureId: string, tenantId: string,
): Promise<string | null> {
  const proc = await ler(admin.from('procedures').select('id')
    .eq('id', procedureId).eq('tenant_id', tenantId).maybeSingle(), 'buscar o procedimento')
  return proc ? null : 'Procedimento não encontrado.'
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
  if (!appt || redeDoAppt !== ctx.tenantId || !alcancaUnidade(ctx, appt.branch_id as string)) {
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
    .maybeSingle(), 'conferir se o atendimento já foi lançado')

  if (!existingTx && !alreadyCharged) {
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

// --- Check-in do cliente (SCHEDULED → CONFIRMED) -----------------
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
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'MANAGE')

    // O núcleo que a agenda e o Copilot dividem (lib/appointments/alteracoes.ts).
    const r = await checkinCore(createAdminClient(), ctx, appointmentId)
    if ('error' in r) return { error: r.error }

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    notifyCheckin(appointmentId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Iniciar atendimento (CONFIRMED → IN_PROGRESS) ---------------
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
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'VIEW')

    const admin = createAdminClient()
    const appt = await ler(admin
      .from('appointments')
      .select('id, status, professional_id, branches!inner(id, tenant_id)')
      .eq('id', appointmentId)
      .single(), 'buscar o agendamento')

    const apptBranch = appt?.branches as unknown as { id: string; tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, apptBranch.id)) return { error: 'Agendamento não encontrado.' }
    if (appt.status !== 'CONFIRMED') return { error: 'O cliente precisa fazer check-in antes de iniciar.' }

    if (isOwnScope(ctx, 'agenda') && appt.professional_id !== ctx.internalUserId) {
      return { error: 'Apenas o profissional responsável pode iniciar este atendimento.' }
    }

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
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status as string)) {
      return { error: 'Não é possível reatribuir um atendimento já finalizado.' }
    }

    // O profissional novo tem de ser da rede — vinha do navegador sem conferência.
    const recusaProf = await conferirPecasDoAgendamento(admin, ctx, { professionalId })
    if (recusaProf) return { error: recusaProf }
    // E livre no horário do agendamento (revisão de 2026-10-08: a troca punha
    // o atendimento por cima de outro do profissional novo).
    if (professionalId !== appt.professional_id && await horarioOcupado(admin, {
      tenantId: ctx.tenantId!, professionalId, inicio: new Date(appt.scheduled_at as string),
      duracaoMin: (appt.duration_min as number | null) ?? 60, excluir: appointmentId,
    })) {
      return { error: 'Este profissional já tem agendamento nesse horário.' }
    }

    const oldProfId = (appt.professional_id ?? null) as string | null
    const newProf = await ler(admin.from('users').select('name').eq('id', professionalId).single(), 'buscar o usuário')
    await gravar(admin
      .from('appointments')
      .update({ professional_id: professionalId })
      .eq('id', appointmentId), 'trocar o profissional do agendamento')

    const userName = ctx.userName || await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'REASSIGNED',
      `Profissional reatribuído para ${newProf?.name ?? professionalId}`,
      { new_professional_id: professionalId, new_professional_name: newProf?.name },
    )

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
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
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
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

    // O núcleo (lib/appointments/alteracoes.ts) é o mesmo do Copilot.
    const r = await cancelarCore(createAdminClient(), ctx, { appointmentId, motivo: cancellationReason })
    if ('error' in r) return { error: r.error }

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidateTag(`appointments:${ctx.tenantId!}`, 'max')
    notifyCancelledAppointment(appointmentId, cancellationReason, ctx.internalUserId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
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
  _prev: { error?: string; avisos?: string[] } | null,
  formData: FormData,
): Promise<{ error?: string; /** Insumos que ficaram com saldo negativo — conclui mesmo assim. */ avisos?: string[] }> {
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

    const admin = createAdminClient()

    const appt = await ler(admin
      .from('appointments')
      .select('id, status, branch_id, client_id, procedure_id, professional_id, price, treatment_plan_id, branches!inner(id, tenant_id)')
      .eq('id', appointmentId)
      .single(), 'buscar o agendamento')

    const apptBranch = appt?.branches as unknown as { id: string; tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, apptBranch.id)) return { error: 'Agendamento não encontrado.' }
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
    let productsUsed: { productId: string; quantity: number }[] = []
    try {
      productsUsed = JSON.parse((formData.get('products_used') as string | null) ?? '[]')
    } catch { /* JSON inválido → sem insumos */ }

    // O mesmo produto duas vezes na lista soma: a baixa é calculada sobre o
    // saldo lido UMA vez, e duas linhas do mesmo produto se sobreporiam.
    const porProduto = new Map<string, number>()
    for (const item of productsUsed) {
      if (!item.productId || !item.quantity || item.quantity <= 0) continue
      porProduto.set(item.productId, (porProduto.get(item.productId) ?? 0) + item.quantity)
    }

    type Insumo = {
      produto: string; quantidade: number; saldo_apos: number
      embalagens: number; rendimento: number | null; custo: number | null; minimo: number
      /** O saldo LIDO para a conta: o banco confere que ainda é este (PT409 se não). */
      antes_embalagens: number; antes_rendimento: number | null
    }
    // Lê o saldo e calcula a baixa de cada insumo. Chamada de novo a cada
    // tentativa: se outra saída mudar o saldo no meio, o banco recusa e a
    // conta é refeita sobre o saldo novo (lib/estoque/nova-tentativa.ts).
    const montarInsumos = async (): Promise<{ insumos: Insumo[]; avisos: string[] }> => {
      const avisos: string[] = []
      const insumos: Insumo[] = []
      for (const [productId, quantity] of porProduto) {
        // Leitura que falha não pode virar "saldo 0": a baixa seria calculada
        // sobre um número inventado e gravada como verdade no movimento.
        const [bps, prod] = await Promise.all([
          ler(admin.from('branch_product_stock')
            .select('current_stock, min_stock, current_rendimento')
            .eq('product_id', productId)
            .eq('branch_id', appt.branch_id)
            .maybeSingle(), 'buscar o saldo do insumo'),
          // Da rede: o id vem do navegador (`products_used`), e um produto de
          // outra rede ganharia saldo e movimento nesta unidade.
          ler(admin.from('products')
            .select('name, unit, units_per_package, consumption_unit, cost_price')
            .eq('id', productId)
            .eq('tenant_id', ctx.tenantId!)
            .maybeSingle(), 'buscar o insumo'),
        ])
        if (!prod) continue

        const currentStock = Number(bps?.current_stock ?? 0)
        const upp          = prod?.units_per_package && prod?.consumption_unit ? Number(prod.units_per_package) : null

        // A conta do saldo depois da saída é a mesma da entrega de produto de
        // voucher (lib/estoque/baixa.ts): uma cópia só.
        const { embalagens, rendimento, saldoApos } = saldoDepoisDaSaida({
          embalagens:           currentStock,
          rendimento:           bps?.current_rendimento != null ? Number(bps.current_rendimento) : null,
          unidadesPorEmbalagem: upp,
        }, quantity)

        insumos.push({
          produto: productId, quantidade: -quantity, saldo_apos: saldoApos,
          embalagens, rendimento,
          custo:   prod.cost_price != null ? Number(prod.cost_price) : null,
          minimo:  Number(bps?.min_stock ?? 0),
          antes_embalagens: currentStock,
          antes_rendimento: bps?.current_rendimento != null ? Number(bps.current_rendimento) : null,
        })

        if (saldoApos < 0) {
          const unidade = upp ? (prod.consumption_unit as string) : (prod.unit as string)
          const falta = (-saldoApos).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
          avisos.push(`${prod.name as string}: faltaram ${falta} ${unidade} no estoque da unidade`)
        }
      }
      return { insumos, avisos }
    }

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
        p_dados:       { notas: notes, intercorrencias: intercurrences, comissoes, insumos: m.insumos },
      })
    })
    const gravado = await gravar(Promise.resolve(resposta), 'concluir o atendimento') as {
      comissao_criada: boolean; pacote: string | null
      comissoes: { linha: string; procedure_id: string | null; liberado: number }[]
    } | null

    // ─── Depois: os avisos do que aconteceu ───────────────────────────────
    // Um fato por linha que já nasce devida. No modo "quando o cliente paga"
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
    revalidateTag(`appointments:${apptBranch!.tenant_id}`, 'max')
    notifyCompleted(appointmentId)
    return { avisos }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
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
    // Desconto comercial da recepção (2026-09-30): R$ ou %, sem teto.
    const valorDoDesconto = Number(formData.get('desconto_valor') ?? 0) || 0
    const pedidoDeDesconto = EntradaDoDesconto.safeParse(
      valorDoDesconto > 0 ? { tipo: formData.get('desconto_tipo'), valor: valorDoDesconto } : null,
    )
    if (!pedidoDeDesconto.success) return { error: 'Desconto inválido.' }

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
        },
      }), 'confirmar o pagamento')
    } catch (e) {
      return { error: mensagemDoErro(e) }
    }

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidatePath(`/${slug}/financeiro`)
    revalidateTag(`appointments:${ctx.tenantId!}`, 'max')
    notifyPayment(appointmentId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
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
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, apptBranch.id)) return { error: 'Agendamento não encontrado.' }

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
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
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
    revalidateTag(`appointments:${ctx.tenantId!}`, 'max')
    notifyRescheduledAppointment(appointmentId, ctx.internalUserId)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
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
      treatment_plan_session_procedures(procedure_id, sort_order, procedures(name)),
      appointments:appointment_id(id, status, scheduled_at, professional:users!professional_id(name))
    `)
    .eq('plan_id', planId)
    .order('sort_order'), 'carregar as sessões do plano')

  type RawSessProc = { procedure_id: string; sort_order: number; procedures: { name: string } | null }
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
    credito:        { tipo: 'PACOTE', id: params.packageSessionId },
    source:         'INTERNAL',
  })
  if ('error' in res) return { error: res.error }
  const appt = { id: res.id }

  revalidatePath(`/${params.slug}/clients/${params.clientId}`)
  revalidateTag(`appointments:${ctx.tenantId!}`, 'max')
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
  price:          number
  durationMin:    number
  slug:           string
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
  const recusa = await conferirPecasDoAgendamento(admin, ctx, {
    branchId: params.branchId, professionalId: params.professionalId, clientId: params.clientId,
  }) ?? await procedimentoDaRedeOuRecusa(admin, params.procedureId, ctx.tenantId!)
  if (recusa) return { error: recusa }
  // E o horário livre (revisão de 2026-10-08: marcava por cima de outro).
  if (await horarioOcupado(admin, {
    tenantId: ctx.tenantId!, professionalId: params.professionalId,
    inicio: new Date(params.scheduledAt), duracaoMin: params.durationMin || 60,
  })) {
    return { error: 'Este profissional já tem agendamento nesse horário.' }
  }

  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .insert({
      branch_id:         params.branchId,
      client_id:         params.clientId,
      procedure_id:      params.procedureId,
      professional_id:   params.professionalId,
      scheduled_at:      params.scheduledAt,
      duration_min:      params.durationMin,
      price:             params.price,
      status:            'SCHEDULED',
      source:            'INTERNAL',
      treatment_plan_id: params.planId,
    })
    .select('id')
    .single()
  if (apptErr || !appt) return { error: `Erro ao criar agendamento: ${apptErr?.message}` }

  // Vincula o agendamento à sessão — necessário para getPlannedSessionAppointments exibir corretamente
  await gravar(admin
    .from('treatment_plan_sessions')
    .update({ appointment_id: appt.id })
    .eq('id', params.sessionId), 'vincular a sessão do plano ao agendamento')

  revalidatePath(`/${params.slug}/clients/${params.clientId}`)
  revalidateTag(`appointments:${ctx.tenantId!}`, 'max')
  notifyNewAppointment(appt.id, ctx.internalUserId)
  return { appointmentId: appt.id }
}

// --- Portal do cliente: slots disponíveis ------------------------
export async function getClientAvailableSlots(
  branchId: string,
  professionalId: string,
  date: string,
  durationMin: number,
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

  const slots = await computeAvailableSlots(admin, branchId, professionalId, date, durationMin)
  return { slots }
}

// --- Portal do cliente: criar agendamento self-service ------------
export async function createClientAppointment(params: {
  branchId:       string
  procedureId:    string
  professionalId: string
  scheduledAt:    string
  slug:           string
}): Promise<{ error?: string; id?: string; documentosParaAssinar?: number }> {
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
      .from('clients').select('tenant_id').eq('id', ctx.clientId!).maybeSingle(), 'buscar o cliente')
    if (!cliente) return { error: 'Cadastro não encontrado.' }

    const branch = await ler(admin
      .from('branches')
      .select('tenant_id')
      .eq('id', params.branchId)
      .eq('tenant_id', cliente.tenant_id as string)
      .eq('is_active', true)
      .maybeSingle(), 'buscar a unidade')
    if (!branch) return { error: 'Filial não encontrada.' }

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

    // Quem atende é marcado por `provides_services`. A validação antiga filtrava
    // por `users.role`, coluna removida na migração de cargos dinâmicos: a query
    // falhava com 42703, `prof` vinha null e TODO agendamento pelo app do cliente
    // era recusado com "Profissional não disponível".
    const { data: prof, error: profErr } = await admin
      .from('users')
      .select('id')
      .eq('id', params.professionalId)
      .eq('branch_id', params.branchId)
      .eq('provides_services', true)
      .eq('is_active', true)
      .maybeSingle()
    if (profErr) return { error: `Erro ao validar o profissional: ${profErr.message}` }
    if (!prof)   return { error: 'Profissional não disponível.' }

    // O horário tem de ser um dos que a tela ofereceu: futuro e livre na grade
    // de `computeAvailableSlots` — que já desconta os agendamentos existentes,
    // e por isso também é a guarda contra dois clientes no mesmo horário.
    const inicio = new Date(params.scheduledAt)
    if (Number.isNaN(inicio.getTime()) || inicio.getTime() <= Date.now()) {
      return { error: 'Escolha um horário a partir de agora.' }
    }
    const p = partsInTZ(inicio)
    const hora = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    const livres = await computeAvailableSlots(
      admin, params.branchId, params.professionalId, dayKeyTZ(inicio), Number(procedure.duration_min),
    )
    if (p.second !== 0 || !livres.includes(hora)) {
      return { error: 'Este horário não está mais disponível. Escolha outro.' }
    }

    const { data: appt, error } = await admin
      .from('appointments')
      .insert({
        branch_id:       params.branchId,
        client_id:       ctx.clientId!,
        procedure_id:    params.procedureId,
        professional_id: params.professionalId,
        scheduled_at:    params.scheduledAt,
        duration_min:    procedure.duration_min,
        price:           procedure.price,
        status:          'SCHEDULED',
        // CLIENT_APP é o cliente pelo portal/app; ONLINE era o agendamento
        // público, que foi descartado (§9.1).
        source:          'CLIENT_APP',
      })
      .select('id')
      .single()

    if (error || !appt) return { error: `Erro ao criar agendamento: ${error?.message}` }

    revalidatePath(`/${params.slug}/cliente/agendamentos`)
    // Marcado pelo proprio cliente no portal: nao ha ator da equipe a excluir.
    notifyNewAppointment(appt.id as string)
    // O gatilho já emitiu os documentos que nascem ao agendar (§9.4.1): o
    // portal leva o cliente direto a eles.
    const documentosParaAssinar = await contar(admin.from('issued_documents').select('id', { count: 'exact', head: true })
      .eq('appointment_id', appt.id as string).in('status', ['A_GERAR', 'PENDENTE', 'INCOMPLETO']), 'contar os documentos do agendamento')
    return { id: appt.id as string, documentosParaAssinar }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function getSchedulingDaySlots(
  branchId: string,
  professionalId: string,
  date: string,
): Promise<{ slots: { scheduledAt: string; durationMin: number; clientName: string | null }[] }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  const branch = await ler(admin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar a unidade')
  if (!branch || !alcancaUnidade(ctx, branchId)) return { slots: [] }

  // Brazil UTC-3
  const dayStart = new Date(`${date}T00:00:00-03:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59-03:00`).toISOString()

  const data = await ler(admin
    .from('appointments')
    .select('scheduled_at, duration_min, clients(name)')
    .eq('branch_id', branchId)
    .eq('professional_id', professionalId)
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)
    .not('status', 'in', '("CANCELLED","NO_SHOW")')
    .order('scheduled_at'), 'carregar os agendamentos')

  return {
    slots: ((data ?? []) as unknown as { scheduled_at: string; duration_min: number; clients: { name: string } | null }[]).map(d => ({
      scheduledAt: d.scheduled_at,
      durationMin: d.duration_min,
      clientName:  d.clients?.name ?? null,
    })),
  }
}

// --- Cliente confirma o atendimento (substitui a ficha de papel) + avalia -------
export async function confirmAndRateAppointment(params: {
  appointmentId:      string
  slug:               string
  professionalRating?: number | null
  procedureRating?:    number | null
  feedback?:           string | null
}): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertClient(ctx)

    const admin = createAdminClient()

    const appt = await ler(admin
      .from('appointments')
      .select('id, client_id, professional_id, status, client_confirmed_at, procedures(name)')
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
    const procedureRating    = clean(params.procedureRating)
    const feedback = params.feedback?.trim() ? params.feedback.trim().slice(0, 1000) : null

    const { error } = await admin
      .from('appointments')
      .update({
        client_confirmed_at: new Date().toISOString(),
        client_rating:       professionalRating,
        procedure_rating:    procedureRating,
        client_feedback:     feedback,
      })
      .eq('id', params.appointmentId)
      .eq('client_id', ctx.clientId!)   // guarda dupla de posse

    if (error) return { error: `Erro ao confirmar: ${error.message}` }

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
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Apoio ao modal de agendamento --------------------------------
//
// A agenda da REDE não tem "a filial atual": a unidade é escolhida na hora, e
// procedimentos, profissionais e salas mudam com ela. Por isso estes dados vêm
// sob demanda, em vez de virem prontos da página como no portal da unidade.

export interface DadosParaAgendar {
  procedures:    { id: string; name: string; category: string; duration_min: number; price: number }[]
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

  type Proc = { id: string; name: string; category: string; duration_min: number; price: number }
  return {
    procedures: (procedures as Proc[]).map(p => ({
      id: p.id, name: p.name, category: p.category,
      duration_min: p.duration_min, price: Number(p.price),
    })),
    professionals: (professionals as { id: string; name: string }[]).map(p => ({ id: p.id, name: p.name })),
    rooms:         (rooms as { id: string; name: string }[]).map(r => ({ id: r.id, name: r.name })),
    slug:          branch.slug as string,
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
