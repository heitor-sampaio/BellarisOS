import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { InjetavelVazio } from '@/app/_shared/injetavel-vazio'

/** Nenhum planejamento aberto. O layout cuida da lista. */
export default async function BranchInjetaveisPage() {
  // O layout também confere, mas a URL é uma porta própria (CLAUDE.md §6).
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'VIEW')
  // O planejador é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'injetaveis')
  return <InjetavelVazio />
}
