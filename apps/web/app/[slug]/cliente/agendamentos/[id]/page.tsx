import Link from 'next/link'
import { idOu404 } from '@/lib/id-da-rota'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock3, User, MapPin } from 'lucide-react'
import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { formatarTelefone } from '@/lib/documentos/valores'
import { AlterarAgendamento } from '@/components/client-portal/alterar-agendamento'

/**
 * O agendamento aberto no portal (2026-10-21): os cartões da agenda não
 * abriam. Até o prazo da rede, ela cancela ou remarca aqui; depois, o caminho
 * para falar com a clínica. Só a ficha DELA — de outra cliente, 404.
 */
export default async function AgendamentoDaClientePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx = await getTenantContext()
  assertClient(ctx)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !ctx.clientId) notFound()

  const admin = createAdminClient()
  const a = await ler(admin.from('appointments')
    .select('id, status, scheduled_at, duration_min, cancellation_reason, procedures(name), profissional:users!professional_id(name), branches!inner(name, phone, tenant_id)')
    .eq('id', id).eq('client_id', ctx.clientId).maybeSingle(), 'buscar o agendamento') as {
      id: string; status: string; scheduled_at: string; duration_min: number; cancellation_reason: string | null
      procedures: { name: string } | null; profissional: { name: string } | null
      branches: { name: string; phone: string | null; tenant_id: string }
    } | null
  if (!a) notFound()
  const rede = await ler(admin.from('tenants').select('portal_prazo_alteracao_horas, phone').eq('id', a.branches.tenant_id).single(),
    'ler o prazo do portal') as { portal_prazo_alteracao_horas: number; phone: string | null } | null
  const prazoHoras = rede?.portal_prazo_alteracao_horas ?? 24

  const aberto = ['SCHEDULED', 'CONFIRMED'].includes(a.status)
  const telefone = (a.branches.phone || rede?.phone || '').replace(/\D/g, '')
  const quando = new Date(a.scheduled_at)

  const linha = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-base-sz)', color: 'var(--text-soft)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href={`/${slug}/cliente/agendamentos`} className="btn-ghost" style={{ alignSelf: 'flex-start', padding: '4px 0', color: 'var(--text-muted)', display: 'inline-flex', gap: 6 }}>
        <ArrowLeft size={15} aria-hidden="true" /> Agenda
      </Link>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          {a.procedures?.name ?? 'Procedimento'}
        </h1>
        <span style={linha}><CalendarDays size={15} aria-hidden="true" />
          {quando.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' })}
        </span>
        <span style={linha}><Clock3 size={15} aria-hidden="true" />
          {quando.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} · {a.duration_min} min
        </span>
        <span style={linha}><User size={15} aria-hidden="true" /> {a.profissional?.name ?? 'Profissional'}</span>
        <span style={linha}><MapPin size={15} aria-hidden="true" /> {a.branches.name}</span>
        {a.status === 'CANCELLED' && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>
            Cancelado{a.cancellation_reason ? ` — ${a.cancellation_reason}` : ''}
          </p>
        )}
      </div>

      {aberto && (
        <AlterarAgendamento
          appointmentId={a.id}
          scheduledAt={a.scheduled_at}
          prazoHoras={prazoHoras}
          telefone={formatarTelefone(telefone)}
          whatsapp={telefone ? `https://wa.me/${telefone.startsWith('55') ? telefone : `55${telefone}`}` : null}
        />
      )}
    </div>
  )
}
