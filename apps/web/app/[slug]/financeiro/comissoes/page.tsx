import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, alcancaUnidade, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { ComissoesDaEquipe } from '@/app/_shared/comissoes-da-equipe'

/** Financeiro → Comissões, no portal da unidade: só a dela. */
export default async function ComissoesDaUnidadePage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ periodo?: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'comissoes')
  assertPermission(ctx, 'financial', 'VIEW')
  const sp = await searchParams

  const unidade = await ler(createAdminClient().from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()

  return (
    <ComissoesDaEquipe
      ctx={ctx}
      unidades={[{ id: unidade.id as string, name: unidade.name as string }]}
      basePath={`/${slug}/financeiro/comissoes`}
      voltarPara={`/${slug}/financeiro`}
      periodoPedido={sp.periodo}
    />
  )
}
