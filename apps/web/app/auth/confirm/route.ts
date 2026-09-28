import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { urlPublica } from '@/lib/origem'

/**
 * A volta de um link de e-mail do Supabase (hoje, o de recuperar a senha):
 * troca o que o link trouxe por uma SESSÃO e segue para `next`.
 *
 *  - `?code=` — o fluxo PKCE, que é o que o e-mail padrão produz quando o
 *    pedido saiu do servidor (`resetPasswordForEmail` no `@supabase/ssr`). O
 *    verificador fica num cookie do navegador que pediu: aberto em outro
 *    aparelho, a troca falha e a pessoa pede de novo.
 *  - `?token_hash=&type=` — o formato do template recomendado para SSR, e o
 *    que o E2E usa (`generateLink` do admin dá o hash sem mandar e-mail).
 *
 * Pública no proxy: quem chega aqui ainda não tem sessão — é para isso que
 * ela existe. Não recebe id de nada; o que decide é o token, validado pelo Auth.
 */
export async function GET(req: NextRequest) {
  const url       = req.nextUrl
  const code      = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type      = url.searchParams.get('type') as EmailOtpType | null

  // Só caminho interno: `//outro.site` e URL absoluta viram redirecionamento
  // aberto para fora do app.
  const pedido = url.searchParams.get('next') ?? '/'
  const next   = pedido.startsWith('/') && !pedido.startsWith('//') ? pedido : '/'

  const supabase = await createClient()
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('link sem código') }

  if (error) {
    // Endereço público, não o do servidor: ver lib/origem.ts.
    const volta = urlPublica(req, next === '/update-password' ? '/update-password' : '/login')
    volta.searchParams.set('erro', 'link')
    return NextResponse.redirect(volta)
  }
  return NextResponse.redirect(urlPublica(req, next))
}
