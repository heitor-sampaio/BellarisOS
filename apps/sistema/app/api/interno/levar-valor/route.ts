import { NextResponse, type NextRequest } from 'next/server'
import { segredoInternoConfere } from '@estetica-os/nucleo/lib/interno'
import { mensagemDoErro } from '@estetica-os/nucleo/lib/db'
import { levarValorAoAsaas } from '@/lib/redes/cobranca'

/**
 * A CLÍNICA contratou ou tirou um adicional (2026-10-07) e pede ao sistema que
 * leve o total novo ao Asaas — a clínica não tem a chave nem o código da
 * cobrança. Pública no proxy: se defende pelo segredo entre os apps
 * (`INTERNO_SECRET`, lib/interno). Só recebe o id da rede; o valor sai do
 * banco, nunca do pedido. Falhou: o cron `assinaturas` leva depois.
 */
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!segredoInternoConfere(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Sem acesso.' }, { status: 401 })
  }
  const tenantId = ((await req.json().catch(() => null)) as { tenantId?: unknown } | null)?.tenantId
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  try {
    await levarValorAoAsaas(tenantId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[interno/levar-valor]', tenantId, mensagemDoErro(e))
    return NextResponse.json({ error: 'O Asaas não recebeu o valor; o cron tenta de novo.' }, { status: 502 })
  }
}
