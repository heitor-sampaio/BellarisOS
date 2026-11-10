import Link from 'next/link'
import { Dica } from '@/components/shared/dica'
import { DEFINICOES } from '@/lib/metrics/definicoes'
import { baseDaOcupacao } from '@/lib/metrics/ocupacao'
import { notFound, redirect } from 'next/navigation'
import { capacidadeEmMinutos, normalizarHorario, type BlocoOcupado } from '@/lib/agenda/horario'
import { blocosDosBloqueios } from '@/lib/agenda/horario-livre'
import { bloqueiosDoPeriodo } from '@/lib/agenda/bloqueios'
import { getTenantContext, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedBranchBySlug, filtroDeQuemAtendeNaUnidade } from '@/lib/cached-queries'
import { ALL_MODULES, MODULE_LABELS } from '@/lib/permissions'
import type { AppModule } from '@estetica-os/types'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { RevenueBarChart } from '@/components/branch/revenue-bar-chart'
import { DashboardEmptyState } from '@/components/shared/dashboard-empty-state'
import { format, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getClientesParaReativarDoRecorte } from '@/lib/metrics/unidade'
import { startOfDayTZ, endOfDayTZ, startOfMonthTZ, addMonthsTZ, addDaysTZ, monthKeyTZ } from '@/lib/datetime'
import {
  resolvePeriod, delta, occupancyPct,
  getCore, getSeries, getTopProcedures, getTicketMedio, EMPTY_CORE,
} from '@/lib/metrics'
import { recorteDosModulos } from '@/lib/metrics/escopo'
import { configDeComissaoDaRede, resumoDasComissoes } from '@/lib/comissoes/leitura'
import { periodosRecentes } from '@/lib/comissoes/periodo'
import { getCoreDosModulos } from '@/lib/metrics/dos-modulos'
import { ChevronRight, ClipboardList } from 'lucide-react'
import { ler, contar } from '@/lib/db'
import { abertosDeAntes, SEM_ABERTOS_DE_ANTES } from '@/lib/metrics/abertos-de-antes'
import { AbertosDeAntes } from '@/components/branch/abertos-de-antes'
import { ParcelasVencidas } from '@/components/shared/parcelas-vencidas'
import { getAReceberVencido } from '@/lib/metrics/vencidas'
import { LotesVencendo } from '@/components/shared/lotes-vencendo'
import { EstoqueAbaixoDoMinimo } from '@/components/shared/estoque-abaixo-do-minimo'
import { itensAbaixoDoMinimo } from '@/lib/estoque/abaixo-do-minimo'
import { lotesVencendoDoRecorte } from '@/lib/estoque/lotes'
import { AvatarDaCliente as Avatar, ClientesDoPeriodo, ReativarClientes } from '@/components/shared/quadros-de-clientes'

// O avatar da cliente é o dos quadros de clientes (um desenho só, F7b).

// --- Status chips -------------------------------------------------
const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  SCHEDULED:   { label: 'Aguardando',  bg: 'var(--bg-app)',      color: 'var(--text-muted)' },
  CONFIRMED:   { label: 'Confirmado',  bg: 'var(--brand-soft)',  color: 'var(--brand)'      },
  ARRIVED:     { label: 'Chegou',      bg: 'var(--success-soft)', color: 'var(--success)'    },
  IN_PROGRESS: { label: 'Em atend.',   bg: 'var(--warning-soft)',color: 'var(--warning)'    },
  COMPLETED:   { label: 'Concluído',   bg: 'var(--success-soft)',color: 'var(--success)'    },
  CANCELLED:   { label: 'Cancelado',   bg: 'var(--bg-app)',      color: 'var(--text-faint)' },
  NO_SHOW:     { label: 'Não veio',    bg: 'var(--bg-app)',      color: 'var(--text-faint)' },
}
function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.SCHEDULED!
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px',
      borderRadius: 99, fontSize: 'var(--text-overline)', fontWeight: 700, whiteSpace: 'nowrap',
      background: s.bg, color: s.color,
      border: status === 'SCHEDULED' ? '1px solid var(--border)' : 'none',
    }}>
      {s.label}
    </span>
  )
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// -----------------------------------------------------------------
export default async function BranchDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx      = await getTenantContext()

  // O dashboard é a única tela da unidade sem `assertPermission` — de
  // propósito: toda a equipe o vê, até o cargo que não abre mais nada. Mas o
  // layout de `[slug]` deixa o CLIENTE passar (é por ele que se chega ao
  // portal do cliente), e aqui o cliente chegava: a página quebrava no
  // `tenantId` nulo em vez de mandá-lo embora. Não vazava nada — por acidente.
  if (ctx.isClient) redirect(`/${slug}/cliente`)

  const branch = await getCachedBranchBySlug(slug, ctx.tenantId!)
  if (!branch) notFound()

  const branchId = branch.id
  const now = new Date()
  const admin = createAdminClient()

  const perm = ctx.permissions
  const canFinancial  = perm.financial  !== 'NONE'
  const canAgenda     = perm.agenda     !== 'NONE'
  const canProcedures = perm.procedures !== 'NONE'
  const canClients    = perm.clients    !== 'NONE'
  const canCheckout   = canProcedures
  // Profissional que atende e não gerencia a agenda: dashboard escopado a ele.
  // Escopo do cargo, não mais heurística sobre o nível de agenda.
  const professionalOnly = isOwnScope(ctx, 'agenda')
  // Cada número segue o escopo do SEU módulo (decisão do Heitor, 2026-10-29;
  // lib/metrics/escopo): a agenda e as clientes — agendamentos, atendimentos,
  // "Clientes no mês", procedimentos mais procurados, a reativar, planos
  // aguardando checkout — pelo da agenda; o dinheiro — faturamento, o gráfico
  // dos 6 meses, o ticket — pelo do financeiro. Até aqui qualquer "só os
  // meus" recortava tudo (D7 de 2026-10-28).
  const recorte = recorteDosModulos(ctx)
  const proId = recorte.agenda
  const dinheiroDela = recorte.financeiro

  const hasAnyWidget = canFinancial || canAgenda || canProcedures || canClients

  // Janelas no fuso do negócio. Antes eram montadas no fuso do processo (UTC
  // em produção), então "hoje" e "este mês" começavam 3h cedo demais.
  const period     = resolvePeriod('month', undefined, undefined, now)
  const todayStart = startOfDayTZ(now)
  const todayEnd   = endOfDayTZ(now)
  const sixMonthsAgo = startOfMonthTZ(addMonthsTZ(now, -5))
  const thirtyDaysAgo = addDaysTZ(now, -30)
  const ninetyDaysAgo = addDaysTZ(now, -90)

  // O mês até agora; o núcleo junta o dinheiro de um recorte e a agenda do outro.
  const janela = { tenantId: ctx.tenantId!, branchIds: [branchId], from: period.from, to: period.to }
  const doDinheiro = { ...janela, professionalId: dinheiroDela }

  const [
    core,
    prevCore,
    monthSeries,
    pendingCheckouts,
    todayAppts,
    profissionaisDaUnidade,
    procedureStats,
    paraReativar,
    ticket,
  ] = await Promise.all([
    // O núcleo é uma chamada só, agregada no Postgres: receita, atendimentos,
    // novos clientes e comissões saem coerentes entre si por construção.
    (canFinancial || canAgenda || canClients)
      ? getCoreDosModulos({ ...janela, recorte })
      : Promise.resolve({ ...EMPTY_CORE }),

    // O anterior só serve à variação do FATURAMENTO: o recorte do dinheiro.
    canFinancial
      ? getCore({ ...doDinheiro, from: period.prevFrom, to: period.prevTo })
      : Promise.resolve({ ...EMPTY_CORE }),

    canFinancial
      ? getSeries({
          tenantId: ctx.tenantId!, branchIds: [branchId],
          from: sixMonthsAgo, to: period.to, granularity: 'month', professionalId: dinheiroDela,
        })
      : Promise.resolve([]),

    canCheckout
      ? (() => {
          let q = admin.from('treatment_plans').select('id', { count: 'exact', head: true })
            .eq('branch_id', branchId).eq('status', 'PROPOSED')
          if (proId) q = q.eq('professional_id', proId)
          return contar(q, 'contar os planos a receber')
        })()
      : Promise.resolve(0),

    // Agenda do dia: a lista em si, não uma agregação.
    canAgenda
      ? (() => {
          let q = admin.from('appointments')
            .select('id, client_id, scheduled_at, duration_min, status, price, clients(name), procedures(name), users!appointments_professional_id_fkey(name)')
            .eq('branch_id', branchId)
            .gte('scheduled_at', todayStart.toISOString())
            .lte('scheduled_at', todayEnd.toISOString())
            .order('scheduled_at')
          if (proId) q = q.eq('professional_id', proId)
          return ler(q, 'carregar a agenda do dia')
        })()
      : Promise.resolve([]),

    (canAgenda && !professionalOnly)
      // Os profissionais e o horário de cada um: a capacidade da ocupação.
      ? ler(admin.from('users').select('id, horario')
          // Os da unidade e os da rede, que atendem em todas (D1, 2026-10-28).
          .eq('tenant_id', ctx.tenantId!).or(filtroDeQuemAtendeNaUnidade(branchId))
          .eq('provides_services', true).eq('is_active', true), 'carregar os profissionais')
      : Promise.resolve([]),

    canProcedures
      ? getTopProcedures({
          tenantId: ctx.tenantId!, branchIds: [branchId],
          from: thirtyDaysAgo, to: now, limit: 4, professionalId: proId,
        })
      : Promise.resolve([]),

    // Sem visita há 90 dias: o total e os três há mais tempo sem vir, contados
    // no banco. Eram três selects sem limite (clientes, visitas e todos os
    // atendimentos dos inativos) somados aqui — cortavam em 1000 (§13.1).
    // r2-ind-03 (o Heitor: "na clínica de uma unidade, a clínica e a unidade
    // são a mesma coisa"): com UMA unidade, todas as clientes ativas da
    // clínica — não só as que têm a tag da unidade.
    // A regra é UMA, a do /admin e a do Copilot também (r3-f13-10).
    canClients
      ? getClientesParaReativarDoRecorte({
          tenantId: ctx.tenantId!, unidade: { id: branchId, name: branch.name }, desde: ninetyDaysAgo, professionalId: proId,
        })
      : Promise.resolve({ total: 0, lista: [], comVisita: 0, recentesSemVisita: 0 }),

    // Ticket médio = o pago pelas clientes ÷ as que pagaram (2026-10-29): dinheiro.
    canFinancial
      ? getTicketMedio(doDinheiro)
      : Promise.resolve(null),
  ])

  // Com o financeiro "só os meus", o financeiro DELA é "Minhas comissões" (A52
  // da 6ª simulação): o cartão de destaque é a comissão a pagar do período de
  // fechamento da rede — o MESMO número da tela de comissões (resumoDasComissoes).
  const minhasComissoes = canFinancial && dinheiroDela
    ? await (async () => {
        const config = await configDeComissaoDaRede(ctx.tenantId!)
        const periodo = periodosRecentes(config.periodo, now, 1)[0]!
        const linhas = await resumoDasComissoes({
          tenantId: ctx.tenantId!, branchIds: [branchId], inicio: periodo.inicio, fim: periodo.fim, profissionalId: dinheiroDela,
        })
        const soma = (f: (l: (typeof linhas)[number]) => number) => Math.round(linhas.reduce((t, l) => t + f(l), 0) * 100) / 100
        return { periodo: periodo.rotulo, aPagar: soma(l => l.aPagar), lancado: soma(l => l.liberado) }
      })()
    : null

  // -- KPIs ------------------------------------------------------
  const monthRevenue       = core.revenueCash
  const monthCompletedCount = core.appointmentsCompleted
  const rawDelta           = delta(monthRevenue, prevCore.revenueCash)
  const revDelta           = rawDelta
    ? { value: rawDelta.value.toFixed(1).replace('.', ','), up: rawDelta.up }
    : null

  // Ticket médio = a média de quanto cada CLIENTE gasta: o pago pelas clientes
  // no mês ÷ as clientes que pagaram (decisão do Heitor, 2026-10-29; lib/metrics).
  // Entra tudo que ela pagou — atendimento, pacote, plano, pré-pago.
  const avgTicket = ticket?.total.valor ?? 0
  const clientesQuePagaram = ticket?.total.clientesQuePagaram ?? 0

  const validToday    = (todayAppts ?? []).filter(a => !['CANCELLED', 'NO_SHOW'].includes(a.status))
  const todayCount    = validToday.length
  const awaitingCount = validToday.filter(a => a.status === 'SCHEDULED').length
  const scheduledMin  = validToday.reduce((s, a) => s + (a.duration_min ?? 0), 0)

  // Capacidade do DIA (a agenda mostrada é a de hoje), não do mês.
  // A capacidade do DIA (a agenda mostrada é a de hoje), pelo HORÁRIO da
  // unidade e de cada profissional — a mesma conta da agenda (lib/agenda/horario).
  const professionalsCount = (profissionaisDaUnidade ?? []).length
  const profissionais = (profissionaisDaUnidade ?? []) as { id: string; horario: unknown }[]
  // O que eles têm agendado HOJE em outra unidade (o da rede atende em todas —
  // D1) sai da capacidade daqui (decisão do Heitor, 2026-10-28). Desde a
  // véspera, para o atendimento que atravessa a meia-noite.
  const ocupadoFora: Record<string, BlocoOcupado[]> = {}
  if (profissionais.length) {
    const fora = await ler(admin.from('appointments')
      .select('professional_id, scheduled_at, duration_min')
      .in('professional_id', profissionais.map(p => p.id))
      .neq('branch_id', branchId)
      .not('status', 'in', '("CANCELLED","NO_SHOW")')
      .gte('scheduled_at', addDaysTZ(todayStart, -1).toISOString())
      .lte('scheduled_at', todayEnd.toISOString()), 'carregar a agenda dos profissionais nas outras unidades')
    for (const a of (fora ?? []) as { professional_id: string; scheduled_at: string; duration_min: number }[]) {
      (ocupadoFora[a.professional_id] ??= []).push({ inicio: a.scheduled_at, minutos: a.duration_min })
    }
    // O tempo BLOQUEADO de cada uma (D15 da 8ª simulação) também sai da
    // capacidade: "430 min de 4.230 min disponíveis" contava as 23 h e meia da
    // Iara bloqueada. Os blocos se fundem com os de fora (nada conta duas vezes).
    const bloqueios = await bloqueiosDoPeriodo(ctx.tenantId!, {
      de: todayStart.toISOString(), ate: todayEnd.toISOString(), profissionais: profissionais.map(p => p.id),
    }, admin)
    for (const p of profissionais) {
      const dela = blocosDosBloqueios(bloqueios.filter(b => b.professionalId === p.id))
      if (dela.length) (ocupadoFora[p.id] ??= []).push(...dela)
    }
  }
  const horarios = {
    unidade:       normalizarHorario((await ler(admin.from('branches').select('horario').eq('id', branchId).maybeSingle(), 'buscar o horário da unidade') as { horario?: unknown } | null)?.horario),
    profissionais: profissionais.map(p => normalizarHorario(p.horario)),
    ocupadoFora:   profissionais.map(p => ocupadoFora[p.id] ?? []),
  }
  const capacityMin = capacidadeEmMinutos(horarios.unidade, horarios.profissionais, todayStart, todayEnd, horarios.ocupadoFora)
  const occupancy   = occupancyPct(scheduledMin, horarios, todayStart, todayEnd) ?? 0

  // -- Gráfico dos últimos 6 meses -------------------------------
  const seriesByMonth = new Map(monthSeries.map(p => [monthKeyTZ(p.bucket), p.revenue]))
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const month = addMonthsTZ(now, -(5 - i))
    return {
      label: format(month, 'MMM', { locale: ptBR }),
      value: seriesByMonth.get(monthKeyTZ(month)) ?? 0,
    }
  })
  // Variação do semestre = último mês vs. primeiro. Antes era o total dos 6
  // meses menos o primeiro mês, o que não comparava nada.
  const semesterDelta = (chartData[5]?.value ?? 0) - (chartData[0]?.value ?? 0)

  // -- Top procedimentos -----------------------------------------
  // O pago sem execução no período vem com 0 (D3 da 5ª): não é "realizado".
  const topProcs = procedureStats.filter(p => p.appointments > 0).map(p => ({ name: p.name, count: p.appointments }))
  const maxProc  = topProcs[0]?.count ?? 1

  // -- Funil ------------------------------------------------------
  // Todas as etapas no mesmo recorte (o mês) e no mesmo universo. Antes o
  // funil misturava "novos no mês" com "agendados hoje", e a barra usava
  // "novos clientes" como base — o que estourava 100%.
  // "Clientes no mês" conta até AGORA (revisto pelo Heitor, 2026-10-29): o que
  // está agendado ainda não aconteceu, e não se sabe se vai. É o núcleo do mês
  // até agora, o mesmo dos cartões. De 2026-10-28 a 10-29 fechava no fim do
  // mês (D12), com os horários de mais tarde e o cancelado de amanhã.
  const funnel = [
    { label: 'Novos clientes',    count: core.newClients,            color: 'var(--brand)' },
    { label: 'Agendamentos',      count: core.appointmentsTotal,     color: 'var(--brand-2)' },
    { label: 'Concluídos',        count: core.appointmentsCompleted, color: 'var(--brand-3)' },
    { label: 'Cancelados/faltas', count: core.appointmentsCancelled + core.appointmentsNoShow, color: 'var(--border)' },
  ]

  // -- Reativar clientes -----------------------------------------
  // A ordem (quem há mais tempo sem vir primeiro; quem nunca veio no fim) vem
  // do banco; aqui só os dias para o rótulo.
  const toReactivate = paraReativar.lista.map(c => ({
    ...c,
    daysSince: c.ultimaVisita ? differenceInDays(now, new Date(c.ultimaVisita)) : null,
  }))
  const inactiveCount = paraReativar.total

  // Atalhos para o estado vazio (módulos que o cargo acessa)
  const BRANCH_ROUTES: Partial<Record<AppModule, string>> = {
    agenda:     `/${slug}/agenda`,
    clients:    `/${slug}/clients`,
    financial:  `/${slug}/financeiro`,
    procedures: `/${slug}/procedures`,
    stock:      `/${slug}/estoque`,
    crm:        `/${slug}/oportunidades`,
    team:       `/${slug}/team`,
  }
  const shortcuts = ALL_MODULES
    .filter(m => BRANCH_ROUTES[m] && perm[m] !== 'NONE')
    .map(m => ({ label: MODULE_LABELS[m], href: BRANCH_ROUTES[m]! }))

  // Os atendimentos de dias anteriores ainda abertos (J-32): quem vê a agenda,
  // com o "só os meus" dela.
  const abertos = canAgenda ? await abertosDeAntes(ctx, branchId, now) : SEM_ABERTOS_DE_ANTES

  // A41 da 7ª simulação: o lote que vence em 30 dias, a quem tem o Estoque — a
  // mesma conta do cartão "Validade em 30 dias" do Estoque.
  const lotesVencendo = perm.stock !== 'NONE'
    ? (await lotesVencendoDoRecorte(ctx.tenantId!, [branchId], 30, now)).map(l => ({
        id: l.id, produto: l.produto, numero: l.numero, validade: l.validade, quantidade: l.quantidade, embalagem: l.embalagem,
        href: `/${slug}/estoque`,
      }))
    : []

  // A39 da 10ª: o que está no mínimo ou abaixo, a quem tem o Estoque (a régua da tela de estoque).
  const abaixoDoMinimo = perm.stock !== 'NONE' ? await itensAbaixoDoMinimo([branchId]) : []

  // D13 da 9ª: as parcelas vencidas da unidade, a quem vê o financeiro dela inteiro.
  const vencidas = canFinancial && !isOwnScope(ctx, 'financial')
    ? (await getAReceberVencido({ tenantId: ctx.tenantId!, branchIds: [branchId] })).total
    : null

  // -------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RealtimeRefresher tables={['appointments', 'financial_transactions', 'clients']} />

      {/* -- Row 0: Header --------------------------------------- */}
      <div>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 3 }}>
          {branch.name} · {format(now, "EEE, dd 'de' MMM yyyy", { locale: ptBR })}
        </p>
      </div>

      {!hasAnyWidget && <DashboardEmptyState userName={ctx.userName} shortcuts={shortcuts} />}

      <AbertosDeAntes base={`/${slug}/agenda`} abertos={abertos.abertos} semChegada={abertos.semChegada} />

      {vencidas && <ParcelasVencidas vencidas={vencidas} href={`/${slug}/financeiro?aberto=vencidas#lancamentos`} />}

      {/* Os lotes que vencem em 30 dias (A41 da 7ª), a quem tem o Estoque. */}
      <LotesVencendo lotes={lotesVencendo} agora={now.toISOString()} />

      {/* A39 da 10ª: o mínimo também no dashboard da unidade, a quem tem o Estoque. */}
      <EstoqueAbaixoDoMinimo itens={abaixoDoMinimo} href={`/${slug}/estoque`} />

      {/* -- Checkout pendente ----------------------------------- */}
      {canCheckout && (pendingCheckouts ?? 0) > 0 && (
        <Link href={`/${slug}/checkout`} style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 20px', borderRadius: 'var(--radius-card-token)',
            background: 'var(--brand-soft)', border: '1.5px solid var(--brand)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--brand)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow-brand-btn)',
            }}>
              <ClipboardList size={16} color="var(--surface)" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>
                {pendingCheckouts} paciente{(pendingCheckouts ?? 0) !== 1 ? 's' : ''} aguardando checkout
              </p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--brand)', opacity: 0.75, marginTop: 2 }}>
                Clique para revisar e finalizar os planos de tratamento
              </p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--brand)', flexShrink: 0 }} />
          </div>
        </Link>
      )}

      {/* -- Row 1: KPI cards ------------------------------------ */}
      {(canFinancial || canAgenda) && (
      <div className="kpi-grid">

        {/* "Só as minhas": as comissões dela são o destaque (A52) */}
        {minhasComissoes && (
        <Link href={`/${slug}/financeiro/comissoes`} data-minhas-comissoes style={{ textDecoration: 'none', background: 'var(--brand)', borderRadius: 'var(--radius-card-token)', padding: '22px 24px', boxShadow: 'var(--shadow-brand-card)', color: 'var(--surface)' }}>
          <p style={{ fontSize: 'var(--text-overline)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>
            Minhas comissões · a pagar
          </p>
          <p style={{ fontSize: 'var(--text-display)', fontWeight: 800, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1 }}>
            {formatBRL(minhasComissoes.aPagar)}
          </p>
          <p style={{ fontSize: 'var(--text-xs-sz)', marginTop: 10, opacity: 0.85 }}>
            {formatBRL(minhasComissoes.lancado)} lançados em {minhasComissoes.periodo}
          </p>
        </Link>
        )}

        {/* Faturamento — brand card (o da equipe); "Meu faturamento do mês" com o financeiro "só os meus" (A41) */}
        {canFinancial && (
        <div className={dinheiroDela ? 'card' : undefined} style={dinheiroDela ? undefined : { background: 'var(--brand)', borderRadius: 'var(--radius-card-token)', padding: '22px 24px', boxShadow: 'var(--shadow-brand-card)', color: 'var(--surface)' }}>
          <p className={dinheiroDela ? 'overline' : undefined} style={{ ...(dinheiroDela ? {} : { fontSize: 'var(--text-overline)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }), display: 'flex', alignItems: 'center', gap: 4 }}>
            {dinheiroDela ? 'Meu faturamento do mês' : 'Faturamento do mês'}
            {dinheiroDela
              ? <Dica rotulo={DEFINICOES.meuFaturamento.rotulo}>{DEFINICOES.meuFaturamento.texto}</Dica>
              : <Dica rotulo={DEFINICOES.receita.rotulo}>{DEFINICOES.receita.texto}</Dica>}
          </p>
          <p style={dinheiroDela
            ? { fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginTop: 10 }
            : { fontSize: 'var(--text-display)', fontWeight: 800, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1 }}>
            {formatBRL(monthRevenue)}
          </p>
          {dinheiroDela && (
            <p data-fora-do-meu-faturamento style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.45 }}>
              {DEFINICOES.foraDoMeuFaturamento.texto}
            </p>
          )}
          {revDelta && (
            <p style={{ fontSize: 'var(--text-xs-sz)', marginTop: 10, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 700 }}>{revDelta.up ? '▲' : '▼'} {revDelta.value}%</span>
              <span style={{ opacity: 0.75 }}>vs. mês anterior</span>
            </p>
          )}
        </div>
        )}

        {/* Agendamentos hoje */}
        {canAgenda && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <p className="overline">{professionalOnly ? 'Meus agendamentos hoje' : 'Agendamentos hoje'}</p>
          <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginTop: 10 }}>
            {todayCount}
          </p>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
            {awaitingCount} aguardando confirmação
          </p>
        </div>
        )}

        {/* Ocupação (filial) OU Meus atendimentos (profissional) */}
        {canAgenda && (professionalOnly ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <p className="overline" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Meus atendimentos
            <Dica rotulo={DEFINICOES.atendimentos.rotulo}>{DEFINICOES.atendimentos.texto}</Dica>
          </p>
          <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginTop: 10 }}>
            {monthCompletedCount ?? 0}
          </p>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>concluídos neste mês</p>
        </div>
        ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <p className="overline" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Taxa de ocupação
            <Dica rotulo={DEFINICOES.ocupacao.rotulo}>{DEFINICOES.ocupacao.texto}</Dica>
          </p>
          <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginTop: 10 }}>
            {professionalsCount ? `${occupancy}%` : '—'}
          </p>
          <div>
            <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-app)', overflow: 'hidden', marginTop: 8 }}>
              <div style={{ height: '100%', width: `${occupancy}%`, background: occupancy > 70 ? 'var(--brand)' : occupancy > 40 ? 'var(--warning)' : 'var(--border)', borderRadius: 99, transition: 'width 600ms ease' }} />
            </div>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 6 }}>
              {/* A53 da 9ª: a base da conta, de quem atende (era "340min de 2720min disponíveis"). */}
              <span data-base-da-ocupacao>{baseDaOcupacao({ agendados: scheduledMin, abertos: capacityMin, profissionais: professionalsCount })}, hoje</span>
            </p>
          </div>
        </div>
        ))}

        {/* Ticket médio */}
        {canFinancial && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <p className="overline">Ticket médio</p>
          <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginTop: 10 }}>
            {avgTicket > 0 ? formatBRL(avgTicket) : '—'}
          </p>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
            {/* O rótulo acompanha a conta: o ticket divide pelas clientes que PAGARAM. */}
            pago pelas clientes ÷ {clientesQuePagaram} {clientesQuePagaram === 1 ? 'cliente que pagou' : 'clientes que pagaram'}
          </p>
        </div>
        )}
      </div>
      )}

      {/* -- Row 2: Gráfico + Agenda ------------------------------ */}
      {(canFinancial || canAgenda) && (
      <div className="rg-2">

        {/* Gráfico */}
        {canFinancial && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>{dinheiroDela ? 'Meu faturamento' : 'Faturamento'}</h2>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                {/* r2-ven-15 × r2-ind-01: o "Meu faturamento" é de VENDA; o ranking por profissional, de execução. */}
                {dinheiroDela ? 'Últimos 6 meses · o que você vendeu (pacotes, pré-pagos e produtos) e os seus atendimentos pagos' : 'Últimos 6 meses'}
              </p>
            </div>
            {semesterDelta > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 99 }}>
                <span style={{ fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--success)' }}>
                  ▲ {formatBRL(semesterDelta)} no semestre
                </span>
              </div>
            )}
          </div>
          <RevenueBarChart data={chartData} />
        </div>
        )}

        {/* Agenda de hoje */}
        {canAgenda && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Agenda de hoje</h2>
            <Link href={`/${slug}/agenda`} style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
              Ver tudo <ChevronRight size={12} />
            </Link>
          </div>

          {validToday.length === 0 ? (
            <p style={{ padding: '16px 20px 24px', color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)', textAlign: 'center' }}>
              Sem agendamentos hoje
            </p>
          ) : (
            <div>
              {validToday.slice(0, 5).map((a, i) => {
                const client    = a.clients    as unknown as { name: string } | null
                const procedure = a.procedures as unknown as { name: string } | null
                const isLast    = i === Math.min(validToday.length, 5) - 1
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: isLast ? 'none' : '1px solid var(--hairline)' }}>
                    <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 800, color: 'var(--brand)', minWidth: 38, flexShrink: 0 }}>
                      {format(new Date(a.scheduled_at), 'HH:mm')}
                    </span>
                    {client && <Avatar name={client.name} size={32} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {client?.name ?? '—'}
                      </p>
                      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {procedure?.name ?? '—'}
                      </p>
                    </div>
                    <StatusChip status={a.status} />
                  </div>
                )
              })}
              {validToday.length > 5 && (
                <Link href={`/${slug}/agenda`} style={{ display: 'block', padding: '10px 20px', fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--brand)', textDecoration: 'none', borderTop: '1px solid var(--hairline)' }}>
                  +{validToday.length - 5} agendamentos →
                </Link>
              )}
            </div>
          )}
        </div>
        )}
      </div>
      )}

      {/* -- Row 3: Procedimentos | Funil CRM | Reativar --------- */}
      {(canProcedures || canClients) && (
      <div className="rg-3">

        {/* Procedimentos mais procurados */}
        {canProcedures && (
        <div className="card">
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
            Procedimentos mais procurados
          </h2>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 18 }}>Últimos 30 dias</p>

          {topProcs.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)', textAlign: 'center', paddingTop: 8 }}>Sem dados</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {topProcs.map((p, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)', flexShrink: 0 }}>{p.count}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-app)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round((p.count / maxProc) * 100)}%`,
                      background: `rgba(195,77,107,${[1, 0.7, 0.5, 0.35][i] ?? 0.35})`,
                      borderRadius: 99,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* O ciclo de clientes do mês. Chamava-se "Funil de leads", com o selo
            CRM — e não tem lead nenhum: são os clientes e os agendamentos do
            mês (a simulação de 2026-10-20 viu o caixa achar que via o CRM). */}
        {canClients && (
          <ClientesDoPeriodo
            titulo="Clientes no mês"
            subtitulo={proId ? 'As suas novas clientes e os seus agendamentos neste mês, até agora' : 'Novos clientes e agendamentos da unidade neste mês, até agora'}
            etapas={funnel}
          />
        )}

        {/* Reativar clientes */}
        {canClients && (
          <ReativarClientes
            clientes={toReactivate.map(c => ({ id: c.id, name: c.name, diasSemVir: c.daysSince, antesDoSistema: c.antesDoSistema }))}
            total={inactiveCount}
            comVisita={paraReativar.comVisita} recentesSemVisita={paraReativar.recentesSemVisita}
            hrefAgendar={`/${slug}/agenda`}
            hrefVerTodas={`/${slug}/clients?status=active`}
          />
        )}

      </div>
      )}
    </div>
  )
}
