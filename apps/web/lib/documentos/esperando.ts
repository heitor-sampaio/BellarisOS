import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * Quantos documentos da cliente esperam a assinatura (A9 da 19ª simulação; a
 * parte do A6 da 18ª que ficou): quem vende sem os Documentos abria a aba e lia
 * "Nenhum documento anexado", com o contrato do pacote pendente. A ficha diz a
 * CONTAGEM, sem título nem conteúdo, e quem colhe. Os abertos são os de
 * `TermosDoCliente`: a montar, faltam dados e pendente.
 */
export async function documentosEsperandoAssinatura(tenantId: string, clientId: string): Promise<number> {
  const admin = createAdminClient()
  const docs = await ler(admin.from('issued_documents').select('id')
    .eq('tenant_id', tenantId).eq('client_id', clientId)
    .in('status', ['A_GERAR', 'INCOMPLETO', 'PENDENTE'])
    .limit(200), 'contar os documentos esperando a assinatura')
  return (docs ?? []).length
}
