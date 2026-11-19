import { notFound, redirect } from 'next/navigation'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, alcancaUnidade, alcancaOAgendamento } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SessaoDeAtendimento } from '@/app/_shared/sessao-de-atendimento'
import { ler } from '@/lib/db'

export default async function AppointmentSessionPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx          = await getTenantContext()

  const branch = await ler(createAdminClient()
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()
  // A sessão só lê sinais (o Heitor, 19/11, "vai na 2"): a unidade se lê pelo
  // servidor, e a abrangência que a RLS conferia se confere aqui.
  if (!alcancaUnidade(ctx, branch.id as string)) notFound()

  // O atendimento DELA numa unidade em que ela atende e que não é a do
  // endereço (decisão 2 da 8ª simulação: a Talita é da Água Verde e cobre o
  // Batel): abre pelo portal dela, com a unidade do agendamento. O de outra
  // pessoa nessa unidade continua 404 — a abrangência não cresce.
  let unidadeDoAtendimento = branch.id as string
  const ag = await ler(createAdminClient().from('appointments')
    .select('branch_id, professional_id, branches!inner(tenant_id, slug)')
    .eq('id', id).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade do atendimento') as
    { branch_id: string; professional_id: string | null; branches: { slug: string } | null } | null
  if (ag && ag.branch_id !== branch.id) {
    // De outra unidade que a pessoa ALCANÇA (quem é da rede): o endereço certo
    // é o da unidade dele (D10 da 9ª: o "Seus atendimentos em outras
    // unidades" levava a Carolina a /menino-deus/agenda/<id da Moinhos>, 404).
    if (alcancaUnidade(ctx, ag.branch_id) && ag.branches?.slug) redirect(`/${ag.branches.slug}/agenda/${id}`)
    if (ctx.internalUserId && alcancaOAgendamento(ctx, ag.branch_id, ag.professional_id)) unidadeDoAtendimento = ag.branch_id
  }

  return <SessaoDeAtendimento branchId={unidadeDoAtendimento} slug={slug} id={id} />
}
