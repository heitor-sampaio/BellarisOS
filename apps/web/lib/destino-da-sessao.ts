import 'server-only'
import type { JwtClaims } from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedirectPath } from '@/lib/auth'
import { ler } from '@/lib/db'
import { destinoDaCliente } from '@/lib/clientes/destino'

/**
 * Para onde a pessoa da sessão vai: o portal dela, pelos claims — a cliente
 * por `destinoDaCliente` (uma clínica, várias, o seletor), a equipe pela
 * unidade ou pela rede. Nulo sem sessão, para a equipe da PLATAFORMA (os apps
 * dela são outros hosts) e no erro: quem chama decide o que fazer.
 *
 * Não passa por `buildContext` de propósito: o login (com a sessão aberta,
 * J-67) não pode depender de um portão que manda de volta ao login — a
 * pessoa desativada dava volta. O portão é o do destino.
 */
export async function destinoPelosClaims(
  supabase?: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  try {
    const sb = supabase ?? await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return null
    const claims = (user.app_metadata ?? {}) as JwtClaims & { plataforma?: string }
    if (claims.plataforma) return null
    if (claims.client_id) return await destinoDaCliente(user.id)
    if (claims.branch_id) {
      const br = await ler(createAdminClient().from('branches').select('slug').eq('id', claims.branch_id).single(), 'buscar a unidade')
      return getRedirectPath(claims.role, br?.slug ?? null)
    }
    return getRedirectPath(claims.role, null)
  } catch {
    return null
  }
}
