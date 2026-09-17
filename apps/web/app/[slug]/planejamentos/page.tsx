import { notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { ListaDePlanejamentos } from '@/app/_shared/lista-de-planejamentos'

export default async function BranchPlanejamentosPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()

  const supabase = await createSupabase()
  const { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) notFound()

  return <ListaDePlanejamentos branchId={branch.id} branchName={branch.name} slug={slug} />
}
