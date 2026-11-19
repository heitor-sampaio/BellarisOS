import { notFound } from 'next/navigation'
import { getTenantContext, assertRecurso, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ListaDePlanejamentos } from '@/app/_shared/lista-de-planejamentos'
import { ler } from '@/lib/db'

export default async function BranchPlanejamentosPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'planos_de_tratamento')
  // A trava da PÁGINA (§6: o layout protege a navegação, não a URL).
  assertPermission(ctx, 'atendimento', 'VIEW')

  const branch = await ler(createAdminClient()
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()
  // A sessão só lê sinais (o Heitor, 19/11, "vai na 2"): a unidade se lê pelo
  // servidor, e a abrangência que a RLS conferia se confere aqui.
  if (!alcancaUnidade(ctx, branch.id as string)) notFound()

  return (
    <ListaDePlanejamentos
      branchId={branch.id}
      branchName={branch.name}
      basePath={`/${slug}/planejamentos`}
    />
  )
}
