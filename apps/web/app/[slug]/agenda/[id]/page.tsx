import { notFound, redirect } from 'next/navigation'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, alcancaUnidade } from '@/lib/auth'
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

  // O atendimento de OUTRA unidade que a pessoa alcança (quem é da rede, ou
  // de várias unidades): o endereço certo é o da unidade dele (D10 da 9ª: o
  // "Seus atendimentos em outras unidades" levava a Carolina a
  // /menino-deus/agenda/<id da Moinhos>, 404). Fora do alcance, segue 404 — o
  // "Atende" só vale nas unidades da pessoa (o Heitor, 2026-11-23), e saiu o
  // caminho de quem atendia fora delas (AG-30).
  const ag = await ler(createAdminClient().from('appointments')
    .select('branch_id, branches!inner(tenant_id, slug)')
    .eq('id', id).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade do atendimento') as
    { branch_id: string; branches: { slug: string } | null } | null
  if (ag && ag.branch_id !== branch.id && alcancaUnidade(ctx, ag.branch_id) && ag.branches?.slug) {
    redirect(`/${ag.branches.slug}/agenda/${id}`)
  }

  return <SessaoDeAtendimento branchId={branch.id as string} slug={slug} id={id} />
}
