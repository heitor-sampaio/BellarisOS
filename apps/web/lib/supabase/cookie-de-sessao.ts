import type { CookieOptions } from '@supabase/ssr'

/** 7 dias: o refresh token sobrevive ao access token (1 h); o proxy renova. */
export const SETE_DIAS = 60 * 60 * 24 * 7

/**
 * As opções de TODO cookie da sessão do Supabase — toda escrita passa por aqui.
 *
 * - **httpOnly**: o JS da página não lê a sessão. Um script injetado levaria o
 *   refresh token (7 dias, renovável) para outra máquina; o navegador recebe
 *   só o access token, por `/api/auth/token` (2026-10-06).
 * - **lax**: o link vindo de fora ainda abre logado; o POST de outro site não
 *   leva o cookie.
 * - **sem domínio**: o cookie é do host. A clínica, o sistema e o suporte
 *   nunca dividem sessão.
 * - o pedaço que vem VAZIO é para apagar (sessão trocada ou encurtada): não
 *   ganha os 7 dias.
 */
export function opcoesDoCookieDeSessao(
  valor: string,
  daBiblioteca: CookieOptions = {},
  producao = process.env.NODE_ENV === 'production',
): CookieOptions {
  const resto = { ...daBiblioteca }
  delete resto.domain
  return {
    ...resto,
    path: daBiblioteca.path ?? '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: producao,
    maxAge: valor ? SETE_DIAS : 0,
  }
}
