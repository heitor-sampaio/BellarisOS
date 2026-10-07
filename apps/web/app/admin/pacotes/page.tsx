import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { PacotesDaRede } from '@/app/_shared/pacotes'
import { termoDaUrl } from '@/lib/texto'

/** Vendas → Pacotes, no portal da rede. `?q=` abre a lista filtrada. */
export default async function PacotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'pacotes')
  assertPermission(ctx, 'procedures', 'VIEW')
  return <PacotesDaRede ctx={ctx} busca={termoDaUrl((await searchParams).q)} />
}
