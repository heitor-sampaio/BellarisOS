'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const WRITABLE_ROLES    = ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'] as const
const ALL_BRANCH_ROLES  = ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL', 'FINANCIAL'] as const

// ─── Helpers internos ─────────────────────────────────────────────
async function getUserName(admin: ReturnType<typeof createAdminClient>, authId: string): Promise<string> {
  const { data } = await admin.from('users').select('name').eq('auth_id', authId).maybeSingle()
  return data?.name ?? 'Usuário'
}

async function logHistory(
  admin: ReturnType<typeof createAdminClient>,
  appointmentId: string,
  internalUserId: string | null,
  userName: string,
  action: string,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!internalUserId) return
  await admin.from('appointment_history').insert({
    appointment_id:  appointmentId,
    changed_by_id:   internalUserId,
    changed_by_name: userName,
    action,
    description,
    metadata: metadata ?? null,
  })
}

// ─── Criar agendamento ────────────────────────────────────────────
export async function addAppointment(
  _prev: { error?: string; success?: boolean; id?: string } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, [...WRITABLE_ROLES, 'PROFESSIONAL'])

    const slug           = formData.get('_slug') as string
    const branchId       = formData.get('_branchId') as string
    const clientId       = formData.get('client_id') as string
    const procedureId    = formData.get('procedure_id') as string
    const professionalId = formData.get('professional_id') as string
    const scheduledAt    = formData.get('scheduled_at') as string
    const notes          = (formData.get('notes') as string)?.trim() || null
    const roomId         = (formData.get('room_id') as string) || null
    const isEvaluation   = formData.get('is_evaluation') === 'true'

    if (!clientId)                         return { error: 'Selecione um cliente.' }
    if (!isEvaluation && !procedureId)     return { error: 'Selecione um procedimento.' }
    if (!professionalId)                   return { error: 'Selecione um profissional.' }
    if (!scheduledAt)                      return { error: 'Informe data e hora.' }
    if (!branchId)                         return { error: 'Filial não identificada.' }

    // Admin client para contornar qualquer edge-case de RLS nos lookups internos
    const admin = createAdminClient()

    // Busca preço e duração do procedimento (apenas quando houver procedimento selecionado)
    let procedure: { price: number; duration_min: number } | null = null
    if (procedureId) {
      const { data, error: procError } = await admin
        .from('procedures')
        .select('price, duration_min')
        .eq('id', procedureId)
        .eq('tenant_id', ctx.tenantId!)
        .single()
      if (procError || !data) return { error: 'Procedimento não encontrado.' }
      procedure = data
    }

    // Validação de conflito de sala (só faz sentido quando há duração definida)
    if (roomId && procedure) {
      const start = new Date(scheduledAt)
      const end   = new Date(start.getTime() + procedure.duration_min * 60000)
      const { data: conflict } = await admin
        .from('appointments')
        .select('id')
        .eq('branch_id', branchId)
        .eq('room_id', roomId)
        .not('status', 'in', '("CANCELLED","NO_SHOW")')
        .lt('scheduled_at', end.toISOString())
        .gt('scheduled_at', new Date(start.getTime() - procedure.duration_min * 60000).toISOString())
        .maybeSingle()
      if (conflict) return { error: 'Esta sala já está ocupada nesse horário.' }
    }

    const { data, error } = await admin
      .from('appointments')
      .insert({
        branch_id:       branchId,
        client_id:       clientId,
        procedure_id:    procedureId || null,
        professional_id: professionalId,
        room_id:         roomId,
        scheduled_at:    scheduledAt,
        duration_min:    procedure?.duration_min ?? 60,
        price:           procedure?.price ?? 0,
        notes,
        status:          'SCHEDULED',
        source:          'INTERNAL',
        is_evaluation:   isEvaluation,
      })
      .select('id')
      .single()

    if (error) return { error: `Erro ao criar agendamento: ${error.message}` }
    if (!data) return { error: 'Erro ao criar agendamento.' }

    const userName = await getUserName(admin, ctx.userId)
    await logHistory(admin, data.id, ctx.internalUserId, userName, 'CREATED', 'Agendamento criado')

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/dashboard`)
    return { success: true, id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Atualizar status do agendamento ─────────────────────────────
export async function updateAppointmentStatus(
  appointmentId: string,
  status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
  slug: string,
  cancellationReason?: string,
) {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])

  // Profissional só pode iniciar (IN_PROGRESS) ou concluir (COMPLETED)
  if (ctx.role === 'PROFESSIONAL' && !(['IN_PROGRESS', 'COMPLETED'] as string[]).includes(status)) {
    throw new Error('Forbidden')
  }

  if (status === 'CANCELLED' && !cancellationReason?.trim()) {
    throw new Error('Motivo de cancelamento obrigatório.')
  }

  const now = new Date().toISOString()
  const fields: Record<string, unknown> = { status }

  if (status === 'CONFIRMED')   fields.confirmed_at  = now
  if (status === 'IN_PROGRESS') fields.started_at    = now
  if (status === 'CANCELLED')   { fields.cancelled_at = now; fields.cancellation_reason = cancellationReason }

  const supabase = await createSupabase()

  if (status === 'COMPLETED') {
    await completeAppointment(appointmentId, slug)
    return
  }

  await supabase
    .from('appointments')
    .update(fields)
    .eq('id', appointmentId)
    .eq('branch_id', await resolveBranchId(supabase, appointmentId, ctx.tenantId!))

  const admin    = createAdminClient()
  const userName = await getUserName(admin, ctx.userId)
  const actionDescMap: Record<string, string> = {
    CONFIRMED:   'Agendamento confirmado',
    IN_PROGRESS: 'Atendimento iniciado',
    NO_SHOW:     'Cliente não compareceu',
    CANCELLED:   `Cancelado: ${cancellationReason ?? ''}`,
  }
  await logHistory(admin, appointmentId, ctx.internalUserId, userName, status, actionDescMap[status] ?? status)

  revalidatePath(`/${slug}/agenda`)
}

// Resolve o branchId pelo appointmentId (para validar acesso)
async function resolveBranchId(supabase: Awaited<ReturnType<typeof createSupabase>>, appointmentId: string, tenantId: string) {
  const { data } = await supabase
    .from('appointments')
    .select('branch_id, branches!inner(tenant_id)')
    .eq('id', appointmentId)
    .single()

  const branch = data?.branches as unknown as unknown as { tenant_id: string } | null
  if (!branch || branch.tenant_id !== tenantId) throw new Error('Acesso negado.')
  return data!.branch_id
}

// ─── Concluir atendimento (transação completa) ────────────────────
async function completeAppointment(appointmentId: string, slug: string) {
  // Nota: idealmente em prisma.$transaction — aqui sequencial via Supabase
  const admin = createAdminClient()

  const { data: appt } = await admin
    .from('appointments')
    .select('id, branch_id, client_id, procedure_id, professional_id, price')
    .eq('id', appointmentId)
    .single()

  if (!appt) throw new Error('Agendamento não encontrado.')

  // Garante que finishSession() foi chamado antes (cria prontuário + debita estoque)
  const { data: existingEntry } = await admin
    .from('medical_record_entries')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (!existingEntry) {
    throw new Error('O atendimento deve ser finalizado pelo profissional antes de ser concluído. Use a opção "Finalizar Sessão".')
  }

  const now = new Date().toISOString()

  // 1. Atualiza status
  await admin.from('appointments').update({ status: 'COMPLETED', completed_at: now }).eq('id', appointmentId)

  // 2. Cria entrada de prontuário (se não existir)
  await admin.from('medical_record_entries').upsert(
    { appointment_id: appointmentId, professional_id: appt.professional_id, anamnesis_data: {} },
    { onConflict: 'appointment_id', ignoreDuplicates: true }
  )

  // 3. Cria transação financeira
  await admin.from('financial_transactions').insert({
    branch_id:       appt.branch_id,
    appointment_id:  appointmentId,
    type:            'INCOME',
    amount:          appt.price,
    description:     'Atendimento concluído',
    payment_method:  'PIX',
  })

  // 4. Cria comissão (busca regra)
  const { data: rule } = await admin
    .from('commission_rules')
    .select('type, value')
    .eq('professional_id', appt.professional_id)
    .or(`procedure_id.eq.${appt.procedure_id},procedure_id.is.null`)
    .order('procedure_id', { nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (rule) {
    const amount = rule.type === 'PERCENTAGE'
      ? (parseFloat(String(appt.price)) * rule.value / 100)
      : rule.value
    const periodRef = new Date().toISOString().substring(0, 7)
    await admin.from('commissions').insert({
      branch_id:       appt.branch_id,
      professional_id: appt.professional_id,
      appointment_id:  appointmentId,
      amount,
      period_ref:      periodRef,
      status:          'OPEN',
    })
  }

  // 5. Credita pontos de fidelidade
  const { data: loyaltyConfig } = await admin
    .from('loyalty_configs')
    .select('points_per_real')
    .eq('tenant_id', (await admin.from('branches').select('tenant_id').eq('id', appt.branch_id).single()).data?.tenant_id)
    .maybeSingle()

  if (loyaltyConfig) {
    const points = Math.floor(parseFloat(String(appt.price)) * loyaltyConfig.points_per_real)
    if (points > 0) {
      const { data: loyaltyAcc } = await admin
        .from('loyalty_accounts')
        .select('id, balance')
        .eq('client_id', appt.client_id)
        .single()
      if (loyaltyAcc) {
        await admin.from('loyalty_accounts').update({ balance: loyaltyAcc.balance + points }).eq('id', loyaltyAcc.id)
        await admin.from('loyalty_transactions').insert({
          loyalty_account_id: loyaltyAcc.id,
          points,
          description:        'Atendimento concluído',
          appointment_id:     appointmentId,
        })
      }
    }
  }

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/dashboard`)
  revalidatePath(`/${slug}/financial`)
}

// ─── Check-in do cliente (SCHEDULED → CONFIRMED) ─────────────────
export async function checkinAppointment(
  appointmentId: string,
  slug: string,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

    const admin = createAdminClient()
    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }
    if (appt.status !== 'SCHEDULED') return { error: 'Check-in só é possível em agendamentos com status Agendado.' }

    await admin
      .from('appointments')
      .update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() })
      .eq('id', appointmentId)

    const userName = await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'CHECKIN', 'Check-in realizado — cliente chegou')

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Iniciar atendimento (CONFIRMED → IN_PROGRESS) ───────────────
export async function startAppointment(
  appointmentId: string,
  slug: string,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])

    const admin = createAdminClient()
    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, professional_id, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }
    if (appt.status !== 'CONFIRMED') return { error: 'O cliente precisa fazer check-in antes de iniciar.' }

    if (ctx.role === 'PROFESSIONAL' && appt.professional_id !== ctx.internalUserId) {
      return { error: 'Apenas o profissional responsável pode iniciar este atendimento.' }
    }

    await admin
      .from('appointments')
      .update({ status: 'IN_PROGRESS', started_at: new Date().toISOString() })
      .eq('id', appointmentId)

    const userName = await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'STARTED', 'Atendimento iniciado')

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Reatribuir profissional ──────────────────────────────────────
export async function reassignProfessional(
  appointmentId: string,
  professionalId: string,
  slug: string,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

    const admin = createAdminClient()
    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status as string)) {
      return { error: 'Não é possível reatribuir um atendimento já finalizado.' }
    }

    const { data: newProf } = await admin.from('users').select('name').eq('id', professionalId).single()
    await admin
      .from('appointments')
      .update({ professional_id: professionalId })
      .eq('id', appointmentId)

    const userName = await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'REASSIGNED',
      `Profissional reatribuído para ${newProf?.name ?? professionalId}`,
      { new_professional_id: professionalId, new_professional_name: newProf?.name },
    )

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Cancelar atendimento ─────────────────────────────────────────
export async function cancelAppointmentSession(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

    const appointmentId      = (formData.get('appointment_id') as string)?.trim()
    const cancellationReason = (formData.get('cancellation_reason') as string)?.trim()
    const slug               = (formData.get('slug') as string)?.trim()

    if (!cancellationReason) return { error: 'Informe o motivo do cancelamento.' }

    const admin = createAdminClient()
    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status as string)) return { error: 'Agendamento já finalizado.' }

    await admin.from('appointments').update({
      status:               'CANCELLED',
      cancelled_at:         new Date().toISOString(),
      cancellation_reason:  cancellationReason,
    }).eq('id', appointmentId)

    const userName = await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'CANCELLED',
      `Cancelado: ${cancellationReason}`)

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Concluir atendimento (fluxo completo) ────────────────────────
// ── Profissional finaliza o atendimento (clínico) ─────────────────────────────
// Cria prontuário, baixa estoque, registra comissão e pontos.
// NÃO cria transação financeira — isso é responsabilidade de confirmPayment.
export async function finishSession(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])

    const appointmentId  = (formData.get('appointment_id') as string)?.trim()
    const notes          = (formData.get('notes') as string)?.trim() || null
    const intercurrences = (formData.get('intercurrences') as string)?.trim() || null
    const slug           = (formData.get('slug') as string)?.trim()

    const admin = createAdminClient()

    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, branch_id, client_id, procedure_id, professional_id, price, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }
    if (appt.status === 'COMPLETED')                      return { error: 'Atendimento já concluído.' }
    if (['CANCELLED', 'NO_SHOW'].includes(appt.status as string)) return { error: 'Agendamento já finalizado.' }

    if (ctx.role === 'PROFESSIONAL' && appt.professional_id !== ctx.internalUserId) {
      return { error: 'Apenas o profissional responsável pode concluir este atendimento.' }
    }

    const now = new Date().toISOString()

    // 1. Marca como concluído
    await admin.from('appointments').update({
      status:       'COMPLETED',
      completed_at: now,
    }).eq('id', appointmentId)

    // 2. Prontuário
    let { data: medRecord } = await admin
      .from('medical_records')
      .select('id')
      .eq('client_id', appt.client_id)
      .maybeSingle()

    if (!medRecord) {
      const { data: newRecord } = await admin
        .from('medical_records')
        .insert({ client_id: appt.client_id })
        .select('id')
        .single()
      medRecord = newRecord
    }

    if (medRecord) {
      await admin.from('medical_record_entries').upsert({
        medical_record_id: medRecord.id,
        appointment_id:    appointmentId,
        professional_id:   appt.professional_id,
        notes,
        intercurrences,
      }, { onConflict: 'appointment_id' })
    }

    // 3. Comissão
    const { data: rule } = await admin
      .from('commission_rules')
      .select('type, value')
      .eq('professional_id', appt.professional_id)
      .or(`procedure_id.eq.${appt.procedure_id},procedure_id.is.null`)
      .order('procedure_id', { nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (rule) {
      const commissionAmount = rule.type === 'PERCENTAGE'
        ? (parseFloat(String(appt.price)) * parseFloat(String(rule.value)) / 100)
        : parseFloat(String(rule.value))
      await admin.from('commissions').insert({
        branch_id:       appt.branch_id,
        professional_id: appt.professional_id,
        appointment_id:  appointmentId,
        amount:          commissionAmount,
        period_ref:      now.substring(0, 7),
        status:          'OPEN',
      })
    }

    // 4. Pontos de fidelidade
    const { data: loyaltyConfig } = await admin
      .from('loyalty_configs')
      .select('points_per_real')
      .eq('tenant_id', apptBranch!.tenant_id)
      .maybeSingle()

    if (loyaltyConfig) {
      const points = Math.floor(parseFloat(String(appt.price)) * parseFloat(String(loyaltyConfig.points_per_real ?? 0)))
      if (points > 0) {
        const { data: loyaltyAcc } = await admin
          .from('loyalty_accounts')
          .select('id, balance')
          .eq('client_id', appt.client_id)
          .maybeSingle()
        if (loyaltyAcc) {
          await admin.from('loyalty_accounts').update({ balance: (loyaltyAcc.balance ?? 0) + points }).eq('id', loyaltyAcc.id)
          await admin.from('loyalty_transactions').insert({
            loyalty_account_id: loyaltyAcc.id,
            points,
            description:        'Atendimento concluído',
            appointment_id:     appointmentId,
          })
        }
      }
    }

    // 5. Baixar estoque
    let productsUsed: { productId: string; quantity: number }[] = []
    try {
      productsUsed = JSON.parse((formData.get('products_used') as string | null) ?? '[]')
    } catch { /* JSON inválido → sem insumos */ }

    for (const item of productsUsed) {
      if (!item.productId || !item.quantity || item.quantity <= 0) continue

      const [{ data: bps }, { data: prod }] = await Promise.all([
        admin.from('branch_product_stock')
          .select('current_stock, min_stock, current_rendimento')
          .eq('product_id', item.productId)
          .eq('branch_id', appt.branch_id)
          .maybeSingle(),
        admin.from('products')
          .select('units_per_package, consumption_unit, cost_price')
          .eq('id', item.productId)
          .maybeSingle(),
      ])

      const currentStock = Number(bps?.current_stock ?? 0)
      const minStock     = Number(bps?.min_stock ?? 0)
      const upp          = prod?.units_per_package && prod?.consumption_unit ? Number(prod.units_per_package) : null

      let newPackages: number
      let newRendimento: number | null
      let movQty: number       // quantity registrado no movement (sempre negativo)
      let movBalance: number   // balance_after no movement

      if (upp) {
        // item.quantity está em unidades de consumo (ex: 2 UI, 5 ml)
        const currentRendimento = bps?.current_rendimento != null
          ? Number(bps.current_rendimento)
          : currentStock * upp  // fallback: assume embalagens cheias

        newRendimento = Math.max(0, currentRendimento - item.quantity)
        newPackages   = newRendimento === 0 ? 0 : Math.ceil(newRendimento / upp)
        movQty        = -item.quantity
        movBalance    = newRendimento  // balance em unidades de consumo
      } else {
        // Produto sem unidade de consumo: item.quantity = embalagens
        newRendimento = null
        newPackages   = Math.max(0, currentStock - item.quantity)
        movQty        = -item.quantity
        movBalance    = newPackages
      }

      const { error: movErr } = await admin.from('stock_movements').insert({
        branch_id:      appt.branch_id,
        product_id:     item.productId,
        type:           'PROCEDURE_USAGE',
        quantity:       movQty,
        balance_after:  movBalance,
        appointment_id: appointmentId,
        created_by:     ctx.internalUserId,
        unit_cost:      prod?.cost_price ?? null,
      })
      if (movErr) return { error: `Erro ao registrar movimentação de estoque: ${movErr.message}` }

      const { error: bpsErr } = await admin.from('branch_product_stock').upsert({
        product_id:         item.productId,
        branch_id:          appt.branch_id,
        current_stock:      newPackages,
        current_rendimento: newRendimento,
        min_stock:          minStock,
        updated_at:         now,
      }, { onConflict: 'product_id,branch_id' })
      if (bpsErr) return { error: `Erro ao atualizar estoque: ${bpsErr.message}` }
    }

    // 6. Atualiza sessão de pacote (se este agendamento pertencer a um)
    const { data: pkgSession } = await admin
      .from('package_sessions')
      .select('id, client_package_id')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (pkgSession) {
      await admin
        .from('package_sessions')
        .update({ status: 'USED', used_at: now })
        .eq('id', pkgSession.id)

      const { data: pkg } = await admin
        .from('client_packages')
        .select('used_sessions')
        .eq('id', pkgSession.client_package_id)
        .single()

      if (pkg) {
        await admin
          .from('client_packages')
          .update({ used_sessions: Number(pkg.used_sessions) + 1 })
          .eq('id', pkgSession.client_package_id)
      }
    }

    const userName = await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'COMPLETED', 'Atendimento concluído pelo profissional')

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidatePath(`/${slug}/dashboard`)
    revalidatePath(`/${slug}/stock`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ── Recepcionista/admin confirma pagamento ─────────────────────────────────────
export async function confirmPayment(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'FINANCIAL'])

    const appointmentId = (formData.get('appointment_id') as string)?.trim()
    const paymentMethod = (formData.get('payment_method') as string)?.trim()
    const slug          = (formData.get('slug') as string)?.trim()

    if (!paymentMethod) return { error: 'Selecione a forma de pagamento.' }

    const admin = createAdminClient()

    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, branch_id, price, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }
    if (appt.status !== 'COMPLETED') return { error: 'O atendimento precisa estar concluído para confirmar pagamento.' }

    // Garante idempotência — não cria duplicata
    const { data: existing } = await admin
      .from('financial_transactions')
      .select('id')
      .eq('appointment_id', appointmentId)
      .maybeSingle()
    if (existing) return { error: 'Pagamento já registrado para este atendimento.' }

    const now = new Date().toISOString()

    await admin.from('financial_transactions').insert({
      branch_id:      appt.branch_id,
      appointment_id: appointmentId,
      type:           'INCOME',
      amount:         appt.price,
      description:    'Atendimento concluído',
      payment_method: paymentMethod,
      is_paid:        true,
      paid_at:        now,
      created_by:     ctx.internalUserId,
    })

    const userName = await getUserName(admin, ctx.userId)
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'PAYMENT_CONFIRMED',
      `Pagamento confirmado via ${paymentMethod}`)

    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidatePath(`/${slug}/financial`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Salvar rascunho de notas (sem concluir) ─────────────────────
export async function saveDraftNotes(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])

    const appointmentId  = (formData.get('appointment_id') as string)?.trim()
    const notes          = (formData.get('notes') as string)?.trim() || null
    const intercurrences = (formData.get('intercurrences') as string)?.trim() || null

    const admin = createAdminClient()
    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, client_id, professional_id, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }

    // Profissional não pode editar registro já finalizado
    const isFinalised = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status as string)
    const isAdmin     = ['NETWORK_ADMIN', 'BRANCH_ADMIN'].includes(ctx.role)
    if (isFinalised && !isAdmin) return { error: 'Registro finalizado. Apenas gerentes podem editar.' }

    // Get or create medical_records
    let { data: medRecord } = await admin
      .from('medical_records')
      .select('id')
      .eq('client_id', appt.client_id)
      .maybeSingle()

    if (!medRecord) {
      const { data: newRecord } = await admin
        .from('medical_records')
        .insert({ client_id: appt.client_id })
        .select('id')
        .single()
      medRecord = newRecord
    }

    if (medRecord) {
      await admin.from('medical_record_entries').upsert({
        medical_record_id: medRecord.id,
        appointment_id:    appointmentId,
        professional_id:   appt.professional_id,
        notes,
        intercurrences,
      }, { onConflict: 'appointment_id' })
    }

    // Log quando admin edita pós-conclusão
    if (isFinalised && isAdmin) {
      const userName = await getUserName(admin, ctx.userId)
      await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'EDITED',
        'Observações do atendimento editadas pelo gerente')
    }

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Salvar queixas do cliente na avaliação ──────────────────────
export async function saveEvaluationComplaints(
  appointmentId: string,
  complaints: string,
): Promise<{ error?: string }> {
  try {
    const ctx   = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])
    const admin = createAdminClient()
    const { error } = await admin
      .from('appointments')
      .update({ notes: complaints || null })
      .eq('id', appointmentId)
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Salvar anotações da sessão (anamnese) ────────────────────────
export async function saveSessionNotes(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL', 'RECEPTIONIST'])

    const appointmentId = formData.get('_appointmentId') as string
    const notes         = (formData.get('session_notes') as string)?.trim() ?? ''

    const admin = createAdminClient()

    const { data: appt } = await admin
      .from('appointments')
      .select('id, professional_id, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const branch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || branch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }

    await admin
      .from('medical_record_entries')
      .upsert(
        {
          appointment_id:  appointmentId,
          professional_id: appt.professional_id,
          anamnesis_data:  { notes },
        },
        { onConflict: 'appointment_id' },
      )

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ─── Reagendar ────────────────────────────────────────────────────
export async function rescheduleAppointment(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, [...WRITABLE_ROLES])

    const appointmentId  = formData.get('_appointmentId') as string
    const scheduledAt    = formData.get('scheduled_at') as string
    const professionalId = formData.get('professional_id') as string
    const slug           = formData.get('_slug') as string

    if (!appointmentId || !scheduledAt) return { error: 'Dados inválidos.' }

    const admin = createAdminClient()

    // Verifica que o agendamento pertence ao tenant antes de atualizar
    const { data: existing } = await admin
      .from('appointments')
      .select('id, branch_id, branches!inner(tenant_id)')
      .eq('id', appointmentId)
      .single()

    const branch = existing?.branches as unknown as { tenant_id: string } | null
    if (!existing || branch?.tenant_id !== ctx.tenantId) {
      return { error: 'Agendamento não encontrado.' }
    }

    const { error } = await admin
      .from('appointments')
      .update({
        scheduled_at:    scheduledAt,
        professional_id: professionalId || undefined,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', appointmentId)

    if (error) return { error: `Erro ao reagendar: ${error.message}` }

    const userName = await getUserName(admin, ctx.userId)
    const dt = new Date(scheduledAt)
    const dtStr = dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    await logHistory(admin, appointmentId, ctx.internalUserId, userName, 'RESCHEDULED',
      `Reagendado para ${dtStr}`, { scheduled_at: scheduledAt })

    revalidatePath(`/${slug}/agenda`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// ── Dados de agendamento pelo checkout ───────────────────────────────────────

export async function getSchedulingBranchProfessionals(
  branchId: string,
): Promise<{ professionals: { id: string; name: string }[] }> {
  const ctx   = await getTenantContext()
  assertRole(ctx, [...ALL_BRANCH_ROLES])
  const admin = createAdminClient()

  const { data: branch } = await admin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (!branch) return { professionals: [] }

  const { data } = await admin
    .from('users')
    .select('id, name')
    .eq('branch_id', branchId)
    .in('role', ['BRANCH_ADMIN', 'PROFESSIONAL'])
    .eq('is_active', true)
    .order('name')

  return { professionals: (data ?? []) as { id: string; name: string }[] }
}

// ─── Sessões de pacote ────────────────────────────────────────────

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
  assertRole(ctx, [...ALL_BRANCH_ROLES])
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('branch_id')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { sessions: [] }

  const { data: branch } = await admin
    .from('branches')
    .select('tenant_id')
    .eq('id', (plan as any).branch_id)
    .maybeSingle()
  if ((branch as any)?.tenant_id !== ctx.tenantId) return { sessions: [] }

  // Busca treatment_plan_sessions com appointment vinculado
  const { data: rawSessions } = await admin
    .from('treatment_plan_sessions')
    .select(`
      id, sort_order, appointment_id,
      treatment_plan_session_procedures(procedure_id, sort_order, procedures(name)),
      appointments:appointment_id(id, status, scheduled_at, professional:users!professional_id(name))
    `)
    .eq('plan_id', planId)
    .order('sort_order')

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

export async function getClientPackageSessions(clientPackageId: string): Promise<{
  sessions: Array<{
    id:             string
    sessionNumber:  number
    status:         string
    appointmentId:  string | null
    scheduledAt:    string | null
    apptStatus:     string | null
    professionalName: string | null
  }>
}> {
  const ctx   = await getTenantContext()
  assertRole(ctx, [...ALL_BRANCH_ROLES])
  const admin = createAdminClient()

  // Valida que o client_package pertence ao tenant
  const { data: pkg } = await admin
    .from('client_packages')
    .select('id, branch_id, branches!inner(tenant_id)')
    .eq('id', clientPackageId)
    .maybeSingle()
  if (!pkg) return { sessions: [] }
  const branch = (pkg as any).branches
  if (branch?.tenant_id !== ctx.tenantId) return { sessions: [] }

  const { data } = await admin
    .from('package_sessions')
    .select('id, session_number, status, appointment_id, appointments(status, scheduled_at, professional:users!professional_id(name))')
    .eq('client_package_id', clientPackageId)
    .order('session_number')

  return {
    sessions: (data ?? []).map((s: any) => ({
      id:              s.id as string,
      sessionNumber:   s.session_number as number,
      status:          s.status as string,
      appointmentId:   s.appointment_id as string | null,
      scheduledAt:     s.appointments?.scheduled_at ?? null,
      apptStatus:      s.appointments?.status ?? null,
      professionalName: s.appointments?.professional?.name ?? null,
    })),
  }
}

export async function schedulePackageSession(params: {
  packageSessionId: string
  branchId:         string
  professionalId:   string
  scheduledAt:      string
  clientId:         string
  procedureId:      string
  price:            number
  durationMin:      number
  slug:             string
}): Promise<{ error?: string; appointmentId?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])
  const admin = createAdminClient()

  // Valida sessão pertence ao tenant
  const { data: sess } = await admin
    .from('package_sessions')
    .select('id, appointment_id, client_package_id, client_packages!inner(branch_id, branches!inner(tenant_id))')
    .eq('id', params.packageSessionId)
    .maybeSingle()
  if (!sess) return { error: 'Sessão não encontrada.' }
  const tenantId = (sess as any).client_packages?.branches?.tenant_id
  if (tenantId !== ctx.tenantId) return { error: 'Sem permissão.' }
  if ((sess as any).appointment_id) return { error: 'Sessão já está agendada.' }

  // Cria appointment
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .insert({
      branch_id:       params.branchId,
      client_id:       params.clientId,
      procedure_id:    params.procedureId,
      professional_id: params.professionalId,
      scheduled_at:    params.scheduledAt,
      duration_min:    params.durationMin,
      price:           params.price,
      status:          'SCHEDULED',
      source:          'INTERNAL',
    })
    .select('id')
    .single()
  if (apptErr || !appt) return { error: `Erro ao criar agendamento: ${apptErr?.message}` }

  // Vincula sessão ao appointment
  await admin
    .from('package_sessions')
    .update({ appointment_id: appt.id, status: 'SCHEDULED' })
    .eq('id', params.packageSessionId)

  revalidatePath(`/${params.slug}/clients/${params.clientId}`)
  return { appointmentId: appt.id }
}

export async function schedulePlanSession(params: {
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
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, branch_id, branches!inner(tenant_id)')
    .eq('id', params.planId)
    .maybeSingle()
  if (!plan) return { error: 'Plano não encontrado.' }
  if ((plan as any).branches?.tenant_id !== ctx.tenantId) return { error: 'Sem permissão.' }

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
  await admin
    .from('treatment_plan_sessions')
    .update({ appointment_id: appt.id })
    .eq('id', params.sessionId)

  revalidatePath(`/${params.slug}/clients/${params.clientId}`)
  return { appointmentId: appt.id }
}

export async function getSchedulingDaySlots(
  branchId: string,
  professionalId: string,
  date: string,
): Promise<{ slots: { scheduledAt: string; durationMin: number; clientName: string | null }[] }> {
  const ctx   = await getTenantContext()
  assertRole(ctx, [...ALL_BRANCH_ROLES])
  const admin = createAdminClient()

  const { data: branch } = await admin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (!branch) return { slots: [] }

  // Brazil UTC-3
  const dayStart = new Date(`${date}T00:00:00-03:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59-03:00`).toISOString()

  const { data } = await admin
    .from('appointments')
    .select('scheduled_at, duration_min, clients(name)')
    .eq('branch_id', branchId)
    .eq('professional_id', professionalId)
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)
    .not('status', 'in', '("CANCELLED","NO_SHOW")')
    .order('scheduled_at')

  return {
    slots: (data ?? []).map((d: any) => ({
      scheduledAt: d.scheduled_at as string,
      durationMin: d.duration_min as number,
      clientName:  (d.clients as any)?.name ?? null,
    })),
  }
}
