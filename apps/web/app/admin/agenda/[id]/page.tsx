import { notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SessaoDeAtendimento } from '@/app/_shared/sessao-de-atendimento'

/**
 * Atendimento visto do portal da rede.
 *
 * Quem opera a rede alcança qualquer unidade, então a filial vem do próprio
 * agendamento em vez do slug da URL — antes esta tela só existia em
 * `/[slug]/agenda/[id]` e abrir um atendimento pelo perfil do cliente
 * empurrava a pessoa para o portal de uma unidade.
 *
 * O `slug` resolvido aqui não é o portal: é o endereço da filial, que as
 * actions da tela usam no `revalidatePath`.
 */
export default async function AdminAppointmentSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx    = await getTenantContext()

  const admin = createAdminClient()
  const { data: appt } = await admin
    .from('appointments')
    .select('branch_id, branches!branch_id(slug)')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  const branch = appt?.branches as unknown as { slug: string } | null
  if (!appt?.branch_id || !branch?.slug) notFound()

  return <SessaoDeAtendimento branchId={appt.branch_id as string} slug={branch.slug} id={id} />
}
