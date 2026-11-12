import type { TenantContext } from '@estetica-os/types'
import { isOwnScope } from '@/lib/auth'

/**
 * C35 do levantamento das regras (F67, 2026-11-12): com o Financeiro em "só
 * os meus", o financeiro da pessoa é "Minhas comissões" (A52) — ela não
 * estorna, não cancela, não lança, não dá crédito, não traz pacote de fora,
 * não remarca nem antecipa. A tela já esconde; a ACTION recusa (pela action
 * direta, gravava em qualquer registro da unidade).
 */
export const RECUSA_DO_SO_OS_MEUS =
  'Com o Financeiro em “só os meus”, seu cargo vê as próprias comissões: estornar, cancelar, lançar e dar crédito são de quem vê o financeiro de todos.'

export function recusaDoSoOsMeus(ctx: TenantContext): string | null {
  return isOwnScope(ctx, 'financial') ? RECUSA_DO_SO_OS_MEUS : null
}
