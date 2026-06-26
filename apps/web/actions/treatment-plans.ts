'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Tipos ─────────────────────────────────────────────────────────────────────

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
}

export interface AnamnesisData {
  skinType:                  string
  allergies:                 string
  medications:               string
  healthConditions:          string
  previousProcedures:        string
  isPregnantOrBreastfeeding: boolean
  useSunscreen:              boolean
  observations:              string
}

// ── Salvar rascunho do plano (profissional) ───────────────────────────────────

export async function saveTreatmentPlan(
  appointmentId: string,
  sessions: PlanSessionInput[],
  notes: string,
  slug: string,
) {
  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])
  const admin = createAdminClient()

  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, branch_id, client_id')
    .eq('id', appointmentId)
    .single()
  if (apptErr || !appt) return { error: 'Agendamento não encontrado.' }

  const { data: plan, error: planErr } = await admin
    .from('treatment_plans')
    .upsert({
      evaluation_appointment_id: appointmentId,
      client_id:                 appt.client_id,
      branch_id:                 appt.branch_id,
      professional_id:           ctx.internalUserId!,
      professional_notes:        notes,
      status:                    'DRAFT',
      updated_at:                new Date().toISOString(),
    }, { onConflict: 'evaluation_appointment_id' })
    .select('id')
    .single()
  if (planErr || !plan) return { error: `Erro ao salvar plano: ${planErr?.message}` }

  // Apaga sessões antigas (cascade deleta os procedimentos)
  await admin.from('treatment_plan_sessions').delete().eq('plan_id', plan.id)

  for (let i = 0; i < sessions.length; i++) {
    const sess = sessions[i]!
    const { data: newSess, error: sessErr } = await admin
      .from('treatment_plan_sessions')
      .insert({ plan_id: plan.id, sort_order: i })
      .select('id')
      .single()
    if (sessErr || !newSess) return { error: `Erro ao salvar sessão ${i + 1}: ${sessErr?.message}` }

    if (sess.procedures.length > 0) {
      await admin.from('treatment_plan_session_procedures').insert(
        sess.procedures.map((p, j) => ({
          session_id:   newSess.id,
          procedure_id: p.procedureId,
          price:        p.price,
          sort_order:   p.sortOrder ?? j,
          products:     (p.products ?? []).map(pr => ({
            product_id: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
          })),
        })),
      )
    }
  }

  revalidatePath(`/${slug}/agenda/${appointmentId}`)
  return { planId: plan.id }
}

// ── Buscar sessões do plano (para checkout wizard) ────────────────────────────

const ALL_BRANCH_ROLES = ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', 'FINANCIAL'] as const

export async function getTreatmentPlanSessions(planId: string): Promise<{
  sessions: PlanSessionForCheckout[]
  total:    number
}> {
  const ctx   = await getTenantContext()
  assertRole(ctx, [...ALL_BRANCH_ROLES])
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('branch_id')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { sessions: [], total: 0 }

  const { data: branch } = await admin
    .from('branches')
    .select('tenant_id')
    .eq('id', plan.branch_id)
    .maybeSingle()
  if (branch?.tenant_id !== ctx.tenantId) return { sessions: [], total: 0 }

  const { data: rawSessions } = await admin
    .from('treatment_plan_sessions')
    .select(`
      id, sort_order, appointment_id,
      treatment_plan_session_procedures(procedure_id, price, sort_order, products, procedures(name, duration_min))
    `)
    .eq('plan_id', planId)
    .order('sort_order')

  type RawProcProduct = { product_id: string; name: string; unit: string; quantity: number }
  type RawProc = { procedure_id: string; price: number; sort_order: number; products: RawProcProduct[]; procedures: { name: string; duration_min: number } | null }
  type RawSess = { id: string; sort_order: number; appointment_id: string | null; treatment_plan_session_procedures: RawProc[] }

  const sessions: PlanSessionForCheckout[] = ((rawSessions ?? []) as RawSess[]).map(s => {
    const procs = (s.treatment_plan_session_procedures ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(p => ({
        procedureId: p.procedure_id,
        name:        p.procedures?.name ?? '—',
        price:       Number(p.price),
        durationMin: p.procedures?.duration_min ?? 60,
        products:    (p.products ?? []).map((pr: RawProcProduct) => ({
          productId: pr.product_id, name: pr.name, unit: pr.unit, quantity: Number(pr.quantity),
        })),
      }))
    const totalPrice = procs.reduce((sum, p) => sum + p.price, 0)
    return {
      id:              s.id,
      sortOrder:       s.sort_order,
      totalPrice,
      mainProcedureId: procs[0]?.procedureId ?? '',
      mainDurationMin: procs.reduce((sum, p) => sum + p.durationMin, 0),
      procedures:      procs,
      appointmentId:   s.appointment_id ?? null,
    }
  })

  const total = sessions.reduce((sum, s) => sum + s.totalPrice, 0)
  return { sessions, total }
}

// ── Enviar plano para recepção (DRAFT → PROPOSED) ─────────────────────────────

export async function proposeTreatmentPlan(planId: string, slug: string) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])

  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, status, evaluation_appointment_id, branch_id, professional_notes, client_id')
    .eq('id', planId)
    .single()

  if (!plan)               return { error: 'Plano não encontrado.' }
  if (plan.status !== 'DRAFT') return { error: 'Apenas planos em rascunho podem ser enviados.' }

  // 1. Observações da profissional
  if (!plan.professional_notes?.trim()) {
    return { error: 'Preencha as observações antes de enviar.' }
  }

  // 2. Pelo menos 1 sessão
  const { count: itemCount } = await admin
    .from('treatment_plan_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
  if (!itemCount || itemCount === 0) {
    return { error: 'Adicione ao menos uma sessão ao plano antes de enviar.' }
  }

  // 3. Dores do cliente (appointment.notes)
  if (plan.evaluation_appointment_id) {
    const { data: appt } = await admin
      .from('appointments')
      .select('notes')
      .eq('id', plan.evaluation_appointment_id)
      .single()
    if (!appt?.notes?.trim()) {
      return { error: 'Registre as dores/queixas do cliente antes de enviar.' }
    }
  }

  // 4. Anamnese preenchida
  const { data: medRecord } = await admin
    .from('medical_records')
    .select('general_anamnesis')
    .eq('client_id', plan.client_id)
    .maybeSingle()
  if (!medRecord?.general_anamnesis) {
    return { error: 'Preencha a anamnese do cliente antes de enviar.' }
  }

  const { error } = await admin
    .from('treatment_plans')
    .update({ status: 'PROPOSED', updated_at: new Date().toISOString() })
    .eq('id', planId)

  if (error) return { error: error.message }

  revalidatePath(`/${slug}/agenda`)
  if (plan.evaluation_appointment_id) {
    revalidatePath(`/${slug}/agenda/${plan.evaluation_appointment_id}`)
  }
  return {}
}

// ── Cancelar checkout (PROPOSED → DRAFT) ─────────────────────────────────────

export async function cancelCheckout(
  planId: string,
  reason: string,
  slug:   string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, status, branch_id, evaluation_appointment_id')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { error: 'Plano não encontrado.' }

  const { data: branch } = await admin
    .from('branches')
    .select('tenant_id')
    .eq('id', plan.branch_id)
    .maybeSingle()
  if (branch?.tenant_id !== ctx.tenantId) return { error: 'Acesso negado.' }

  if (plan.status === 'ACCEPTED') return { error: 'Plano já foi aprovado e não pode ser cancelado.' }

  const { error } = await admin
    .from('treatment_plans')
    .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) return { error: error.message }

  if (plan.evaluation_appointment_id) {
    await admin.from('appointment_history').insert({
      appointment_id:  plan.evaluation_appointment_id,
      changed_by_id:   ctx.internalUserId,
      changed_by_name: 'Recepção',
      action:          'CHECKOUT_CANCELLED',
      description:     reason.trim() ? `Checkout cancelado: ${reason.trim()}` : 'Checkout cancelado pela recepção',
    })
  }

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/checkout/${planId}`)
  return {}
}

// ── Cancelar tratamento em andamento (ACCEPTED → CANCELLED) ──────────────────

export async function cancelTreatmentPlan(
  planId: string,
  reason: string,
  slug:   string,
): Promise<{ error?: string }> {
  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, status, branch_id, client_id, evaluation_appointment_id')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { error: 'Plano não encontrado.' }

  const { data: branch } = await admin
    .from('branches')
    .select('tenant_id')
    .eq('id', plan.branch_id)
    .maybeSingle()
  if (branch?.tenant_id !== ctx.tenantId) return { error: 'Acesso negado.' }

  if (plan.status !== 'ACCEPTED') return { error: 'Apenas tratamentos ativos (aceitos) podem ser cancelados.' }

  // Permissão por número de sessões: multi → somente NETWORK_ADMIN
  const { count: sessionCount } = await admin
    .from('treatment_plan_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)

  if ((sessionCount ?? 0) > 1 && ctx.role !== 'NETWORK_ADMIN') {
    return { error: 'Somente o administrador da rede pode cancelar tratamentos com múltiplas sessões.' }
  }

  const { error } = await admin
    .from('treatment_plans')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) return { error: error.message }

  // Cancela agendamentos futuros vinculados ao plano
  const cancelledAt  = new Date().toISOString()
  const cancelReason = reason.trim() ? `Tratamento cancelado: ${reason.trim()}` : 'Tratamento cancelado'

  const { data: futureAppts } = await admin
    .from('appointments')
    .select('id, price')
    .eq('treatment_plan_id', planId)
    .in('status', ['SCHEDULED', 'CONFIRMED'])

  if (futureAppts && futureAppts.length > 0) {
    const apptIds = futureAppts.map(a => a.id)

    await admin
      .from('appointments')
      .update({
        status:              'CANCELLED',
        cancelled_at:        cancelledAt,
        cancellation_reason: cancelReason,
      })
      .in('id', apptIds)

    // Registra histórico em cada agendamento cancelado
    await admin.from('appointment_history').insert(
      apptIds.map(apptId => ({
        appointment_id:  apptId,
        changed_by_id:   ctx.internalUserId,
        changed_by_name: ctx.role === 'NETWORK_ADMIN' ? 'Admin Rede' : 'Gerente',
        action:          'CANCELLED',
        description:     cancelReason,
      }))
    )

    // Emite crédito interno pelo valor das sessões não realizadas (plano já estava pago)
    const totalCredit = futureAppts.reduce((s, a) => s + Number(a.price ?? 0), 0)
    if (totalCredit > 0 && plan.client_id) {
      await admin.from('internal_credits').insert({
        client_id:   plan.client_id,
        branch_id:   plan.branch_id,
        amount:      totalCredit,
        description: `Cancelamento de plano — ${futureAppts.length} sessão(ões) não realizada(s)`,
        created_at:  new Date().toISOString(),
      })
    }
  }

  if (plan.evaluation_appointment_id) {
    await admin.from('appointment_history').insert({
      appointment_id:  plan.evaluation_appointment_id,
      changed_by_id:   ctx.internalUserId,
      changed_by_name: ctx.role === 'NETWORK_ADMIN' ? 'Admin Rede' : 'Gerente',
      action:          'TREATMENT_CANCELLED',
      description:     cancelReason,
    })
  }

  revalidatePath(`/${slug}/clients`)
  return {}
}

// ── Gerar plano completo de uma só vez (avaliação) ────────────────────────────

export async function generateEvaluationPlan(
  appointmentId:         string,
  complaints:            string,
  anamnesis:             AnamnesisData,
  sessions:              PlanSessionInput[],
  planNotes:             string,
  sessionNotes:          string,
  sessionIntercurrences: string,
  slug:                  string,
): Promise<{ error?: string; planId?: string }> {
  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])
  const admin = createAdminClient()

  if (!complaints.trim()) return { error: 'Registre as dores/queixas do cliente.' }
  if (sessions.length === 0) return { error: 'Adicione ao menos uma sessão ao plano antes de enviar.' }

  const { data: appt } = await admin
    .from('appointments')
    .select('id, branch_id, client_id, professional_id')
    .eq('id', appointmentId)
    .single()
  if (!appt) return { error: 'Agendamento não encontrado.' }

  // 1. Queixas do cliente → appointment.notes
  await admin.from('appointments').update({ notes: complaints.trim() }).eq('id', appointmentId)

  // 2. Anamnese → medical_records.general_anamnesis
  await admin.from('medical_records').upsert(
    { client_id: appt.client_id, general_anamnesis: { ...anamnesis, updatedAt: new Date().toISOString(), updatedBy: ctx.internalUserId } },
    { onConflict: 'client_id' },
  )

  // 3. Upsert plano + salvar sessões enviadas pelo editor → PROPOSED
  const { data: plan, error: planErr } = await admin
    .from('treatment_plans')
    .upsert({
      evaluation_appointment_id: appointmentId,
      client_id:                 appt.client_id,
      branch_id:                 appt.branch_id,
      professional_id:           ctx.internalUserId!,
      professional_notes:        planNotes.trim() || null,
      status:                    'PROPOSED',
      updated_at:                new Date().toISOString(),
    }, { onConflict: 'evaluation_appointment_id' })
    .select('id')
    .single()
  if (planErr || !plan) return { error: `Erro ao gerar plano: ${planErr?.message}` }

  // Salva as sessões do editor (sobrescreve o que havia no banco)
  await admin.from('treatment_plan_sessions').delete().eq('plan_id', plan.id)
  for (let i = 0; i < sessions.length; i++) {
    const sess = sessions[i]!
    const { data: newSess, error: sessErr } = await admin
      .from('treatment_plan_sessions')
      .insert({ plan_id: plan.id, sort_order: i })
      .select('id').single()
    if (sessErr || !newSess) return { error: `Erro ao salvar sessão ${i + 1}: ${sessErr?.message}` }
    if (sess.procedures.length > 0) {
      await admin.from('treatment_plan_session_procedures').insert(
        sess.procedures.map((p, j) => ({
          session_id:   newSess.id,
          procedure_id: p.procedureId,
          price:        p.price,
          sort_order:   p.sortOrder ?? j,
          products:     (p.products ?? []).map(pr => ({
            product_id: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
          })),
        })),
      )
    }
  }
  const count = sessions.length

  // 4. Observações do atendimento → medical_record_entries
  if (sessionNotes.trim() || sessionIntercurrences.trim()) {
    let { data: medRecord } = await admin
      .from('medical_records').select('id').eq('client_id', appt.client_id).maybeSingle()
    if (!medRecord) {
      const { data: newRec } = await admin.from('medical_records').insert({ client_id: appt.client_id }).select('id').single()
      medRecord = newRec
    }
    if (medRecord) {
      await admin.from('medical_record_entries').upsert({
        medical_record_id: medRecord.id,
        appointment_id:    appointmentId,
        professional_id:   appt.professional_id,
        notes:             sessionNotes.trim() || null,
        intercurrences:    sessionIntercurrences.trim() || null,
      }, { onConflict: 'appointment_id' })
    }
  }

  // 5. Log
  await admin.from('appointment_history').insert({
    appointment_id:  appointmentId,
    changed_by_id:   ctx.internalUserId,
    changed_by_name: 'Profissional',
    action:          'PLAN_PROPOSED',
    description:     `Plano de tratamento enviado para recepção — ${count} sessão(ões)`,
  })

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/agenda/${appointmentId}`)
  revalidatePath(`/${slug}/checkout`)
  return { planId: plan.id }
}

// ── Assinar termo de consentimento digitalmente ───────────────────────────────

export async function signConsentTerm(consentId: string, signatureDataUrl: string, slug: string) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

  const admin = createAdminClient()

  const { error } = await admin
    .from('consent_terms')
    .update({
      status:         'SIGNED',
      signed_at:      new Date().toISOString(),
      signed_via:     'web',
      signature_data: signatureDataUrl,
    })
    .eq('id', consentId)

  if (error) return { error: error.message }

  revalidatePath(`/${slug}/checkout`)
  return {}
}

// ── Criar termos de consentimento para o checkout ─────────────────────────────

export async function createCheckoutConsentTerms(
  planId: string,
  medicalRecordId: string,
  clientName: string,
  branchName: string,
  items: { procedureName: string; sessions: number; unitPrice: number }[],
  totalAmount: number,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

  const admin  = createAdminClient()
  const today  = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const totalBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)

  const itemsText = items
    .map(it => `• ${it.procedureName} — ${it.sessions} sessão(ões) — R$ ${it.unitPrice.toFixed(2).replace('.', ',')} cada`)
    .join('\n')

  const anamnesisContent = `TERMO DE ANAMNESE E SAÚDE

Data: ${today}
Paciente: ${clientName}
Clínica: ${branchName}

Declaro que as informações prestadas sobre meu histórico de saúde são verdadeiras e completas. Estou ciente de que omissões ou informações incorretas podem comprometer a segurança e eficácia dos procedimentos realizados.

Confirmo não ter alergia a produtos utilizados nos procedimentos contratados ou, caso tenha, a informei à profissional durante a avaliação.

Li, entendi e concordo com este Termo de Anamnese.`

  const contractContent = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ESTÉTICOS

Data: ${today}
Contratante: ${clientName}
Contratada: ${branchName}

SERVIÇOS CONTRATADOS:
${itemsText}

VALOR TOTAL: ${totalBRL}

A contratada se compromete a executar os procedimentos listados com profissionalismo, higiene e os materiais adequados.

O contratante declara ter sido informado sobre os procedimentos, seus benefícios esperados e possíveis contraindicações.

Li, entendi e concordo com os termos deste Contrato de Prestação de Serviços.`

  const { data: terms, error } = await admin
    .from('consent_terms')
    .insert([
      {
        medical_record_id: medicalRecordId,
        title:             'Termo de Anamnese',
        content:           anamnesisContent,
        status:            'PENDING',
        signed_via:        'web',
      },
      {
        medical_record_id: medicalRecordId,
        title:             'Contrato de Prestação de Serviços',
        content:           contractContent,
        status:            'PENDING',
        signed_via:        'web',
      },
    ])
    .select('id, title, content, status')

  if (error) return { error: error.message }
  return { terms }
}

// ── Finalizar checkout (pagamento + agendamento de execução) ──────────────────

export type SessionScheduleInput = {
  planSessionId:  string
  scheduledAt:    string
  professionalId: string
  branchId:       string
}

export async function checkoutTreatmentPlan(
  planId:           string,
  paymentMethod:    string,
  sessionSchedules: SessionScheduleInput[],
  slug:             string,
) {
  const ctx   = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, status, client_id, branch_id, evaluation_appointment_id')
    .eq('id', planId)
    .single()

  if (!plan)                      return { error: 'Plano não encontrado.' }
  if (plan.status !== 'PROPOSED') return { error: 'Apenas planos enviados para recepção podem ser finalizados.' }

  // Busca sessões com procedimentos
  const { sessions, total } = await getTreatmentPlanSessions(planId)
  if (sessions.length === 0) return { error: 'Plano sem sessões cadastradas.' }

  // Caixa aberto
  const { data: cashRegister } = await admin
    .from('cash_registers')
    .select('id')
    .eq('branch_id', plan.branch_id)
    .eq('status', 'OPEN')
    .maybeSingle()

  // 1. Transação financeira
  const { data: transaction, error: txErr } = await admin
    .from('financial_transactions')
    .insert({
      branch_id:        plan.branch_id,
      client_id:        plan.client_id,
      cash_register_id: cashRegister?.id ?? null,
      type:             'INCOME',
      category:         'Serviços',
      description:      'Plano de tratamento — checkout novo paciente',
      amount:           total,
      payment_method:   paymentMethod,
      is_paid:          true,
      paid_at:          new Date().toISOString(),
      created_by:       ctx.internalUserId,
    })
    .select('id')
    .single()
  if (txErr) return { error: `Erro ao registrar pagamento: ${txErr.message}` }

  // 2. Para cada sessão: criar appointment (se agendado)
  let newAppointmentId: string | null = null

  for (const sess of sessions) {
    const sched = sessionSchedules.find(s => s.planSessionId === sess.id) ?? null
    let appointmentId: string | null = null

    if (sched && sess.mainProcedureId) {
      const { data: appt } = await admin
        .from('appointments')
        .insert({
          branch_id:         sched.branchId,
          client_id:         plan.client_id,
          procedure_id:      sess.mainProcedureId,
          professional_id:   sched.professionalId,
          scheduled_at:      sched.scheduledAt,
          duration_min:      sess.mainDurationMin,
          price:             sess.totalPrice,
          status:            'SCHEDULED',
          source:            'INTERNAL',
          treatment_plan_id: planId,
        })
        .select('id')
        .single()
      appointmentId = appt?.id ?? null
      if (!newAppointmentId) newAppointmentId = appointmentId
    }

    // Atualiza treatment_plan_sessions.appointment_id
    await admin
      .from('treatment_plan_sessions')
      .update({ appointment_id: appointmentId })
      .eq('id', sess.id)
  }

  // 3. Marcar plano como ACCEPTED
  await admin
    .from('treatment_plans')
    .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
    .eq('id', planId)

  // 4. Log no appointment de avaliação
  if (plan.evaluation_appointment_id) {
    await admin.from('appointment_history').insert({
      appointment_id:    plan.evaluation_appointment_id,
      changed_by_id:     ctx.internalUserId,
      changed_by_name:   'Recepção',
      action:            'CHECKOUT_COMPLETED',
      description:       `Checkout concluído — R$ ${total.toFixed(2).replace('.', ',')} — ${paymentMethod}`,
    })
  }

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/checkout`)
  revalidatePath(`/${slug}/dashboard`)
  return { transactionId: transaction.id, newAppointmentId }
}

// ── Ficha de tratamento ───────────────────────────────────────────────────────

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
  anamnesis:            AnamnesisData | null
}

export async function getTreatmentPlanDetails(planId: string, clientId: string): Promise<{ data?: TreatmentFileDetails; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])

    const admin = createAdminClient()

    // 1. Busca o plano (sem joins — evita erro de FK alias no PostgREST)
    const { data: plan, error: planErr } = await admin
      .from('treatment_plans')
      .select('id, status, professional_notes, created_at, professional_id, evaluation_appointment_id')
      .eq('id', planId)
      .eq('client_id', clientId)
      .single()

    if (planErr || !plan) return { error: 'Plano não encontrado.' }

    // 2. Busca em paralelo: profissional, avaliação, sessões, agendamentos e anamnese
    const [
      { data: professional },
      { data: evalAppt },
      { data: sessionsRaw },
      { data: appts },
      { data: medRecord },
    ] = await Promise.all([
      plan.professional_id
        ? admin.from('users').select('name').eq('id', plan.professional_id).single()
        : Promise.resolve({ data: null }),

      plan.evaluation_appointment_id
        ? admin.from('appointments').select('id, scheduled_at, notes').eq('id', plan.evaluation_appointment_id).single()
        : Promise.resolve({ data: null }),

      admin.from('treatment_plan_sessions')
        .select('id, sort_order, treatment_plan_session_procedures(procedure_id, price, procedures(name, duration_min))')
        .eq('plan_id', planId)
        .order('sort_order'),

      admin.from('appointments')
        .select('id, scheduled_at, status, completed_at, notes')
        .eq('treatment_plan_id', planId)
        .order('scheduled_at'),

      admin.from('medical_records')
        .select('general_anamnesis')
        .eq('client_id', clientId)
        .maybeSingle(),
    ])

    // 3. Zipa sessões com agendamentos pela ordem (sort_order ↔ scheduled_at asc)
    const sortedAppts = (appts ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const sessions: TreatmentFileSession[] = (sessionsRaw ?? []).map((s, i) => {
      type RawProc = { procedure_id: string; price: number; procedures: { name: string; duration_min: number } | null }
      const procs = (s.treatment_plan_session_procedures as RawProc[] | null) ?? []
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

    return {
      data: {
        id:                   plan.id,
        status:               plan.status,
        professionalNotes:    plan.professional_notes ?? null,
        createdAt:            plan.created_at,
        professionalName:     (professional as { name?: string } | null)?.name ?? null,
        evaluationDate:       (evalAppt as { scheduled_at?: string } | null)?.scheduled_at ?? null,
        evaluationComplaints: (evalAppt as { notes?: string } | null)?.notes ?? null,
        evaluationNotes:      null,
        sessions,
        anamnesis:            (medRecord?.general_anamnesis as AnamnesisData | null) ?? null,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}
