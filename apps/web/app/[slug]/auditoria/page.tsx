import { notFound } from 'next/navigation'
import { getTenantContext, assertAuditoria, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { TelaDaAuditoria } from '@/app/_shared/auditoria'
import type { FiltrosDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria no portal da unidade (CF3a): o mesmo corpo da rede. É só da
 * Admin da rede (2026-11-16: "Auditoria é só admin"), que lê a rede inteira.
 */
export default async function AuditoriaDaUnidadePage({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<FiltrosDaAuditoria>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertAuditoria(ctx)
  const unidade = await ler(createAdminClient().from('branches').select('id')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()
  return <TelaDaAuditoria ctx={ctx} basePath={`/${slug}/auditoria`} slug={slug} filtros={await searchParams} />
}
