import { notFound } from 'next/navigation'
import { getTenantContext, assertRecurso } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { ListaDeCheckout } from '@/app/_shared/lista-de-checkout'
import { ler } from '@/lib/db'

export default async function CheckoutListPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'planos_de_tratamento')

  const supabase = await createSupabase()
  const branch = await ler(supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()

  return <ListaDeCheckout branchIds={[branch.id]} branchName={branch.name} slug={slug} />
}
