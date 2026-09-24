import { notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { SessaoDeAtendimento } from '@/app/_shared/sessao-de-atendimento'
import { ler } from '@/lib/db'

export default async function AppointmentSessionPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const ctx          = await getTenantContext()

  const supabase = await createSupabase()
  const branch = await ler(supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()

  return <SessaoDeAtendimento branchId={branch.id} slug={slug} id={id} />
}
