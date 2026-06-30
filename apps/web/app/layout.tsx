import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lumière — Gestão de Clínicas',
  description: 'Sistema de gestão para redes de clínicas de estética',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Lidos em runtime pelo servidor — não dependem de build-time inlining
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const metaAppId   = process.env.NEXT_PUBLIC_META_APP_ID ?? ''

  const runtimeConfig = `
    window.__SUPABASE_URL__=${JSON.stringify(supabaseUrl)};
    window.__SUPABASE_KEY__=${JSON.stringify(supabaseKey)};
    window.fbAsyncInit=function(){FB.init({appId:${JSON.stringify(metaAppId)},cookie:true,xfbml:true,version:'v19.0'});FB.AppEvents.logPageView();};
  `.trim()

  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>
        {/* Injeta config em runtime antes de qualquer componente React */}
        <script dangerouslySetInnerHTML={{ __html: runtimeConfig }} />
        {children}
        <Script
          id="facebook-jssdk"
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}
