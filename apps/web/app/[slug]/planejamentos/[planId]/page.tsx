import { notFound, redirect } from 'next/navigation'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, assertRecurso, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { DetalheDePlano } from '@/app/_shared/detalhe-de-plano'
import { ler } from '@/lib/db'

/** Um plano de tratamento aberto pelo portal da unidade. */
export default async function BranchPlanoPage({
  params,
}: {
  params: Promise<{ slug: string; planId: string }>
}) {
  const { slug, planId } = await params
  // A18 da 6ª simulação: "/planejamentos/novo" dava 404 — o novo plano é o
  // "Novo plano" da lista, que abre por ?novo=1 (para quem monta).
  if (planId === 'novo') redirect(`/${slug}/planejamentos?novo=1`)
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(planId)
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'planos_de_tratamento')
  // A trava da PÁGINA (§6: o layout protege a navegação, não a URL).
  assertPermission(ctx, 'atendimento', 'VIEW')

  const branch = await ler(createAdminClient()
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()
  // A sessão só lê sinais (o Heitor, 19/11, "vai na 2"): a unidade se lê pelo
  // servidor, e a abrangência que a RLS conferia se confere aqui.
  if (!alcancaUnidade(ctx, branch.id as string)) notFound()

  return (
    <DetalheDePlano
      planId={planId}
      branchId={branch.id}
      slug={slug}
      basePath={`/${slug}/planejamentos`}
    />
  )
}
