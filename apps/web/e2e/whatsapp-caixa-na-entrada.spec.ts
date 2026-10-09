import { test, expect } from '@playwright/test'
import { banco, apagarConversas, tenantId, PREFIXO } from './apoio/banco'

/**
 * A mensagem que entra carrega POR QUAL CAIXA entrou.
 *
 * O webhook sempre soube disso e jogava fora: ele lia o token (uazapi) ou o
 * `metadata.phone_number_id` (Cloud API), descobria a REDE por ele, e então
 * recarregava "a config da rede" — caindo em qualquer linha ativa que vencesse
 * o desempate `updated_at desc`. Com um número por rede isso dava na mesma;
 * com dois, a mensagem entraria na conversa da caixa errada e o HMAC seria
 * conferido com o segredo da caixa errada.
 *
 * Este teste tranca o carimbo, que é o que sustenta o resto: sem
 * `whatsapp_number_id` na conversa e na mensagem, o dedup por caixa, a janela
 * de 24h por caixa e o botão de editar por caixa não têm de onde sair.
 *
 * ⚠️ O caso de DUAS caixas (mesmo telefone entrando por tokens diferentes e
 * virando duas conversas) ainda não cabe aqui: o índice único total
 * `uniq_conversations_tenant_channel_external` continua de pé e recusaria a
 * segunda. Ele só sai quando a fase de dedup por caixa for concluída — e é o
 * único passo irreversível da frente.
 */

const telefone = '5548' + String(Date.now()).slice(-9)
let convId: string | null = null
let caixaCriada: string | null = null

test.afterAll(async () => {
  if (convId) {
    await apagarConversas([convId])
  }
  if (caixaCriada) await banco().from('whatsapp_numbers').delete().eq('id', caixaCriada)
})

test('a conversa e a mensagem nascem carimbadas com a caixa que recebeu', async ({ request }) => {
  const db = banco()

  // A credencial mora em `whatsapp_numbers` — é de lá que o webhook rotea.
  // A caixa é DESTE teste (2026-10-09): a uazapi real da rede de teste saiu
  // quando o Heitor trocou os números dela, e o teste passava a se pular.
  const token = `e2e-entrada-${Date.now().toString(36)}`
  const { data: caixa, error: erroCaixa } = await db.from('whatsapp_numbers').insert({
    tenant_id: await tenantId(), provider: 'uazapi', label: `${PREFIXO} entrada ${token}`,
    is_active: true, config: { token, baseUrl: 'https://e2e.invalido' },
  }).select('id, label, config').single<{ id: string; label: string; config: Record<string, string> }>()
  expect(erroCaixa, 'criar a caixa do teste').toBeNull()
  caixaCriada = caixa!.id

  const res = await request.post('/api/webhooks/uazapi', {
    data: {
      token,
      data: {
        chat: { name: '[e2e] Caixa na entrada', phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: 'Oi, por qual numero eu cheguei?',
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: 'E2ECAIXA_' + Date.now(),
          fromMe: false,
        },
      },
    },
  })
  expect(res.ok()).toBe(true)

  await expect.poll(async () => {
    const { data } = await db.from('conversations')
      .select('id').eq('contact_phone', telefone).maybeSingle()
    convId = (data?.id as string) ?? null
    return convId
  }, { message: 'a conversa deveria nascer' }).not.toBeNull()

  const { data: conv } = await db.from('conversations')
    .select('whatsapp_number_id, branch_id').eq('id', convId!).single()

  expect(conv?.whatsapp_number_id,
    'sem a caixa na conversa, o dedup e a janela de 24h não têm de onde sair',
  ).toBe(caixa!.id)

  // A unidade do número é RÓTULO, não escopo: a conversa segue nascendo na rede
  // e a unidade vira tag depois, como já era a regra.
  expect(conv?.branch_id,
    'o vínculo da caixa com unidade não pode semear a unidade da conversa',
  ).toBeNull()

  await expect.poll(async () => {
    const { data } = await db.from('messages')
      .select('whatsapp_number_id').eq('conversation_id', convId!).limit(1)
    return data?.[0]?.whatsapp_number_id ?? null
  }, {
    message: 'a mensagem também carrega a caixa: ela pode divergir da conversa '
      + 'quando o usuário responde pelo número dele',
  }).toBe(caixa!.id)
})
