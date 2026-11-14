import { NextRequest, NextResponse } from 'next/server'
import { mensagemDoErro } from '@/lib/db'
import { assinarPorLink } from '@/lib/documentos/link-publico'

/**
 * Assinar pelo link público — SEM sessão.
 *
 * Confere a identidade DE NOVO (não confia que quem chega aqui passou por
 * `/api/assinar/abrir`), e `documento_assinar` exige o hash do que foi
 * mostrado e consome o link na mesma transação: uso único.
 *
 * DC3 (leva 2): `itens` traz o id e o hash de CADA documento do link — uma
 * assinatura assina todos, e o banco recusa se faltar ou sobrar algum. O
 * aceite gravado é o do servidor, com os títulos do banco.
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
    const r = await assinarPorLink({
      token: corpo.token, cpf: corpo.cpf, nascimento: corpo.nascimento,
      assinatura: corpo.assinatura, itens: corpo.itens, hashExibido: corpo.hashExibido,
    })
    if (r.erro) return NextResponse.json({ erro: r.erro }, { status: r.status ?? 403 })
    return NextResponse.json({ codigo: r.codigo, documentos: r.documentos })
  } catch (e) {
    // Regra do banco (hash mudou, link já usado): a mensagem é para a tela.
    return NextResponse.json({ erro: mensagemDoErro(e) }, { status: 409 })
  }
}
