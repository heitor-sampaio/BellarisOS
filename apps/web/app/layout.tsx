import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { CapacitorSessionSync }  from '@/components/capacitor-session-sync'
import { NavigationProgress }    from '@/components/shared/navigation-progress'
import { NativeShell }           from '@/components/native-shell'
import { Toaster }               from 'sonner'

// Garante renderização dinâmica em todas as páginas para que as env vars de
// runtime (NEXT_PUBLIC_SUPABASE_URL, etc.) sejam lidas no servidor a cada
// request — não baked-in no HTML estático durante o build do Railway.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'BellarisOS — Gestão de Clínicas',
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

  // Auto-reload when WebView has cached stale HTML with old Server Action IDs.
  // Next.js throws UnrecognizedActionError (POST 404) after a new deployment.
  // Reloading once fetches the current HTML with up-to-date action hashes.
  const staleActionGuard = `
(function(){
  var _reloading=false;
  function reload(){if(_reloading)return;_reloading=true;window.location.reload();}
  window.addEventListener('unhandledrejection',function(e){
    var m=e&&e.reason&&(e.reason.message||String(e.reason));
    if(m&&(m.indexOf('UnrecognizedActionError')!==-1||(m.indexOf('Server Action')!==-1&&m.indexOf('was not found')!==-1))){reload();}
  });
})();
`.trim()

  return (
    // O `suppressHydrationWarning` aqui é obrigatório, não conveniência: dois
    // scripts abaixo mexem em `document.documentElement` ANTES da hidratação —
    // a classe `sidebar-collapsed` (para a barra não piscar aberta) e a
    // `.capacitor` do shell nativo. O servidor renderiza `<html>` sem elas, e
    // o React acusava "tree hydrated but some attributes ... didn't match" a
    // cada carga com a barra recolhida. O aviso era permanente no overlay do
    // Next, o que ensina a ignorá-lo — e aí o próximo erro de hidratação, esse
    // de verdade, passa batido.
    //
    // A supressão vale só para os atributos deste elemento, não desce para os
    // filhos: mismatch de verdade lá dentro continua sendo acusado.
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* MessageChannel polyfill must be first — before any deferred script (React) runs */}
        <script dangerouslySetInnerHTML={{ __html: mcPolyfill }} />
        {/* Auto-reload on stale Server Action IDs (WebView cache after deploy) */}
        <script dangerouslySetInnerHTML={{ __html: staleActionGuard }} />
        {/* Injeta config em runtime antes de qualquer componente React */}
        <script dangerouslySetInnerHTML={{ __html: runtimeConfig }} />
        {/* Aplica o estado recolhido do sidebar antes do paint (evita flash) */}
        <script dangerouslySetInnerHTML={{ __html: "(function(){try{if(localStorage.getItem('sidebar-collapsed')==='1')document.documentElement.classList.add('sidebar-collapsed')}catch(e){}})()" }} />
        {/* Mantém armazenamento nativo (Preferences) sincronizado com a sessão */}
        <CapacitorSessionSync />
        {/* Configura shell nativo (classe .capacitor + status bar rosé/branco) */}
        <NativeShell />
        {/* Barra de progresso de navegação — aparece ao clicar em qualquer NavItem */}
        <NavigationProgress />
        {children}
        {/* Sem isto, todo `toast()` do sistema é uma chamada que não faz nada:
            o sonner só desenha onde o Toaster está montado, e ele não estava em
            lugar nenhum. Quatro telas avisavam de erro e sucesso no vazio.
            Fica no layout raiz porque os avisos nascem nos três portais. */}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }}
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
