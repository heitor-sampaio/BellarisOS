/**
 * De onde o NAVEGADOR tira o endereço e a chave pública do Supabase.
 *
 * A imagem do Docker é uma só para os três apps e é buildada sem as
 * `NEXT_PUBLIC_*` (docs/regras/infra.md): o servidor as lê em runtime e o
 * layout raiz as entrega à página de DOIS jeitos — o `<script>` que põe
 * `window.__SUPABASE_URL__`, e as `<meta>` abaixo.
 *
 * As `<meta>` existem por causa do 404 dos portais (frente F, 2026-10-28): o
 * `notFound()` fora de Suspense (é o que dá o HTTP 404, D18) faz o Next
 * responder com a casca de erro (`<html id="__next_error__">`), e a página é
 * desenhada pelo navegador a partir do payload. O React cria as `<meta>` nesse
 * desenho, mas NÃO executa o script de `dangerouslySetInnerHTML`: sem a
 * reserva, o sino e o Realtime do layout davam "supabaseUrl is required", e a
 * produção mostrava "Algo deu errado" no lugar de "Página não encontrada".
 * Quem lê é sempre um efeito (o cliente nasce em `useEffect`), depois de as
 * `<meta>` estarem no documento.
 */
export const META_SUPABASE_URL = 'bellaris-supabase-url'
export const META_SUPABASE_KEY = 'bellaris-supabase-key'

function daMeta(nome: string): string {
  if (typeof document === 'undefined') return ''
  return document.querySelector(`meta[name="${nome}"]`)?.getAttribute('content') ?? ''
}

export function configDoSupabaseNoNavegador(): { url: string; key: string } {
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, string>
    if (w.__SUPABASE_URL__ && w.__SUPABASE_KEY__) {
      return { url: w.__SUPABASE_URL__, key: w.__SUPABASE_KEY__ }
    }
    const url = daMeta(META_SUPABASE_URL)
    const key = daMeta(META_SUPABASE_KEY)
    if (url && key) return { url, key }
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  }
}
