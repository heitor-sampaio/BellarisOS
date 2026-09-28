import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirGraphFalsa, type GraphFalsa } from './apoio/graph-falsa'
import { subirUazapiFalsa, type UazapiFalsa } from './apoio/uazapi-falsa'

/**
 * O que faltava da P5: template, mídia, entrada pelo Instagram e os crons
 * `eventos-expirados` e `meta-capi`. Tudo contra servidores falsos em
 * 127.0.0.1 — nada sai para a Meta nem para a uazapi, e nada chega a ninguém.
 *
 * Achados corrigidos junto:
 *  - template e mídia gravavam a mensagem SEM a caixa que enviou (§9.8.0), e a
 *    conversa sem caixa nunca adquiria a sua;
 *  - `reenviarEventosPendentes` engolia o erro da fila (cron verde sem enviar);
 *  - `getTenantPorPagina` engolia o erro do banco (a mensagem era descartada).
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx {
  graph: GraphFalsa; uazapi: UazapiFalsa; sdr: MembroDeTeste; config: MembroDeTeste; outra: OutraRede
  oficial: string; phoneNumberId: string; waba: string; convOficial: string; telOficial: string
  tplOk: string; tplOutraWaba: string; tplRascunho: string; tplPosicional: string
  caixaUazapi: string; convUazapi: string; telUazapi: string
}
let f: Fx | null = null

test.beforeAll(async () => {
  const b = db()
  const tenant = await tenantId()
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const graph = await subirGraphFalsa()
  const uazapi = await subirUazapiFalsa()
  const phoneNumberId = `e2e${Date.now()}`
  const waba = `waba-e2e-${marca}`
  const agora = new Date().toISOString()
  const oficial = await ins('whatsapp_numbers', {
    tenant_id: tenant, provider: 'official', label: `${PREFIXO} Oficial meta ${marca}`, is_active: true,
    phone_number_id: phoneNumberId, waba_id: waba,
    config: { provider: 'official', phoneNumberId, wabaId: waba, accessToken: 'x', verifyToken: 'x', appSecret: 'x', graphBase: graph.url },
  })
  const telOficial = '5548' + String(Date.now()).slice(-9)
  const convOficial = await ins('conversations', {
    tenant_id: tenant, status: 'open', channel: 'whatsapp', provider: 'official', whatsapp_number_id: oficial,
    contact_name: `${PREFIXO} Template ${marca}`, contact_phone: telOficial, contact_external_id: telOficial,
    contact_aliases: [telOficial], last_message_at: agora,
  })
  const tpl = (nome: string, extra: Record<string, unknown>) => ins('message_templates', {
    tenant_id: tenant, name: `e2e_${nome}_${marca}`, language: 'pt_BR', status: 'APPROVED',
    body_text: 'Olá {{nome}}, seu horário está confirmado.', waba_id: waba, ...extra,
  })
  const caixaUazapi = await ins('whatsapp_numbers', {
    tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Mídia ${marca}`, is_active: true,
    config: { token: `e2e-midia-${marca}`, baseUrl: uazapi.url },
  })
  const telUazapi = '5548' + String(Date.now() + 5).slice(-9)
  const convUazapi = await ins('conversations', {
    tenant_id: tenant, status: 'open', channel: 'whatsapp', provider: 'uazapi', whatsapp_number_id: caixaUazapi,
    contact_name: `${PREFIXO} Mídia ${marca}`, contact_phone: telUazapi, contact_external_id: telUazapi,
    contact_aliases: [telUazapi], last_message_at: agora, last_inbound_at: agora,
  })
  f = {
    graph, uazapi, outra: await criarOutraRede(`meta${marca}`),
    // SDR sem número próprio: sai pela caixa DA CONVERSA — a do teste.
    sdr: await criarMembro(`meta${marca}`, { rotulo: 'SDR meta', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] }),
    config: await criarMembro(`metacfg${marca}`, { rotulo: 'Config meta', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] }),
    oficial, phoneNumberId, waba, convOficial, telOficial,
    tplOk: await tpl('ok', {}),
    tplOutraWaba: await tpl('outra', { waba_id: `waba-alheia-${marca}` }),
    tplRascunho: await tpl('rascunho', { status: 'DRAFT' }),
    // Formato POSICIONAL da Meta: o sistema não o preenche — não pode sair com as chaves.
    tplPosicional: await tpl('posicional', { body_text: 'Olá {{1}}, tudo certo?' }),
    caixaUazapi, convUazapi, telUazapi,
  }
})

test.afterAll(async () => {
  if (!f) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const { data: midias } = await b.from('messages').select('media_path').eq('conversation_id', f.convUazapi).not('media_path', 'is', null)
  const caminhos = (midias ?? []).map(m => m.media_path as string)
  if (caminhos.length) olhar('mídia', await b.storage.from('inbox-media').remove(caminhos))
  const { data: convsDaOutra } = await b.from('conversations').select('id').eq('tenant_id', f.outra.tenantId)
  await apagarConversas([f.convOficial, f.convUazapi, ...(convsDaOutra ?? []).map(c => c.id as string)])
  olhar('templates', await b.from('message_templates').delete().in('id', [f.tplOk, f.tplOutraWaba, f.tplRascunho, f.tplPosicional]))
  olhar('caixas', await b.from('whatsapp_numbers').delete().in('id', [f.oficial, f.caixaUazapi]))
  olhar('caixas da config', await b.from('whatsapp_numbers').delete().like('label', `${PREFIXO} Config ${marca}%`))
  olhar('capi', await b.from('meta_capi_events').delete().eq('tenant_id', f.outra.tenantId))
  olhar('eventos', await b.from('domain_events').delete().eq('tenant_id', f.outra.tenantId))
  olhar('integrações', await b.from('integration_configs').delete().eq('tenant_id', f.outra.tenantId))
  await f.sdr.limpar()
  await f.config.limpar()
  await f.outra.limpar()
  await f.graph.fechar()
  await f.uazapi.fechar()
  expect(falhas).toEqual([])
})

const mensagensDe = async (conv: string) =>
  (await db().from('messages').select('id, content, status, external_id, template_id, whatsapp_number_id, media_type, media_path')
    .eq('conversation_id', conv).eq('direction', 'outbound')).data ?? []

test.describe.serial('mensagens pela Meta e crons', () => {
  test('template: recusa rascunho, outra conta, variável faltando e formato posicional; o certo sai pela Graph', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.sdr.estado })
    const page = await ctx.newPage()
    const enviar = (tpl: string, valores: Record<string, string>) =>
      chamarAcao(page, 'actions/inbox.ts', 'sendTemplateMessage', '/admin/inbox', [f!.convOficial, tpl, valores])
    try {
      await enviar(f!.tplRascunho, { nome: 'Ana' })
      await enviar(f!.tplOutraWaba, { nome: 'Ana' })
      await enviar(f!.tplOk, {})
      await enviar(f!.tplPosicional, { 1: 'Ana' })
      expect(await mensagensDe(f!.convOficial), 'nada gravado nas recusas').toHaveLength(0)
      expect(f!.graph.terminadasEm('/messages'), 'nada saiu nas recusas').toHaveLength(0)

      await enviar(f!.tplOk, { nome: 'Ana' })
    } finally {
      await ctx.close()
    }
    const [enviada] = f!.graph.terminadasEm('/messages')
    expect(enviada!.caminho).toBe(`/${f!.phoneNumberId}/messages`)
    expect(enviada!.corpo).toMatchObject({
      to: f!.telOficial, type: 'template',
      template: { name: `e2e_ok_${marca}`, language: { code: 'pt_BR' },
        components: [{ type: 'body', parameters: [{ type: 'text', parameter_name: 'nome', text: 'Ana' }] }] },
    })
    const [msg] = await mensagensDe(f!.convOficial)
    expect(msg).toMatchObject({
      status: 'sent', external_id: 'wamid.falsa-1', template_id: f!.tplOk,
      content: 'Olá Ana, seu horário está confirmado.',
      whatsapp_number_id: f!.oficial,   // gravava nulo
    })
  })

  test('mídia pela tela: o arquivo sobe, sai pela caixa da conversa e fica no histórico', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.sdr.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/admin/inbox?c=${f!.convUazapi}`)
      // PNG 1×1 — o menor arquivo de imagem válido.
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
      await page.locator('input[type="file"]').first().setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png })
      await page.locator('button', { hasText: 'Enviar' }).last().click()
      await expect.poll(() => f!.uazapi.para('/send/media').length, { message: 'saiu para o provedor' }).toBe(1)
    } finally {
      await ctx.close()
    }
    const [saida] = f!.uazapi.para('/send/media')
    expect(saida!.token).toBe(`e2e-midia-${marca}`)
    expect(saida!.corpo).toMatchObject({ number: f!.telUazapi, type: 'image' })
    expect(String(saida!.corpo.file), 'o provedor recebe um link assinado do bucket').toContain('/storage/v1/object/sign/inbox-media/')

    const [msg] = await mensagensDe(f!.convUazapi)
    expect(msg).toMatchObject({ status: 'sent', media_type: 'image', whatsapp_number_id: f!.caixaUazapi })
    expect(msg!.media_path).toBeTruthy()
  })

  test('Instagram: a entrega assinada vira conversa na rede da página; o eco não entra', async ({ request }) => {
    const segredo = process.env.META_APP_SECRET
    test.skip(!segredo, 'META_APP_SECRET não está no .env.local')
    const igUserId = `ig-e2e-${marca}`
    const { error } = await db().from('integration_configs').insert({
      tenant_id: f!.outra.tenantId, provider: 'meta_messaging', is_active: true,
      config: { pages: [{ pageId: `pg-e2e-${marca}`, pageName: `${PREFIXO} Página`, pageToken: 'x', igUserId }], activePageId: `pg-e2e-${marca}` },
    })
    expect(error).toBeNull()

    const entregar = (mid: string, texto: string, eco = false) => {
      const corpo = JSON.stringify({ object: 'instagram', entry: [{ id: igUserId, time: Date.now(), messaging: [{
        sender: { id: `IGSID-${marca}` }, recipient: { id: igUserId }, timestamp: Date.now(),
        message: { mid, text: texto, ...(eco ? { is_echo: true } : {}) },
      }] }] })
      const assinatura = `sha256=${createHmac('sha256', segredo!).update(corpo).digest('hex')}`
      return request.post('/api/webhooks/meta', { data: corpo, headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinatura } })
    }
    expect((await entregar(`mid.e2e.${marca}.1`, 'oi pelo direct')).status()).toBe(200)
    expect((await entregar(`mid.e2e.${marca}.2`, 'nossa resposta', true)).status()).toBe(200)

    const conversa = async () => (await db().from('conversations').select('id, channel, contact_external_id')
      .eq('tenant_id', f!.outra.tenantId).eq('contact_external_id', `IGSID-${marca}`)).data ?? []
    await expect.poll(async () => (await conversa()).length, { message: 'a conversa nasce na rede da página' }).toBe(1)
    const [c] = await conversa()
    expect(c!.channel).toBe('instagram')
    const { data: msgs } = await db().from('messages').select('content, direction').eq('conversation_id', c!.id)
    expect(msgs).toEqual([{ content: 'oi pelo direct', direction: 'inbound' }])
  })

  test('caixa pela tela: endereço interno é recusado e chave fora da lista não é gravada', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.config.estado })
    const page = await ctx.newPage()
    const salvar = (sufixo: string, config: Record<string, string>) =>
      chamarAcao(page, 'actions/integrations.ts', 'salvarNumeroWhatsApp', '/admin/settings',
        // Inativa: ativar emitiria "integração conectada" na corrente da rede.
        [null, 'uazapi', config, false, { rotulo: `${PREFIXO} Config ${marca} ${sufixo}` }])
    const caixas = async () => (await db().from('whatsapp_numbers').select('label, config')
      .like('label', `${PREFIXO} Config ${marca}%`)).data ?? []
    try {
      // O servidor faz a chamada para esse endereço: aceitar um interno é dar à
      // clínica um jeito de o app falar com a rede de dentro (SSRF).
      await salvar('local', { token: `e2e-cfg-${marca}`, baseUrl: 'http://127.0.0.1:9' })
      await salvar('privado', { token: `e2e-cfg-${marca}`, baseUrl: 'https://10.0.0.1' })
      await salvar('metadados', { token: `e2e-cfg-${marca}`, baseUrl: 'https://169.254.169.254' })
      expect(await caixas(), 'nenhuma caixa com endereço interno').toEqual([])

      await salvar('ok', { token: `e2e-cfg-${marca}`, baseUrl: 'https://e2e.invalido', graphBase: 'http://127.0.0.1:1', provider: 'official' })
    } finally {
      await ctx.close()
    }
    expect(await caixas(), 'só token e baseUrl entram').toEqual([
      { label: `${PREFIXO} Config ${marca} ok`, config: { token: `e2e-cfg-${marca}`, baseUrl: 'https://e2e.invalido' } },
    ])
  })

  test('cron eventos-expirados: o fato de 31 dias sai, o de hoje fica', async ({ request }) => {
    const segredo = process.env.CRON_SECRET
    test.skip(!segredo, 'CRON_SECRET não está no .env.local')
    const fato = (quando: Date) => db().from('domain_events').insert({
      tenant_id: f!.outra.tenantId, nome: 'cliente.criado', entidade: 'cliente', ocorrido_em: quando.toISOString(),
      dados: { marca },
    }).select('id').single<{ id: string }>()
    const velho = (await fato(new Date(Date.now() - 31 * 86_400_000))).data!.id
    const novo  = (await fato(new Date())).data!.id

    const r = await request.get('/api/cron/eventos-expirados', { headers: { authorization: `Bearer ${segredo}` } })
    expect(r.status()).toBe(200)
    const restam = ((await db().from('domain_events').select('id').in('id', [velho, novo])).data ?? []).map(x => x.id)
    expect(restam).toEqual([novo])
  })

  test('cron meta-capi: envia com click id, descarta o velho e o sem click id', async ({ request }) => {
    const segredo = process.env.CRON_SECRET
    test.skip(!segredo, 'CRON_SECRET não está no .env.local')
    const pixel = `px-e2e-${marca}`
    const { error } = await db().from('integration_configs').insert({
      tenant_id: f!.outra.tenantId, provider: 'meta_ads', is_active: true,
      config: { accessToken: `tok-${marca}`, pixelId: pixel, adAccountId: '1', graphBase: f!.graph.url },
    })
    expect(error).toBeNull()
    const evento = async (nome: string, extra: Record<string, unknown>) => (await db().from('meta_capi_events').insert({
      tenant_id: f!.outra.tenantId, event_id: `e2e-${nome}-${marca}`, event_name: 'Purchase', valor: 150, ...extra,
    }).select('id').single<{ id: string }>()).data!.id
    const bom     = await evento('bom', { ctwa_clid: `clid-${marca}` })
    const velho   = await evento('velho', { ctwa_clid: `clid-${marca}`, ocorrido_em: new Date(Date.now() - 8 * 86_400_000).toISOString() })
    const semClid = await evento('semclid', {})

    const r = await request.get('/api/cron/meta-capi', { headers: { authorization: `Bearer ${segredo}` } })
    expect(r.status()).toBe(200)

    const status = async (id: string) => (await db().from('meta_capi_events').select('status, erro').eq('id', id).single()).data
    expect(await status(bom)).toMatchObject({ status: 'enviado', erro: null })
    expect((await status(velho))!.status).toBe('descartado')
    expect(await status(semClid)).toMatchObject({ status: 'descartado', erro: 'sem ctwa_clid' })

    const enviadas = f!.graph.terminadasEm(`/${pixel}/events`)
    expect(enviadas, 'um envio só: o do evento bom').toHaveLength(1)
    expect(enviadas[0]!.corpo).toMatchObject({ access_token: `tok-${marca}` })
    expect(JSON.stringify(enviadas[0]!.corpo)).toContain(`e2e-bom-${marca}`)
  })
})
