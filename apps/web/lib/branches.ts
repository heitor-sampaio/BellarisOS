import { createAdminClient } from '@/lib/supabase/admin'

export type FilialAtiva = { id: string; name: string; slug: string }

/**
 * Filiais ativas da rede.
 *
 * Existe para dar um único tratamento ao erro. Metade das telas do `/admin`
 * escrevia `const { data: branchesRaw } = await admin…` e caía num
 * "Nenhuma filial ativa" — a mensagem errada para uma consulta que falhou, e
 * indistinguível de uma rede realmente sem unidades. Aqui a falha é falha:
 * sobe e a tela mostra erro, em vez de fingir que a rede está vazia.
 */
export async function filiaisAtivas(tenantId: string): Promise<FilialAtiva[]> {
  const { data, error } = await createAdminClient()
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(`Não foi possível carregar as unidades: ${error.message}`)
  return (data ?? []) as FilialAtiva[]
}
