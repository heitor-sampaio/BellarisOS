import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { TelaDaAuditoria } from '@/app/_shared/auditoria'
import type { FiltrosDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria no portal da unidade (CF3a): o mesmo corpo da rede. O que se lê
 * é o que a pessoa alcança — as unidades DELA (quem tem A e B vê A e B, em
 * qualquer dos dois portais), e quem é da rede, a rede inteira.
 */
export default async function AuditoriaDaUnidadePage({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<FiltrosDaAuditoria>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertPermission(ctx, 'audit', 'VIEW')
  const unidade = await ler(createAdminClient().from('branches').select('id')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()
  return <TelaDaAuditoria ctx={ctx} basePath={`/${slug}/auditoria`} slug={slug} filtros={await searchParams} />
}
