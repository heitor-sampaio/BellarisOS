import type { Metadata, Viewport } from 'next'
import '@estetica-os/nucleo/estilos/globals.css'
import { Toaster } from 'sonner'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'BellarisOS — Suporte',
  description: 'O atendimento do BellarisOS: chamados e diagnóstico das redes.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lidos em runtime: o Realtime do navegador (lib/supabase/client) usa.
  const runtimeConfig = `window.__SUPABASE_URL__=${JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')};window.__SUPABASE_KEY__=${JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')};`
  // O nonce da CSP desta requisição (o proxy gera): o script em linha só roda com ele.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="pt-BR">
      <body>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: runtimeConfig }} />
        {children}
        <Toaster position="top-right" richColors toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
      </body>
    </html>
  )
}
