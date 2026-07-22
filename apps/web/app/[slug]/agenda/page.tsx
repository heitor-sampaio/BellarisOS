import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { AgendaCalendar } from '@/components/branch/agenda-calendar'
import { ProfessionalAgendaView } from '@/components/branch/professional-agenda'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import {
  getCachedBranchBySlug, getCachedBranchProcedures,
  getCachedBranchProfessionals, getCachedRoomsByBranch,
} from '@/lib/cached-queries'

export default async function AgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  // Profissional que atende clientes e não gerencia a agenda inteira: vê só a própria.
  const canManageAgenda  = ctx.permissions.agenda === 'MANAGE'
  const professionalOnly = ctx.providesServices && !canManageAgenda

  const supabase = await createSupabase()

  const branch = await getCachedBranchBySlug(slug, ctx.tenantId!)
  if (!branch) notFound()

  const branchId = branch.id

  // Janela de 3 meses: mês anterior + atual + próximo
  const from = startOfMonth(subMonths(new Date(), 1)).toISOString()
  const to   = endOfMonth(addMonths(new Date(), 1)).toISOString()

  let appointmentsQuery = supabase
    .from('appointments')
    .select(`
      id, scheduled_at, duration_min, status, price, professional_id, is_evaluation,
      clients(name),
      procedures(name),
      users(name)
    `)
    .eq('branch_id', branchId)
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .not('status', 'in', '("CANCELLED","NO_SHOW")')
    .order('scheduled_at')

  if (professionalOnly && ctx.internalUserId) {
    appointmentsQuery = appointmentsQuery.eq('professional_id', ctx.internalUserId)
  }

  const [
    { data: rawAppointments },
    { data: clients },
    procedures,
    professionals,
    rooms,
  ] = await Promise.all([
    appointmentsQuery,

    supabase
      .from('clients')
      .select('id, name, phone')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name'),

    getCachedBranchProcedures(branchId, ctx.tenantId!),
    getCachedBranchProfessionals(branchId, ctx.tenantId!),
    getCachedRoomsByBranch(branchId, ctx.tenantId!),
  ])

  // Mapeia appointments para eventos do FullCalendar
  const events = (rawAppointments ?? []).map(a => {
    const client       = a.clients       as unknown as { name: string } | null
    const procedure    = a.procedures    as unknown as { name: string } | null
    const professional = a.users         as unknown as { name: string } | null
    const endDate      = new Date(new Date(a.scheduled_at).getTime() + a.duration_min * 60000)

    return {
      id:               a.id,
      start:            a.scheduled_at,
      end:              endDate.toISOString(),
      durationMin:      a.duration_min,
      status:           a.status,
      clientName:       client?.name ?? '—',
      procedureName:    procedure?.name ?? '—',
      isEvaluation:     Boolean((a as any).is_evaluation),
      professionalName: professional?.name ?? '—',
      professionalId:   (a as any).professional_id as string ?? '',
      price:            String(a.price),
    }
  })

  if (professionalOnly) {
    const currentPro = professionals?.find(p => p.id === ctx.internalUserId)
    return (
      <div style={{ padding: '0 4px' }}>
        <ProfessionalAgendaView
          events={events}
          slug={slug}
          professionalName={currentPro?.name ?? ''}
          branchName={branch.name}
          professionalId={ctx.internalUserId ?? ''}
          branchId={branchId}
        />
      </div>
    )
  }

  return (
    <div>
      <RealtimeRefresher tables={['appointments', 'treatment_plans']} />

      <AgendaCalendar
        branchId={branchId}
        branchName={branch.name}
        slug={slug}
        events={events}
        clients={clients ?? []}
        procedures={procedures ?? []}
        professionals={professionals ?? []}
        rooms={rooms ?? []}
        canWrite={canManageAgenda}
        userRole={ctx.role}
      />
    </div>
  )
}
