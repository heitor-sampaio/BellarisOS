import { notFound } from 'next/navigation'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, alcancaUnidade, alcancaOAgendamento } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { SessaoDeAtendimento } from '@/app/_shared/sessao-de-atendimento'
import { ler } from '@/lib/db'

export default async function AppointmentSessionPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ receber?: string }>
}) {
  const { slug, id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx          = await getTenantContext()

  const supabase = await createSupabase()
  const branch = await ler(supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()

  // O atendimento DELA numa unidade em que ela atende e que não é a do
  // endereço (decisão 2 da 8ª simulação: a Talita é da Água Verde e cobre o
  // Batel): abre pelo portal dela, com a unidade do agendamento. O de outra
  // pessoa nessa unidade continua 404 — a abrangência não cresce.
  let unidadeDoAtendimento = branch.id as string
  if (ctx.internalUserId && (ctx.atendeEm ?? []).length) {
    const ag = await ler(createAdminClient().from('appointments')
      .select('branch_id, professional_id, branches!inner(tenant_id)')
      .eq('id', id).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade do atendimento') as
      { branch_id: string; professional_id: string | null } | null
    if (ag && ag.branch_id !== branch.id && !alcancaUnidade(ctx, ag.branch_id)
      && alcancaOAgendamento(ctx, ag.branch_id, ag.professional_id)) unidadeDoAtendimento = ag.branch_id
  }

  const { receber } = await searchParams
  return <SessaoDeAtendimento branchId={unidadeDoAtendimento} slug={slug} id={id} abrirRecebimento={receber === '1'} />
}
