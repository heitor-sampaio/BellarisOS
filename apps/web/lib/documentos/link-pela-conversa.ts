import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { conversaDeWhatsappDaCliente } from '@/lib/contatos/conversa-de-whatsapp'

/**
 * Em qual conversa do inbox mandar o link de assinatura de um cliente.
 *
 * Só WhatsApp, aberta, e a que o cliente usou por ÚLTIMO — é a de janela de 24h
 * mais provavelmente aberta, e a do número que ele reconhece. A ligação é
 * `conversations.client_id`; sem ela, o telefone do cadastro (com e sem o 9);
 * nunca a de um número removido. Não CRIA conversa: abrir uma thread para a
 * primeira mensagem, no WhatsApp oficial, nem seria possível sem template.
 */
export async function conversaDoCliente(tenantId: string, clientId: string): Promise<string | null> {
  // A régua é uma só (C55, F69): a mesma da automação.
  return conversaDeWhatsappDaCliente(tenantId, clientId)
}

/** A rede liga o envio do link pela conversa? (Configurações → Documentos) */
export async function envioPelaConversaLigado(tenantId: string): Promise<boolean> {
  const t = await ler(createAdminClient().from('tenants').select('documentos_link_pela_conversa')
    .eq('id', tenantId).single(), 'ler a configuração do envio do link')
  return !!t?.documentos_link_pela_conversa
}
