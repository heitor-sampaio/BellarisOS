import type { TenantContext } from '@estetica-os/types'
import { can } from '@/lib/auth'

/**
 * Quem vê o "Estornar" na tela (A19 da 14ª, F75): o Financeiro em Gerenciar
 * — a mesma trava de `reverseTransaction`. A ficha do cliente, o
 * atendimento pago e o Financeiro perguntam AQUI (era a mesma conta repetida
 * em cada página, e o atendimento pago nem a fazia).
 */
export function podeEstornar(ctx: TenantContext): boolean {
  return can(ctx, 'financial', 'MANAGE')
}

/**
 * Quem dá BAIXA no Financeiro — o "Receber"/"Pagar" da lista e da ficha
 * (`markTransactionPaid`). CX2 (aprovado pelo Heitor em 13/11: "Blz pode ser
 * assim"): "O Financeiro … dá baixa só no que entra sem passar pelo balcão (a
 * transferência que caiu na conta)". É o PDV em Gerenciar ou o Financeiro em
 * Gerenciar — a régua do `podeReceber`. Era só o PDV (C33, F67). O que passa
 * pelo balcão (a comanda, o check-in do plano) segue no PDV.
 */
export function podeDarBaixa(ctx: TenantContext): boolean {
  return can(ctx, 'cashier', 'MANAGE') || can(ctx, 'financial', 'MANAGE')
}
