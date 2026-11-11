import { can, isOwnScope } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'

/**
 * Quem vê quanto CADA UM ganha: o financeiro com escopo de todos
 * (`comissoes.md`, "Quem vê quanto cada um ganha"). Com "só as próprias", a
 * pessoa vê só a dela — também no "Vender" (A18 da 12ª: a comissão de venda de
 * quem vendeu, dita antes de vender).
 */
export function veComissaoDeTodos(ctx: TenantContext): boolean {
  return can(ctx, 'financial', 'VIEW') && !isOwnScope(ctx, 'financial')
}
