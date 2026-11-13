import { getTenantContext, assertPermission, ownerFilter, assertRecurso } from '@/lib/auth'
import { unidadesParaLer, nomeNaTela } from '@/lib/unidades/da-tela'
import { ComissoesDaEquipe } from '@/app/_shared/comissoes-da-equipe'

/** Financeiro → Comissões, no portal da rede: todas as unidades, com filtro. */
export default async function ComissoesDaRedePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; unidade?: string }>
}) {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'comissoes')
  assertPermission(ctx, 'financial', 'VIEW')
  const sp = await searchParams

  // F72 (A32 da 14ª; H6): as unidades de LEITURA — a desativada com comissão a
  // pagar (ou o que mais ficou nela) segue no filtro, com o selo: o "Fechar as
  // comissões" da janela de desativar chega aqui.
  // O movimento conta nos períodos que a tela oferece (os 12 últimos): a comissão
  // já paga de lá entra no total da rede (C45).
  const agora = new Date()
  const unidades = (await unidadesParaLer(ctx.tenantId!, {
    periodo: { de: new Date(agora.getTime() - 400 * 86_400_000), ate: agora },
  })).map(u => ({ id: u.id, name: nomeNaTela(u), ativa: u.ativa }))

  return (
    <ComissoesDaEquipe
      ctx={ctx}
      unidades={unidades}
      unidadeAtual={sp.unidade}
      basePath="/admin/financeiro/comissoes"
      // Quem só vê as próprias volta para o início: o financeiro da rede o
      // manda para cá.
      voltarPara={ownerFilter(ctx, 'financial') ? '/admin/dashboard' : '/admin/financeiro'}
      periodoPedido={sp.periodo}
    />
  )
}
