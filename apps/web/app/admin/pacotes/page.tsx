import { getTenantContext, assertPermission } from '@/lib/auth'
import { PacotesDaRede } from '@/app/_shared/pacotes'

/** Vendas → Pacotes, no portal da rede. */
export default async function PacotesPage() {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'procedures', 'VIEW')
  return <PacotesDaRede ctx={ctx} />
}
