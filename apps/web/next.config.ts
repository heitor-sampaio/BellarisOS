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
        // Páginas HTML nunca ficam em cache — evita Server Action IDs desatualizados no WebView
        source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        // Assets estáticos podem usar cache longo (hash no nome do arquivo)
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
};

export default nextConfig;
