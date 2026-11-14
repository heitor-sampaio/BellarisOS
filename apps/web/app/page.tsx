import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTenantContext, getRedirectPath } from '@/lib/auth'
import { AuthRedirect } from '@/components/auth-redirect'
import { destinoDaCliente } from '@/lib/clientes/destino'
import { slugDaUnidadeDeEntrada } from '@/lib/unidades/de-entrada'

export const dynamic = 'force-dynamic'

/**
 * O `/` da clínica só decide a porta (2026-10-17): a página de quem ainda não
 * conhece o BellarisOS mora em bellarisos.com (`apps/site`).
 *  - Com sessão: o portal.
 *  - Sem sessão: o login. Pelo `AuthRedirect`, e não por um redirect do
 *    servidor: no cold start do app Android o primeiro pedido chega SEM os
 *    cookies do WebView, e só a pergunta ao servidor depois da hidratação
 *    distingue "sem sessão" de "cookies ainda não carregados".
 */
export default async function Entrada() {
  // O destino se resolve no try e o redirect sai FORA dele: o redirect() lança
  // NEXT_REDIRECT, e o catch o engolia — até 2026-10-17 quem levava a pessoa
  // logada ao portal era só o AuthRedirect, uma volta a mais.
  let destino: string | null = null
  try {
    const ctx = await getTenantContext()

    if (ctx.isClient) {
      destino = await destinoDaCliente(ctx.userId)
    } else if (ctx.branchId) {
      // Com várias unidades, a ÚLTIMA usada (PO1).
      destino = getRedirectPath(ctx.role, await slugDaUnidadeDeEntrada(ctx.userId, ctx.branchId))
    } else {
      destino = getRedirectPath(ctx.role, null)
    }
  } catch {
    // Sem sessão (ou ainda sem os cookies): quem decide é o AuthRedirect.
  }
  if (destino) redirect(destino)

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg-app)', fontFamily: 'var(--font-sans)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <AuthRedirect senaoPara="/login" />
      <p style={{ fontSize: 'var(--text-name)', fontWeight: 'var(--weight-extrabold)', color: 'var(--brand)', letterSpacing: 'var(--tracking-tight)' }}>
        BellarisOS ✦
      </p>
      {/* Sem JavaScript, o caminho fica à mão. */}
      <noscript>
        <Link href="/login">Entrar</Link>
      </noscript>
    </main>
  )
}
