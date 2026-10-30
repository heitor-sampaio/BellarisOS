import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { CalendarDays, ChevronRight, Clock3, User, Plus } from 'lucide-react'
import { ler } from '@/lib/db'
import { separarAgendaDoPortal, limiteParaAlterar } from '@/lib/clientes/agenda-do-portal'

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  ARRIVED:     'Na clínica',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  NO_SHOW:     'Não compareceu',
}

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED:   'var(--brand)',
  CONFIRMED:   'var(--success)',
  ARRIVED:     'var(--success)',
  IN_PROGRESS: 'var(--warning)',
  COMPLETED:   'var(--text-muted)',
  CANCELLED:   'var(--danger)',
  NO_SHOW:     'var(--danger)',
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
  const data = await ler(admin
    .from('appointments')
    .select('id, scheduled_at, status, price, duration_min, procedures(name), professionals:users!professional_id(name)')
    .eq('client_id', ctx.clientId!)
    .order('scheduled_at', { ascending: false }), 'carregar os agendamentos')

  const ficha = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId!).single(),
    'ler a ficha') as { tenant_id: string } | null
  const rede = ficha
    ? await ler(admin.from('tenants').select('portal_prazo_alteracao_horas').eq('id', ficha.tenant_id).single(),
        'ler o prazo do portal') as { portal_prazo_alteracao_horas: number } | null
    : null
  const prazoHoras = rede?.portal_prazo_alteracao_horas ?? 24

  const appointments = (data ?? []) as unknown as Appt[]
  // A mesma regra da home (D14): o que ainda vai acontecer, em aberto.
  const { proximos: upcoming, historico: past } = separarAgendaDoPortal(appointments)

  return (
    <div>
      {/* -- Header ----------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
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
            color:          'var(--on-brand)',
            borderRadius:   10,
            fontWeight:     700,
            fontSize: 'var(--text-base-sz)',
            textDecoration: 'none',
            boxShadow: 'var(--shadow-brand-btn)',
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
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: '-4px 0 10px' }}>
            Toque no agendamento para cancelar ou remarcar — pelo app, até {prazoHoras} horas antes. Depois disso, fale com a clínica.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map(a => <AppointmentCard key={a.id} appt={a} slug={slug} highlight prazoHoras={prazoHoras} />)}
          </div>
        </section>
      )}

      {/* -- Histórico ------------------------------------------- */}
      {past.length > 0 && (
        <section>
          <GroupLabel>Histórico</GroupLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map(a => <AppointmentCard key={a.id} appt={a} slug={slug} />)}
          </div>
        </section>
      )}

      {/* -- Vazio ----------------------------------------------- */}
      {appointments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--radius-squircle)', background: 'var(--brand-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <CalendarDays size={24} color="var(--brand)" />
          </div>
          <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Nenhum agendamento ainda
          </p>
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 24 }}>
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
      fontSize: 'var(--text-2xs)',
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

// O cartão abre o agendamento (2026-10-21: não abria — nem detalhe, nem cancelar).
function AppointmentCard({ appt, slug, highlight = false, prazoHoras }: { appt: Appt; slug: string; highlight?: boolean; prazoHoras?: number }) {
  const dt    = new Date(appt.scheduled_at)
  const color = STATUS_COLOR[appt.status] ?? 'var(--text-muted)'
  const price = appt.price
    ? `R$ ${Number(appt.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—'

  return (
    <Link
      href={`/${slug}/cliente/agendamentos/${appt.id}`}
      className="card"
      style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
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
          borderRadius: 'var(--radius-chip-token)',
          fontSize: 'var(--text-overline)',
          fontWeight:   700,
          background:   `${color}18`,
          color,
          whiteSpace:   'nowrap',
        }}>
          {STATUS_LABEL[appt.status] ?? appt.status}
        </span>
        {/* A seta diz que o cartão abre (J-61). */}
        <ChevronRight data-abre-detalhe size={16} color="var(--text-faint)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      </div>

      {/* Details row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <User size={11} />
          {appt.professionals?.name ?? 'Profissional'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <CalendarDays size={11} />
          {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' })}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <Clock3 size={11} />
          {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
        </span>
        {appt.price > 0 && (
          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', marginLeft: 'auto' }}>
            {price}
          </span>
        )}
      </div>
      {prazoHoras != null && ['SCHEDULED', 'CONFIRMED'].includes(appt.status) && new Date(appt.scheduled_at).getTime() - Date.now() >= prazoHoras * 3600_000 && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          Alterar até {limiteParaAlterar(appt.scheduled_at, prazoHoras)}
        </p>
      )}
    </Link>
  )
}
