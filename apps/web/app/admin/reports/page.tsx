import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantContext, assertPermission, isOwnScope } from '@/lib/auth'
import {
  ReportsBiSection, type ReportsTab, type ReportsPeriod,
} from '@/components/admin/reports-bi-section'

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string; branch?: string; funil?: string }>
}) {
  const { tab: rawTab, period: rawPeriod, from: rawFrom, to: rawTo, branch: rawBranch, funil: rawFunil } = await searchParams

  const ctx = await getTenantContext()
  assertPermission(ctx, 'reports', 'VIEW')

  // Alcance próprio em relatórios significa "uma unidade por vez". Antes isso
  // era uma porta fechada; com o filtro, o cargo simplesmente não recebe a
  // opção "Rede inteira".
  const podeVerRede = !isOwnScope(ctx, 'reports')

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

  // Recorte: a rede inteira, ou uma unidade. Quem não pode ver o consolidado
  // cai na primeira unidade em vez de numa tela vazia.
  const selecionada = branches.find(b => b.id === rawBranch)
    ?? (podeVerRede ? undefined : branches[0])

  return (
    <ReportsBiSection
      tenantId={ctx.tenantId!}
      branches={selecionada ? [selecionada] : branches}
      todasAsUnidades={branches}
      selectedBranchId={selecionada?.id ?? null}
      allowNetwork={podeVerRede}
      showBranchFilter
      tab={(rawTab ?? 'overview') as ReportsTab}
      period={(rawPeriod ?? 'month') as ReportsPeriod}
      rawFrom={rawFrom}
      rawTo={rawTo}
      rawFunil={rawFunil}
      scopeLabel={selecionada?.name ?? 'Rede'}
    />
  )
}
