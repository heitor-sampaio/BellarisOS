import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

export { SUFIXO_DO_REMOVIDO, recusaDoNumeroRemovido } from './numero-removido-texto'

/**
 * A conversa é de um número REMOVIDO da clínica (r2-cfg-06,
 * `lib/whatsapp/remover.ts`)? Devolve o nome dele, ou nulo.
 *
 * A conversa fica no inbox como estava — o Heitor: "mantém as duas conversas
 * no inbox" —, mas não se responde por ela: o número não fala mais, e sair por
 * outro abriria outra conversa no celular da pessoa sem ela saber de onde. O
 * envio (texto, template, mídia) recusa com `recusaDoNumeroRemovido`, e a tela
 * mostra o mesmo texto no lugar do campo.
 */
export async function numeroRemovidoDaConversa(admin: Admin, numeroId: string | null): Promise<string | null> {
  if (!numeroId) return null
  const linha = await ler(admin.from('whatsapp_numbers').select('label, removido_em').eq('id', numeroId).maybeSingle(),
    'conferir se o número da conversa foi removido') as { label: string | null; removido_em: string | null } | null
  return linha?.removido_em ? (linha.label ?? 'sem nome') : null
}
