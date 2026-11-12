import { createAdminClient } from '@/lib/supabase/admin'

/**
 * A conversa de WhatsApp por onde se fala com a cliente — UMA régua (C55,
 * F69), a função `conversa_de_whatsapp_da_cliente` do banco:
 *
 * - pela ficha; sem conversa ligada a ela, pelo telefone do cadastro (com e
 *   sem o 9 do celular);
 * - nunca a encerrada, nem a de um número REMOVIDO da clínica (por ela nada
 *   sai — era a mais recente que a automação escolhia, e o envio falhava);
 * - a em que ELA falou por último vem primeiro.
 *
 * A usam a automação ("Mandar mensagem"), o link de assinatura e o da ficha
 * de pré-atendimento pela conversa, e a conta antes de ligar uma automação
 * (`publico_com_conversa`). Fora de `actions/`: recebe a rede, quem chama já
 * conferiu.
 */
export async function conversaDeWhatsappDaCliente(tenantId: string, clientId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .rpc('conversa_de_whatsapp_da_cliente', { p_tenant: tenantId, p_cliente: clientId })
  if (error) throw new Error(`Não consegui achar a conversa da cliente: ${error.message}`)
  return (data as string | null) ?? null
}
