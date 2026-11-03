import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Tirar um número de WhatsApp da clínica SEM mexer nas conversas dele
 * (r2-cfg-06, o Heitor em 2026-11-03: "não tem como juntar duas conversas em
 * uma só e manter alguma coerência, ela estava falando com pessoas diferentes
 * … mantém as duas conversas no inbox, porque o inbox é uma visualização
 * unificada de todos os inbox; se a pessoa quiser, existem os filtros para
 * isso").
 *
 * Apagar a linha punha as conversas do número em "sem número" (ON DELETE SET
 * NULL), e a da pessoa que já tinha uma conversa sem número colidia no índice
 * único desse ramo — de 02/11 a 03/11 (F7c) o remover JUNTAVA as duas. Agora
 * a linha FICA, marcada (`removido_em`, migration `20261103001401`): fora do
 * ar, fora do padrão, sem a credencial (`config` vazio — o token não fica no
 * banco), sem o `phone_number_id` (o número pode ser conectado de novo, e a
 * entrega da Meta para ele não acha mais esta caixa) e sem as pessoas ligadas
 * (elas podem falar por outro número). As conversas continuam apontando para
 * ela, cada uma com as mensagens e o card dela; o inbox as mostra com
 * "· número removido" e não responde por elas (`lib/inbox/numero-removido.ts`).
 * Quem lê os números da clínica (Configurações, a escolha de saída) filtra
 * `removido_em is null` (`getNumerosDaRede`).
 */
export async function marcarNumeroComoRemovido(
  tenantId: string, numeroId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { error: erroDasPessoas } = await admin.from('whatsapp_number_users')
    .delete().eq('whatsapp_number_id', numeroId).eq('tenant_id', tenantId)
  if (erroDasPessoas) {
    console.error('[whatsapp/remover] tirar as pessoas do número:', erroDasPessoas.message)
    return { ok: false, error: 'Não consegui remover o número. Tente de novo.' }
  }
  const { data, error } = await admin.from('whatsapp_numbers')
    .update({
      removido_em: new Date().toISOString(), is_active: false, is_default: false,
      // Sem instância paga (a gerenciada saiu na uazapi antes): não conta mais
      // nas instâncias em uso nem nas da rede (actions/uazapi-connection.ts).
      managed: false,
      phone_number_id: null, config: {}, updated_at: new Date().toISOString(),
    })
    .eq('id', numeroId).eq('tenant_id', tenantId).is('removido_em', null)
    .select('id')
  if (error) {
    console.error('[whatsapp/remover] marcar o número como removido:', error.message)
    return { ok: false, error: 'Não consegui remover o número. Tente de novo.' }
  }
  if (!data?.length) return { ok: false, error: 'Conexão não encontrada nesta rede.' }
  return { ok: true }
}
