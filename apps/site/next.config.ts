import type { NextConfig } from 'next'
import { politicaDoSite } from './lib/csp'

/**
 * BellarisOS — Site (bellarisos.com, 2026-10-17). A página de quem ainda não
 * conhece o sistema: sem sessão, sem Supabase Auth, sem SDK da Meta. Os links
 * de entrar e de começar vão para a clínica (`CLINICA_URL`).
 *
 * Diferente da clínica e da plataforma, aqui o buscador é bem-vindo (sem
 * `noindex`) e nada é privado — o `no-store` dos outros apps não vale.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy',   value: politicaDoSite() },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  transpilePackages: [
    '@estetica-os/nucleo',
    '@estetica-os/types',
    '@estetica-os/validators',
    '@estetica-os/utils',
  ],
  async headers() {
    return [{ source: '/:caminho*', headers: securityHeaders }]
  },
}

export default nextConfig
