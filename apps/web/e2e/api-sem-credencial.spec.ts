import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro } from './apoio/sessao'
import { ARQUIVO_DE_SESSAO } from '../playwright.config'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/**
 * As rotas de `/api/*` são PÚBLICAS no proxy (`lib/supabase/middleware.ts`):
 * ninguém é mandado para o login. Cada uma se defende sozinha — cron pelo
 * `CRON_SECRET`, webhook pela assinatura ou token do provedor, e o resto pela
 * sessão. Aqui se confere que cada defesa
 * existe, porque uma rota nova que esqueça a dela não dá erro nenhum: ela
 * simplesmente atende quem chegar.
 *
 * Achados desta varredura (2026-09-27), corrigidos junto:
 * - `/api/geocode` não conferia sessão: era proxy aberto para o Nominatim,
 *   que bane o IP do servidor acima de 1 consulta/s.
 * - o OAuth da Meta não conferia permissão: qualquer membro logado trocava a
 *   conta Meta da rede pela dele e deixava a integração inativa.
 */

const CRONS = ['automacoes', 'estoque-minimo', 'eventos-expirados', 'fidelidade-expiracao', 'lgpd-exports', 'meta-capi', 'notification-campaigns']

// Sem sessão nenhuma: o `storageState` padrão do projeto é o do admin.
test.use({ storageState: { cookies: [], origins: [] } })

test('crons recusam sem o CRON_SECRET e com um segredo errado', async ({ request }) => {
  for (const job of CRONS) {
    const sem = await request.get(`/api/cron/${job}`)
    expect(sem.status(), `${job} sem cabeçalho`).toBe(401)
    const errado = await request.get(`/api/cron/${job}`, { headers: { authorization: 'Bearer nao-e-o-segredo' } })
    expect(errado.status(), `${job} com segredo errado`).toBe(401)
  }
})

test('geocode exige sessão', async ({ request, browser }) => {
  const anonimo = await request.post('/api/geocode', { data: { cities: [], ceps: [] } })
  expect(anonimo.status()).toBe(401)

  // Controle: o admin logado é atendido (listas vazias não saem para fora).
  const ctx = await browser.newContext({ storageState: ARQUIVO_DE_SESSAO })
  try {
    const logado = await ctx.request.post('/api/geocode', { data: { cities: [], ceps: [] } })
    expect(logado.status()).toBe(200)
    const grande = await ctx.request.post('/api/geocode', { data: { cities: [], ceps: Array.from({ length: 2001 }, (_, i) => String(i)) } })
    expect(grande.status(), 'acima do teto').toBe(413)
  } finally {
    await ctx.close()
  }
})

test('OAuth da Meta: sem sessão e sem permissão de configurações não começa nem grava', async ({ request, browser }) => {
  const inicio = await request.get('/api/oauth/meta?produto=mensagens', { maxRedirects: 0 })
  expect([401, 500], 'sem sessão (500 só se o META_APP_ID faltar no ambiente)').toContain(inicio.status())

  const semConfig = await criarMembro(`oauth${Date.now().toString(36)}`, { rotulo: 'Sem configurações', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })
  const ctx = await browser.newContext({ storageState: semConfig.estado })
  try {
    const r = await ctx.request.get('/api/oauth/meta?produto=mensagens', { maxRedirects: 0 })
    expect([403, 500]).toContain(r.status())

    // O callback é quem GRAVA: mesmo com o state certo no cookie, sem a
    // permissão ele volta com erro antes de trocar o código.
    await ctx.addCookies([{ name: 'meta_oauth_state', value: 'estado-e2e', url: BASE }])
    const cb = await ctx.request.get('/api/oauth/meta/callback?code=x&state=estado-e2e', { maxRedirects: 0 })
    expect(cb.status()).toBe(307)
    expect(cb.headers()['location']).toContain('meta_error_reason=sem_permissao')
  } finally {
    await ctx.close()
    await semConfig.limpar()
  }

  // Controle: o admin começa a conexão normalmente (vai para o Facebook).
  const admin = await browser.newContext({ storageState: ARQUIVO_DE_SESSAO })
  try {
    const r = await admin.request.get('/api/oauth/meta?produto=ads', { maxRedirects: 0 })
    if (r.status() !== 500) {
      expect(r.status()).toBe(307)
      expect(r.headers()['location']).toContain('facebook.com')
    }
  } finally {
    await admin.close()
  }
})

test('webhooks: token, verify token e assinatura errados não entram', async ({ request }) => {
  // uazapi: token desconhecido responde 200 (de propósito, para a uazapi não
  // desligar o webhook) e não processa nada.
  const uaz = await request.post('/api/webhooks/uazapi', { data: { token: 'token-que-nao-existe', message: { text: 'oi' } } })
  expect(uaz.status()).toBe(200)

  // Meta (Messenger/Instagram): handshake e entrega.
  const hand = await request.get('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123')
  expect(hand.status()).toBe(403)
  const meta = await request.post('/api/webhooks/meta', { data: { object: 'page', entry: [] }, headers: { 'x-hub-signature-256': 'sha256=00' } })
  expect(meta.status()).toBe(401)
  const metaSem = await request.post('/api/webhooks/meta', { data: { object: 'page', entry: [] } })
  expect(metaSem.status()).toBe(401)
})

test.describe('webhook oficial do WhatsApp confere a assinatura com o segredo DA CAIXA', () => {
  let caixa: string | null = null
  const marca = Date.now().toString(36)
  const phoneNumberId = `e2e${Date.now()}`
  const segredo = `segredo-${marca}`
  const telefone = '5548' + String(Date.now()).slice(-9)

  test.beforeAll(async () => {
    const { data, error } = await banco().from('whatsapp_numbers').insert({
      tenant_id: await tenantId(), provider: 'official', label: `${PREFIXO} Oficial assinatura ${marca}`,
      is_active: true, phone_number_id: phoneNumberId,
      config: { provider: 'official', phoneNumberId, accessToken: 'x', verifyToken: 'x', appSecret: segredo, baseUrl: 'https://e2e.invalido' },
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    caixa = data!.id
  })

  test.afterAll(async () => {
    const db = banco()
    if (!caixa) return
    const { data } = await db.from('conversations').select('id').eq('whatsapp_number_id', caixa)
    await apagarConversas((data ?? []).map(c => c.id as string))
    await db.from('whatsapp_numbers').delete().eq('id', caixa)
  })

  test('assinatura errada: 401 e nenhuma conversa; certa: a mensagem entra', async ({ request }) => {
    const corpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: phoneNumberId },
        contacts: [{ wa_id: telefone, profile: { name: `${PREFIXO} Remetente ${marca}` } }],
        messages: [{ id: `wamid.e2e.${marca}`, from: telefone, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'oi' } }],
      } }] }],
    })
    const conversas = async () =>
      (await banco().from('conversations').select('id').eq('whatsapp_number_id', caixa!)).data?.length ?? 0

    const outroSegredo = `sha256=${createHmac('sha256', 'outro-segredo').update(corpo).digest('hex')}`
    const errada = await request.post('/api/webhooks/whatsapp', { data: corpo, headers: { 'content-type': 'application/json', 'x-hub-signature-256': outroSegredo } })
    expect(errada.status()).toBe(401)
    const semAssinatura = await request.post('/api/webhooks/whatsapp', { data: corpo, headers: { 'content-type': 'application/json' } })
    expect(semAssinatura.status()).toBe(401)
    expect(await conversas(), 'nada entrou').toBe(0)

    // Controle: com o segredo da caixa, a mesma entrega vira conversa.
    const certa = `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`
    const ok = await request.post('/api/webhooks/whatsapp', { data: corpo, headers: { 'content-type': 'application/json', 'x-hub-signature-256': certa } })
    expect(ok.status()).toBe(200)
    await expect.poll(conversas, { message: 'a entrega assinada entra' }).toBe(1)
  })
})
