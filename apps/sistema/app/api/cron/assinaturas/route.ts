import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { expirarNaClinica } from '@estetica-os/nucleo/lib/plataforma/expirar-na-clinica'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { depoisDaMudanca } from '@estetica-os/nucleo/lib/redes/assinatura'
import { aplicarCobranca, assinaturaEncerradaNoAsaas, sincronizarCobranca } from '@/lib/redes/cobranca'
import { EVENTOS_DE_ASSINATURA } from '@/lib/asaas/webhook'
import { configDoAsaas } from '@/lib/asaas/cliente'
import { mensagemDoErro, tentar } from '@estetica-os/nucleo/lib/db'

/**
 * As regras de TEMPO da assinatura (Notification Cron, de hora em hora):
 *  1. teste vencido sem pagamento → em atraso;
 *  2. em atraso além da carência → suspensa.
 * As duas moram numa função do banco que REIVINDICA a linha (o `where` do
 * update): duas passagens não suspendem duas vezes. Depois, o cache de cada
 * rede que mudou expira e quem a administra é avisado.
 *
 * De reserva, reprocessa os eventos do Asaas parados há mais de 15 minutos
 * (o `after()` do webhook que não chegou ao fim) e reconcilia, uma vez por
 * dia, as faturas de cada assinatura ligada (um webhook perdido não deixa a
 * clínica sem fatura).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Aqui e na CLÍNICA, que guarda o cache da rede (o `buildContext` lê a cada tela).
const expirar = async (tag: string) => {
  revalidateTag(tag, { expire: 0 })
  await expirarNaClinica([tag])
}

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || !iguais(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()

  const { data, error } = await admin.rpc('assinaturas_aplicar_regras', {})
  if (error) {
    console.error('[cron/assinaturas]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const mudancas = (data ?? []) as { tenant_id: string; de: string; para: string }[]
  for (const m of mudancas) await depoisDaMudanca(m.tenant_id, m.de, m.para, 'regra', expirar)

  // Eventos do webhook que ficaram para trás.
  const limite = new Date(Date.now() - 15 * 60_000).toISOString()
  const { data: parados, error: eParados } = await admin.from('asaas_events')
    .select('id, evento, payload, tentativas').is('processado_em', null).lt('recebido_em', limite).lt('tentativas', 5)
    .order('recebido_em').limit(50)
  if (eParados) console.error('[cron/assinaturas] eventos parados:', eParados.message)
  let reprocessados = 0
  for (const ev of (parados ?? []) as { id: string; evento: string; payload: { payment?: Record<string, unknown>; subscription?: { id?: string } }; tentativas: number }[]) {
    // Reivindica: só quem muda a linha (tentativas = lido) processa.
    const { data: meu, error: eMeu } = await admin.from('asaas_events').update({ tentativas: ev.tentativas + 1 })
      .eq('id', ev.id).eq('tentativas', ev.tentativas).is('processado_em', null).select('id')
    if (eMeu) { console.error('[cron/assinaturas] reivindicar evento:', eMeu.message); continue }
    if (!meu?.length) continue
    try {
      if (ev.payload.payment) await aplicarCobranca(ev.payload.payment, ev.evento, expirar)
      else if (EVENTOS_DE_ASSINATURA.has(ev.evento) && typeof ev.payload.subscription?.id === 'string') {
        await assinaturaEncerradaNoAsaas(ev.payload.subscription.id)
      }
      await tentar(admin.from('asaas_events').update({ processado_em: new Date().toISOString(), erro: null }).eq('id', ev.id), 'marcar o evento como processado')
      reprocessados++
    } catch (e) {
      await tentar(admin.from('asaas_events').update({ erro: mensagemDoErro(e).slice(0, 500) }).eq('id', ev.id), 'guardar o erro do evento')
    }
  }

  // Reconciliação diária (as que não mexeram há 24 h), em lotes pequenos.
  let sincronizadas = 0
  if (configDoAsaas().temChave) {
    const umDia = new Date(Date.now() - 86_400_000).toISOString()
    const { data: subs, error: eSubs } = await admin.from('tenant_subscriptions').select('tenant_id')
      .eq('cobranca', 'ativa').not('asaas_subscription_id', 'is', null).lt('updated_at', umDia).limit(20)
    if (eSubs) console.error('[cron/assinaturas] assinaturas a reconciliar:', eSubs.message)
    for (const s of (subs ?? []) as { tenant_id: string }[]) {
      try {
        await sincronizarCobranca(s.tenant_id, expirar)
        // Marca a passagem mesmo sem cobrança nova, para não voltar na hora seguinte.
        await tentar(admin.from('tenant_subscriptions').update({ updated_at: new Date().toISOString() }).eq('tenant_id', s.tenant_id),
          'marcar a reconciliação')
        sincronizadas++
      } catch (e) { console.error('[cron/assinaturas] reconciliar:', s.tenant_id, mensagemDoErro(e)) }
    }
  }

  return NextResponse.json({ ok: true, mudancas: mudancas.length, reprocessados, sincronizadas })
}

/** Compara em tempo constante: o tempo da recusa não diz quanto do segredo bateu. */
function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
