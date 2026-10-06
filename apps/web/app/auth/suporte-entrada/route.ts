import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { opcoesDoCookieDeSessao } from '@/lib/supabase/cookie-de-sessao'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlPublica } from '@/lib/origem'
import { ativarSessaoDeSuporte } from '@/lib/suporte/entrar'
import { avisarAcessoDoSuporte } from '@/lib/suporte/avisos'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * "Entrar como" — a metade da CLÍNICA (2026-10-06).
 *
 * A aba nova que o painel do suporte abriu chega aqui com um CÓDIGO de uso
 * único no corpo do POST. A rota:
 *  1. só aceita o POST vindo do host do suporte (`Origin`): um site qualquer
 *     não planta sessão no navegador de ninguém;
 *  2. consome o código (uma vez, dentro de 60 s — o banco garante);
 *  3. abre a sessão REAL do membro e grava os cookies DELE, httpOnly, NESTE
 *     host. A sessão do atendente nunca passa por aqui.
 *
 * Pública no proxy (é uma rota de auth): quem chega ainda não tem sessão
 * aqui. Código que não serve: uma página de "link expirado", nada criado.
 */
function pagina(status: number, titulo: string, texto: string) {
  let painel = ''
  try { painel = urlDoHost('suporte') } catch { /* sem a variável: sem o link */ }
  const link = painel ? `<p><a href="${painel}/">Voltar ao painel do suporte</a></p>` : ''
  return new NextResponse(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>${titulo}</title></head><body style="font-family:system-ui,sans-serif;padding:32px"><h1>${titulo}</h1><p>${texto}</p>${link}</body></html>`, {
    status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function POST(req: NextRequest) {
  let origemDoSuporte: string
  try { origemDoSuporte = new URL(urlDoHost('suporte')).origin } catch {
    return pagina(503, 'Entrada indisponível', 'O endereço do painel do suporte não está configurado.')
  }
  if (req.headers.get('origin') !== origemDoSuporte) {
    return pagina(403, 'Pedido recusado', 'A entrada na conta só vale vinda do painel do suporte.')
  }

  const form = await req.formData().catch(() => null)
  const codigo = String(form?.get('codigo') ?? '')
  const r = await ativarSessaoDeSuporte(codigo)
  if (!r) return pagina(410, 'Link expirado', 'Este acesso já foi usado ou venceu. Volte ao painel e entre de novo.')
  if (!r.ok) {
    // O detalhe (erro do Auth ou do banco) vai para o log, não para a página.
    console.error('[suporte/entrada] não ativou a sessão:', r.error)
    return pagina(502, 'Não consegui entrar na conta', 'Volte ao painel e tente de novo.')
  }
  const s = r.valor

  const resposta = NextResponse.redirect(urlPublica(req, s.destino), 303)
  const doAlvo = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista: { name: string; value: string; options?: CookieOptions }[]) =>
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, opcoesDoCookieDeSessao(value, options))),
    },
  })
  const { error: eSet } = await doAlvo.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken })
  if (eSet) {
    // A sessão já está ATIVA no banco: sem encerrar, ela trava novas entradas
    // (uma ativa por atendente e por alvo) até vencer.
    const { error: eFim } = await createAdminClient().rpc('suporte_sessao_encerrar', {
      p_sessao: s.sessaoId, p_motivo: 'falhou ao abrir', p_falhou: true,
    })
    if (eFim) console.error('[suporte/entrada] não encerrou a sessão que falhou:', eFim.message)
    console.error('[suporte/entrada] não gravou a sessão do membro:', eSet.message)
    return pagina(502, 'Não consegui entrar na conta', 'Volte ao painel e tente de novo.')
  }

  await avisarAcessoDoSuporte(s.tenantId, s.alvo, { atendente: s.atendente, motivo: s.motivo, entrou: true })
  return resposta
}
