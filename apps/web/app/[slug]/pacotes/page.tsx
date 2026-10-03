import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { PacotesDaRede } from '@/app/_shared/pacotes'
import { termoDaUrl } from '@/lib/texto'

/** Vendas → Pacotes, no portal da unidade: o catálogo da rede (e os da unidade). */
export default async function PacotesDaUnidadePage({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { slug } = await params
  const busca    = termoDaUrl((await searchParams).q)
  const ctx = await getTenantContext()
  assertPermission(ctx, 'procedures', 'VIEW')
  const unidade = await ler(createAdminClient().from('branches').select('id')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()
  return <PacotesDaRede ctx={ctx} unidadeId={unidade.id as string} busca={busca} />
}
