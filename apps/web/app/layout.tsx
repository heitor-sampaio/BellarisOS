import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lumière — Gestão de Clínicas',
  description: 'Sistema de gestão para redes de clínicas de estética',
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? ''

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>
        {children}
        {/* Facebook JS SDK — obrigatório para o fluxo de Login com Facebook (Meta Ads OAuth) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.fbAsyncInit=function(){FB.init({appId:'${META_APP_ID}',cookie:true,xfbml:true,version:'v19.0'});FB.AppEvents.logPageView()};`,
          }}
        />
        <Script
          id="facebook-jssdk"
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}
