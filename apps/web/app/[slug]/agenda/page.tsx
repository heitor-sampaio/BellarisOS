import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, isOwnScope } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarHorario, type Horario } from '@/lib/agenda/horario'
import { ler, lerTodas } from '@/lib/db'
import { AgendaCalendar } from '@/components/branch/agenda-calendar'
import { ProfessionalAgendaView } from '@/components/branch/professional-agenda'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { selosDaFicha } from '@/lib/pre-atendimento/selos'
import {
  getCachedBranchBySlug, getCachedBranchProcedures,
  getCachedBranchProfessionals, getCachedRoomsByBranch,
} from '@/lib/cached-queries'

export default async function AgendaPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { slug } = await params
  // O dia aberto vai na URL (2026-10-21): recarregar ou mandar o link abre nele.
  const dataDaUrl = (await searchParams).date
  const dataInicial = dataDaUrl && /^\d{4}-\d{2}-\d{2}$/.test(dataDaUrl) ? dataDaUrl : null
  const ctx      = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  // Escopo do cargo decide o alcance; antes era inferido de "atende clientes e
  // não gerencia a agenda", o que impedia dar gestão da própria agenda a alguém.
  const canManageAgenda  = ctx.permissions.agenda === 'MANAGE'
  const professionalOnly = isOwnScope(ctx, 'agenda')

  const supabase = await createSupabase()

  const branch = await getCachedBranchBySlug(slug, ctx.tenantId!)
  if (!branch) notFound()

  const branchId = branch.id

  // Janela de 3 meses em volta do dia aberto: mês anterior + atual + próximo
  const base = dataInicial ? new Date(`${dataInicial}T12:00:00`) : new Date()
  const from = startOfMonth(subMonths(base, 1)).toISOString()
  const to   = endOfMonth(addMonths(base, 1)).toISOString()

  // Em páginas (lerTodas, 2026-10-21): o PostgREST devolve no máximo 1000
  // linhas, e numa unidade movimentada os 3 meses passam disso — a grade
  // perdia horários em silêncio. A ordem tem desempate pelo id: sem ela, as
  // páginas se sobrepõem.
  const paginaDaAgenda = (de: number, ate: number) => {
    let q = supabase
      .from('appointments')
      .select(`
        id, scheduled_at, duration_min, status, price, professional_id, client_id, arrived_at,
        clients(name),
        procedures(name),
        users!professional_id(name)
      `)
      .eq('branch_id', branchId)
      .gte('scheduled_at', from)
      .lte('scheduled_at', to)
      .not('status', 'in', '("CANCELLED","NO_SHOW")')
    if (professionalOnly && ctx.internalUserId) q = q.eq('professional_id', ctx.internalUserId)
    return q.order('scheduled_at').order('id').range(de, ate)
  }

  // A lista de clientes saiu daqui: a busca do agendamento passou a ser feita
  // no servidor, por nome ou telefone. Carregar a filial inteira para filtrar
  // em JavaScript para de funcionar quando a base cresce — e não achava o
  // telefone mascarado de qualquer forma.
  const [
    rawAppointments,
    procedures,
    professionals,
    rooms,
    horarioRaw,
  ] = await Promise.all([
    lerTodas(paginaDaAgenda, 'carregar a agenda'),

    getCachedBranchProcedures(branchId, ctx.tenantId!),
    getCachedBranchProfessionals(branchId, ctx.tenantId!),
    getCachedRoomsByBranch(branchId, ctx.tenantId!),
    // O horário de funcionamento (2026-10-21): a grade e a ocupação da agenda.
    Promise.all([
      ler(createAdminClient().from('branches').select('horario').eq('id', branchId).maybeSingle(), 'buscar o horário da unidade'),
      ler(createAdminClient().from('users').select('id, horario').eq('branch_id', branchId).eq('provides_services', true), 'buscar o horário dos profissionais'),
    ]),
  ])
  const horarioDaUnidade = normalizarHorario((horarioRaw[0] as { horario?: unknown } | null)?.horario)
  const horariosDosProfissionais: Record<string, Horario | null> = Object.fromEntries(
    ((horarioRaw[1] ?? []) as { id: string; horario: unknown }[]).map(p => [p.id, normalizarHorario(p.horario)]),
  )

  // Agenda vazia é um fato; agenda que falhou é outra coisa. `appointments` tem
  // duas chaves para `users` (`professional_id` e `created_by_id`), então o
  // embed precisa dizer qual — sem isso o PostgREST recusa, o erro era
  // descartado e a unidade inteira aparecia sem nenhum atendimento.

  // O selo da ficha de saúde no bloco (2026-10-21): só o estado, do banco.
  const selos = await selosDaFicha(ctx.tenantId!, (rawAppointments ?? []) as { id: string; client_id: string | null; status: string }[])

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
      professionalName: professional?.name ?? '—',
      professionalId:   a.professional_id ?? '',
      price:            String(a.price),
      fichaDeSaude:     selos[a.id] ?? null,
      arrivedAt:        (a as { arrived_at?: string | null }).arrived_at ?? null,
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
      <RealtimeRefresher tables={['appointments']} />

      <AgendaCalendar
        branchId={branchId}
        branchName={branch.name}
        slug={slug}
        events={events}
        procedures={procedures ?? []}
        professionals={professionals ?? []}
        horarioDaUnidade={horarioDaUnidade}
        horariosDosProfissionais={horariosDosProfissionais}
        rooms={rooms ?? []}
        canWrite={canManageAgenda}
        userRole={ctx.role}
        dataInicial={dataInicial}
      />
    </div>
  )
}
