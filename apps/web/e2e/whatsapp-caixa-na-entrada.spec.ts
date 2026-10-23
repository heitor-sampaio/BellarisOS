import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { banco, apagarConversas, tenantId, PREFIXO } from './apoio/banco'
import { cifrarSegredos } from '../lib/integracoes/cofre'

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

// Uma caixa que não decifra não derruba as outras (2026-10-23). O webhook acha
// a caixa decifrando o token de TODAS as da uazapi (lib/whatsapp/factory.ts):
// uma linha cifrada com outra chave — a chave colada errada num ambiente —
// fazia a busca inteira lançar, e nenhuma mensagem entrava, de rede nenhuma.
test('uma caixa com credencial que não decifra não derruba a entrada das outras', async ({ request }) => {
  const db = banco()
  const marca = Date.now().toString(36)
  const fone = '5547' + String(Date.now()).slice(-9)
  const estragada = cifrarSegredos({ token: `e2e-estragada-${marca}` }, randomBytes(32)).token
  const token = `e2e-boa-${marca}`
  // A estragada entra ANTES: a varredura passa por ela primeiro.
  const { data: caixas, error } = await db.from('whatsapp_numbers').insert([
    { tenant_id: await tenantId(), provider: 'uazapi', label: `${PREFIXO} estragada ${marca}`, is_active: true, config: { token: estragada, baseUrl: 'https://e2e.invalido' } },
    { tenant_id: await tenantId(), provider: 'uazapi', label: `${PREFIXO} boa ${marca}`, is_active: true, config: { token, baseUrl: 'https://e2e.invalido' } },
  ]).select('id')
  expect(error, 'criar as caixas').toBeNull()
  const ids = (caixas ?? []).map(c => c.id as string)
  let conversa: string | null = null
  try {
    const res = await request.post('/api/webhooks/uazapi', {
      data: { token, data: {
        chat: { name: '[e2e] Caixa boa', phone: fone },
        message: { sender_pn: fone, chatid: `${fone}@s.whatsapp.net`, text: 'chegou?', messageTimestamp: Math.floor(Date.now() / 1000), id: 'E2EBOA_' + marca, fromMe: false },
      } },
    })
    expect(res.status(), 'o webhook não quebra').toBe(200)
    await expect.poll(async () => {
      conversa = ((await db.from('conversations').select('id').eq('contact_phone', fone).maybeSingle()).data?.id as string) ?? null
      return conversa
    }, { message: 'a mensagem da caixa boa entra' }).not.toBeNull()
  } finally {
    if (conversa) await apagarConversas([conversa])
    await db.from('whatsapp_numbers').delete().in('id', ids)
  }
})

// O mesmo no handshake da Cloud API: o webhook confere o `verifyToken` de
// TODAS as caixas oficiais, e uma que não decifra derrubava a verificação.
test('a verificação do webhook oficial passa mesmo com uma caixa que não decifra', async ({ request }) => {
  const db = banco()
  const marca = Date.now().toString(36)
  const verificacao = `e2e-verifica-${marca}`
  const estragada = cifrarSegredos({ verifyToken: `e2e-estragada-${marca}` }, randomBytes(32)).verifyToken
  const { data: caixas, error } = await db.from('whatsapp_numbers').insert([
    { tenant_id: await tenantId(), provider: 'official', label: `${PREFIXO} oficial estragada ${marca}`, is_active: false, config: { verifyToken: estragada } },
    { tenant_id: await tenantId(), provider: 'official', label: `${PREFIXO} oficial boa ${marca}`, is_active: false, config: { verifyToken: verificacao } },
  ]).select('id')
  expect(error, 'criar as caixas').toBeNull()
  try {
    const res = await request.get(`/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${verificacao}&hub.challenge=desafio-${marca}`)
    expect(res.status(), 'a verificação não quebra').toBe(200)
    expect(await res.text()).toBe(`desafio-${marca}`)
  } finally {
    await db.from('whatsapp_numbers').delete().in('id', (caixas ?? []).map(c => c.id as string))
  }
})
