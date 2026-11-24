import { getTenantContext, assertRecurso, can, vistaPessoal } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
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
  // Com o Financeiro em Ver, as de todos; quem atende sem ele, a vista pessoal
  // ("Minhas comissões": só as dela).
  const minhas = can(ctx, 'financial', 'VIEW') ? null : vistaPessoal(ctx, 'financial')
  if (!minhas && !can(ctx, 'financial', 'VIEW')) throw semAcesso()
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
      // Na vista pessoal volta para o início: o financeiro da rede a manda para cá.
      voltarPara={minhas ? '/admin/dashboard' : '/admin/financeiro'}
      // A 27ª (princípio 7): o link diz para onde volta.
      voltarRotulo={minhas ? 'Dashboard' : 'Financeiro'}
      periodoPedido={sp.periodo}
      abas={{ base: '/admin/financeiro', titulo: unidades.length > 1 ? 'Financeiro da Rede' : 'Financeiro' }}
    />
  )
}
