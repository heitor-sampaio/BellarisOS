import { redirect } from 'next/navigation'
import { getTenantContext, getRedirectPath } from '@/lib/auth'
import { destinoDaCliente } from '@/lib/clientes/destino'
import { slugDaUnidadeDeEntrada } from '@/lib/unidades/de-entrada'
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

    if (ctx.isClient) {
      dest = (await destinoDaCliente(ctx.userId)) ?? dest
    } else if (ctx.branchId) {
      // Com várias unidades, a ÚLTIMA usada (PO1).
      dest = getRedirectPath(ctx.role, await slugDaUnidadeDeEntrada(ctx.userId, ctx.branchId))
    } else {
      dest = getRedirectPath(ctx.role, null)
    }
  } catch {
    dest = '/login'
  }

  redirect(dest)
}
