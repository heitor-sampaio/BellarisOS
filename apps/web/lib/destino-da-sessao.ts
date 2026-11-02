import 'server-only'
import type { JwtClaims } from '@estetica-os/types'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedirectPath } from '@/lib/auth'
import { ler } from '@/lib/db'
import { destinoDaCliente } from '@/lib/clientes/destino'

/**
 * O login não é de NENHUMA clínica: nem membro de uma rede (`users`, ativo ou
 * não) nem cliente com ficha (`clients.auth_id`). "Não deve ter como ter um
 * login sem vínculo, ou é rede ou é unidade" (o Heitor, 2026-11-01): os
 * caminhos que criam e desfazem vínculo não deixam sobra, e o login que ainda
 * sobrar não entra (`loginAction`). Confere no BANCO, não nos claims — o
 * claim de um vínculo desfeito fica no token. A equipe da plataforma não passa
 * por aqui (o login a recusa antes).
 */
export async function contaSemVinculo(authId: string): Promise<boolean> {
  const admin = createAdminClient()
  const [membro, ficha] = await Promise.all([
    ler(admin.from('users').select('id').eq('auth_id', authId).limit(1), 'buscar o membro do login'),
    ler(admin.from('clients').select('id').eq('auth_id', authId).limit(1), 'buscar a ficha do login'),
  ])
  return !(membro ?? []).length && !(ficha ?? []).length
}

/**
 * Para onde a pessoa da sessão vai: o portal dela, pelos claims — a cliente
 * por `destinoDaCliente` (uma clínica, várias, o seletor), a equipe pela
 * unidade ou pela rede. Nulo sem sessão, para a equipe da PLATAFORMA (os apps
 * dela são outros hosts), para o login sem rede nem ficha e no erro: quem
 * chama decide o que fazer.
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
    // Sem rede nem ficha (a conta que sobrou, ou o e-mail do primeiro admin
    // da plataforma usado na clínica), não há destino: o "/admin/dashboard"
    // de sempre mandava de volta ao /login pelo portão do /admin, e o /login
    // ao destino de novo — milhares de idas e voltas, a tela em branco.
    if (!claims.tenant_id) return null
    if (claims.branch_id) {
      const br = await ler(createAdminClient().from('branches').select('slug').eq('id', claims.branch_id).single(), 'buscar a unidade')
      return getRedirectPath(claims.role, br?.slug ?? null)
    }
    return getRedirectPath(claims.role, null)
  } catch {
    return null
  }
}
