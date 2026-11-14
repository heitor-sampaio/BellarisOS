import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, alcancaUnidade, assertRecurso, ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { ComissoesDaEquipe } from '@/app/_shared/comissoes-da-equipe'

/** Financeiro → Comissões, no portal da unidade: só a dela. */
export default async function ComissoesDaUnidadePage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ periodo?: string; unidade?: string }>
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

  // "Minhas comissões" de quem ATENDE também em outra unidade (decisão 2 da 8ª:
  // a Talita da Água Verde cobre o Batel): as outras unidades em que ela atende
  // entram no recorte — só as comissões DELA (o "só as próprias"); quem vê as
  // de todos fica na unidade dele.
  const minhas = ownerFilter(ctx, 'financial')
  const outras = minhas && minhas === ctx.internalUserId
    ? (ctx.atendeEm ?? []).filter(u => u !== unidade.id) : []
  const deFora = outras.length
    ? ((await ler(createAdminClient().from('branches').select('id, name')
        .eq('tenant_id', ctx.tenantId!).in('id', outras).order('name'), 'buscar as unidades em que atende')) ?? []) as { id: string; name: string }[]
    : []

  return (
    <ComissoesDaEquipe
      ctx={ctx}
      unidades={[{ id: unidade.id as string, name: unidade.name as string }, ...deFora]}
      unidadeAtual={deFora.length ? sp.unidade : undefined}
      basePath={`/${slug}/financeiro/comissoes`}
      voltarPara={`/${slug}/financeiro`}
      periodoPedido={sp.periodo}
      abas={{ base: `/${slug}/financeiro`, titulo: 'Financeiro' }}
    />
  )
}
