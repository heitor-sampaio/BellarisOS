import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  // `microphone=(self)`: o inbox grava áudio para mandar no WhatsApp. Com
  // `microphone=()` o navegador recusa getUserMedia na própria origem, e o
  // botão de gravar falhava com "confira a permissão" sem haver o que conferir.
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Anexo do inbox sobe por Server Action. O teto padrão é 1MB, o que recusa
    // qualquer foto de celular — e o erro chega como falha genérica de rede.
    // 20MB cobre o limite de vídeo e áudio da Meta (16MB) com folga.
    serverActions: { bodySizeLimit: '20mb' },
  },
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
