import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getPlatformContext } from '@estetica-os/nucleo/lib/plataforma/contexto'
import { registrarNaPlataforma } from '@estetica-os/nucleo/lib/plataforma/auditoria'
import { urlDaClinica, urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'
import { urlPublica } from '@estetica-os/nucleo/lib/origem'
import { abrirSessaoDeSuporte } from '@estetica-os/nucleo/lib/suporte/entrar'
import { DIGEST_SEM_ACESSO } from '@estetica-os/nucleo/lib/sem-acesso'

/**
 * "Entrar como" um membro de uma rede — a metade do PAINEL (POST do
 * formulário, que abre numa aba nova).
 *
 * Como toda `/api/*`, se defende sozinha: só quem é da plataforma, verificado
 * em duas etapas (`getPlatformContext`), e só com autorização vigente da
 * clínica — conferida no banco (`suporte_sessao_abrir`).
 *
 * Não grava cookie nenhum: a sessão do membro nasce na CLÍNICA, que é outro
 * host. Daqui sai só uma página que envia o CÓDIGO de uso único à clínica
 * (`/auth/suporte-entrada`) — no corpo do POST, fora da URL e dos logs.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const escapar = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export async function POST(req: NextRequest) {
  // Só o formulário do PRÓPRIO painel. app.* e suporte.* são o mesmo SITE: o
  // cookie lax do atendente vai junto num POST que parta da clínica, e o Next
  // só confere a origem em server action, não em route handler. Sem isto, um
  // script na clínica abriria, pelo atendente, a sessão em outra conta.
  let origemDoPainel: string | null = null
  try { origemDoPainel = new URL(urlDoHost('suporte')).origin } catch { /* sem SUPORTE_URL */ }
  if (!origemDoPainel || req.headers.get('origin') !== origemDoPainel) {
    return NextResponse.json({ error: 'Pedido recusado.' }, { status: 403 })
  }

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
    const destino = chamadoId ? `/chamados/${chamadoId}` : `/redes/${UUID.test(tenantId) ? tenantId : ''}`
    const u = urlPublica(req, destino)
    u.searchParams.set('erro', erro)
    return NextResponse.redirect(u, 303)
  }
  if (!UUID.test(tenantId) || !UUID.test(userId)) return volta('Pedido inválido.')
  if (motivo.length < 3) return volta('Diga o motivo do acesso.')

  const r = await abrirSessaoDeSuporte(ctx, {
    tenantId, userId, motivo, chamadoId,
    ip: req.headers.get('x-real-ip'), userAgent: req.headers.get('user-agent'),
  })
  if (!r.ok) return volta(r.error)

  await registrarNaPlataforma(ctx, 'sessao.aberta', {
    tenantId, targetUserId: userId, dados: { sessao: r.valor.sessaoId, motivo, chamado: chamadoId },
  })

  const destino = `${urlDaClinica()}/auth/suporte-entrada`
  const nonce = randomBytes(16).toString('base64')
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Entrando na conta…</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px">
<form method="post" action="${escapar(destino)}">
<input type="hidden" name="codigo" value="${escapar(r.valor.codigo)}">
<p>Entrando na conta de ${escapar(r.valor.alvo.nome)}…</p>
<noscript><button type="submit">Continuar</button></noscript>
</form>
<script nonce="${nonce}">document.forms[0].submit()</script>
</body></html>`
  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // Sem referrer-policy própria: vale a do next.config (strict-origin-when-
      // cross-origin), que deixa o navegador mandar o Origin deste host no POST
      // à clínica (que o confere). no-referrer ou same-origin o trocariam por null.
      // Só o script desta página roda, e o formulário só vai para a clínica.
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action ${new URL(destino).origin}; frame-ancestors 'none'; base-uri 'none'`,
    },
  })
}
