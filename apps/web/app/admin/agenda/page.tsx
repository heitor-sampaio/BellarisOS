import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminAgendaView } from '@/components/admin/admin-agenda-view'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

type AgendaView = 'day' | 'week'

export default async function AdminAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const { view: rawView, date: rawDate } = await searchParams

  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  const admin       = createAdminClient()
  const view        = ((rawView ?? 'day') as AgendaView)
  const now         = new Date()
  const todayStr    = now.toISOString().slice(0, 10)
  const selectedStr = rawDate ?? todayStr

  // -- Intervalo de datas a buscar -----------------------------------
  let startDate: Date
  let endDate: Date

  if (view === 'week') {
    // Segunda-feira da semana do dia selecionado
    const sel  = new Date(selectedStr + 'T00:00:00')
    const dow  = sel.getDay()               // 0=dom, 1=seg, ...
    const diff = (dow === 0 ? -6 : 1 - dow) // shift para segunda
    startDate  = new Date(sel); startDate.setDate(sel.getDate() + diff)
    endDate    = new Date(startDate);        endDate.setDate(startDate.getDate() + 6)
    endDate.setHours(23, 59, 59, 999)
  } else {
    startDate = new Date(selectedStr + 'T00:00:00')
    endDate   = new Date(selectedStr + 'T23:59:59.999')
  }

  // -- Filiais -------------------------------------------------------
  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  const branches  = (branchesRaw ?? []) as { id: string; name: string; slug: string }[]
  const branchIds = branches.map(b => b.id)

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  // -- Agendamentos do intervalo -------------------------------------
  const { data: apptsRaw } = await admin
    .from('appointments')
    .select('id, scheduled_at, started_at, completed_at, status, source, branch_id, procedure_id, client_id, professional_id, price, procedures(name), clients(name), users(name)')
    .in('branch_id', branchIds)
    .gte('scheduled_at', startDate.toISOString())
    .lte('scheduled_at', endDate.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1000)

  const appointments = (apptsRaw ?? []) as any[]

  return (
    <>
      <RealtimeRefresher tables={['appointments']} />
      <AdminAgendaView
        view={view}
        selectedDate={selectedStr}
        todayStr={todayStr}
        branches={branches}
        appointments={appointments}
      />
    </>
  )
}
