import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Tirar um número de WhatsApp da rede sem quebrar nas conversas dele (F7c,
 * achado do Heitor em 2026-11-02).
 *
 * As conversas do número perdem a caixa (`whatsapp_number_id` SET NULL), e a
 * pessoa que JÁ tem uma conversa sem número — de uma conexão antiga — colidia
 * no índice único do ramo "sem número": o remover falhava com "duplicate key
 * value violates unique constraint" cru na tela, e o número ficava.
 *
 * Em dois passos, porque a instância gerenciada sai NO MEIO deles
 * (`removerConexaoUazapi`): primeiro se junta (repetível, não apaga nada),
 * depois a instância, por fim as conversas vazias e o número.
 */

export type Passo = { ok: true; vazias: string[] } | { ok: false; error: string }

/**
 * Junta, numa transação (`juntar_conversas_do_numero`), cada conversa do
 * número que colidiria na conversa sem número que a pessoa já tinha — as
 * mensagens e as oportunidades vão para ela — e devolve as que ficaram vazias.
 */
export async function juntarConversasDoNumero(tenantId: string, numeroId: string): Promise<Passo> {
  const { data, error } = await createAdminClient().rpc('juntar_conversas_do_numero', {
    p_numero: numeroId, p_tenant: tenantId,
  })
  if (error) {
    if (error.code === 'P0002') return { ok: false, error: 'Conexão não encontrada nesta rede.' }
    console.error('[whatsapp/remover] juntar as conversas:', error.message)
    return { ok: false, error: 'Não consegui juntar as conversas deste número às que a clínica já tinha. Nada foi removido.' }
  }
  return { ok: true, vazias: (data ?? []) as string[] }
}

/** Tira as conversas que a junção esvaziou e, só então, o número. */
export async function apagarNumeroJuntado(
  tenantId: string, numeroId: string, vazias: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  if (vazias.length) {
    const { error } = await admin.from('conversations').delete()
      .eq('tenant_id', tenantId).eq('whatsapp_number_id', numeroId).in('id', vazias)
    if (error) {
      console.error('[whatsapp/remover] tirar as conversas vazias:', error.message)
      return { ok: false, error: 'As conversas foram juntadas, mas o número não saiu. Tente remover de novo.' }
    }
  }
  const { error } = await admin.from('whatsapp_numbers').delete().eq('id', numeroId).eq('tenant_id', tenantId)
  if (error) {
    console.error('[whatsapp/remover] apagar o número:', error.message)
    return { ok: false, error: 'Não consegui remover o número. Tente de novo.' }
  }
  return { ok: true }
}
