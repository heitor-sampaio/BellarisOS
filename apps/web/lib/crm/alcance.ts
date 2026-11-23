import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { can, temRecurso } from '@/lib/auth'

/**
 * Esta pessoa pode mexer nesta oportunidade?
 *
 * Mesma regra do funil (`updateLead`, `updateLeadStage`): quem tem o CRM
 * alcança as oportunidades da rede. Sem nenhum acesso ao CRM, nenhuma — é o
 * caso de quem cadastra cliente e mandaria um `_leadId` junto.
 *
 * Irmão de `conversaAoAlcance` (`lib/inbox/alcance.ts`), e fora do
 * `'use server'` pelo mesmo motivo: exportado de lá, o portão seria ele mesmo
 * um endpoint dizendo "existe e você não pode ver".
 *
 * `false` para inexistente, de outra rede — e para erro de
 * leitura. Quem chama responde como se a oportunidade não existisse.
 */
export async function leadAoAlcance(
  admin: ReturnType<typeof createAdminClient>,
  ctx: TenantContext,
  leadId: string,
): Promise<boolean> {
  if (!can(ctx, 'crm', 'VIEW')) return false
  // As oportunidades são uma funcionalidade do PLANO (lib/planos/recursos.ts).
  if (!temRecurso(ctx, 'oportunidades')) return false

  const { data, error } = await admin.from('leads').select('id')
    .eq('id', leadId).eq('tenant_id', ctx.tenantId!).maybeSingle()
  if (error) { console.error('[leadAoAlcance]', error.message); return false }
  return !!data
}
