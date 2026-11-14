import { getTenantContext, assertPermission } from '@/lib/auth'
import { termoDaUrl } from '@/lib/texto'
import { CatalogoDeProcedimentos } from '@/app/_shared/catalogo-de-procedimentos'

/** Procedimentos, no portal da rede: o catálogo (o corpo é o mesmo da unidade). */
export default async function AdminProceduresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'procedures', 'VIEW')
  // `?q=` filtra a lista (a busca universal abre a tela por aqui).
  return <CatalogoDeProcedimentos termo={termoDaUrl((await searchParams).q)} />
}
