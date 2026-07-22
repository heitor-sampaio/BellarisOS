import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { CalendarDays, Star, ChevronRight, Sparkles } from 'lucide-react'

// -- Helpers --------------------------------------------------------
function fmtBRL(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

// -- Types ----------------------------------------------------------
type NextAppt = {
  id:           string
  scheduled_at: string
  procedures:   { name: string } | null
  professionals: { name: string } | null
}

type ActivePackage = {
  id:             string
  total_sessions: number
  used_sessions:  number
  expires_at:     string | null
  service_packages: { name: string } | null
}

type ActivePlan = {
  id:         string
  status:     string
  created_at: string
  treatment_plan_items: Array<{ procedures: { name: string } | null }>
}

// -- Page -----------------------------------------------------------
export default async function ClientHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  const [clientRes, nextApptRes, pendingConfirmRes, packagesRes, plansRes, loyaltyRes] = await Promise.all([
    admin.from('clients').select('name').eq('id', ctx.clientId!).single(),
    admin.from('appointments')
      .select('id, scheduled_at, procedures(name), professionals:users!professional_id(name)')
      .eq('client_id', ctx.clientId!)
      .in('status', ['SCHEDULED', 'CONFIRMED'])
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(1)
      .maybeSingle(),
    admin.from('appointments')
      .select('id, scheduled_at, procedures(name), professionals:users!professional_id(name)')
      .eq('client_id', ctx.clientId!)
      .eq('status', 'COMPLETED')
      .is('client_confirmed_at', null)
      .order('scheduled_at', { ascending: false })
      .limit(5),
    admin.from('client_packages')
      .select('id, total_sessions, used_sessions, expires_at, service_packages(name)')
      .eq('client_id', ctx.clientId!)
      .order('purchased_at', { ascending: false })
      .limit(5),
    admin.from('treatment_plans')
      .select('id, status, created_at, treatment_plan_items(procedures(name))')
      .eq('client_id', ctx.clientId!)
      .in('status', ['PROPOSED', 'ACCEPTED'])
      .order('created_at', { ascending: false })
      .limit(3),
    admin.from('loyalty_accounts')
      .select('balance')
      .eq('client_id', ctx.clientId!)
      .maybeSingle(),
  ])

  const clientName   = (clientRes.data as { name: string } | null)?.name ?? 'você'
  const firstName    = clientName.split(' ')[0] ?? clientName
  const nextAppt     = nextApptRes.data as NextAppt | null
  const pendingConfirm = (pendingConfirmRes.data ?? []) as unknown as NextAppt[]
  const allPackages  = (packagesRes.data ?? []) as unknown as ActivePackage[]
  const activePkgs   = allPackages.filter(p => Number(p.used_sessions) < Number(p.total_sessions))
  const activePlans  = (plansRes.data ?? []) as unknown as ActivePlan[]
  const points       = Number((loyaltyRes.data as { balance: number } | null)?.balance ?? 0)

  const hasActiveTreatments = activePkgs.length > 0 || activePlans.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* -- Saudação ----------------------------------------------- */}
      <div>
        <h1 style={{
          fontSize:      26,
          fontWeight:    800,
          color:         'var(--text)',
          letterSpacing: '-0.025em',
          marginBottom:  4,
        }}>
          Olá, {firstName}!
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Bem-vinda ao seu espaço pessoal.
        </p>
      </div>

      {/* -- Pontos de fidelidade ----------------------------------- */}
      {points > 0 && (
        <div style={{
          background:    'linear-gradient(135deg, var(--brand) 0%, #9b2d47 100%)',
          borderRadius:  14,
          padding:       '16px 20px',
          display:       'flex',
          alignItems:    'center',
          justifyContent: 'space-between',
          color:         '#fff',
        }}>
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.8, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
              Seus pontos
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {points.toLocaleString('pt-BR')}
            </p>
          </div>
          <Star size={32} strokeWidth={1.5} style={{ opacity: 0.5 }} />
        </div>
      )}

      {/* -- Aguardando confirmação --------------------------------- */}
      {pendingConfirm.length > 0 && (
        <section>
          <SectionHeader label="Aguardando sua confirmação" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingConfirm.map(a => (
              <Link
                key={a.id}
                href={`/${slug}/cliente/atendimentos/${a.id}/confirmar`}
                className="card"
                style={{
                  padding: '14px 16px', textDecoration: 'none',
                  border: '1.5px solid var(--brand)', background: 'var(--brand-soft)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 14.5, letterSpacing: '-0.01em', marginBottom: 2 }}>
                    {a.procedures?.name ?? 'Procedimento'}
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--brand-deep, var(--brand))', fontWeight: 600 }}>
                    Toque para confirmar e avaliar
                  </p>
                </div>
                <ChevronRight size={18} color="var(--brand)" style={{ flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* -- Próximo agendamento ------------------------------------- */}
      <section>
        <SectionHeader label="Próximo agendamento" />
        {nextAppt ? (
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 15.5, marginBottom: 4, letterSpacing: '-0.01em' }}>
                  {nextAppt.procedures?.name ?? 'Procedimento'}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {nextAppt.professionals?.name ?? 'Profissional'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarDays size={13} color="var(--brand)" />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--brand)' }}>
                    {(() => {
                      const { date, time } = fmtDateTime(nextAppt.scheduled_at)
                      return `${date} às ${time}`
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '20px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 14 }}>
              Nenhum agendamento próximo.
            </p>
            <Link href={`/${slug}/cliente/agendamentos/novo`} className="btn-primary">
              Agendar agora
            </Link>
          </div>
        )}
      </section>

      {/* -- Tratamentos em curso ----------------------------------- */}
      {hasActiveTreatments && (
        <section>
          <SectionHeader label="Tratamentos em curso" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {activePkgs.map(pkg => {
              const used  = Number(pkg.used_sessions)
              const total = Number(pkg.total_sessions)
              const pct   = total > 0 ? Math.round((used / total) * 100) : 0
              return (
                <div key={pkg.id} className="card" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Sparkles size={15} color="var(--brand)" />
                    <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>
                      {(pkg.service_packages as { name: string } | null)?.name ?? 'Pacote de sessões'}
                    </p>
                  </div>
                  <ProgressBar pct={pct} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {used} de {total} sessões realizadas
                    </span>
                    {pkg.expires_at && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                        válido até {new Date(pkg.expires_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {activePlans.map(plan => {
              const procs = (plan.treatment_plan_items ?? [])
                .map((i: { procedures: { name: string } | null }) => i.procedures?.name)
                .filter(Boolean)
                .slice(0, 2)
                .join(', ')
              return (
                <div key={plan.id} className="card" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkles size={15} color="var(--brand)" />
                    <div>
                      <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>
                        Plano de tratamento
                      </p>
                      {procs && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {procs}
                        </p>
                      )}
                    </div>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 11, fontWeight: 700,
                      color: '#22c55e',
                      background: '#22c55e18',
                      padding: '3px 10px', borderRadius: 20,
                    }}>
                      {plan.status === 'ACCEPTED' ? 'Ativo' : 'Proposto'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* -- CTA ---------------------------------------------------- */}
      <Link
        href={`/${slug}/cliente/agendamentos/novo`}
        className="btn-primary"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <CalendarDays size={15} />
        Agendar procedimento
      </Link>

    </div>
  )
}

// -- Sub-components ------------------------------------------------

function SectionHeader({ label }: { label: string }) {
  return (
    <p style={{
      fontSize:      11,
      fontWeight:    700,
      color:         'var(--text-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      marginBottom:  10,
    }}>
      {label}
    </p>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height:       '100%',
        width:        `${pct}%`,
        background:   'var(--brand)',
        borderRadius: 3,
        transition:   'width 400ms',
      }} />
    </div>
  )
}
