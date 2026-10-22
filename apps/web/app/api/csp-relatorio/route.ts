import { NextRequest, NextResponse } from 'next/server'
import { resumoDoRelatorio } from '@/lib/seguranca/csp'

/**
 * O relatório do CSP da clínica (2026-10-08; bloqueia desde 2026-10-22): o
 * navegador manda o que a política barrou, e aqui vira UMA linha no log do
 * Railway por (diretiva, origem barrada, página). Linha nova depois do
 * bloqueio é uma tela que perdeu algo: liberar na política, se for legítimo.
 * (No `next dev` a política só avisa, e a linha diz o que ela barraria.)
 *
 * É pública por natureza: o navegador manda sem sessão. A defesa é o formato:
 * só os tipos de relatório, corpo pequeno, nada gravado no banco, e o log sem
 * repetição (e sem caminho nem consulta da URL bloqueada, que podem ter dado).
 */
export const dynamic = 'force-dynamic'

const TIPOS = new Set(['application/csp-report', 'application/reports+json', 'application/json'])
const TAMANHO_MAXIMO = 16_384
/** O que já foi registrado neste processo (com teto: não cresce sem fim). */
const vistos = new Set<string>()

export async function POST(req: NextRequest) {
  const tipo = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!TIPOS.has(tipo)) return new NextResponse(null, { status: 415 })
  if (Number(req.headers.get('content-length') ?? 0) > TAMANHO_MAXIMO) return new NextResponse(null, { status: 413 })
  const texto = await req.text()
  if (texto.length > TAMANHO_MAXIMO) return new NextResponse(null, { status: 413 })

  let corpo: unknown
  try { corpo = JSON.parse(texto) } catch { return new NextResponse(null, { status: 400 }) }

  for (const v of resumoDoRelatorio(corpo)) {
    const chave = `${v.diretiva}|${v.bloqueado}|${v.pagina}`
    if (vistos.has(chave)) continue
    if (vistos.size >= 500) vistos.clear()
    vistos.add(chave)
    console.warn(`[csp] ${v.diretiva} barrou ${v.bloqueado} em ${v.pagina}`)
  }
  return new NextResponse(null, { status: 204 })
}
