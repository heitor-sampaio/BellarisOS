import { notFound } from 'next/navigation'
import { getTenantContext, assertRecurso } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { DetalheDePlano } from '@/app/_shared/detalhe-de-plano'
import { ler } from '@/lib/db'

/** Um plano de tratamento aberto pelo portal da unidade. */
export default async function BranchPlanoPage({
  params,
}: {
  params: Promise<{ slug: string; planId: string }>
}) {
  const { slug, planId } = await params
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'planos_de_tratamento')

  const supabase = await createSupabase()
  const branch = await ler(supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()

  return (
    <DetalheDePlano
      planId={planId}
      branchId={branch.id}
      slug={slug}
      basePath={`/${slug}/planejamentos`}
    />
  )
}
