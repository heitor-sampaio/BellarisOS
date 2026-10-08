import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { cotaDoCopilot } from '@estetica-os/nucleo/lib/planos/recursos'
import { ler, tentar } from '@/lib/db'
import type { Admin } from '@/lib/copilot/ferramentas/tipos'

/**
 * A cota mensal do Copilot por rede (decisão do Heitor, 2026-10-08): o plano
 * diz quantos tokens por mês (`cotas.copilot`, null = sem limite) e cada
 * pedido soma o que gastou em `copilot_uso_mensal`. Passou, o Copilot avisa e
 * só volta no mês seguinte. O mês é o de Brasília.
 *
 * A conferência é ANTES do pedido e o registro DEPOIS: um pedido pode passar
 * um pouco do teto (o último), nunca dois meses de uma vez.
 */

export function mesDeBrasilia(agora = new Date()): string {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(agora).split('-')
  return `${ano}-${mes}-01`
}

export async function usoDoMes(admin: Admin, tenantId: string): Promise<number> {
  const linha = await ler(admin.from('copilot_uso_mensal').select('tokens')
    .eq('tenant_id', tenantId).eq('mes', mesDeBrasilia()).maybeSingle(), 'ler o uso do Copilot') as { tokens: number } | null
  return Number(linha?.tokens ?? 0)
}

export async function cotaEsgotada(admin: Admin, ctx: TenantContext): Promise<boolean> {
  const limite = cotaDoCopilot(ctx.plano ?? null)
  if (limite === null) return false
  return (await usoDoMes(admin, ctx.tenantId!)) >= limite
}

export async function registrarUso(admin: Admin, tenantId: string, tokens: number): Promise<void> {
  await tentar(admin.rpc('copilot_registrar_uso', { p_tenant: tenantId, p_tokens: Math.round(tokens) }), 'registrar o uso do Copilot')
}
