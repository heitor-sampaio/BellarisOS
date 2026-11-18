import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * Os nomes das "Clientes específicas" de uma campanha (A37 da 15ª simulação),
 * para o resumo do público e o formulário de editar. Só as fichas da rede: o id
 * de outra rede gravado à mão não vira nome (nem cliente no disparo — o
 * `clientes_do_publico` recorta pela rede).
 */
export async function clientesDaCampanha(tenantId: string, ids: unknown): Promise<{ id: string; name: string }[]> {
  const lista = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  if (!lista.length) return []
  const achadas = await ler(createAdminClient().from('clients').select('id, name')
    .eq('tenant_id', tenantId).in('id', lista.slice(0, 200)), 'ler as clientes da campanha') as { id: string; name: string }[] | null
  const porId = new Map((achadas ?? []).map(c => [c.id, c]))
  return lista.map(id => porId.get(id)).filter((c): c is { id: string; name: string } => !!c)
}
