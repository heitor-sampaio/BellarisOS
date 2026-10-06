/**
 * A porta dos hosts da plataforma (sistema e suporte, 2026-10-06) — as
 * regras puras que `proxy.ts` aplica.
 *
 * A CSP é ESTRITA: o painel enxerga todas as redes, e o suporte desenha texto
 * escrito pelas clínicas (os chamados). Script só com o nonce da requisição
 * (e o que ele carregar, `strict-dynamic`); nada de moldura; o formulário só
 * vai para onde se disser. Estilo fica `'unsafe-inline'`: as telas usam
 * `style` em linha, e CSS injetado não executa nada.
 */
export function politicaDeConteudo(o: { nonce: string; supabase: string; formulario: string[]; dev: boolean }): string {
  const supa = o.supabase.replace(/\/+$/, '')
  const realtime = supa.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${supa}`,
    `connect-src 'self' ${supa} ${realtime}`,
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${o.formulario.length ? ` ${o.formulario.join(' ')}` : ''}`,
    "frame-ancestors 'none'",
  ].join('; ') + ';'
}

/**
 * A lista de IPs opcional (`PLATAFORMA_IPS`, separados por vírgula). Vazia =
 * desligada. Ligada, sem IP no pedido não passa. O IP é o `X-Real-IP` (a
 * borda do Railway o escreve) — o primeiro do `x-forwarded-for` o cliente
 * forja à vontade.
 */
export function ipPermitido(ip: string | null | undefined, lista: string | undefined): boolean {
  const permitidos = (lista ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!permitidos.length) return true
  return !!ip && permitidos.includes(ip.trim())
}
