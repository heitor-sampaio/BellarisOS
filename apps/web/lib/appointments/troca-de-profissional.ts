import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { filtroDeQuemAtendeNaUnidade } from '@/lib/cached-queries'
export { textoDaTroca } from '@/lib/appointments/texto-da-troca'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Trocar a profissional de um agendamento (A22 da 8ª simulação, 2026-11-06):
 * a nova tem de ATENDER na unidade do agendamento — a unidade marcada no
 * "Atende" dela (decisão 2 do Heitor, `filtroDeQuemAtendeNaUnidade`). A janela
 * só oferece quem atende; o servidor recusa o resto (a troca pela janela, o
 * arraste para a coluna, a remarcação com outra profissional).
 */
export async function recusaDeQuemNaoAtende(admin: Admin, tenantId: string, professionalId: string, branchId: string): Promise<string | null> {
  const quem = await ler(admin.from('users').select('id, name')
    .eq('id', professionalId).eq('tenant_id', tenantId).eq('is_active', true)
    .or(filtroDeQuemAtendeNaUnidade(branchId)).maybeSingle(), 'conferir quem atende na unidade')
  if (quem) return null
  const nome = (await ler(admin.from('users').select('name').eq('id', professionalId).eq('tenant_id', tenantId).maybeSingle(), 'buscar o profissional') as { name: string } | null)?.name
  return `${nome ?? 'Esta profissional'} não atende nesta unidade (o “Atende clientes em” dela, na Equipe).`
}
