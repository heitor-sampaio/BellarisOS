import { notFound } from 'next/navigation'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { differenceInYears, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ClientProfile } from '@/components/branch/client-profile'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import type { ProfileClient, ProfileStats, ProfileAppointment, ProfilePackage, ProfileTransaction, ProfileInternalCredit, ClientHistoryEvent } from '@/components/branch/client-profile'
import type { ClientDocumentItem } from '@/components/branch/client-documents-tab'

const UPCOMING_STATUSES = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS']

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const ctx = await getTenantContext()
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

  const { data: raw } = await admin
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('branch_id', branch.id)
    .single()
  if (!raw) notFound()

  const client: ProfileClient = {
    id:                raw.id,
    name:              raw.name,
    phone:             raw.phone,
    email:             raw.email ?? null,
    document:          raw.document ?? null,
    birthDate:         raw.birth_date ?? null,
    tags:              (raw.tags as string[]) ?? [],
    notes:             raw.notes ?? null,
    isActive:          raw.is_active,
    createdAt:         raw.created_at,
    zipCode:           (raw as any).zip_code ?? null,
    address:           (raw as any).address ?? null,
    addressNumber:     (raw as any).address_number ?? null,
    addressComplement: (raw as any).address_complement ?? null,
    neighborhood:      (raw as any).neighborhood ?? null,
    city:              (raw as any).city ?? null,
    state:             (raw as any).state ?? null,
  }

  // Parallel data fetches
  const [
    { data: appts },
    { data: loyalty },
    { data: medRecord },
    { data: pkgs },
    { data: docsRaw },
    { data: txAppts },
    { data: directTxRaw },
    { data: credits },
    { data: branchesRaw },
    { data: activePlansRaw },
    { data: allPlansHistRaw },
  ] = await Promise.all([
    admin
      .from('appointments')
      .select('id, scheduled_at, status, price, treatment_plan_id, created_at, completed_at, cancelled_at, is_evaluation, procedures(name), professional:users!professional_id(name)')
      .eq('client_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(60),

    admin
      .from('loyalty_accounts')
      .select('balance')
      .eq('client_id', id)
      .maybeSingle(),

    admin
      .from('medical_records')
      .select('id, general_anamnesis, consent_terms(id, title, signed_at, signed_via), entries:medical_record_entries(notes, created_at)')
      .eq('client_id', id)
      .maybeSingle(),

    admin
      .from('client_packages')
      .select('id, total_sessions, used_sessions, expires_at, service_packages(name, procedure_id, price, procedures(name, duration_min))')
      .eq('client_id', id)
      .order('purchased_at', { ascending: false })
      .limit(10),

    admin
      .from('client_documents')
      .select('id, name, category, file_url, file_name, file_size, mime_type, uploaded_by:users!uploaded_by(name), created_at')
      .eq('client_id', id)
      .eq('branch_id', branch.id)
      .order('created_at', { ascending: false }),

    // Transações via agendamentos concluídos
    admin
      .from('appointments')
      .select(`
        scheduled_at,
        procedures(name),
        transaction:financial_transactions(
          id, description, amount, payment_method, is_paid, paid_at, created_at,
          installments(id, number, total, amount, due_date, is_paid, paid_at)
        )
      `)
      .eq('client_id', id)
      .not('transaction', 'is', null)
      .order('scheduled_at', { ascending: false })
      .limit(50),

    // Transações diretas de checkout (client_id preenchido diretamente)
    admin
      .from('financial_transactions')
      .select('id, description, amount, payment_method, is_paid, paid_at, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50),

    admin
      .from('internal_credits')
      .select('id, amount, description, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),

    admin
      .from('branches')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'),

    // Plano de tratamento avulso ACCEPTED (sem client_package) — modelo sessão-primeiro
    admin
      .from('treatment_plans')
      .select('id, status, treatment_plan_sessions(id, treatment_plan_session_procedures(procedure_id, price, procedures(name, duration_min)))')
      .eq('client_id', id)
      .eq('status', 'ACCEPTED')
      .order('created_at', { ascending: false })
      .limit(1),

    // Todos os planos para histórico (sem filtro de status)
    admin
      .from('treatment_plans')
      .select('id, status, created_at, updated_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
  ])

  // KPIs
  const completedAppts  = (appts ?? []).filter(a => a.status === 'COMPLETED')
  const totalSessions   = completedAppts.length
  const apptInvested    = completedAppts.reduce((s, a) => s + parseFloat(String(a.price ?? 0)), 0)

  // Transações diretas de checkout (evita duplicar com apptTx)
  type DirectTx = { id: string; description: string; amount: string; payment_method: string | null; is_paid: boolean; paid_at: string | null; created_at: string }
  const directTxList    = (directTxRaw as DirectTx[] | null) ?? []
  const checkoutInvested = directTxList.filter(t => t.is_paid).reduce((s, t) => s + parseFloat(t.amount), 0)

  const totalInvested   = apptInvested + checkoutInvested
  const txCount         = totalSessions + directTxList.filter(t => t.is_paid).length
  const ticketMedio     = txCount > 0 ? totalInvested / txCount : 0
  const age             = client.birthDate ? differenceInYears(new Date(), new Date(client.birthDate)) : null

  const stats: ProfileStats = { totalSessions, totalInvested, ticketMedio, age }

  // Map appointments — separar futuros de passados
  const allAppointments: ProfileAppointment[] = (appts ?? []).map(a => ({
    id:               a.id,
    scheduledAt:      a.scheduled_at,
    price:            parseFloat(String(a.price ?? 0)),
    status:           a.status,
    procedureName:    (a.procedures as { name?: string } | null)?.name ?? '—',
    professionalName: (a.professional as { name?: string } | null)?.name ?? '—',
  }))

  const upcomingAppointments = allAppointments.filter(a => UPCOMING_STATUSES.includes(a.status))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))  // próximo primeiro
  const recentAppointments   = allAppointments.filter(a => !UPCOMING_STATUSES.includes(a.status))
    .slice(0, 30)

  // Active package — first non-exhausted, non-expired
  let activePackage: ProfilePackage | null = null
  const pkgsArray = Array.isArray(pkgs) ? pkgs : pkgs ? [pkgs] : []
  const now = new Date()
  const activePkg = pkgsArray.find(p =>
    p.used_sessions < p.total_sessions &&
    (!p.expires_at || new Date(p.expires_at) > now)
  )
  if (activePkg) {
    const sp   = activePkg.service_packages as { name?: string; procedure_id?: string; price?: number; procedures?: { name?: string; duration_min?: number } | null } | null
    const proc = sp?.procedures ?? null
    activePackage = {
      id:            activePkg.id,
      name:          sp?.name ?? 'Pacote',
      totalSessions: activePkg.total_sessions,
      usedSessions:  activePkg.used_sessions,
      procedureId:   sp?.procedure_id ?? '',
      procedureName: proc?.name ?? sp?.name ?? '—',
      price:         Number(sp?.price ?? 0) / (activePkg.total_sessions || 1),
      durationMin:   proc?.duration_min ?? 60,
    }
  }

  // Fallback: plano de tratamento avulso ACCEPTED (sem client_package) — modelo sessão-primeiro
  if (!activePackage && activePlansRaw && activePlansRaw.length > 0) {
    type RawSessProc = { procedure_id: string; price: string; procedures: { name: string; duration_min: number } | null }
    type RawSess     = { id: string; treatment_plan_session_procedures: RawSessProc[] }
    const plan       = activePlansRaw[0] as { id: string; status: string; treatment_plan_sessions: RawSess[] }
    const sessions   = plan.treatment_plan_sessions ?? []
    const totalSess  = sessions.length
    const completedSess = (appts ?? []).filter(
      (a: { status: string }) => a.status === 'COMPLETED' && (a as any).treatment_plan_id === plan.id
    ).length
    const firstProc  = sessions[0]?.treatment_plan_session_procedures?.[0] ?? null
    const allProcNames = [...new Set(sessions.flatMap(s =>
      s.treatment_plan_session_procedures.map(p => p.procedures?.name ?? '—')
    ))]
    const planName = allProcNames.length === 1
      ? allProcNames[0]!
      : allProcNames.length > 1
        ? `${allProcNames[0]} + ${allProcNames.length - 1} mais`
        : 'Tratamento'
    activePackage = {
      id:            plan.id,
      name:          planName,
      totalSessions: totalSess,
      usedSessions:  completedSess,
      procedureId:   firstProc?.procedure_id ?? '',
      procedureName: planName,
      price:         Number(firstProc?.price ?? 0),
      durationMin:   firstProc?.procedures?.duration_min ?? 60,
      planId:        plan.id,
      planStatus:    plan.status,
    }
  }

  // Session notes from most recent MRE
  type MreEntry = { notes?: string | null; created_at?: string }
  const mreEntries = (medRecord?.entries as MreEntry[] | null) ?? []
  const latestEntry = mreEntries.sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  )[0]
  const sessionNotes = latestEntry?.notes ?? ''

  // Transactions
  type RawInstallment = { id: string; number: number; total: number; amount: string; due_date: string; is_paid: boolean; paid_at: string | null }
  type RawTx = { id: string; description: string; amount: string; payment_method: string | null; is_paid: boolean; paid_at: string | null; created_at: string; installments: RawInstallment[] }
  type RawTxAppt = { scheduled_at: string; procedures: { name: string } | null; transaction: RawTx | null }

  const apptTransactions: ProfileTransaction[] = ((txAppts as RawTxAppt[] | null) ?? [])
    .filter(a => a.transaction !== null)
    .map(a => ({
      id:            a.transaction!.id,
      description:   a.transaction!.description,
      amount:        parseFloat(a.transaction!.amount),
      paymentMethod: a.transaction!.payment_method,
      isPaid:        a.transaction!.is_paid,
      paidAt:        a.transaction!.paid_at,
      createdAt:     a.transaction!.created_at,
      procedureName: (a.procedures as { name?: string } | null)?.name ?? null,
      scheduledAt:   a.scheduled_at,
      installments:  (a.transaction!.installments ?? []).map(p => ({
        id:      p.id,
        number:  p.number,
        total:   p.total,
        amount:  parseFloat(p.amount),
        dueDate: p.due_date,
        isPaid:  p.is_paid,
        paidAt:  p.paid_at,
      })),
    }))

  const checkoutTransactions: ProfileTransaction[] = directTxList.map(t => ({
    id:            t.id,
    description:   t.description,
    amount:        parseFloat(t.amount),
    paymentMethod: t.payment_method,
    isPaid:        t.is_paid,
    paidAt:        t.paid_at,
    createdAt:     t.created_at,
    procedureName: null,
    scheduledAt:   null,
    installments:  [],
    isCheckout:    true,
  }))

  // Mesclar e ordenar por data desc (mais recente primeiro)
  const seenIds = new Set(apptTransactions.map(t => t.id))
  const transactions: ProfileTransaction[] = [
    ...apptTransactions,
    ...checkoutTransactions.filter(t => !seenIds.has(t.id)),
  ].sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))

  // Internal credits
  type RawCredit = { id: string; amount: string; description: string; created_at: string }
  const internalCredits: ProfileInternalCredit[] = ((credits as RawCredit[] | null) ?? []).map(c => ({
    id:          c.id,
    amount:      parseFloat(c.amount),
    description: c.description,
    createdAt:   c.created_at,
  }))

  // Documents
  type RawDoc = { id: string; name: string; category: string; file_url: string; file_name: string; file_size: number | null; mime_type: string | null; uploaded_by: { name: string } | null; created_at: string }
  const documents: ClientDocumentItem[] = ((docsRaw as RawDoc[] | null) ?? []).map(d => ({
    id:          d.id,
    name:        d.name,
    category:    d.category,
    fileUrl:     d.file_url,
    fileName:    d.file_name,
    fileSize:    d.file_size,
    mimeType:    d.mime_type,
    uploadedBy:  d.uploaded_by?.name ?? null,
    createdAt:   d.created_at,
  }))

  const canGrantCredit = ['NETWORK_ADMIN', 'BRANCH_ADMIN'].includes(ctx.role)

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH:            'Dinheiro',
    PIX:             'Pix',
    DEBIT_CARD:      'Débito',
    CREDIT_CARD:     'Crédito',
    INTERNAL_CREDIT: 'Crédito interno',
  }

  // ── Unified client history ────────────────────────────────────────────────
  const appAccountCreatedAt = (raw as any).app_account_created_at as string | null

  type RawHistoryPlan = { id: string; status: string; created_at: string; updated_at: string | null }
  type RawConsentTerm = { id: string; title: string; signed_at: string | null; signed_via: string | null }

  let evIdx = 0
  const uid = (prefix: string) => `${prefix}-${evIdx++}`
  const history: ClientHistoryEvent[] = []

  // 1. Cadastro do cliente
  history.push({
    id: uid('cc'), date: raw.created_at,
    type: 'CLIENT_CREATED', title: 'Cliente cadastrado',
    subtitle: null, amount: null, link: null,
  })

  // 2. Conta no app
  if (appAccountCreatedAt) {
    history.push({
      id: uid('aa'), date: appAccountCreatedAt,
      type: 'APP_ACCOUNT', title: 'Conta criada no app',
      subtitle: null, amount: null, link: null,
    })
  }

  // 3. Agendamentos
  for (const a of (appts ?? [])) {
    const proc = (a.procedures as { name?: string } | null)?.name ?? '—'
    const prof = (a.professional as { name?: string } | null)?.name ?? '—'
    const isEval = Boolean((a as any).is_evaluation)
    const label = isEval ? 'Avaliação' : proc

    if (a.status === 'COMPLETED' && (a as any).completed_at) {
      history.push({
        id: uid('ac'), date: (a as any).completed_at,
        type: 'APPOINTMENT_COMPLETED',
        title: `Atendimento: ${label}`,
        subtitle: `com ${prof}`,
        amount: parseFloat(String(a.price ?? 0)),
        link: `/${slug}/agenda/${a.id}`,
      })
    } else if (a.status === 'CANCELLED' && (a as any).cancelled_at) {
      history.push({
        id: uid('ax'), date: (a as any).cancelled_at,
        type: 'APPOINTMENT_CANCELLED',
        title: `Cancelado: ${label}`,
        subtitle: null, amount: null,
        link: `/${slug}/agenda/${a.id}`,
      })
    } else if (a.status === 'NO_SHOW') {
      history.push({
        id: uid('an'), date: a.scheduled_at,
        type: 'APPOINTMENT_NO_SHOW',
        title: `Não compareceu: ${label}`,
        subtitle: null, amount: null,
        link: `/${slug}/agenda/${a.id}`,
      })
    } else {
      const evDate = (a as any).created_at ?? a.scheduled_at
      history.push({
        id: uid('as'), date: evDate,
        type: 'APPOINTMENT_SCHEDULED',
        title: `Agendamento: ${label}`,
        subtitle: `${format(new Date(a.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · ${prof}`,
        amount: null,
        link: `/${slug}/agenda/${a.id}`,
      })
    }
  }

  // 4. Pagamentos (somente pagos, sem duplicatas)
  for (const tx of transactions) {
    if (tx.isPaid) {
      const txTitle = tx.procedureName
        ? `Pagamento: ${tx.procedureName}`
        : (tx.description || 'Pagamento recebido')
      history.push({
        id: uid('pay'), date: tx.paidAt ?? tx.createdAt,
        type: 'PAYMENT',
        title: txTitle,
        subtitle: tx.paymentMethod ? (PAYMENT_METHOD_LABELS[tx.paymentMethod] ?? tx.paymentMethod) : null,
        amount: tx.amount,
        link: null,
      })
    }
  }

  // 5. Planos de tratamento (todos os statuses)
  for (const plan of ((allPlansHistRaw as RawHistoryPlan[] | null) ?? [])) {
    if (plan.status === 'DRAFT' || plan.status === 'PROPOSED') {
      history.push({
        id: uid('pp'), date: plan.created_at,
        type: 'PLAN_PROPOSED',
        title: 'Plano de tratamento proposto',
        subtitle: null, amount: null, link: null,
      })
    } else if (plan.status === 'ACCEPTED') {
      history.push({
        id: uid('pa'), date: plan.updated_at ?? plan.created_at,
        type: 'PLAN_ACCEPTED',
        title: 'Plano de tratamento aceito',
        subtitle: 'Checkout realizado',
        amount: null, link: null,
      })
    } else if (plan.status === 'CANCELLED' || plan.status === 'REJECTED') {
      history.push({
        id: uid('pc'), date: plan.updated_at ?? plan.created_at,
        type: 'PLAN_CANCELLED',
        title: 'Plano de tratamento cancelado',
        subtitle: null, amount: null, link: null,
      })
    }
  }

  // 6. Pacotes adquiridos
  for (const pkg of pkgsArray) {
    const sp       = pkg.service_packages as { name?: string; price?: number } | null
    const pkgDate  = (pkg as any).purchased_at ?? (pkg as any).created_at as string | undefined
    if (pkgDate) {
      history.push({
        id: uid('pkg'), date: pkgDate,
        type: 'PACKAGE_PURCHASED',
        title: `Pacote adquirido: ${sp?.name ?? 'Pacote'}`,
        subtitle: `${pkg.total_sessions} sessões`,
        amount: Number(sp?.price ?? 0),
        link: null,
      })
    }
  }

  // 7. Termos assinados (via prontuário)
  const consentTerms = (medRecord as any)?.consent_terms as RawConsentTerm[] | null
  for (const term of (consentTerms ?? [])) {
    if (term.signed_at) {
      history.push({
        id: uid('ct'), date: term.signed_at,
        type: 'CONSENT_SIGNED',
        title: `Assinado: ${term.title}`,
        subtitle: term.signed_via === 'web' ? 'Na recepção' : term.signed_via === 'mobile' ? 'No app' : null,
        amount: null, link: null,
      })
    }
  }

  const clientHistory = history.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
    <RealtimeRefresher tables={['appointments', 'treatment_plans', 'client_packages']} />
    <ClientProfile
      client={client}
      branchId={branch.id}
      stats={stats}
      upcomingAppointments={upcomingAppointments}
      recentAppointments={recentAppointments}
      allAppointments={allAppointments}
      loyaltyBalance={loyalty?.balance ?? 0}
      activePackage={activePackage}
      sessionNotes={sessionNotes}
      transactions={transactions}
      internalCredits={internalCredits}
      documents={documents}
      canGrantCredit={canGrantCredit}
      branches={(branchesRaw ?? []) as { id: string; name: string }[]}
      currentBranchId={branch.id}
      slug={slug}
      role={ctx.role}
      clientHistory={clientHistory}
    />
    </>
  )
}
