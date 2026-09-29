import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { telefoneParaWhatsApp } from './link'

/**
 * Em qual conversa do inbox mandar o link de assinatura de um cliente.
 *
 * Só WhatsApp, aberta, e a que o cliente usou por ÚLTIMO — é a de janela de 24h
 * mais provavelmente aberta, e a do número que ele reconhece. A ligação é
 * `conversations.client_id`; sem ela, o telefone do cadastro (no formato do
 * webhook: 55 + DDD + número). Não CRIA conversa: abrir uma thread para a
 * primeira mensagem, no WhatsApp oficial, nem seria possível sem template.
 */
export async function conversaDoCliente(tenantId: string, clientId: string): Promise<string | null> {
  const admin = createAdminClient()
  const base = () => admin.from('conversations').select('id')
    .eq('tenant_id', tenantId).eq('channel', 'whatsapp').neq('status', 'closed')
    .order('last_inbound_at', { ascending: false, nullsFirst: false }).limit(1)

  const ligada = await ler(base().eq('client_id', clientId), 'buscar a conversa do cliente')
  if (ligada?.[0]) return ligada[0].id as string

  const cliente = await ler(admin.from('clients').select('phone').eq('id', clientId).maybeSingle(), 'buscar o telefone do cliente')
  const telefone = telefoneParaWhatsApp(cliente?.phone as string | null)
  if (!telefone) return null
  const peloTelefone = await ler(base().eq('contact_phone', telefone), 'buscar a conversa pelo telefone')
  return (peloTelefone?.[0]?.id as string | undefined) ?? null
}

/** A rede liga o envio do link pela conversa? (Configurações → Documentos) */
export async function envioPelaConversaLigado(tenantId: string): Promise<boolean> {
  const t = await ler(createAdminClient().from('tenants').select('documentos_link_pela_conversa')
    .eq('id', tenantId).single(), 'ler a configuração do envio do link')
  return !!t?.documentos_link_pela_conversa
}
