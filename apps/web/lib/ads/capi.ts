import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdsConfig } from './factory'
import type { MetaAdsConfig } from './types'

const GRAPH_API_VERSION = 'v25.0'

/**
 * Eventos que este sistema manda para a Meta.
 *
 * `Schedule` é o de OTIMIZAÇÃO: agendar é o primeiro compromisso real da
 * pessoa, tem volume para a Meta sair do aprendizado (venda fechada não tem,
 * numa clínica só) e não é ambíguo.
 *
 * `Purchase` fecha o ROI e por isso sai no RECEBIMENTO, não no fechamento —
 * plano vendido e não pago vira ROI fantasma. O mesmo critério do §13.1: se a
 * receita exige `is_paid`, isto também.
 *
 * `Atendimento` é evento de LEITURA, não de otimização: no-show em estética é
 * alto, e separar "agendou" de "veio" muda a interpretação do CPA.
 */
export type CapiEvent =
  | 'Lead'
  | 'Schedule'
  | 'Purchase'
  | 'CompleteRegistration'
  | 'Atendimento'

export interface CapiInput {
  tenantId: string
  event:    CapiEvent
  /**
   * Id determinístico do FATO (`schedule:<appointment_id>`).
   *
   * A Meta deduplica por ele. Determinístico e não aleatório porque o mesmo
   * fato pode ser processado duas vezes — retentativa, reentrega de webhook,
   * alguém clicando duas vezes — e nesses casos a venda não pode contar duas.
   */
  eventId:  string
  /** Sem ele não há atribuição de click-to-WhatsApp. */
  ctwaClid?: string | null
  adId?:     string | null
  phone?:    string | null
  email?:    string | null
  /** Só em Purchase. Em reais. */
  valor?:    number | null
  /** Momento do FATO. O envio pode ser depois; o `event_time` é este. */
  ocorridoEm?: Date
  customData?: Record<string, unknown>
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

/**
 * Monta o corpo do evento.
 *
 * ⚠️ `action_source: 'business_messaging'` e `messaging_channel: 'whatsapp'`
 * não são detalhe: com `'website'` — que era o que este projeto mandava — a
 * Meta ACEITA o evento e não o atribui ao anúncio. Falha silenciosa, do tipo
 * que parece ter funcionado.
 *
 * O `ctwa_clid` vai em `user_data`, ao lado dos identificadores da pessoa; é
 * ele que liga o evento ao clique.
 */
export function montarPayload(input: CapiInput, pixelId: string) {
  const quando = Math.floor((input.ocorridoEm ?? new Date()).getTime() / 1000)

  const userData: Record<string, unknown> = {}
  // Telefone e e-mail vão com hash, exigência da Meta. Telefone só com
  // dígitos: o mesmo número com e sem máscara geraria hashes diferentes e a
  // Meta não casaria a pessoa.
  if (input.phone) userData.ph = sha256(input.phone.replace(/\D/g, ''))
  if (input.email) userData.em = sha256(input.email.toLowerCase().trim())
  if (input.ctwaClid) userData.ctwa_clid = input.ctwaClid

  const custom: Record<string, unknown> = { ...(input.customData ?? {}) }
  if (input.valor != null) {
    custom.value    = Number(input.valor)
    custom.currency = 'BRL'
  }
  if (input.adId) custom.ad_id = input.adId

  return {
    data: [{
      event_name:        input.event,
      event_time:        quando,
      event_id:          input.eventId,
      action_source:     'business_messaging',
      messaging_channel: 'whatsapp',
      user_data:         userData,
      custom_data:       custom,
    }],
  }
}

/**
 * Registra e manda um evento — nesta ordem.
 *
 * A linha nasce ANTES do envio porque é ela que guarda o `event_id`: sem ele
 * gravado, uma retentativa conta a mesma venda de novo. Se a linha já existe
 * (mesmo `tenant_id` + `event_id`), o fato já foi tratado e não se repete.
 *
 * **Nunca lança.** Isto roda ao lado de criar agendamento e de receber
 * pagamento; um erro de rede da Meta não pode derrubar nenhum dos dois. O que
 * falha fica com `status='falhou'` e o cron recolhe.
 */
export async function enviarEventoCapi(input: CapiInput): Promise<void> {
  const admin = createAdminClient()

  try {
    const { data: linha, error: erroInsert } = await admin
      .from('meta_capi_events')
      .insert({
        tenant_id:   input.tenantId,
        event_id:    input.eventId,
        event_name:  input.event,
        ctwa_clid:   input.ctwaClid ?? null,
        ad_id:       input.adId ?? null,
        valor:       input.valor ?? null,
        ocorrido_em: (input.ocorridoEm ?? new Date()).toISOString(),
        status:      'pendente',
      })
      .select('id')
      .single()

    // 23505 = o fato já foi registrado antes. Não é erro: é a dedup fazendo o
    // trabalho dela.
    if (erroInsert) {
      if (erroInsert.code !== '23505') console.error('[capi] registrar:', erroInsert.message)
      return
    }

    await despachar(admin, linha.id as string, input)
  } catch (e) {
    console.error('[capi]', (e as Error).message)
  }
}

/** Envia de fato e carimba o resultado na linha. */
async function despachar(
  admin: ReturnType<typeof createAdminClient>,
  linhaId: string,
  input: CapiInput,
): Promise<void> {
  const config = await getAdsConfig(input.tenantId, 'meta_ads') as MetaAdsConfig | null

  // Sem integração não há para onde mandar. Fica `pendente`: quando a Meta Ads
  // for conectada, o cron recolhe o que ficou para trás — e é por isso que
  // vale a pena registrar mesmo sem poder enviar.
  if (!config?.accessToken || !config.pixelId) {
    await admin.from('meta_capi_events')
      .update({ erro: 'Integração Meta Ads não conectada' })
      .eq('id', linhaId)
    return
  }

  // Sem click id não há atribuição possível a click-to-WhatsApp. Mandar assim
  // mesmo só suja o dataset com evento que a Meta não consegue casar.
  if (!input.ctwaClid) {
    await admin.from('meta_capi_events')
      .update({ status: 'descartado', erro: 'sem ctwa_clid' })
      .eq('id', linhaId)
    return
  }

  const payload = montarPayload(input, config.pixelId)
  let erro: string | null = null

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.pixelId}/events`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...payload, access_token: config.accessToken }),
      },
    )
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({})) as any
      erro = corpo?.error?.message ?? `Graph API ${res.status}`
    }
  } catch (e) {
    erro = (e as Error).message
  }

  await admin.from('meta_capi_events').update({
    status:     erro ? 'falhou' : 'enviado',
    erro,
    payload,
    tentativas: 1,
    enviado_em: erro ? null : new Date().toISOString(),
  }).eq('id', linhaId)

  if (erro) console.error('[capi]', input.event, input.eventId, erro)
}

/**
 * Recolhe o que ficou para trás.
 *
 * Caminho de EXCEÇÃO, não de entrega: o normal é o evento sair no ato. Aqui
 * entram os que falharam por rede, os que esperavam a integração ser conectada
 * e os que o processo não chegou a mandar.
 *
 * A Meta recusa evento com mais de 7 dias, então o que passar disso é
 * descartado — insistir só queima chamada.
 */
export async function reenviarEventosPendentes(limite = 50): Promise<{
  enviados: number; descartados: number; falharam: number
}> {
  const admin = createAdminClient()
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const { data: linhas, error } = await admin
    .from('meta_capi_events')
    .select('id, tenant_id, event_id, event_name, ctwa_clid, ad_id, valor, ocorrido_em, tentativas')
    .in('status', ['pendente', 'falhou'])
    .order('ocorrido_em', { ascending: true })
    .limit(limite)

  if (error) { console.error('[capi cron]', error.message); return { enviados: 0, descartados: 0, falharam: 0 } }

  let enviados = 0, descartados = 0, falharam = 0

  for (const l of linhas ?? []) {
    if ((l.ocorrido_em as string) < seteDiasAtras) {
      await admin.from('meta_capi_events')
        .update({ status: 'descartado', erro: 'mais de 7 dias — a Meta não aceita' })
        .eq('id', l.id as string)
      descartados++
      continue
    }

    const antes = l.tentativas as number
    await despachar(admin, l.id as string, {
      tenantId:   l.tenant_id as string,
      event:      l.event_name as CapiEvent,
      eventId:    l.event_id as string,
      ctwaClid:   l.ctwa_clid as string | null,
      adId:       l.ad_id as string | null,
      valor:      l.valor as number | null,
      ocorridoEm: new Date(l.ocorrido_em as string),
    })
    await admin.from('meta_capi_events')
      .update({ tentativas: antes + 1 })
      .eq('id', l.id as string)

    const { data: agora } = await admin
      .from('meta_capi_events').select('status').eq('id', l.id as string).maybeSingle()
    if (agora?.status === 'enviado') enviados++
    else if (agora?.status === 'descartado') descartados++
    else falharam++
  }

  return { enviados, descartados, falharam }
}
