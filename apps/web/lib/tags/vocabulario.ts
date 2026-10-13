import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O vocabulário de tags da rede (\`tags\`, 2026-10-13) — o que a ficha, o
 * cadastro, o inbox, o card, as automações e as campanhas oferecem. Cresce
 * sozinho (gatilho em clients, contacts e leads) e se gerencia em
 * Configurações → Tags. Só as ATIVAS: a arquivada fica em quem já tem.
 */
export async function tagsAtivasDaRede(tenantId: string): Promise<string[]> {
  const linhas = await ler(createAdminClient().from('tags').select('nome')
    .eq('tenant_id', tenantId).is('arquivada_em', null), 'ler as tags da rede') as { nome: string }[] | null
  return (linhas ?? []).map(l => l.nome).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
}
