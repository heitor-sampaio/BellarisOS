import type { TenantContext } from '@estetica-os/types'
import { can, isOwnScope } from '@/lib/auth'

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

/**
 * Quem vê o "Estornar" na tela (A19 da 14ª, F75): o Financeiro em Gerenciar,
 * de todos — a mesma trava de `reverseTransaction`. A ficha do cliente, o
 * atendimento pago e o Financeiro perguntam AQUI (era a mesma conta repetida
 * em cada página, e o atendimento pago nem a fazia).
 */
export function podeEstornar(ctx: TenantContext): boolean {
  return can(ctx, 'financial', 'MANAGE') && !recusaDoSoOsMeus(ctx)
}

/**
 * Quem dá BAIXA no Financeiro — o "Receber"/"Pagar" da lista e da ficha
 * (`markTransactionPaid`). CX2 (aprovado pelo Heitor em 13/11: "Blz pode ser
 * assim"): "O Financeiro … dá baixa só no que entra sem passar pelo balcão (a
 * transferência que caiu na conta)". É o PDV em Gerenciar ou o Financeiro em
 * Gerenciar de todos — a régua do `podeReceber`, sem o "só os meus" (C35: o
 * financeiro dessa pessoa é "Minhas comissões"). Era só o PDV (C33, F67). O
 * que passa pelo balcão (a comanda, o check-in do plano) segue no PDV.
 */
export function podeDarBaixa(ctx: TenantContext): boolean {
  return can(ctx, 'cashier', 'MANAGE') || (can(ctx, 'financial', 'MANAGE') && !recusaDoSoOsMeus(ctx))
}
