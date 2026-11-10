import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

export const INDICADA_POR_DE_FORA = 'A ficha de quem indicou não é desta clínica.'

/**
 * "Indicada por" (decisão do Heitor, 2026-11-10) vem do navegador como o id de
 * uma ficha: conferido aqui — uuid, da MESMA rede e não a própria ficha — antes
 * de gravar (o banco confere de novo, `trg_indicada_por_confere`). Vazio = sem
 * indicação. Usado pelo Novo cliente, pela aba Dados e pelo Agendar com cliente nova.
 */
export async function conferirIndicadaPor(
  admin: Admin, tenantId: string, valor: unknown, propria: string | null = null,
): Promise<{ id: string | null } | { error: string }> {
  const id = typeof valor === 'string' ? valor.trim() : ''
  if (!id) return { id: null }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: INDICADA_POR_DE_FORA }
  if (propria && id === propria) return { error: 'Uma ficha não pode ser indicada por ela mesma.' }
  const ficha = await ler(admin.from('clients').select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle(),
    'conferir a ficha de quem indicou')
  return ficha ? { id } : { error: INDICADA_POR_DE_FORA }
}
