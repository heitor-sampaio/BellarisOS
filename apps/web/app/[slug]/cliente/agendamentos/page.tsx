import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { CalendarDays, Clock3, User, Plus } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  NO_SHOW:     'Não compareceu',
}

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED:   'var(--brand)',
  CONFIRMED:   '#22c55e',
  IN_PROGRESS: '#f59e0b',
  COMPLETED:   'var(--text-muted)',
  CANCELLED:   '#ef4444',
  NO_SHOW:     '#ef4444',
}

type Appt = {
  id:            string
  scheduled_at:  string
  status:        string
  price:         number
  duration_min:  number
  procedures:    { name: string } | null
  professionals: { name: string } | null
}

export default async function ClientAgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug }   = await params
  const ctx        = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()
  const { data } = await admin
    .from('appointments')
    .select('id, scheduled_at, status, price, duration_min, procedures(name), professionals:users!professional_id(name)')
    .eq('client_id', ctx.clientId!)
    .order('scheduled_at', { ascending: false })

  const appointments = (data ?? []) as unknown as Appt[]
  const upcoming = appointments.filter(a => ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const past = appointments.filter(a => ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status))

  return (
    <div>
      {/* -- Header ----------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Agenda
        </h1>
        <Link
          href={`/${slug}/cliente/agendamentos/novo`}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            6,
            padding:        '9px 16px',
            background:     'var(--brand)',
            color:          '#fff',
            borderRadius:   10,
            fontWeight:     700,
            fontSize:       13,
            textDecoration: 'none',
            boxShadow:      '0 2px 8px var(--brand-shadow, rgba(195,77,107,0.35))',
          }}
        >
          <Plus size={14} />
          Agendar
        </Link>
      </div>

      {/* -- Próximos --------------------------------------------- */}
      {upcoming.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <GroupLabel>Próximos</GroupLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map(a => <AppointmentCard key={a.id} appt={a} highlight />)}
          </div>
        </section>
      )}

      {/* -- Histórico ------------------------------------------- */}
      {past.length > 0 && (
        <section>
          <GroupLabel>Histórico</GroupLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map(a => <AppointmentCard key={a.id} appt={a} />)}
          </div>
        </section>
      )}

      {/* -- Vazio ----------------------------------------------- */}
      {appointments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: 'var(--brand-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <CalendarDays size={24} color="var(--brand)" />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Nenhum agendamento ainda
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 24 }}>
            Escolha um procedimento e agende sua consulta.
          </p>
          <Link href={`/${slug}/cliente/agendamentos/novo`} className="btn-primary">
            Fazer primeiro agendamento
          </Link>
        </div>
      )}
    </div>
  )
}

// -- Sub-components ------------------------------------------------

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize:      11,
      fontWeight:    700,
      color:         'var(--text-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      marginBottom:  10,
    }}>
      {children}
    </p>
  )
}

function AppointmentCard({ appt, highlight = false }: { appt: Appt; highlight?: boolean }) {
  const dt    = new Date(appt.scheduled_at)
  const color = STATUS_COLOR[appt.status] ?? 'var(--text-muted)'
  const price = appt.price
    ? `R$ ${Number(appt.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—'

  return (
    <div
      className="card"
      style={{
        padding: highlight ? '16px 18px' : '13px 18px',
        border:  highlight ? '1.5px solid var(--brand)' : undefined,
      }}
    >
      {/* Procedure name + status badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p style={{
          fontWeight:    800,
          color:         'var(--text)',
          fontSize:      highlight ? 15 : 14,
          letterSpacing: '-0.01em',
          lineHeight:    1.2,
        }}>
          {appt.procedures?.name ?? 'Procedimento'}
        </p>
        <span style={{
          flexShrink:   0,
          padding:      '3px 10px',
          borderRadius: 20,
          fontSize:     10.5,
          fontWeight:   700,
          background:   `${color}18`,
          color,
          whiteSpace:   'nowrap',
        }}>
          {STATUS_LABEL[appt.status] ?? appt.status}
        </span>
      </div>

      {/* Details row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-muted)' }}>
          <User size={11} />
          {appt.professionals?.name ?? 'Profissional'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-muted)' }}>
          <CalendarDays size={11} />
          {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-muted)' }}>
          <Clock3 size={11} />
          {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {appt.price > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginLeft: 'auto' }}>
            {price}
          </span>
        )}
      </div>
    </div>
  )
}
