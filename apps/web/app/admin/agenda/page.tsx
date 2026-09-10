import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminAgendaView } from '@/components/admin/admin-agenda-view'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { dayKeyTZ, weekdayTZ, addDaysTZ, startOfDayTZ, endOfDayTZ } from '@/lib/datetime'

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
  // "Hoje" no fuso do negócio. Com `toISOString()` o dia virava às 21h em
  // Brasília e a agenda passava a abrir no dia seguinte.
  const todayStr    = dayKeyTZ(new Date())
  const selectedStr = rawDate ?? todayStr

  // Meio-dia UTC como âncora do dia escolhido: longe das bordas, o parse não
  // escorrega para o dia anterior nem para o seguinte por causa do offset.
  const selected = new Date(selectedStr + 'T12:00:00Z')

  // -- Intervalo de datas a buscar -----------------------------------
  let startDate: Date
  let endDate: Date

  if (view === 'week') {
    // Segunda-feira da semana do dia selecionado
    const dow    = weekdayTZ(selected)         // 0=dom, 1=seg, ...
    const diff   = (dow === 0 ? -6 : 1 - dow)  // shift para segunda
    const monday = addDaysTZ(selected, diff)
    startDate    = startOfDayTZ(monday)
    endDate      = endOfDayTZ(addDaysTZ(monday, 6))
  } else {
    startDate = startOfDayTZ(selected)
    endDate   = endOfDayTZ(selected)
  }

  // -- Filiais -------------------------------------------------------
  const { data: branchesRaw, error: branchesError } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  // Falha de consulta não é ausência de filial — ver o mesmo tratamento em
  // /admin/reports.
  if (branchesError) {
    console.error('[admin/agenda] branches:', branchesError.message)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Não foi possível carregar as unidades agora. Tente recarregar em instantes.
      </div>
    )
  }

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
  // O embed de `users` precisa nomear a FK: `appointments` referencia `users`
  // duas vezes (professional_id e created_by_id) e o PostgREST recusa o embed
  // ambíguo com PGRST201. Sem checar o `error`, isso virava uma agenda vazia.
  const { data: apptsRaw, error: apptsError } = await admin
    .from('appointments')
    .select('id, scheduled_at, started_at, completed_at, status, source, branch_id, procedure_id, client_id, professional_id, price, procedures(name), clients(name), users!appointments_professional_id_fkey(name)')
    .in('branch_id', branchIds)
    .gte('scheduled_at', startDate.toISOString())
    .lte('scheduled_at', endDate.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1000)

  if (apptsError) console.error('[admin/agenda] appointments:', apptsError.message)

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
