import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantContext, assertPermission, isOwnScope } from '@/lib/auth'
import {
  ReportsBiSection, type ReportsTab, type ReportsPeriod,
} from '@/components/admin/reports-bi-section'

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>
}) {
  const { tab: rawTab, period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams

  const ctx = await getTenantContext()
  assertPermission(ctx, 'reports', 'VIEW')

  // Alcance próprio em relatórios significa "só a minha unidade" — e o
  // consolidado da rede não é a unidade de ninguém.
  if (isOwnScope(ctx, 'reports')) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Seu cargo vê os relatórios de uma unidade por vez, não o consolidado da
        rede. Abra pelo item <strong>Relatórios</strong> no portal da unidade.
      </div>
    )
  }

  const admin = createAdminClient()

  const { data: branchesRaw, error: branchesError } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  // Consulta que falha é diferente de rede sem unidade. Tratar as duas como a
  // mesma coisa dizia "nenhuma filial cadastrada" quando o banco estava fora.
  if (branchesError) {
    console.error('[admin/reports] branches:', branchesError.message)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Não foi possível carregar as unidades agora. Tente recarregar em instantes.
      </div>
    )
  }

  const branches = branchesRaw ?? []

  if (branches.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  return (
    <ReportsBiSection
      tenantId={ctx.tenantId!}
      branches={branches}
      tab={(rawTab ?? 'overview') as ReportsTab}
      period={(rawPeriod ?? 'month') as ReportsPeriod}
      rawFrom={rawFrom}
      rawTo={rawTo}
      scopeLabel="Rede"
    />
  )
}
