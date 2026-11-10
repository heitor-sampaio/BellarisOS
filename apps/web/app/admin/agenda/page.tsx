import { getTenantContext, assertPermission, ownerFilter, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import type { ComponentProps } from 'react'
import { AdminAgendaView } from '@/components/admin/admin-agenda-view'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { janelaDaGrade, normalizarHorario } from '@/lib/agenda/horario'
import { selosDaFicha } from '@/lib/pre-atendimento/selos'
import { menoresDaAgenda } from '@/lib/clients/menores-da-agenda'
import { pagosAntes } from '@/lib/appointments/pago-antes'
import { dayKeyTZ, weekdayTZ, addDaysTZ, startOfDayTZ, endOfDayTZ } from '@/lib/datetime'
import { bloqueiosDoPeriodo } from '@/lib/agenda/bloqueios'
import { nomesDosRegistros } from '@/lib/nomes-dos-registros'
import { getCachedBranchProfessionals, getCachedRoomsByBranch } from '@/lib/cached-queries'
import { ler } from '@/lib/db'

type AgendaView = 'day' | 'week'

export default async function AdminAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; unidade?: string }>
}) {
  const { view: rawView, date: rawDate, unidade } = await searchParams

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
    .select('id, name, slug, horario')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  // Falha de consulta não é ausência de filial — ver o mesmo tratamento em
  // /admin/reports.
  if (branchesError) {
    console.error('[admin/agenda] branches:', branchesError.message)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Não foi possível carregar as unidades agora. Tente recarregar em instantes.
      </div>
    )
  }

  const todasUnidadesComHorario = (branchesRaw ?? []) as { id: string; name: string; slug: string; horario: unknown }[]
  const todasUnidades = todasUnidadesComHorario.map(({ id, name, slug }) => ({ id, name, slug }))

  // `?unidade=` recorta a rede a uma filial — é para onde o dashboard aponta ao
  // se olhar uma unidade, em vez de mandar a pessoa para o portal dela. Aceita
  // id ou slug: quem linka daqui de dentro tem o id, o dashboard tem o slug, e
  // `?unidade=centro` ainda é legível para quem olha a URL. Valor desconhecido
  // (ou unidade desativada) cai na rede inteira, em vez de numa tela vazia.
  const unidadeId = todasUnidades.find(b => b.id === unidade || b.slug === unidade)?.id ?? ''
  // Cada coluna leva o horário DA unidade: a grade sombreia o fechado dela e
  // marca o encaixe (A26 da 6ª simulação).
  const comHorario = (b: { id: string; name: string; slug: string }) =>
    ({ ...b, horario: normalizarHorario(todasUnidadesComHorario.find(x => x.id === b.id)?.horario) })
  const branches  = (unidadeId ? todasUnidades.filter(b => b.id === unidadeId) : todasUnidades).map(comHorario)
  const branchIds = branches.map(b => b.id)
  // A grade do dia abre no horário de funcionamento: o mais cedo e o mais tarde
  // entre as unidades mostradas, estendido pelos agendamentos (D5, 2026-10-28).
  const janela = janelaDaGrade(todasUnidadesComHorario.filter(b => branchIds.includes(b.id)).map(b => normalizarHorario(b.horario)))

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  // -- Agendamentos do intervalo -------------------------------------
  // O embed de `users` precisa nomear a FK: `appointments` referencia `users`
  // duas vezes (professional_id e created_by_id) e o PostgREST recusa o embed
  // ambíguo com PGRST201. Sem checar o `error`, isso virava uma agenda vazia.
  // Alcance do cargo vale aqui também: sem isto, um membro de rede com agenda
  // "só a própria" via a agenda de todo mundo nesta tela.
  const agendaOwner = ownerFilter(ctx, 'agenda')

  //
  // Em páginas até o fim (2026-10-22), como a da unidade: com `.limit(1000)`,
  // a semana de uma rede movimentada perdia os últimos horários, e o dia
  // aparecia livre. A ordem tem desempate pelo id.
  // Falha para a tela: com o erro só no log, a agenda aparecia VAZIA — e agenda
  // vazia é informação ("dia livre"), não sintoma.
  const apptsRaw = await lerTodas((de, ate) => {
    let apptsQuery = admin
      .from('appointments')
      .select('id, scheduled_at, duration_min, started_at, completed_at, arrived_at, cancellation_reason, status, source, branch_id, procedure_id, client_id, professional_id, price, procedures(name), clients(name), users!appointments_professional_id_fkey(name), rooms(name)')
      .in('branch_id', branchIds)
      .gte('scheduled_at', startDate.toISOString())
      .lte('scheduled_at', endDate.toISOString())
    if (agendaOwner) apptsQuery = apptsQuery.eq('professional_id', agendaOwner)
    return apptsQuery.order('scheduled_at', { ascending: true }).order('id').range(de, ate)
  }, 'carregar a agenda da rede')

  // O selo da ficha de saúde no bloco (2026-10-21): só o estado, do banco.
  const brutos = (apptsRaw ?? []) as unknown as { id: string; client_id: string | null; status: string }[]
  const [selos, jaPagos, menores] = await Promise.all([
    selosDaFicha(ctx.tenantId!, brutos),
    // O que já foi pago antes (D12): a janela não o mostra como valor a cobrar.
    pagosAntes(admin, brutos.map(a => a.id)),
    // A menor de idade (decisão 2 do Heitor, 2026-11-05).
    menoresDaAgenda(ctx.tenantId!, brutos.map(a => a.client_id)),
  ])
  const appointments = brutos.map(a => ({ ...a, ficha: selos[a.id] ?? null, pagoAntes: jaPagos.get(a.id) ?? null, menor: (a.client_id && menores[a.client_id]) || null })) as unknown as ComponentProps<typeof AdminAgendaView>['appointments']

  // O bloqueio pontual (decisão 3 da 7ª): cada um na coluna da unidade de onde
  // foi feito (a da sala), com de quem é. Com "só os meus", só os dela.
  const todosOsBloqueios = await bloqueiosDoPeriodo(ctx.tenantId!, { de: startDate.toISOString(), ate: endDate.toISOString(), unidades: branchIds })
  const bloqueiosVistos = agendaOwner ? todosOsBloqueios.filter(b => b.professionalId === agendaOwner) : todosOsBloqueios
  const salasDosBloqueios = [...new Set(bloqueiosVistos.map(b => b.roomId).filter((x): x is string => !!x))]
  const [nomesDosBloqueios, salasLidas] = await Promise.all([
    nomesDosRegistros(ctx.tenantId!, { membros: bloqueiosVistos.map(b => b.professionalId) }),
    salasDosBloqueios.length
      ? ler(admin.from('rooms').select('id, name').in('id', salasDosBloqueios).in('branch_id', branchIds), 'buscar as salas bloqueadas') as Promise<{ id: string; name: string }[] | null>
      : Promise.resolve([] as { id: string; name: string }[]),
  ])
  const bloqueios = bloqueiosVistos.map(b => ({
    ...b,
    rotulo: b.roomId
      ? `${(salasLidas ?? []).find(s => s.id === b.roomId)?.name ?? 'Sala'} bloqueada · ${b.motivo}`
      : `Bloqueado · ${(b.professionalId && nomesDosBloqueios.membros[b.professionalId]) || 'Profissional'} · ${b.motivo}`,
  }))
  // "Bloquear horário" daqui com UMA unidade na tela (a clínica de uma unidade
  // vive no /admin — H3): a lista de quem atende e das salas dela.
  const umaSo = branches.length === 1 ? branches[0]! : null
  const paraBloquear = umaSo && ctx.permissions.agenda === 'MANAGE'
    ? {
        branchId: umaSo.id,
        profissionais: ((await getCachedBranchProfessionals(umaSo.id, ctx.tenantId!)) ?? []).map(p => ({ id: p.id as string, name: p.name as string })),
        salas: ((await getCachedRoomsByBranch(umaSo.id, ctx.tenantId!)) ?? []).map(r => ({ id: r.id as string, name: r.name as string })),
        soEu: agendaOwner ? { id: agendaOwner, name: ctx.userName || 'Você' } : null,
      }
    : null

  return (
    <>
      <RealtimeRefresher tables={['appointments']} />
      <AdminAgendaView
        view={view}
        selectedDate={selectedStr}
        todayStr={todayStr}
        branches={branches}
        todasUnidades={todasUnidades}
        unidadeId={unidadeId}
        appointments={appointments}
        janela={janela}
        podeAgendar={ctx.permissions.agenda === 'MANAGE'}
        escopoProprio={agendaOwner !== null}
        meuId={ctx.internalUserId ?? null}
        podeConcluir={can(ctx, 'medical_records', 'MANAGE')}
        bloqueios={bloqueios}
        paraBloquear={paraBloquear}
      />
    </>
  )
}
