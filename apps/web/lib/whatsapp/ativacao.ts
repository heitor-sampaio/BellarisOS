import { createAdminClient } from '@/lib/supabase/admin'
import type { WhatsAppProviderType } from './types'

/**
 * Só um provedor de WhatsApp ativo por rede.
 *
 * Nada no banco garante isso — não há índice parcial de "um ativo por tenant" —
 * e `getWhatsAppConfig` precisa escolher um quando há dois. O estado inválido
 * não é teórico: a conexão gerenciada ativava a uazapi pelo webhook sem tocar na
 * config `official`, e o envio passava a sair pela API oficial (que a rede tinha
 * configurado mas não usa), falhando com a mensagem já gravada como enviada.
 *
 * Por isso todo caminho que ATIVA um provedor desativa o irmão na mesma ação:
 * o formulário manual, o pareamento e o evento de conexão do webhook.
 */
const PROVEDORES_WHATSAPP: WhatsAppProviderType[] = ['uazapi', 'official']

export async function desativarOutroProvedorWhatsApp(
  tenantId: string,
  manter: WhatsAppProviderType,
): Promise<void> {
  const outros = PROVEDORES_WHATSAPP.filter(p => p !== manter)
  if (outros.length === 0) return

  const { error } = await createAdminClient()
    .from('integration_configs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .in('provider', outros)
    .eq('is_active', true)

  if (error) console.error('[desativarOutroProvedorWhatsApp]', error.message)
}
