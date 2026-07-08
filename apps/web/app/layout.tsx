import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { CapacitorSessionSync } from '@/components/capacitor-session-sync'

export const metadata: Metadata = {
  title: 'Lumière — Gestão de Clínicas',
  description: 'Sistema de gestão para redes de clínicas de estética',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Lidos em runtime pelo servidor — não dependem de build-time inlining
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const metaAppId   = process.env.NEXT_PUBLIC_META_APP_ID ?? ''

  const runtimeConfig = `
    window.__SUPABASE_URL__=${JSON.stringify(supabaseUrl)};
    window.__SUPABASE_KEY__=${JSON.stringify(supabaseKey)};
    window.fbAsyncInit=function(){FB.init({appId:${JSON.stringify(metaAppId)},cookie:true,xfbml:true,version:'v25.0'});FB.AppEvents.logPageView();};
  `.trim()

  // MessageChannel polyfill: must run BEFORE deferred scripts (React/Next.js).
  // Some Android WebViews (Capacitor) silently drop MessageChannel.postMessage()
  // deliveries, which breaks React 18's task scheduler — useEffect never fires,
  // no error is thrown. Replacing with a setTimeout-based implementation fixes it.
  const mcPolyfill = `
(function(){
  if(typeof MessageChannel==='undefined')return;
  window.MessageChannel=function(){
    var _h;
    var p1={};
    Object.defineProperty(p1,'onmessage',{get:function(){return _h;},set:function(fn){_h=fn;}});
    this.port1=p1;
    this.port2={postMessage:function(d){var h=_h;if(h)setTimeout(function(){h({data:d,origin:'',lastEventId:'',source:null,ports:[]});},0);}};
  };
})();
`.trim()

  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>
        {/* MessageChannel polyfill must be first — before any deferred script (React) runs */}
        <script dangerouslySetInnerHTML={{ __html: mcPolyfill }} />
        {/* Injeta config em runtime antes de qualquer componente React */}
        <script dangerouslySetInnerHTML={{ __html: runtimeConfig }} />
        {/* Mantém armazenamento nativo (Preferences) sincronizado com a sessão */}
        <CapacitorSessionSync />
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
