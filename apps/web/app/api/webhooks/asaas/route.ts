import { NextRequest, NextResponse, after } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { tentar, mensagemDoErro } from '@/lib/db'
import { tokenDoWebhookConfere, EVENTOS_DE_COBRANCA, EVENTOS_DE_ASSINATURA } from '@/lib/asaas/webhook'
import { aplicarCobranca, assinaturaEncerradaNoAsaas } from '@/lib/redes/assinatura'

/**
 * O webhook do ASAAS (cobrança das assinaturas das redes). Rota de `/api/*`:
 * se defende sozinha — pelo token `asaas-access-token` que nós definimos no
 * painel do Asaas (§6).
 *
 * - O evento é GRAVADO antes de tudo, pela chave do Asaas: a entrega é "pelo
 *   menos uma vez", e o repetido bate no 23505 (responde 200, já recebido).
 * - Responde 200 NA HORA (só 200 conta como entregue; o resto o Asaas repete e,
 *   depois de 15 falhas, pausa a fila). O processamento vai para `after()`, e o
 *   cron `assinaturas` recolhe o que ficar para trás.
 * - A situação da rede é recalculada POR ESTADO no banco
 *   (`assinatura_aplicar_cobranca`): eventos fora de ordem não estragam nada.
 */
export const dynamic = 'force-dynamic'

const expirar = (tag: string) => revalidateTag(tag, { expire: 0 })

export async function POST(req: NextRequest) {
  if (!tokenDoWebhookConfere(req.headers.get('asaas-access-token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let corpo: { id?: string; event?: string; payment?: Record<string, unknown>; subscription?: Record<string, unknown> }
  try { corpo = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const id = typeof corpo.id === 'string' ? corpo.id.slice(0, 200) : null
  const evento = typeof corpo.event === 'string' ? corpo.event.slice(0, 80) : null
  if (!id || !evento) return NextResponse.json({ error: 'Evento sem id' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('asaas_events').insert({ id, evento, payload: corpo })
  if (error?.code === '23505') return NextResponse.json({ ok: true, repetido: true })
  if (error) {
    console.error('[webhook/asaas] gravar o evento:', error.message)
    return NextResponse.json({ error: 'Não gravou' }, { status: 500 })
  }

  after(async () => {
    try {
      if (EVENTOS_DE_COBRANCA.has(evento) && corpo.payment) {
        await aplicarCobranca(corpo.payment, evento, expirar)
      } else if (EVENTOS_DE_ASSINATURA.has(evento) && typeof corpo.subscription?.id === 'string') {
        await assinaturaEncerradaNoAsaas(corpo.subscription.id)
      }
      await tentar(admin.from('asaas_events').update({ processado_em: new Date().toISOString(), tentativas: 1 }).eq('id', id),
        'marcar o evento como processado')
    } catch (e) {
      console.error('[webhook/asaas] processar:', mensagemDoErro(e))
      await tentar(admin.from('asaas_events').update({ erro: mensagemDoErro(e).slice(0, 500), tentativas: 1 }).eq('id', id),
        'guardar o erro do evento')
    }
  })

  return NextResponse.json({ ok: true })
}
