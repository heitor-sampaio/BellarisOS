import { can } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'

/**
 * Quem vê quanto CADA UM ganha: quem vê o Financeiro (`comissoes.md`, "Quem vê
 * quanto cada um ganha") — também no "Vender" (A18 da 12ª: a comissão de venda
 * de quem vendeu, dita antes de vender). Sem ele, quem atende vê só a dela, na
 * vista pessoal ("Minhas comissões").
 */
export function veComissaoDeTodos(ctx: TenantContext): boolean {
  return can(ctx, 'financial', 'VIEW')
}
