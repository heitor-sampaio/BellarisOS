import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { temRecurso } from '@/lib/auth'
import { copilotConfigurado } from '@/lib/copilot/openai'

/**
 * O Copilot aparece para esta pessoa? Membro da equipe (nunca o cliente final),
 * com o Copilot no plano da rede, a instalação configurada (a chave da OpenAI)
 * e fora da sessão de suporte. A rota e as actions conferem o mesmo.
 */
export function copilotNaTela(ctx: TenantContext): boolean {
  return !ctx.isClient && !!ctx.tenantId && !!ctx.internalUserId
    && temRecurso(ctx, 'copilot') && copilotConfigurado() && !ctx.suporte
}
