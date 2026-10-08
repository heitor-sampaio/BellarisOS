import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can } from '@/lib/auth'
import { copilotConfigurado } from '@/lib/copilot/openai'

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
