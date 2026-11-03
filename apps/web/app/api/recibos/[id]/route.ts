import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, can, podeReceber, alcancaUnidade, isOwnScope } from '@/lib/auth'
import { getCachedFichasDoLogin } from '@/lib/cached-queries'
import { buildPdf } from '@/lib/pdf'
import { lancamentoDoRecibo, reciboDoLancamento } from '@/lib/financeiro/recibo'

/**
 * O recibo de um pagamento, em PDF (ven-06 da revisão, 2026-11-02: "um
 * recibo simples em PDF, pelo app ou impresso").
 *
 * Toda rota de /api se defende sozinha (§6): sessão; da equipe, quem recebe
 * (`cashier`) ou vê o financeiro da unidade inteira, da rede e com a unidade
 * ao alcance; da cliente, só o pagamento DELA — de qualquer clínica em que
 * tenha ficha (a rota não tem a clínica no endereço). Só do que foi PAGO e não
 * estornado; o resto é 404 (não se diz que existe).
 */

export const dynamic = 'force-dynamic'

const naoEncontrado = () => NextResponse.json({ error: 'Recibo não encontrado.' }, { status: 404 })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await getTenantContext()
  } catch {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  if (!ctx.isClient && !podeReceber(ctx) && !(can(ctx, 'financial', 'VIEW') && !isOwnScope(ctx, 'financial'))) {
    return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })
  }

  const lancamento = await lancamentoDoRecibo(id)
  if (!lancamento) return naoEncontrado()
  if (ctx.isClient) {
    const fichas = (await getCachedFichasDoLogin(ctx.userId)).map(f => f.clientId)
    if (!lancamento.clientId || !(fichas.length ? fichas : [ctx.clientId]).includes(lancamento.clientId)) return naoEncontrado()
  } else if (lancamento.tenantId !== ctx.tenantId || !alcancaUnidade(ctx, lancamento.branchId)) {
    return naoEncontrado()
  }

  const { doc, arquivo } = await reciboDoLancamento(lancamento)
  const pdf = buildPdf(doc)
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // Abre no navegador (imprimir ou baixar dali); o nome serve ao "salvar".
      'Content-Disposition': `inline; filename="${arquivo}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
