import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth'
import { assinaturaDoMenu } from '@/lib/sessao/assinatura-do-menu'

/**
 * A assinatura do menu de quem pergunta (LO-06; A7 da 43ª): o `MenuEmDia`
 * compara com a que o layout desenhou e, se mudou, redesenha. `/api/*` é
 * público no proxy: a rota se defende pela sessão (só a equipe tem menu). Não
 * diz nada além de uma assinatura do próprio acesso, e não grava nada.
 */
export async function GET() {
  const ctx = await getTenantContext().catch(() => null)
  if (!ctx || ctx.isClient || !ctx.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ assinatura: assinaturaDoMenu(ctx) }, { headers: { 'cache-control': 'no-store' } })
}
