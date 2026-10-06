import type { NextConfig } from 'next'

/**
 * BellarisOS — Suporte. Um app à parte, num host à parte: a sessão da equipe da
 * plataforma nunca divide origem (nem cookie) com a clínica.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Painel interno: nada aqui é para buscador.
  { key: 'X-Robots-Tag',              value: 'noindex, nofollow' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  transpilePackages: [
    '@estetica-os/nucleo',
    '@estetica-os/types',
    '@estetica-os/validators',
    '@estetica-os/utils',
  ],
  async headers() {
    return [
      { source: '/((?!_next/|favicon.ico).*)', headers: [...securityHeaders, { key: 'Cache-Control', value: 'no-store' }] },
    ]
  },
}

export default nextConfig
