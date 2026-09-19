import { getTenantContext, assertPermission } from '@/lib/auth'
import { InjetavelVazio } from '@/app/_shared/injetavel-vazio'

/** Nenhum planejamento aberto. O layout cuida da lista. */
export default async function BranchInjetaveisPage() {
  // O layout também confere, mas a URL é uma porta própria (CLAUDE.md §6).
  assertPermission(await getTenantContext(), 'medical_records', 'VIEW')
  return <InjetavelVazio />
}
