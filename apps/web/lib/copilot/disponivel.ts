import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can } from '@/lib/auth'
import { copilotConfigurado } from '@/lib/copilot/openai'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * O Copilot está no plano DESTA rede? Diferente de toda outra funcionalidade,
 * aqui "sem plano" (sem retrato) NÃO libera: o Copilot custa por uso (a
 * OpenAI cobra cada pedido), e uma rede sem plano ganharia um Copilot sem
 * cota no dia em que a chave entrasse no Railway (decisão de 2026-10-08).
 * Conta o efetivo: o plano que o inclui OU o adicional contratado
 * (`recursosEfetivos`).
 */
export function copilotNoPlano(ctx: TenantContext): boolean {
  return !!ctx.plano && ctx.plano.funcionalidades.includes('copilot')
}

/**
 * O CARGO desta pessoa tem o Copilot? O módulo `copilot` da matriz de Cargos
 * (pedido do Heitor, 2026-10-08): Ver só consulta; Gerenciar também prepara
 * gravações (o executor confere). O plano decide se a rede tem; o cargo, quem usa.
 */
export function copilotNoCargo(ctx: TenantContext): boolean {
  return can(ctx, 'copilot', 'VIEW')
}

/**
 * O Copilot aparece para esta pessoa? Membro da equipe (nunca o cliente final),
 * com o Copilot no plano da rede E no cargo, a instalação configurada (a chave da OpenAI)
 * e fora da sessão de suporte. A rota e as actions conferem o mesmo.
 */
export function copilotNaTela(ctx: TenantContext): boolean {
  return !ctx.isClient && !!ctx.tenantId && !!ctx.internalUserId
    && copilotNoPlano(ctx) && copilotNoCargo(ctx) && copilotConfigurado() && !ctx.suporte
}

/**
 * O Copilot fora do PLANO aparece EXPLICADO para quem administra a clínica
 * (A51 da 6ª simulação; princípio 3: ele sumia calado, e a dona em teste
 * grátis — "tudo, menos o Copilot", J-7 — não sabia por quê). Só para quem
 * pode contratar (`administraARede`: da rede, com Configurações em
 * Gerenciar); a equipe não ganha um botão que não usa. Nada se libera: a
 * rota e as actions seguem recusando.
 */
export function copilotForaDoPlanoNaTela(ctx: TenantContext): boolean {
  return !ctx.isClient && !!ctx.tenantId && !!ctx.internalUserId && !ctx.suporte
    && !copilotNoPlano(ctx) && ctx.branchId === null && ctx.permissions.settings === 'MANAGE'
}

/**
 * A rede está no TESTE grátis? Lido na hora (não no cache da rede): só para o
 * aviso do Copilot fora do plano, que só quem administra a clínica vê.
 */
export async function redeEmTeste(tenantId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('tenants').select('plan_status').eq('id', tenantId).maybeSingle()
  // Falhou a leitura: o aviso fica no texto geral ("não faz parte do plano"), sem derrubar a tela.
  if (error) { console.error('[copilot] ler a situação da rede:', error.message); return false }
  return (data as { plan_status: string | null } | null)?.plan_status === 'trial'
}
