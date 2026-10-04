import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

import { getPlatformContext } from '@/lib/plataforma/contexto'
import { registrarNaPlataforma } from '@/lib/plataforma/auditoria'
import { createClient } from '@/lib/supabase/server'
import { urlPublica } from '@/lib/origem'
import { createAdminClient } from '@/lib/supabase/admin'
import { abrirSessaoDeSuporte } from '@/lib/suporte/entrar'
import { avisarAcessoDoSuporte } from '@/lib/suporte/avisos'
import { COOKIE_DA_VOLTA, cifrarVolta } from '@/lib/suporte/cookie'
import { DIGEST_SEM_ACESSO } from '@/lib/sem-acesso'

/**
 * "Entrar como" um membro de uma rede (POST do formulário do painel).
 *
 * Como toda `/api/*`, se defende sozinha (o proxy não barra): só quem é da
 * plataforma, verificado em duas etapas, e só com autorização vigente da
 * clínica — conferida no banco (`suporte_sessao_abrir`).
 *
 * Troca os cookies da sessão: os do atendente saem, os do membro entram, e o
 * refresh token do atendente fica cifrado no cookie de volta, para o "Sair"
 * devolvê-lo ao painel. Gravar cookie só pode em Route Handler ou Server
 * Function — daí esta rota.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  let ctx
  try {
    ctx = await getPlatformContext()
  } catch (e) {
    if ((e as { digest?: string })?.digest === DIGEST_SEM_ACESSO) return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
    throw e
  }

  const form = await req.formData()
  const tenantId  = String(form.get('tenantId') ?? '')
  const userId    = String(form.get('userId') ?? '')
  const motivo    = String(form.get('motivo') ?? '').trim().slice(0, 300)
  const chamado   = String(form.get('chamadoId') ?? '')
  const chamadoId = UUID.test(chamado) ? chamado : null
  const volta = (erro: string) => {
    const destino = chamadoId ? `/suporte/chamados/${chamadoId}` : `/suporte/redes/${UUID.test(tenantId) ? tenantId : ''}`
    const u = urlPublica(req, destino)
    u.searchParams.set('erro', erro)
    return NextResponse.redirect(u, 303)
  }
  if (!UUID.test(tenantId) || !UUID.test(userId)) return volta('Pedido inválido.')
  if (motivo.length < 3) return volta('Diga o motivo do acesso.')

  // A sessão do atendente, para a volta.
  const atual = await createClient()
  const { data: { session: minha } } = await atual.auth.getSession()
  if (!minha?.refresh_token) return volta('Sua sessão expirou. Entre de novo.')

  const r = await abrirSessaoDeSuporte(ctx, {
    tenantId, userId, motivo, chamadoId,
    ip: req.headers.get('x-real-ip'), userAgent: req.headers.get('user-agent'),
  })
  if (!r.ok) return volta(r.error)
  const s = r.valor

  const resposta = NextResponse.redirect(urlPublica(req, s.destino), 303)
  const doAlvo = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista: { name: string; value: string; options?: CookieOptions }[]) => {
        // O pedaço que sobra da sessão antiga vem para ser APAGADO (vazio):
        // não pode ganhar a validade de 7 dias.
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value,
          value ? { ...options, maxAge: 60 * 60 * 24 * 7 } : { ...options, maxAge: 0 }))
      },
    },
  })
  const { error: eSet } = await doAlvo.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken })
  if (eSet) {
    // A sessão já está ATIVA no banco: sem encerrar, ela trava novas entradas
    // (uma ativa por atendente e por alvo) até vencer.
    const { error: eFim } = await createAdminClient().rpc('suporte_sessao_encerrar', {
      p_sessao: s.sessaoId, p_motivo: 'falhou ao abrir', p_falhou: true,
    })
    if (eFim) console.error('[suporte/entrar] não encerrou a sessão que falhou:', eFim.message)
    return volta(`Não consegui abrir a conta: ${eSet.message}`)
  }

  const segundos = Math.max(60, Math.ceil((Date.parse(s.expiraEm) - Date.now()) / 1000) + 3600)
  resposta.cookies.set(COOKIE_DA_VOLTA, cifrarVolta({ sessaoId: s.sessaoId, refresh: minha.refresh_token }), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: segundos,
  })

  await registrarNaPlataforma(ctx, 'sessao.aberta', {
    tenantId, targetUserId: userId, dados: { sessao: s.sessaoId, motivo, chamado: chamadoId },
  })
  await avisarAcessoDoSuporte(tenantId, s.alvo, { atendente: ctx.nome, motivo, entrou: true })
  return resposta
}
