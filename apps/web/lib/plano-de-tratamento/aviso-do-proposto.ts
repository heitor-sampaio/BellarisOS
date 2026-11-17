import { createAdminClient } from '@/lib/supabase/admin'
import { notifyClient } from '@/lib/notifications/notify'
import { ler } from '@/lib/db'

/**
 * O aviso à cliente de que um plano foi PROPOSTO (A12 da 20ª simulação,
 * 2026-11-17; princípio 3, como a "Foto nova"): o plano aparecia só no cartão
 * do Início do app, e ninguém a avisava. Vai ao sino e ao celular dela, UMA
 * vez por plano — o plano da avaliação é refeito a cada salvar e não pode
 * tocar o celular a cada vez. O texto é genérico (o aviso aparece na tela de
 * bloqueio: nada do procedimento), e o link leva ao plano no app.
 *
 * Nunca lança: o plano já foi proposto.
 */
export async function avisarDoPlanoProposto(tenantId: string, planId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const plano = await ler(admin.from('treatment_plans')
      .select('id, client_id, status, branches!branch_id(tenant_id, slug, name)')
      .eq('id', planId)
      .eq('branches.tenant_id', tenantId)
      .maybeSingle(), 'buscar o plano proposto') as {
        client_id: string | null; status: string
        branches: { tenant_id: string; slug: string; name: string } | null
      } | null
    if (!plano?.client_id || plano.status !== 'PROPOSED' || plano.branches?.tenant_id !== tenantId) return

    const jaAvisada = await ler(admin.from('client_notifications').select('id')
      .eq('client_id', plano.client_id)
      .eq('type', 'plano_proposto')
      .eq('data->>planoId', planId)
      .limit(1), 'ver se a cliente já foi avisada do plano') as unknown[] | null
    if (jaAvisada?.length) return

    await notifyClient(admin, plano.client_id, {
      type:  'plano_proposto',
      title: 'Plano novo',
      body:  `${plano.branches.name || 'A equipe'} preparou um plano de tratamento para você.`,
      data:  { planoId: planId, link: `/${plano.branches.slug}/cliente/planos/${planId}` },
    })
  } catch (e) {
    console.error('[avisarDoPlanoProposto]', (e as Error).message)
  }
}
