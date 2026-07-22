import Link from 'next/link'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

type Period = '7d' | '30d' | 'month' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d',    label: 'Últimos 7 dias' },
  { key: '30d',   label: 'Últimos 30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'all',   label: 'Todo período' },
]

function fmtInt(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(n)
}
function fmtPct(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export default async function AdminComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'reports', 'VIEW')

  const { period: rawPeriod } = await searchParams
  const period = (PERIODS.some(p => p.key === rawPeriod) ? rawPeriod : 'month') as Period

  const now = new Date()
  const msPerDay = 86_400_000
  let startDate: Date
  if (period === '7d')        { startDate = new Date(now.getTime() - 7 * msPerDay);  startDate.setHours(0, 0, 0, 0) }
  else if (period === '30d')  { startDate = new Date(now.getTime() - 30 * msPerDay); startDate.setHours(0, 0, 0, 0) }
  else if (period === 'all')  { startDate = new Date(2000, 0, 1) }
  else                        { startDate = new Date(now.getFullYear(), now.getMonth(), 1) }
  const startISO = startDate.toISOString()
  const endISO   = now.toISOString()

  const admin = createAdminClient()

  // Filiais da rede
  const { data: branchesRaw } = await admin
    .from('branches').select('id').eq('tenant_id', ctx.tenantId!).eq('is_active', true)
  const branchIds = (branchesRaw ?? []).map((b: { id: string }) => b.id)

  if (branchIds.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  const [{ data: stagesRaw }, { data: leadsRaw }, { data: apptsRaw }, { data: usersRaw }] = await Promise.all([
    admin.from('crm_stages').select('id, name, position').eq('tenant_id', ctx.tenantId!).order('position'),
    admin.from('leads')
      .select('id, crm_stage_id, client_id, owner_id, created_at')
      .in('branch_id', branchIds)
      .eq('tenant_id', ctx.tenantId!)
      .gte('created_at', startISO).lte('created_at', endISO),
    admin.from('appointments')
      .select('id, status, source, is_evaluation, price, created_by_id, scheduled_at')
      .in('branch_id', branchIds)
      .gte('scheduled_at', startISO).lte('scheduled_at', endISO),
    admin.from('users').select('id, name').eq('tenant_id', ctx.tenantId!),
  ])

  const stages = (stagesRaw ?? []) as { id: string; name: string; position: number }[]
  const leads  = (leadsRaw  ?? []) as { id: string; crm_stage_id: string | null; client_id: string | null; owner_id: string | null }[]
  const appts  = (apptsRaw  ?? []) as { status: string; source: string; is_evaluation: boolean; price: number; created_by_id: string | null }[]
  const userName = new Map((usersRaw ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))

  // -- KPIs de conversão --------------------------------------------
  const totalLeads   = leads.length
  const convertidos  = leads.filter(l => l.client_id).length
  const conversao    = totalLeads > 0 ? (convertidos / totalLeads) * 100 : 0

  // -- Avaliações (agendadas × realizadas) --------------------------
  const evals          = appts.filter(a => a.is_evaluation)
  const evalAgendadas  = evals.length
  const evalRealizadas = evals.filter(a => a.status === 'COMPLETED').length
  const comparecimento = evalAgendadas > 0 ? (evalRealizadas / evalAgendadas) * 100 : 0

  // -- Agendamentos de origem comercial -----------------------------
  const comerciais = appts.filter(a => a.source === 'COMMERCIAL')

  // -- Funil por estágio --------------------------------------------
  const funil = stages.map(s => ({
    name:  s.name,
    count: leads.filter(l => l.crm_stage_id === s.id).length,
  }))
  const funilMax = Math.max(1, ...funil.map(f => f.count))

  // -- Ranking por vendedor -----------------------------------------
  type Seller = { id: string; name: string; leads: number; convertidos: number; agendamentos: number }
  const sellers = new Map<string, Seller>()
  const bump = (id: string | null): Seller | null => {
    if (!id) return null
    let s = sellers.get(id)
    if (!s) { s = { id, name: userName.get(id) ?? 'Sem nome', leads: 0, convertidos: 0, agendamentos: 0 }; sellers.set(id, s) }
    return s
  }
  for (const l of leads) {
    const s = bump(l.owner_id)
    if (s) { s.leads++; if (l.client_id) s.convertidos++ }
  }
  for (const a of comerciais) { const s = bump(a.created_by_id); if (s) s.agendamentos++ }
  const ranking = [...sellers.values()]
    .sort((a, b) => (b.leads + b.agendamentos) - (a.leads + a.agendamentos))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['leads', 'appointments']} />

      {/* Header + período */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Comercial
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            Desempenho de vendas e conversão de leads
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <Link key={p.key} href={`/admin/comercial?period=${p.key}`} className="chip" data-selected={p.key === period}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
        <KpiHero label="Conversão de leads" value={fmtPct(conversao)} sub={`${fmtInt(convertidos)} de ${fmtInt(totalLeads)} leads`} />
        <Kpi label="Leads recebidos"        value={fmtInt(totalLeads)} />
        <Kpi label="Avaliações agendadas"   value={fmtInt(evalAgendadas)} sub={`${fmtInt(evalRealizadas)} realizadas`} />
        <Kpi label="Comparecimento"         value={fmtPct(comparecimento)} sub="das avaliações" />
        <Kpi label="Agendamentos comerciais" value={fmtInt(comerciais.length)} sub="gerados pelo comercial" />
      </div>

      {/* Funil */}
      <div className="card" style={{ padding: 20 }}>
        <div className="overline" style={{ marginBottom: 14 }}>Funil de leads</div>
        {funil.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Nenhuma etapa configurada.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {funil.map(f => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 120, fontSize: 13, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>{f.name}</div>
                <div style={{ flex: 1, height: 10, background: 'var(--track, #f0e6e3)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(f.count / funilMax) * 100}%`, height: '100%', background: 'var(--brand)', borderRadius: 99 }} />
                </div>
                <div style={{ width: 40, textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: 'var(--text)', fontVariant: 'tabular-nums' }}>{fmtInt(f.count)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ranking por vendedor */}
      <div className="card" style={{ padding: 20 }}>
        <div className="overline" style={{ marginBottom: 14 }}>Ranking por vendedor</div>
        {ranking.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Nenhuma atividade comercial atribuída neste período.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 90px', gap: 8, padding: '6px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
              <span>Vendedor</span>
              <span style={{ textAlign: 'right' }}>Leads</span>
              <span style={{ textAlign: 'right' }}>Conv.</span>
              <span style={{ textAlign: 'right' }}>Agend.</span>
            </div>
            {ranking.map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 90px', gap: 8, padding: '9px 8px', borderTop: '1px solid var(--hairline)', fontSize: 13.5, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                <span style={{ textAlign: 'right', fontVariant: 'tabular-nums' }}>{fmtInt(s.leads)}</span>
                <span style={{ textAlign: 'right', fontVariant: 'tabular-nums', color: 'var(--brand)', fontWeight: 700 }}>
                  {s.leads > 0 ? fmtPct((s.convertidos / s.leads) * 100) : '—'}
                </span>
                <span style={{ textAlign: 'right', fontVariant: 'tabular-nums' }}>{fmtInt(s.agendamentos)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// KPI hero (preenchido em rosé — destaque do grupo)
function KpiHero({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ borderRadius: 'var(--radius-card)', padding: 20, background: 'var(--brand)', color: 'var(--on-brand)', boxShadow: 'var(--shadow-brand-card)' }}>
      <div style={{ fontSize: 'var(--text-overline)', letterSpacing: 'var(--tracking-overline)', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(255,255,255,.8)' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, marginTop: 11, letterSpacing: '-0.02em', fontVariant: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 8, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>{sub}</div>}
    </div>
  )
}

// KPI neutro (branco com borda)
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ borderRadius: 'var(--radius-card)', padding: 20, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 'var(--text-overline)', letterSpacing: 'var(--tracking-overline)', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, marginTop: 11, letterSpacing: '-0.02em', fontVariant: 'tabular-nums', color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 8, fontWeight: 600, color: 'var(--text-faint)' }}>{sub}</div>}
    </div>
  )
}
