import { getTenantContext, assertPermission } from '@/lib/auth'
import { PacotesDaRede } from '@/app/_shared/pacotes'
import { termoDaUrl } from '@/lib/texto'

/** Vendas → Pacotes, no portal da rede. `?q=` abre a lista filtrada. */
export default async function PacotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'procedures', 'VIEW')
  return <PacotesDaRede ctx={ctx} busca={termoDaUrl((await searchParams).q)} />
}
