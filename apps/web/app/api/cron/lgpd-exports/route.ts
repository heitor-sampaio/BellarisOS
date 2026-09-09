import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processExportRequest } from '@/actions/lgpd'

/**
 * Rede de segurança das solicitações de dados (LGPD).
 *
 * O caminho normal é o `after()` disparado na própria solicitação. Esta rota
 * recolhe o que ficou para trás — processo reiniciado no meio, falha de rede
 * ao gravar no storage — para nenhum pedido ficar parado sem ninguém perceber.
 * A LGPD dá 15 dias para responder, então varrer de hora em hora basta.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STALE_MINUTES = 15
const BATCH = 10

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString()

  // 'processing' parado há muito tempo = processo morreu no meio; volta para a
  // fila. `processExportRequest` só age sobre 'pending', então destravar aqui é
  // o que permite a retomada.
  const { error: resetErr } = await admin
    .from('lgpd_requests')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('status', 'processing')
    .lt('updated_at', staleBefore)

  if (resetErr) {
    return NextResponse.json({ error: `Falha ao destravar pendências: ${resetErr.message}` }, { status: 500 })
  }

  const { data: pending, error } = await admin
    .from('lgpd_requests')
    .select('id, include_medical, medical_status')
    .eq('status', 'pending')
    .eq('type', 'export')
    .order('requested_at', { ascending: true })
    .limit(BATCH)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Um pedido que espera liberação do prontuário não é atraso: fica parado até
  // a equipe decidir, e é a aprovação que o coloca de volta em 'pending'.
  const ready = (pending ?? []).filter(
    r => !(r.include_medical && r.medical_status === 'pending'),
  )

  for (const r of ready) {
    await processExportRequest(r.id)
  }

  return NextResponse.json({
    ok: true,
    processed: ready.length,
    awaitingReview: (pending ?? []).length - ready.length,
  })
}
