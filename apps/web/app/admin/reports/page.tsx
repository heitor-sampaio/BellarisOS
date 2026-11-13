import { getTenantContext, assertPermission, isOwnScope } from '@/lib/auth'
import { umaUnidadeSo } from '@/lib/unidades/uma-so'
import { unidadesParaLer, periodoDaTela, nomeNaTela } from '@/lib/unidades/da-tela'
import {
  ReportsBiSection, type ReportsTab, type ReportsPeriod,
} from '@/components/admin/reports-bi-section'

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string; unidade?: string; branch?: string; funil?: string; tipo?: string; pagina?: string }>
}) {
  const { tab: rawTab, period: rawPeriod, from: rawFrom, to: rawTo, unidade: rawUnidade, branch: rawBranch, funil: rawFunil, tipo: rawTipo, pagina: rawPagina } = await searchParams

  const ctx = await getTenantContext()
  assertPermission(ctx, 'reports', 'VIEW')

  // Alcance próprio em relatórios significa "uma unidade por vez". Antes isso
  // era uma porta fechada; com o filtro, o cargo simplesmente não recebe a
  // opção "Rede inteira".
  const podeVerRede = !isOwnScope(ctx, 'reports')

  // F72 (D1 da 14ª; H6, C45): as unidades de LEITURA — a desativada com
  // movimento no período ou com o que ficou nela entra no total, no seletor e
  // no `?unidade=`, com o selo; os Relatórios diziam R$ 1.846 e "MANACÁ
  // SAVASSI" com a Pampulha recém-fechada (o dashboard dizia R$ 2.476).
  const branches = (await unidadesParaLer(ctx.tenantId!, {
    periodo: await periodoDaTela(ctx.tenantId!, rawPeriod ?? 'month', rawFrom, rawTo),
  })).map(b => ({ id: b.id, name: nomeNaTela(b), slug: b.slug }))

  if (branches.length === 0) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
        Nenhuma filial ativa cadastrada.
      </div>
    )
  }

  // Recorte: a rede inteira, ou uma unidade. Quem não pode ver o consolidado
  // cai na primeira unidade em vez de numa tela vazia.
  // `?unidade=<id|endereço>` é o drill-down da rede, como no dashboard e em
  // Clientes (J-54; A57 da 5ª, 2026-11-02); `?branch=<id>` segue como apelido.
  const pedida = rawUnidade ?? rawBranch
  const selecionada = branches.find(b => b.id === pedida || b.slug === pedida)
    ?? (podeVerRede ? undefined : branches[0])
  // D-19: com UMA unidade, o cabeçalho diz o nome dela, não "Rede", e os
  // quadros por unidade somem. F72: "uma" é uma nos NÚMEROS — enquanto a
  // desativada tem dado aqui, o total é de duas, e o cabeçalho diz "Rede".
  const umaUnidade = umaUnidadeSo(branches.length)

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
      rawTipo={rawTipo}
      rawPagina={rawPagina}
      scopeLabel={selecionada?.name ?? (umaUnidade ? branches[0]!.name : 'Rede')}
      umaUnidade={umaUnidade}
    />
  )
}
