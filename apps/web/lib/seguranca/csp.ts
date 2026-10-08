/**
 * O CSP da CLÍNICA (2026-10-08) — por enquanto em REPORT-ONLY: o navegador
 * avisa o que seria bloqueado (em `/api/csp-relatorio`, que registra no log) e
 * não bloqueia nada. A clínica carrega muita coisa de fora (o SDK da Meta, a
 * mídia do WhatsApp, o Supabase, as fontes), e uma lista incompleta bloqueando
 * quebraria tela em produção sem ninguém ver. O caminho: avisar, juntar o que
 * é legítimo, e só então trocar o cabeçalho para o que bloqueia.
 *
 * A política é a que um dia vai bloquear — estrita como a dos hosts da
 * plataforma (`packages/nucleo/src/lib/plataforma/porta.ts`): script só com o
 * nonce da requisição (e o que ele carregar, `strict-dynamic`). Estilo fica
 * `'unsafe-inline'`: as telas usam `style` em linha, e CSS não executa nada.
 */

export const ROTA_DO_RELATORIO = '/api/csp-relatorio'

export function politicaDaClinica(o: { nonce: string; supabase: string; dev: boolean }): string {
  const supa = o.supabase.replace(/\/+$/, '')
  const realtime = supa.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // O mapa de calor do dashboard (os ladrilhos do ArcGIS).
    `img-src 'self' data: blob: ${supa} https://server.arcgisonline.com`,
    `media-src 'self' blob: ${supa}`,
    `connect-src 'self' ${supa} ${realtime}`,
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
