import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { ehUuid } from '@/lib/id-da-rota'
import { conversaAoAlcance } from '@/lib/inbox/alcance'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A conversa do `?c=` existe NA REDE, mas está fora das caixas do cargo (A8
 * da 38ª: a tela caía calada em "Selecione uma conversa"). A página volta com
 * o motivo (`comAviso`, CLAUDE.md §6), sem dizer nada da conversa — as
 * mensagens seguem trancadas por `conversaAoAlcance`.
 *
 * O id que não é da rede (ou não existe, ou não é um id) não avisa: dizer
 * "fora do seu alcance" ali contaria que ele existe em outra rede. Erro ao
 * ler: não avisa (a tela segue como antes).
 */
export async function conversaDoEnderecoForaDoAlcance(
  admin: Admin, ctx: TenantContext, id: string | null | undefined,
): Promise<boolean> {
  if (!ehUuid(id)) return false
  try {
    const linha = await ler(admin.from('conversations')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId!)
      .maybeSingle(), 'conferir a conversa do endereço')
    if (!linha) return false
    return !(await conversaAoAlcance(admin, ctx, id))
  } catch (e) {
    console.error('[conversaDoEnderecoForaDoAlcance]', e instanceof Error ? e.message : e)
    return false
  }
}
