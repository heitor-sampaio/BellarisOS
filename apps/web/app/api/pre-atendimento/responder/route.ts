import { NextRequest, NextResponse } from 'next/server'
import { mensagemDoErro } from '@/lib/db'
import { responderPorLink } from '@/lib/pre-atendimento/link-publico'

/**
 * Responder a ficha de pré-atendimento pelo link — SEM sessão. Confere a
 * identidade de novo (como a de abrir) antes de gravar.
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
    const r = await responderPorLink({
      token: corpo.token, cpf: corpo.cpf, nascimento: corpo.nascimento,
      respostas: corpo.respostas, nadaMudou: corpo.nadaMudou,
    })
    if (r.erro) return NextResponse.json({ erro: r.erro }, { status: r.status ?? 403, headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: mensagemDoErro(e) }, { status: 500 })
  }
}
