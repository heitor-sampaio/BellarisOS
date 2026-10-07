import { getTenantContext, assertPermission, ownerFilter, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
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

  const unidades = await ler(createAdminClient().from('branches').select('id, name')
    .eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'), 'carregar as unidades')

  return (
    <ComissoesDaEquipe
      ctx={ctx}
      unidades={(unidades ?? []) as { id: string; name: string }[]}
      unidadeAtual={sp.unidade}
      basePath="/admin/financeiro/comissoes"
      // Quem só vê as próprias volta para o início: o financeiro da rede o
      // manda para cá.
      voltarPara={ownerFilter(ctx, 'financial') ? '/admin/dashboard' : '/admin/financeiro'}
      periodoPedido={sp.periodo}
    />
  )
}
