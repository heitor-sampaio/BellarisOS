import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { segredoInternoConfere, tagsParaExpirar } from '../interno'
import { urlDaClinica, urlDoHost } from './destino'

/**
 * O cache que um app muda e OUTRO app guarda (2026-10-06). Cada processo tem
 * o seu `unstable_cache`: o `updateTag` daqui não chega lá. Quem muda pede ao
 * dono do cache, por `/api/interno/expirar` (ver `lib/interno.ts`):
 *  - a situação da rede (`rede:`) e a sessão de suporte (`suporte-sessao:`) e
 *    o membro (`user:`) moram na CLÍNICA;
 *  - a pessoa da plataforma (`plataforma:`) mora no SUPORTE (e no sistema).
 *
 * Acessório, nunca lança: falhou, registra e segue. O TTL e a RLS (que lê o
 * estado no banco a cada transação) seguem valendo; o aviso é para a TELA não
 * ficar atrasada.
 */
export type OndeExpirar = 'clinica' | 'sistema' | 'suporte'

export async function expirarEm(onde: OndeExpirar, tags: string[]): Promise<void> {
  const lista = tags.filter(Boolean)
  if (!lista.length) return
  try {
    const segredo = process.env.INTERNO_SECRET
    if (!segredo) { console.error('[expirarEm] INTERNO_SECRET não definida'); return }
    const base = onde === 'clinica' ? urlDaClinica() : urlDoHost(onde)
    const r = await fetch(`${base}/api/interno/expirar`, {
      method: 'POST',
      headers: { authorization: `Bearer ${segredo}`, 'content-type': 'application/json' },
      body: JSON.stringify({ tags: lista }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!r.ok) console.error(`[expirarEm] ${onde} respondeu`, r.status)
  } catch (e) {
    console.error(`[expirarEm] ${onde}:`, (e as Error).message)
  }
}

/** Atalho: o que mora na clínica. */
export const expirarNaClinica = (tags: string[]) => expirarEm('clinica', tags)

/**
 * O handler de `/api/interno/expirar` (o mesmo nos três apps): segredo,
 * lista fechada, e expira na hora.
 */
export async function rotaDeExpirar(req: NextRequest): Promise<NextResponse> {
  if (!segredoInternoConfere(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Sem acesso.' }, { status: 401 })
  }
  const tags = tagsParaExpirar(await req.json().catch(() => null))
  if (!tags) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  for (const tag of tags) revalidateTag(tag, { expire: 0 })
  return NextResponse.json({ ok: true, expiradas: tags.length })
}
