import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from './server'

/**
 * `GET /api/auth/token` — o access token da sessão, para o Realtime do
 * navegador. Mora no núcleo porque a clínica e o suporte (a fila de chamados)
 * usam o mesmo `RealtimeRefresher`; cada app só reexporta (`app/api/auth/token`).
 *
 * Os cookies da sessão são httpOnly (`cookie-de-sessao.ts`): o navegador não
 * lê a sessão. O que ele precisa — falar com o Realtime como a pessoa, para a
 * RLS valer — sai daqui: SÓ o access token (até 1 h, não se renova sozinho),
 * nunca o refresh. Quem roda um script na página consegue pedir este token;
 * não consegue levar a sessão de 7 dias embora.
 *
 * `/api/*` se defende sozinha:
 * - sem sessão → 401;
 * - pedido que não é da MESMA ORIGEM → 403 (`Sec-Fetch-Site`). O CORS já
 *   impede outro site de LER a resposta; recusar é para nem renovar a sessão
 *   por ele — e app.* e suporte.* são o mesmo SITE, não a mesma origem.
 * A sessão vencida é renovada aqui mesmo (os cookies novos vão na resposta).
 */
export async function rotaDoToken(req: NextRequest): Promise<NextResponse> {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    return semCache(NextResponse.json({ error: 'Pedido de outro site' }, { status: 403 }))
  }

  const supabase = await createClient()
  // getClaims valida o JWT; sem sessão válida (nem renovável), não há token.
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return semCache(NextResponse.json({ error: 'Sem sessão' }, { status: 401 }))
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return semCache(NextResponse.json({ error: 'Sem sessão' }, { status: 401 }))

  return semCache(NextResponse.json({
    access_token: session.access_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + 300,
  }))
}

function semCache(r: NextResponse): NextResponse {
  r.headers.set('Cache-Control', 'no-store')
  return r
}
