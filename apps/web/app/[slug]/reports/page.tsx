import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
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
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>
}) {
  const { slug } = await params
  const { tab: rawTab, period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams

  const ctx = await getTenantContext()
  assertPermission(ctx, 'reports', 'VIEW')

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

  return (
    <ReportsBiSection
      tenantId={ctx.tenantId!}
      branches={[branch]}
      tab={(rawTab ?? 'overview') as ReportsTab}
      period={(rawPeriod ?? 'month') as ReportsPeriod}
      rawFrom={rawFrom}
      rawTo={rawTo}
      scopeLabel={branch.name}
    />
  )
}
