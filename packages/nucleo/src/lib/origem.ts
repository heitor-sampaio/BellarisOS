import type { NextRequest } from 'next/server'

/**
 * O endereço público pelo qual a pessoa chegou — para montar redirect e
 * `redirect_uri`.
 *
 * NUNCA `req.url` / `req.nextUrl.origin` para isso. O servidor standalone (o
 * que roda no Docker) monta os dois a partir do `HOSTNAME` em que ESCUTA
 * (`0.0.0.0`), não do domínio acessado: em produção, `/auth/confirm` mandava
 * para `https://0.0.0.0:8080/login` — todo link de e-mail (recuperação de
 * senha, confirmação) e o retorno do OAuth da Meta quebrados. No `next dev`
 * não aparece, porque lá o endereço é o mesmo. Achado pela suíte contra o
 * build, 2026-09-28; conferido em app.bellarisos.com.
 *
 * Ordem: o que o proxy do Railway informa (`x-forwarded-*`), o `Host` da
 * requisição, e só então `NEXT_PUBLIC_APP_URL`.
 */
export function origemPublica(req: NextRequest | Request): string {
  return origemDosCabecalhos(req.headers) ?? (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin).replace(/\/$/, '')
}

/**
 * O mesmo, sem a requisição na mão — numa server action, com
 * `await headers()`. Sem cabeçalho de host, `NEXT_PUBLIC_APP_URL`.
 */
export function origemPublicaDe(h: Headers): string {
  return origemDosCabecalhos(h) ?? (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
}

function origemDosCabecalhos(h: Headers): string | null {
  const host = primeiro(h.get('x-forwarded-host')) ?? h.get('host')
  if (!host) return null
  const proto = primeiro(h.get('x-forwarded-proto'))
    ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Um caminho interno virado URL absoluta no endereço público. */
export function urlPublica(req: NextRequest | Request, caminho: string): URL {
  return new URL(caminho, origemPublica(req))
}

// Atrás de mais de um proxy o cabeçalho vem em lista: o primeiro é o do cliente.
function primeiro(valor: string | null): string | null {
  const v = valor?.split(',')[0]?.trim()
  return v ? v : null
}

/**
 * O destino `next` de um link (`/auth/confirm`), só se for caminho DESTE app;
 * senão, `padrao`. Não basta `startsWith('/') && !startsWith('//')`: o parser
 * de URL troca `\` por `/` e descarta tab e quebra de linha, então `/\evil.com`
 * e `/<tab>/evil.com` viravam `//evil.com` — redirecionamento aberto com um
 * link verdadeiro do Supabase. Prova: `tests/caminho-interno.test.ts`.
 */
export function caminhoInterno(pedido: string | null, padrao = '/'): string {
  if (!pedido || !pedido.startsWith('/') || pedido.startsWith('//')) return padrao
  if (/[\\\u0000-\u001f\u007f]/.test(pedido)) return padrao
  const base = 'http://caminho.invalid'
  try {
    return new URL(pedido, base).origin === base ? pedido : padrao
  } catch {
    return padrao
  }
}
