import { notFound } from 'next/navigation'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { getCachedProductsReference } from '@/lib/cached-queries'
import { AppointmentSession } from '@/components/branch/appointment-session'
import type { SessionAppointment, SessionClient, SessionProduct, AvailableProduct, SessionProfessional, HistoryEntry } from '@/components/branch/appointment-session'
import { normalizeFormSchema, type AnamnesisField } from '@/lib/anamnesis'
import type { GeneralAnamnesis } from '@/components/branch/anamnesis-tab'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

export default async function AppointmentSessionPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const ctx          = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])

  const supabase = await createSupabase()
  const admin    = createAdminClient()

  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) notFound()

  // 1ª rodada: appointment + MRE em paralelo
  const [{ data: apptRaw }, { data: mreRaw }] = await Promise.all([
    admin
      .from('appointments')
      .select(`
        id, status, scheduled_at, started_at, completed_at, cancelled_at,
        cancellation_reason, price, duration_min, client_notes, notes, procedure_id, professional_id,
        is_evaluation, treatment_plan_id,
        client_confirmed_at, client_rating, procedure_rating, client_feedback,
        procedures(id, name, category, duration_min, anamnesis_form_id),
        professional:users!professional_id(id, name),
        room:rooms(id, name),
        client:clients(id, name, phone, birth_date, tags, notes, document)
      `)
      .eq('id', id)
      .eq('branch_id', branch.id)
      .single(),

    admin
      .from('medical_record_entries')
      .select('notes, intercurrences, anamnesis_data')
      .eq('appointment_id', id)
      .maybeSingle(),
  ])

  if (!apptRaw) notFound()

  type RawProc   = { id: string; name: string; category: string; duration_min: number }
  type RawProf   = { id: string; name: string }
  type RawRoom   = { id: string; name: string } | null
  type RawClient = { id: string; name: string; phone: string | null; birth_date: string | null; tags: string[] | null; notes: string | null; document: string | null }

  const proc = apptRaw.procedures   as unknown as RawProc   | null
  const prof = apptRaw.professional as unknown as RawProf   | null
  const room = apptRaw.room         as unknown as RawRoom
  const cli  = apptRaw.client       as unknown as RawClient | null
  if (!cli) notFound()

  const procedureId = apptRaw.procedure_id as string | null

  // 2ª rodada: anamnese + insumos + produtos + profissionais + histórico + pagamento + plano de tratamento
  const treatmentPlanId = (apptRaw as any).treatment_plan_id as string | null
  const isPartOfPlan    = !!treatmentPlanId && !apptRaw.is_evaluation

  const [
    { data: medRecord }, { data: procProductsRaw }, branchProductsRaw,
    { data: professionalsRaw }, { data: historyRaw }, { data: paymentRaw },
    { data: allProceduresRaw }, { data: packagesRaw }, { data: planRaw },
    { data: planSessionRaw },
  ] = await Promise.all([
    admin
      .from('medical_records')
      .select('general_anamnesis')
      .eq('client_id', cli.id)
      .maybeSingle(),

    procedureId
      ? admin
          .from('procedure_products')
          .select('product_id, quantity, products(name, unit, consumption_unit, units_per_package)')
          .eq('procedure_id', procedureId)
      : Promise.resolve({ data: [] as never[], error: null }),

    getCachedProductsReference(ctx.tenantId!),

    admin
      .from('users')
      .select('id, name')
      .eq('branch_id', branch.id)
      .eq('role', 'PROFESSIONAL')
      .eq('is_active', true)
      .order('name'),

    admin
      .from('appointment_history')
      .select('id, changed_by_name, action, description, created_at')
      .eq('appointment_id', id)
      .order('created_at', { ascending: false }),

    admin
      .from('financial_transactions')
      .select('id, payment_method, amount')
      .eq('appointment_id', id)
      .maybeSingle(),

    // Todos os procedimentos ativos da rede (para o plano de tratamento) — com insumos embutidos
    admin
      .from('procedures')
      .select('id, name, category, duration_min, price, procedure_products(product_id, quantity, products(id, name, unit, consumption_unit, units_per_package))')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'),

    // Pacotes disponíveis
    admin
      .from('service_packages')
      .select('id, name, procedure_id, total_sessions, price')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true),

    // Plano de tratamento existente para este appointment
    admin
      .from('treatment_plans')
      .select(`
        id, status, professional_notes,
        treatment_plan_sessions(
          id, sort_order,
          treatment_plan_session_procedures(procedure_id, price, sort_order, products, procedures(name))
        )
      `)
      .eq('evaluation_appointment_id', id)
      .maybeSingle(),

    // Sessão do plano vinculada a este agendamento (para sessões de execução)
    isPartOfPlan
      ? admin
          .from('treatment_plan_sessions')
          .select('treatment_plan_session_procedures(products)')
          .eq('appointment_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null }),

  ])

  type RawProcProduct = {
    product_id: string
    quantity:   number
    products:   { name: string; unit: string; consumption_unit: string | null; units_per_package: number | null } | null
  }

  const anamnesis = (medRecord?.general_anamnesis as GeneralAnamnesis | null) ?? null

  // Produtos do procedimento (insumos padrão)
  const defaultProducts: SessionProduct[] = ((procProductsRaw ?? []) as unknown as RawProcProduct[])
    .filter(pp => pp.products !== null)
    .map(pp => {
      const p = pp.products!
      const displayUnit = (p.consumption_unit && p.units_per_package) ? p.consumption_unit : p.unit
      return {
        productId: pp.product_id,
        name:      p.name,
        unit:      displayUnit,
        quantity:  pp.quantity,
      }
    })

  // Produtos da sessão do plano de tratamento (sobrepõem os padrão quando presentes)
  type RawSessProduct = { product_id: string; name: string; unit: string; quantity: number }
  type RawSessProc    = { products: RawSessProduct[] | null }
  const planSessionProducts: SessionProduct[] = planSessionRaw
    ? ((planSessionRaw as any).treatment_plan_session_procedures as RawSessProc[] ?? [])
        .flatMap(sp => (sp.products ?? []).map(p => ({
          productId: p.product_id,
          name:      p.name,
          unit:      p.unit,
          quantity:  Number(p.quantity),
        })))
    : []

  const products = planSessionProducts.length > 0 ? planSessionProducts : defaultProducts

  // Todos os produtos ativos da rede (para o profissional adicionar avulso)
  type RawBranchProduct = { id: string; name: string; unit: string; consumption_unit: string | null; units_per_package: number | null }
  const availableProducts: AvailableProduct[] = ((branchProductsRaw ?? []) as RawBranchProduct[]).map(p => ({
    id:   p.id,
    name: p.name,
    unit: (p.consumption_unit && p.units_per_package) ? p.consumption_unit : p.unit,
  }))

  const professionals: SessionProfessional[] = ((professionalsRaw ?? []) as { id: string; name: string }[]).map(p => ({
    id:   p.id,
    name: p.name,
  }))

  type RawHistory = { id: string; changed_by_name: string; action: string; description: string; created_at: string }
  const history: HistoryEntry[] = ((historyRaw ?? []) as RawHistory[]).map(h => ({
    id:            h.id,
    changedByName: h.changed_by_name,
    action:        h.action,
    description:   h.description,
    createdAt:     h.created_at,
  }))

  // Procedimentos e pacotes para o editor de plano de tratamento
  type RawProcInsumo = {
    product_id: string
    quantity:   number
    products:   { id: string; name: string; unit: string; consumption_unit: string | null; units_per_package: number | null } | null
  }
  type RawAllProc = {
    id:                 string
    name:               string
    category:           string
    duration_min:       number
    price:              number
    procedure_products: RawProcInsumo[]
  }

  const allProcs = (allProceduresRaw ?? []) as unknown as RawAllProc[]

  const treatmentProcedures = allProcs.map(p => ({
    id:          p.id,
    name:        p.name,
    category:    p.category,
    durationMin: p.duration_min,
    price:       Number(p.price),
    products:    (p.procedure_products ?? [])
      .filter(pp => pp.products !== null)
      .map(pp => {
        const pr   = pp.products!
        const unit = (pr.consumption_unit && pr.units_per_package) ? pr.consumption_unit : pr.unit
        return { productId: pp.product_id, name: pr.name, unit, quantity: Number(pp.quantity) }
      }),
  }))

  // Mapa de insumos padrão por procedure_id
  const procedureProductsMap: Record<string, { productId: string; name: string; unit: string; quantity: number }[]> = {}
  for (const proc of allProcs) {
    procedureProductsMap[proc.id] = (proc.procedure_products ?? [])
      .filter(pp => pp.products !== null)
      .map(pp => {
        const p    = pp.products!
        const unit = (p.consumption_unit && p.units_per_package) ? p.consumption_unit : p.unit
        return { productId: pp.product_id, name: p.name, unit, quantity: Number(pp.quantity) }
      })
  }

  type RawPkg = { id: string; name: string; procedure_id: string; total_sessions: number; price: number }
  const treatmentPackages = ((packagesRaw ?? []) as RawPkg[]).map(p => ({
    id: p.id, name: p.name, procedureId: p.procedure_id, totalSessions: p.total_sessions, price: Number(p.price),
  }))

  // Plano de tratamento existente (se houver)
  type RawPlanProcProduct = { product_id: string; name: string; unit: string; quantity: number }
  type RawPlanSessProc = { procedure_id: string; price: number; sort_order: number; products: RawPlanProcProduct[]; procedures: { name: string } | null }
  type RawPlanSess = { id: string; sort_order: number; treatment_plan_session_procedures: RawPlanSessProc[] }
  const existingPlan = planRaw ? {
    id:       planRaw.id as string,
    status:   planRaw.status as string,
    notes:    (planRaw.professional_notes as string | null) ?? null,
    sessions: ((planRaw.treatment_plan_sessions as unknown as RawPlanSess[]) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(sess => ({
        procedures: (sess.treatment_plan_session_procedures ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(p => ({
            procedureId: p.procedure_id,
            name:        (p.procedures as { name?: string } | null)?.name ?? '—',
            price:       Number(p.price),
            products:    (p.products ?? []).map((pr: RawPlanProcProduct) => ({
              productId: pr.product_id, name: pr.name, unit: pr.unit, quantity: Number(pr.quantity),
            })),
          })),
      })),
  } : null

  const appointment: SessionAppointment = {
    id:                  apptRaw.id,
    status:              apptRaw.status,
    scheduledAt:         apptRaw.scheduled_at,
    startedAt:           apptRaw.started_at ?? null,
    completedAt:         apptRaw.completed_at ?? null,
    cancelledAt:         apptRaw.cancelled_at ?? null,
    cancellationReason:  apptRaw.cancellation_reason ?? null,
    price:               parseFloat(String(apptRaw.price ?? 0)),
    durationMin:         Number(proc?.duration_min ?? apptRaw.duration_min ?? 0),
    clientNotes:         apptRaw.client_notes ?? null,
    procedureName:       proc?.name ?? '—',
    procedureCategory:   proc?.category ?? '',
    professionalId:      prof?.id ?? '',
    professionalName:    prof?.name ?? '—',
    roomName:            room?.name ?? null,
    savedNotes:          mreRaw?.notes ?? null,
    savedIntercurrences: mreRaw?.intercurrences ?? null,
    isEvaluation:        Boolean((apptRaw as any).is_evaluation),
    complaints:          (apptRaw as any).notes ?? null,
    clientConfirmedAt:   (apptRaw as any).client_confirmed_at ?? null,
    clientRating:        (apptRaw as any).client_rating ?? null,
    procedureRating:     (apptRaw as any).procedure_rating ?? null,
    clientFeedback:      (apptRaw as any).client_feedback ?? null,
  }

  const client: SessionClient = {
    id:        cli.id,
    name:      cli.name,
    phone:     cli.phone ?? null,
    birthDate: cli.birth_date ?? null,
    tags:      (cli.tags as string[]) ?? [],
    notes:     cli.notes ?? null,
    document:  cli.document ?? null,
  }

  const isAdmin   = ['NETWORK_ADMIN', 'BRANCH_ADMIN'].includes(ctx.role)
  const isResponsibleProfessional = ctx.role === 'PROFESSIONAL' && ctx.internalUserId === apptRaw.professional_id

  const canCheckin   = ['RECEPTIONIST', 'BRANCH_ADMIN', 'NETWORK_ADMIN'].includes(ctx.role)
  const canManage    = isResponsibleProfessional || isAdmin
  const canReassign  = isAdmin
  const canPayment   = ['RECEPTIONIST', 'BRANCH_ADMIN', 'NETWORK_ADMIN', 'FINANCIAL'].includes(ctx.role)

  type RawPayment = { id: string; payment_method: string; amount: number } | null
  const paymentRawTyped = paymentRaw as RawPayment
  const paymentTransaction = paymentRawTyped
    ? { id: paymentRawTyped.id, paymentMethod: paymentRawTyped.payment_method, amount: Number(paymentRawTyped.amount) }
    : null

  // Ficha de anamnese vinculada ao procedimento (construtor) + respostas já salvas
  const procedureFormId = (apptRaw.procedures as unknown as { anamnesis_form_id?: string | null } | null)?.anamnesis_form_id ?? null
  let anamnesisForm: { name: string; fields: AnamnesisField[] } | null = null
  let anamnesisAnswers: Record<string, unknown> = {}
  if (procedureFormId) {
    const { data: formRow } = await admin
      .from('anamnesis_forms')
      .select('name, schema')
      .eq('id', procedureFormId)
      .eq('tenant_id', ctx.tenantId!)
      .maybeSingle()
    if (formRow) {
      anamnesisForm = { name: formRow.name as string, fields: normalizeFormSchema(formRow.schema).fields }
      const cf = (mreRaw?.anamnesis_data as { customForm?: { answers?: Record<string, unknown> } } | null)?.customForm
      if (cf?.answers && typeof cf.answers === 'object') anamnesisAnswers = cf.answers
    }
  }

  return (
    <>
      <RealtimeRefresher tables={['appointments', 'medical_record_entries', 'financial_transactions']} />
      <AppointmentSession
        appointment={appointment}
        client={client}
        anamnesis={anamnesis}
        anamnesisForm={anamnesisForm}
        anamnesisAnswers={anamnesisAnswers}
        products={products}
        availableProducts={availableProducts}
        professionals={professionals}
        history={history}
        branchId={branch.id}
        slug={slug}
        canCheckin={canCheckin}
        canManage={canManage}
        canReassign={canReassign}
        canPayment={canPayment}
        isProfessional={ctx.role === 'PROFESSIONAL'}
        paymentTransaction={paymentTransaction}
        treatmentProcedures={treatmentProcedures}
        treatmentPackages={treatmentPackages}
        existingPlan={existingPlan}
        procedureProductsMap={procedureProductsMap}
        isPartOfPlan={isPartOfPlan}
      />
    </>
  )
}
