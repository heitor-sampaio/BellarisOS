import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { usoDoCopilot } from '@estetica-os/nucleo/lib/planos/uso-do-copilot'
import { tentar } from '@/lib/db'
import type { Admin } from '@/lib/copilot/ferramentas/tipos'

/**
 * A cota mensal do Copilot por rede (decisão do Heitor, 2026-10-08): o plano
 * diz quantos tokens por mês (`cotas.copilot`, null = sem limite) e cada
 * pedido soma o que gastou em `copilot_uso_mensal`. Passou, o Copilot avisa e
 * só volta no mês seguinte. O mês é o de Brasília (o uso mora no núcleo:
 * `usoDoCopilot`, lido também pelo sistema e pela aba Assinatura).
 *
 * A conferência é ANTES do pedido e o registro DEPOIS: um pedido pode passar
 * um pouco do teto (o último), nunca dois meses de uma vez.
 */

export async function cotaEsgotada(admin: Admin, ctx: TenantContext): Promise<boolean> {
  const u = await usoDoCopilot(admin, ctx.tenantId!, ctx.plano ?? null)
  return u.cota !== null && u.tokens >= u.cota
}

/** Soma os tokens (a cota) e o custo em dólar (null = sem preço conhecido; não zera o que havia). */
export async function registrarUso(admin: Admin, tenantId: string, tokens: number, custoUsd: number | null = null): Promise<void> {
  await tentar(admin.rpc('copilot_registrar_uso', { p_tenant: tenantId, p_tokens: Math.round(tokens), p_custo_usd: custoUsd }), 'registrar o uso do Copilot')
}
