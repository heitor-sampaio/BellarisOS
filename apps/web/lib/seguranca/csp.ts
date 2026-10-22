/**
 * O CSP da CLÍNICA. Nasceu em REPORT-ONLY (2026-10-08): o navegador avisava o
 * que seria bloqueado, em `/api/csp-relatorio`, que registra no log. Juntados
 * os avisos de duas semanas (a Meta e o ViaCEP, liberados) e o inventário do
 * que a clínica carrega de fora, passou a BLOQUEAR em 2026-10-22. O relatório
 * continua: o que for barrado aparece no log como `[csp] … barrou …`.
 *
 * Estrita como a dos hosts da plataforma
 * (`packages/nucleo/src/lib/plataforma/porta.ts`): script só com o nonce da
 * requisição (e o que ele carregar, `strict-dynamic`). Estilo fica
 * `'unsafe-inline'`: as telas usam `style` em linha, e CSS não executa nada.
 *
 * O que fica de fora dela: o app Android. O Capacitor busca o HTML por conta
 * própria (para injetar a ponte nativa) e o entrega ao WebView SEM os
 * cabeçalhos do servidor.
 */

export const ROTA_DO_RELATORIO = '/api/csp-relatorio'

/**
 * Qual cabeçalho leva a política: o que bloqueia no build (a produção e a
 * completa), o que só avisa no `next dev` — o painel de erros do Next injeta
 * um script sem nonce, e bloqueá-lo tiraria a tela de erro do desenvolvimento.
 */
export function cabecalhoDoCsp(dev: boolean): 'content-security-policy' | 'content-security-policy-report-only' {
  return dev ? 'content-security-policy-report-only' : 'content-security-policy'
}

export function politicaDaClinica(o: { nonce: string; supabase: string; dev: boolean }): string {
  const supa = o.supabase.replace(/\/+$/, '')
  const realtime = supa.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // O mapa de calor do dashboard (os ladrilhos do ArcGIS). E a miniatura do
    // criativo da Meta (o selo "Veio de anúncio" quando o aviso não trouxe o
    // base64, e a peça na tela da campanha): a URL que a Graph devolve.
    `img-src 'self' data: blob: ${supa} https://server.arcgisonline.com https://*.fbcdn.net https://www.facebook.com`,
    `media-src 'self' blob: ${supa}`,
    // O endereço pelo CEP: o navegador consulta o ViaCEP (ficha da cliente,
    // perfil do app, unidade — 2026-10-22). E o SDK da Meta, que só carrega no
    // "Conectar pela Meta" do WhatsApp oficial (conectar-whatsapp-meta.tsx).
    `connect-src 'self' ${supa} ${realtime} https://viacep.com.br https://connect.facebook.net https://www.facebook.com`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${ROTA_DO_RELATORIO}`,
  ].join('; ') + ';'
}

export interface Violacao { diretiva: string; bloqueado: string; pagina: string }

/** Só a ORIGEM do que foi bloqueado (sem caminho nem consulta: pode ter token ou dado). */
function origem(u: unknown): string {
  const s = typeof u === 'string' ? u : ''
  if (!s) return '?'
  if (/^(inline|eval|data|blob|wasm-eval|trusted-types-sink)$/.test(s)) return s
  try { return new URL(s).origin } catch { return s.slice(0, 40) }
}

/** Só o CAMINHO da página (sem a consulta: pode ter id ou dado). */
function caminho(u: unknown): string {
  try { return new URL(String(u)).pathname } catch { return '?' }
}

/**
 * O relatório do navegador em linhas curtas — os dois formatos: o antigo
 * (`application/csp-report`, `{ 'csp-report': … }`) e o novo
 * (`application/reports+json`, uma lista de `{ type, body }`).
 */
export function resumoDoRelatorio(corpo: unknown): Violacao[] {
  const linhas: Violacao[] = []
  const antigo = (corpo as { 'csp-report'?: Record<string, unknown> } | null)?.['csp-report']
  if (antigo && typeof antigo === 'object') {
    linhas.push({
      diretiva: String(antigo['effective-directive'] ?? antigo['violated-directive'] ?? '?'),
      bloqueado: origem(antigo['blocked-uri']),
      pagina: caminho(antigo['document-uri']),
    })
  }
  if (Array.isArray(corpo)) {
    for (const r of corpo as { type?: string; body?: Record<string, unknown> }[]) {
      if (r?.type !== 'csp-violation' || !r.body) continue
      linhas.push({
        diretiva: String(r.body.effectiveDirective ?? '?'),
        bloqueado: origem(r.body.blockedURL),
        pagina: caminho(r.body.documentURL),
      })
    }
  }
  return linhas
}
