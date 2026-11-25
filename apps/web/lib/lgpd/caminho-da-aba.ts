/**
 * Onde quem RESPONDE ao pedido de dados (LGPD) o abre: a aba LGPD de
 * Configurações, no portal em que a pessoa está (D8 da 25ª). Responde quem
 * tem Clientes em Gerenciar (revisão de 24/11) ou quem libera o prontuário (Prontuário em
 * Gerenciar — C31, F70; `docs/regras/crm-inbox.md`). A aba existe nos dois
 * portais: a cliente é da rede (H5), e o pedido também. Puro: a ficha lê
 * daqui.
 */
export function caminhoDaAbaLgpd(
  ctx: { branchId: string | null; permissions: Record<string, string> },
  /** A unidade do portal; nulo = o portal da rede. */
  slug: string | null | undefined,
): string | null {
  const responde = ctx.permissions.clients === 'MANAGE' || ctx.permissions.medical_records === 'MANAGE'
  if (!responde) return null
  return ctx.branchId === null || !slug ? '/admin/settings?tab=lgpd' : `/${slug}/settings?tab=lgpd`
}
