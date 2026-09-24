import Link from 'next/link'
import { getTenantContext, assertPermission, can, podeReceber } from '@/lib/auth'
import { getCabecalhoDoPlano } from '@/actions/treatment-plans'
import { procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
import { PlanoAberto } from '@/components/branch/plano-aberto'

/**
 * Um plano de tratamento aberto, nos dois portais.
 *
 * `branchId` e `slug` são os da TELA, não os do plano: é o mesmo que a lista já
 * passava, e é o que o editor usa para saber onde criar e o que revalidar.
 */
export async function DetalheDePlano({
  planId, branchId, slug, basePath,
}: {
  planId:   string
  branchId: string | null
  slug:     string
  basePath: string
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  const [{ plano, error }, procs] = await Promise.all([
    getCabecalhoDoPlano(planId),
    procedimentosParaPlano(ctx.tenantId!),
  ])

  if (error || !plano) {
    return (
      <div style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base-sz)' }}>
          {error ?? 'Plano não encontrado.'}
        </p>
        <Link href={basePath} className="btn-secondary" style={{ textDecoration: 'none' }}>
          Voltar aos planejamentos
        </Link>
      </div>
    )
  }

  return (
    <PlanoAberto
      plano={plano}
      basePath={basePath}
      branchId={branchId ?? ''}
      slug={slug}
      procedures={procs.procedures}
      availableProducts={procs.products}
      podeEditar={can(ctx, 'medical_records', 'MANAGE')}
      podeReceber={podeReceber(ctx)}
    />
  )
}
