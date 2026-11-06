import { test, expect, type APIRequestContext } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A mesma mensagem do WhatsApp entra UMA vez por conversa (2026-11-06).
 *
 * O histórico da coexistência chega em pedaços, e a Meta reentrega. A
 * deduplicação era "procura; se não achou, grava": duas entregas ao mesmo
 * tempo passavam as duas pela procura e gravavam as duas. A Bellaris Clinic
 * ficou com 34 mensagens do histórico de maio em dobro — e, dali em diante, a
 * procura (`maybeSingle`) achava DUAS linhas e estourava PGRST116: o webhook
 * respondia 500 a cada reentrega delas (15 vezes em 05/11).
 *
 * Prova:
 *  - o banco recusa a segunda linha com o mesmo `external_id` na conversa
 *    (`messages_external_id_unico`);
 *  - seis entregas simultâneas do mesmo histórico: todas 200, cada mensagem
 *    uma vez; e a reentrega depois também 200, sem nada a mais.
 */

const marca = Date.now().toString(36)
const sufixo = String(Date.now()).slice(-7)
const FONE_ID = `7${sufixo}11`
const DA_CLINICA = `5548977${sufixo.slice(-6)}`
const CLIENTE = `5548966${sufixo.slice(-6)}`
const SEGREDO = `segredo-${marca}`

const db = () => banco()
let outra: OutraRede | null = null
let caixaId: string | null = null

test.beforeAll(async () => {
  outra = await criarOutraRede(`hist${marca}`)
  const { data, error } = await db().from('whatsapp_numbers').insert({
    tenant_id: outra.tenantId, provider: 'official', label: `${PREFIXO} Histórico ${marca}`, is_active: true,
    phone_number_id: FONE_ID, waba_id: `waba-hist-${marca}`,
    config: { provider: 'official', phoneNumberId: FONE_ID, wabaId: `waba-hist-${marca}`, accessToken: 'x', verifyToken: 'x', appSecret: SEGREDO },
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a caixa').toBeNull()
  caixaId = data!.id
})

test.afterAll(async () => {
  if (!outra) return
  const b = db()
  const { data: convs } = await b.from('conversations').select('id').eq('tenant_id', outra.tenantId)
  await apagarConversas((convs ?? []).map(c => c.id as string))
  await b.from('contacts').delete().eq('tenant_id', outra.tenantId)
  if (caixaId) await b.from('whatsapp_numbers').delete().eq('id', caixaId)
  await outra.limpar()
})

async function entregar(request: APIRequestContext, valor: Record<string, unknown>) {
  const corpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: `waba-hist-${marca}`, changes: [{ field: 'history', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: DA_CLINICA, phone_number_id: FONE_ID },
      ...valor,
    } }] }],
  })
  const assinatura = `sha256=${createHmac('sha256', SEGREDO).update(corpo).digest('hex')}`
  const r = await request.post('/api/webhooks/whatsapp', {
    data: corpo, headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinatura },
  })
  return { status: r.status(), texto: await r.text() }
}

test.describe('a mesma mensagem do WhatsApp entra uma vez', () => {
  test('o banco recusa a segunda linha com o mesmo id do WhatsApp na conversa', async () => {
    const b = db()
    const { data: conv, error: e1 } = await b.from('conversations').insert({
      tenant_id: outra!.tenantId, status: 'open', channel: 'whatsapp', provider: 'official', whatsapp_number_id: caixaId,
      contact_name: `${PREFIXO} Dobro ${marca}`, contact_phone: `5548955${sufixo.slice(-6)}`,
      contact_external_id: `5548955${sufixo.slice(-6)}`, contact_aliases: [`5548955${sufixo.slice(-6)}`],
    }).select('id').single<{ id: string }>()
    expect(e1).toBeNull()
    const linha = {
      conversation_id: conv!.id, tenant_id: outra!.tenantId, direction: 'inbound', content: 'Oi',
      channel: 'whatsapp', status: 'delivered', external_id: `wamid.dobro.${marca}`, importada: true, is_read: true,
    }
    expect((await b.from('messages').insert(linha)).error).toBeNull()
    const segunda = await b.from('messages').insert(linha)
    expect(segunda.error?.code, 'a segunda com o mesmo external_id').toBe('23505')
  })

  test('seis entregas simultâneas do mesmo histórico: todas 200, cada mensagem uma vez', async ({ request }) => {
    const velho = Math.floor(new Date('2026-05-08T16:00:00Z').getTime() / 1000)
    const historico = { history: [{ metadata: { phase: 0, chunk_order: 1, progress: 100 }, threads: [{ id: CLIENTE, messages: [
      { from: CLIENTE, id: `wamid.h1.${marca}`, timestamp: String(velho), type: 'text', text: { body: 'Oi, tem horário?' }, history_context: { status: 'READ' } },
      { from: DA_CLINICA, to: CLIENTE, id: `wamid.h2.${marca}`, timestamp: String(velho + 30), type: 'text', text: { body: 'Tem sim.' }, history_context: { status: 'READ' } },
      { from: CLIENTE, id: `wamid.h3.${marca}`, timestamp: String(velho + 60), type: 'text', text: { body: 'Às 10h?' }, history_context: { status: 'READ' } },
    ] }] }] }

    const respostas = await Promise.all(Array.from({ length: 6 }, () => entregar(request, historico)))
    for (const r of respostas) expect(r.status, r.texto).toBe(200)

    const contar = async () => {
      const { data } = await db().from('messages').select('external_id, conversation_id')
        .eq('tenant_id', outra!.tenantId).like('external_id', `wamid.h_.${marca}`)
      return (data ?? []).map(m => m.external_id as string).sort()
    }
    expect(await contar()).toEqual([`wamid.h1.${marca}`, `wamid.h2.${marca}`, `wamid.h3.${marca}`])

    const depois = await entregar(request, historico)
    expect(depois.status, depois.texto).toBe(200)
    expect(await contar()).toHaveLength(3)
  })
})
