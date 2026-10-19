import { redirect } from 'next/navigation'
import { getTenantContext, getRedirectPath } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { destinoDaCliente } from '@/lib/clientes/destino'
import { lerClaims, marcaDaPlataforma } from '@/lib/plataforma/contexto'

export const dynamic = 'force-dynamic'

export default async function AuthRedirectPage() {
  // Resolve o destino sem chamar redirect() dentro do try/catch.
  // redirect() lança NEXT_REDIRECT internamente; se estiver dentro de
  // um catch, o catch o captura e sobrescreve com redirect('/login').
  let dest = '/login'

  // A plataforma não tem rede: vai para o /suporte (fora do try, que engoliria
  // o redirect de `buildContext`).
  const marca = marcaDaPlataforma(await lerClaims())
  // A equipe da plataforma não entra na clínica (os apps dela são outros hosts).
  if (marca) redirect('/login?acesso=plataforma')

  try {
    const ctx   = await getTenantContext()
    const admin = createAdminClient()

    if (ctx.isClient) {
      dest = (await destinoDaCliente(ctx.userId)) ?? dest
    } else if (ctx.branchId) {
      const br = await ler(admin
        .from('branches').select('slug').eq('id', ctx.branchId).single(), 'buscar a unidade')
      dest = getRedirectPath(ctx.role, br?.slug ?? null)
    } else {
      dest = getRedirectPath(ctx.role, null)
    }
  } catch {
    dest = '/login'
  }

  redirect(dest)
}
