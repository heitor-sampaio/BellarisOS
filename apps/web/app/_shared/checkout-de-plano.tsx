import { notFound, redirect } from 'next/navigation'
import { getTenantContext, assertPodeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O antigo "Checkout" do plano — a mesma rota nos dois portais. Desde o PDV
 * (fase 3, PT1b: a revisão do Heitor de 2026-11-13) o plano não se fecha mais
 * aqui: o aceite é no plano, e o dinheiro, na comanda do plano no PDV. A rota
 * fica (links velhos, a fila dos propostos) e leva aonde a coisa mora agora:
 * - proposto (ou rascunho) → o plano, onde se aceita;
 * - aceito → a comanda dele no PDV;
 * - o resto → a ficha da cliente.
 *
 * Quem chama resolve a unidade: pelo slug da URL na unidade, pelo próprio
 * plano na rede. A consulta exige o `branch_id`.
 */
export async function CheckoutDePlano({
  branchId, slug, planId, portal,
}: {
  branchId:   string
  branchName: string
  slug:       string
  planId:     string
  /** Onde a pessoa está: `/admin` na rede; sem ele, o portal da unidade. */
  portal?:    string
}): Promise<null> {
  const ctx = await getTenantContext()
  assertPodeReceber(ctx)

  const admin = createAdminClient()
  const plano = await ler(admin.from('treatment_plans').select('id, status, client_id, branch_id')
    .eq('id', planId).eq('branch_id', branchId).maybeSingle(), 'buscar o plano') as
    { id: string; status: string; client_id: string | null; branch_id: string } | null
  if (!plano) notFound()

  const base = portal ?? `/${slug}`
  if (plano.status === 'DRAFT' || plano.status === 'PROPOSED') redirect(`${base}/planejamentos/${plano.id}`)
  if (plano.status === 'ACCEPTED') {
    const comanda = await ler(admin.from('comandas').select('id').eq('treatment_plan_id', plano.id)
      .is('cancelada_em', null).maybeSingle(), 'buscar a comanda do plano') as { id: string } | null
    redirect(`${base}/pdv?unidade=${plano.branch_id}${comanda ? `&comanda=${comanda.id}` : ''}`)
  }
  if (plano.client_id) redirect(`${base}/clients/${plano.client_id}`)
  return notFound()
}
