import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { can, ownerFilter } from '@/lib/auth'

/**
 * Esta pessoa pode mexer nesta oportunidade?
 *
 * Mesma regra do funil (`updateLead`, `updateLeadStage`): com CRM
 * "só os meus", alcança o que é seu e o que ainda não tem dono. Sem nenhum
 * acesso ao CRM, nenhuma — é o caso de quem cadastra cliente e mandaria um
 * `_leadId` junto.
 *
 * Irmão de `conversaAoAlcance` (`lib/inbox/alcance.ts`), e fora do
 * `'use server'` pelo mesmo motivo: exportado de lá, o portão seria ele mesmo
 * um endpoint dizendo "existe e você não pode ver".
 *
 * `false` para inexistente, de outra rede, de outro dono — e para erro de
 * leitura. Quem chama responde como se a oportunidade não existisse.
 */
export async function leadAoAlcance(
  admin: ReturnType<typeof createAdminClient>,
  ctx: TenantContext,
  leadId: string,
): Promise<boolean> {
  if (!can(ctx, 'crm', 'VIEW')) return false

  let q = admin.from('leads').select('id').eq('id', leadId).eq('tenant_id', ctx.tenantId!)
  const owner = ownerFilter(ctx, 'crm')
  if (owner) q = q.or(`owner_id.is.null,owner_id.eq.${owner}`)

  const { data, error } = await q.maybeSingle()
  if (error) { console.error('[leadAoAlcance]', error.message); return false }
  return !!data
}
