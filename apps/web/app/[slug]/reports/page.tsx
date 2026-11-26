import { notFound, redirect } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { destinoDaAbaPedida } from '@/lib/relatorios/aba-pedida'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'
import {
  ReportsBiSection, type ReportsTab, type ReportsPeriod,
} from '@/components/admin/reports-bi-section'

/**
 * Relatórios da unidade.
 *
 * Os relatórios existiam só em `/admin/reports`, e o portal da rede redireciona
 * quem tem unidade fixa (`app/admin/layout.tsx`). Uma gerente de unidade com
 * `reports: VIEW` não alcançava relatório nenhum — a permissão era inerte.
 *
 * Aqui o recorte é sempre a unidade da rota, então o alcance do cargo não muda
 * nada nesta tela: quem tem "a rede inteira" usa o portal da rede para o
 * consolidado, e usa esta para olhar uma unidade de cada vez.
 */
export default async function BranchReportsPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string; tipo?: string; pagina?: string; tags?: string }>
}) {
  const { slug } = await params
  const { tab: rawTab, period: rawPeriod, from: rawFrom, to: rawTo, tipo: rawTipo, pagina: rawPagina, tags: rawTags } = await searchParams

  const ctx = await getTenantContext()
  assertPermission(ctx, 'reports', 'VIEW')
  // A21 da 26ª: a aba fora da permissão leva à primeira dela, com a URL certa e o aviso.
  const destino = destinoDaAbaPedida(`/${slug}/reports`, {
    tab: rawTab, period: rawPeriod, from: rawFrom, to: rawTo, tags: rawTags,
  }, ctx.reportTabs)
  if (destino) redirect(destino)

  const admin = createAdminClient()

  const { data: branch, error } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (error) {
    console.error('[branch/reports] branch:', error.message)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Não foi possível carregar a unidade agora. Tente recarregar em instantes.
      </div>
    )
  }
  if (!branch) notFound()

  // D5 da 34ª (UU-01, D-19): na rede de uma unidade, o que é "por unidade" some aqui também.
  const umaUnidade = await redeTemUmaUnidade(ctx.tenantId!)

  return (
    <ReportsBiSection
      tenantId={ctx.tenantId!}
      branches={[branch]}
      tab={(rawTab ?? 'overview') as ReportsTab}
      period={(rawPeriod ?? 'month') as ReportsPeriod}
      rawFrom={rawFrom}
      rawTo={rawTo}
      rawTipo={rawTipo}
      rawPagina={rawPagina}
      rawTags={rawTags}
      scopeLabel={branch.name}
      umaUnidade={umaUnidade}
    />
  )
}
