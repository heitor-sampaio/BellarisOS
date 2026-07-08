import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  transpilePackages: [
    '@estetica-os/types',
    '@estetica-os/validators',
    '@estetica-os/utils',
    '@estetica-os/db',
  ],
  async headers() {
    return [
      {
        // Páginas HTML: sem cache para evitar Server Action IDs desatualizados no WebView.
        // Next.js gerencia o cache de _next/static automaticamente (não incluir aqui).
        source: '/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
};

export default nextConfig;
