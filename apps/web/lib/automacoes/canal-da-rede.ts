import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * A rede tem um número de WhatsApp CONECTADO (ativo)? (A14 da 5ª simulação.)
 *
 * O modelo de automação nascia mandando por WhatsApp numa rede sem número
 * nenhum: ligava, rodava e não mandava — o erro mudo. A tela avisa, e o modelo
 * nasce com o aviso no celular (push). Só o servidor lê `whatsapp_numbers`
 * (credencial: a sessão não tem política nenhuma ali).
 */
export async function redeTemWhatsapp(tenantId: string): Promise<boolean> {
  const linhas = await ler(createAdminClient().from('whatsapp_numbers').select('id')
    .eq('tenant_id', tenantId).eq('is_active', true).limit(1), 'conferir o WhatsApp da rede') as { id: string }[] | null
  return (linhas?.length ?? 0) > 0
}
