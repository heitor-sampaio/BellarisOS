import { getTenantContext, podeReceber } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { unidadesParaLer, nomeNaTela } from '@/lib/unidades/da-tela'
import { SeloUnidadeDesativada } from '@/components/shared/selo-unidade-desativada'
import { Pdv } from '@/app/_shared/pdv'

/** O PDV, no portal da rede: uma unidade de cada vez (`?unidade=`), como o Fechamento. */
export default async function PdvDaRedePage({ searchParams }: {
  searchParams: Promise<{ ver?: string; comanda?: string; unidade?: string }>
}) {
  const ctx = await getTenantContext()
  if (!podeReceber(ctx)) throw semAcesso()
  const sp = await searchParams

  // As unidades de LEITURA (a desativada com comanda aberta ainda recebe), e a
  // abrangência vence: quem tem unidade fixa, só a dela.
  const unidades = (await unidadesParaLer(ctx.tenantId!)).filter(u => !ctx.branchId || u.id === ctx.branchId)
  if (unidades.length === 0) {
    return <p style={{ padding: 40, color: 'var(--text-muted)' }}>Nenhuma unidade ativa.</p>
  }
  const atual = unidades.find(u => u.id === sp.unidade || u.slug === sp.unidade) ?? unidades[0]!

  return (
    <>
      {!atual.ativa && <div style={{ marginBottom: 12 }}><SeloUnidadeDesativada /></div>}
      <Pdv ctx={ctx} unidades={unidades.map(u => ({ id: u.id, name: nomeNaTela(u) }))}
        unidadeId={atual.id} slugDaUnidade={atual.slug} basePath="/admin/pdv"
        ver={sp.ver} comandaId={sp.comanda} />
    </>
  )
}
