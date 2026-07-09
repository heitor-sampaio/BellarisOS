import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ConfirmAppointmentForm } from '@/components/client-portal/confirm-appointment-form'

export const dynamic = 'force-dynamic'

export default async function ConfirmAppointmentPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const ctx = await getTenantContext()
  assertRole(ctx, ['CLIENT'])

  const admin = createAdminClient()
  const { data: appt } = await admin
    .from('appointments')
    .select('id, client_id, status, client_confirmed_at, scheduled_at, procedures(name), professionals:users!professional_id(name)')
    .eq('id', id)
    .maybeSingle()

  // Só o dono, concluído e ainda não confirmado.
  if (
    !appt ||
    appt.client_id !== ctx.clientId ||
    appt.status !== 'COMPLETED' ||
    appt.client_confirmed_at
  ) {
    redirect(`/${slug}/cliente/historico`)
  }

  const procedureName    = (appt!.procedures as unknown as { name?: string } | null)?.name ?? 'Procedimento'
  const professionalName = (appt!.professionals as unknown as { name?: string } | null)?.name ?? 'Profissional'

  return (
    <div>
      <Link
        href={`/${slug}/cliente/historico`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none', marginBottom: 16 }}
      >
        <ChevronLeft size={16} /> Voltar
      </Link>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 6 }}>
        Confirmar atendimento
      </h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 20 }}>
        Confirme que este atendimento foi realizado. Se quiser, avalie o procedimento e a profissional.
      </p>

      <ConfirmAppointmentForm
        appointmentId={appt!.id as string}
        slug={slug}
        procedureName={procedureName}
        professionalName={professionalName}
        scheduledAt={appt!.scheduled_at as string}
      />
    </div>
  )
}
