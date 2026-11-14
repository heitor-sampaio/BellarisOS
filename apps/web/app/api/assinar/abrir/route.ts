import { NextRequest, NextResponse } from 'next/server'
import { mensagemDoErro } from '@/lib/db'
import { abrirPorLink } from '@/lib/documentos/link-publico'

/**
 * Abrir o documento pelo link público — SEM sessão.
 *
 * A defesa desta rota (§6) é o próprio link: o token (32 bytes, só o hash no
 * banco) mais a identidade do cliente, conferida em `documento_link_abrir`,
 * que conta as tentativas e bloqueia o link e o IP.
 *
 * Devolve TODOS os documentos abertos do link (DC3, leva 2: um link por
 * cliente e momento) — `doc` é o primeiro, para o link de um só.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
    if (!corpo || typeof corpo !== 'object') throw new Error()
  } catch {
    return NextResponse.json({ erro: 'Pedido inválido.' }, { status: 400 })
  }
  try {
    const r = await abrirPorLink({ token: corpo.token, cpf: corpo.cpf, nascimento: corpo.nascimento })
    if (r.erro) return NextResponse.json({ erro: r.erro }, { status: r.status ?? 403, headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ documentos: r.documentos, doc: r.doc }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: mensagemDoErro(e) }, { status: 500 })
  }
}
