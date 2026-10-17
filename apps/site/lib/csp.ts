/**
 * A CSP do site: tudo daqui mesmo, menos as fontes do Google (o
 * `globals.css` do núcleo as importa). Sem nonce: o site não tem script em
 * linha próprio, e o Next põe os dele como arquivos — o JSON-LD é dado
 * (`application/ld+json`), não roda.
 */
export function politicaDoSite(): string {
  return [
    "default-src 'self'",
    // O runtime do Next hidrata com scripts em linha (o payload do RSC).
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}
