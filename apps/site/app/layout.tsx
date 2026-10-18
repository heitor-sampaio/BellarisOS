import type { Metadata, Viewport } from 'next'
import '@estetica-os/nucleo/estilos/globals.css'
import './site.css'
import { SCRIPT_DO_MOVIMENTO } from '@/lib/movimento'

const TITULO = 'BellarisOS — sistema para clínicas de estética'
const DESCRICAO = 'Agenda, prontuário, WhatsApp, vendas, financeiro e automações num lugar só. Teste grátis por 14 dias, sem cartão.'

export async function generateMetadata(): Promise<Metadata> {
  const site = (process.env.SITE_URL || 'https://bellarisos.com').replace(/\/$/, '')
  return {
    metadataBase: new URL(site),
    title: TITULO,
    description: DESCRICAO,
    alternates: { canonical: '/' },
    openGraph: { type: 'website', locale: 'pt_BR', url: '/', siteName: 'BellarisOS', title: TITULO, description: DESCRICAO },
    twitter: { card: 'summary_large_image', title: TITULO, description: DESCRICAO },
    robots: { index: true, follow: true },
  }
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f8f8f8' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Liga o movimento ANTES de pintar (sem piscar), e o desliga sozinho se a página não carregar. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_MOVIMENTO }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
