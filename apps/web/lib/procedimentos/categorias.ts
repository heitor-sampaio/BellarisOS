import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * As categorias de procedimento da rede (`procedure_categories`, 2026-10-14)
 * — o que o cadastro do procedimento oferece. Cresce sozinho (gatilho em
 * procedures) e se gerencia em Procedimentos → Categorias. Só as ATIVAS: o
 * procedimento que já está numa arquivada continua nela.
 */
export async function categoriasAtivasDaRede(tenantId: string): Promise<string[]> {
  const linhas = await ler(createAdminClient().from('procedure_categories').select('nome')
    .eq('tenant_id', tenantId).is('arquivada_em', null), 'ler as categorias de procedimento') as { nome: string }[] | null
  return (linhas ?? []).map(l => l.nome).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
}
