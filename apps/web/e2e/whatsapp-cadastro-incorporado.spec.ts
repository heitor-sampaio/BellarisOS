import { test, expect, type Page, type Browser } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { banco, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirGraphFalsa, type GraphFalsa } from './apoio/graph-falsa'

/**
 * O cadastro incorporado da Meta (Embedded Signup) e a coexistência.
 *
 * A janela da Meta não se simula: o teste parte do que ela devolve ao
 * navegador (o código e os ids da conta e do número) e chama a action como a
 * tela chamaria. A Graph é a falsa, numa porta FIXA: o servidor do build lê
 * `META_GRAPH_BASE_TESTE` ao subir (playwright.build.config.ts e o workflow).
 * Contra o `next dev` não há como apontá-lo para cá, e o teste se pula.
 *
 * Prova:
 *  - coexistência conecta sem registrar o número e pede contatos e histórico;
 *    Cloud API registra com PIN; número fora da conta autorizada é recusado;
 *    sem `settings: MANAGE`, nada;
 *  - a tela não recebe o token, e o formulário manual não apaga a credencial;
 *  - o webhook da coexistência: a agenda dá nome à pessoa, o histórico entra
 *    IMPORTADO (lido, sem reordenar a conversa, sem evento), a mensagem enviada
 *    pelo celular entra como saída, e nada se duplica na reentrega.
 */

const PORTA = 3199
const marca = Date.now().toString(36)
const sufixo = String(Date.now()).slice(-7)
const WABA = `9${sufixo}01`
const FONE_ID = `8${sufixo}01`
const WABA_CLOUD = `9${sufixo}02`
const FONE_ID_CLOUD = `8${sufixo}02`
const DA_CLINICA = `5548999${sufixo.slice(-6)}`
const CLIENTE = `5548988${sufixo.slice(-6)}`
const TOKEN = `tok-negocio-${marca}`

const db = () => banco()

interface Fx { graph: GraphFalsa; outra: OutraRede; config: MembroDeTeste; leitor: MembroDeTeste }
let f: Fx | null = null

test.skip(!process.env.META_GRAPH_BASE_TESTE, 'só contra o build: o servidor precisa subir com META_GRAPH_BASE_TESTE')

test.beforeAll(async () => {
  const graph = await subirGraphFalsa(PORTA)
  graph.responder('/oauth/access_token', { access_token: TOKEN })
  graph.responder(`/${WABA}/phone_numbers`, { data: [{ id: FONE_ID, display_phone_number: `+${DA_CLINICA}`, verified_name: `Clínica ${marca}` }] })
  graph.responder(`/${WABA_CLOUD}/phone_numbers`, { data: [{ id: FONE_ID_CLOUD, display_phone_number: '+5548911110000', verified_name: `Cloud ${marca}` }] })
  const outra = await criarOutraRede(`es${marca}`)
  f = {
    graph, outra,
    config: await criarMembro(`escfg${marca}`, {
      tenant: outra.tenantId, rotulo: 'Config WhatsApp',
      permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
    }),
    leitor: await criarMembro(`esleitor${marca}`, {
      tenant: outra.tenantId, rotulo: 'Sem configurações',
      permissoes: [{ modulo: 'crm', nivel: 'VIEW' }],
    }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const { data: convs } = await b.from('conversations').select('id').eq('tenant_id', f.outra.tenantId)
  await apagarConversas((convs ?? []).map(c => c.id as string))
  olhar('pessoas', await b.from('contacts').delete().eq('tenant_id', f.outra.tenantId))
  olhar('caixas', await b.from('whatsapp_numbers').delete().eq('tenant_id', f.outra.tenantId))
  olhar('eventos', await b.from('domain_events').delete().eq('tenant_id', f.outra.tenantId))
  await f.config.limpar()
  await f.leitor.limpar()
  await f.outra.limpar()
  await f.graph.fechar()
  expect(falhas).toEqual([])
})

async function como<T>(browser: Browser, quem: 'config' | 'leitor', fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: f![quem].estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const conectar = (p: Page, pedido: Record<string, unknown>) =>
  chamarAcao(p, 'actions/integrations.ts', 'conectarWhatsAppPelaMeta', '/admin/settings', [pedido])

const caixa = async (foneId: string) =>
  (await db().from('whatsapp_numbers').select('id, config, is_active, is_default, label, waba_id')
    .eq('tenant_id', f!.outra.tenantId).eq('phone_number_id', foneId).maybeSingle()).data

/** Entrega assinada com o segredo do app, como a Meta faz. */
async function entregar(p: Page, campo: string, valor: Record<string, unknown>) {
  const corpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: WABA, changes: [{ field: campo, value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: DA_CLINICA, phone_number_id: FONE_ID },
      ...valor,
    } }] }],
  })
  const assinatura = `sha256=${createHmac('sha256', process.env.META_APP_SECRET!).update(corpo).digest('hex')}`
  const r = await p.request.post('/api/webhooks/whatsapp', {
    data: corpo, headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinatura },
  })
  expect(r.status(), await r.text()).toBe(200)
}

test.describe.serial('WhatsApp pelo cadastro incorporado da Meta', () => {
  test('sem permissão de configurações, nada conecta', async ({ browser }) => {
    await como(browser, 'leitor', async p => {
      await conectar(p, { code: 'cod', wabaId: WABA, phoneNumberId: FONE_ID, modo: 'coexistencia' }).catch(() => null)
    })
    expect(await caixa(FONE_ID), 'nenhuma caixa').toBeNull()
    expect(f!.graph.terminadasEm('/subscribed_apps'), 'a Meta não foi chamada').toHaveLength(0)
  })

  test('número fora da conta autorizada é recusado', async ({ browser }) => {
    const r = await como(browser, 'config', p =>
      conectar(p, { code: 'cod', wabaId: WABA, phoneNumberId: '123', modo: 'coexistencia' }))
    expect(r.texto).toContain('não pertence à conta')
    expect(await caixa('123')).toBeNull()
  })

  test('coexistência: conecta sem registrar, inscreve o webhook e pede contatos e histórico', async ({ browser }) => {
    const r = await como(browser, 'config', p =>
      conectar(p, { code: 'cod-coex', wabaId: WABA, phoneNumberId: FONE_ID, businessId: '777', modo: 'coexistencia' }))
    expect(r.texto).toContain('numeroId')

    const linha = await caixa(FONE_ID)
    expect(linha?.is_active).toBe(true)
    expect(linha?.is_default, 'a rede não tinha padrão').toBe(true)
    expect(linha?.waba_id).toBe(WABA)
    expect(linha?.label).toContain(`Clínica ${marca}`)
    expect(linha?.config).toMatchObject({
      provider: 'official', conexao: 'cadastro_incorporado', modo: 'coexistencia',
      accessToken: TOKEN, wabaId: WABA, phoneNumberId: FONE_ID, businessId: '777',
    })
    expect((linha?.config as Record<string, unknown>).appSecret, 'sem segredo próprio').toBeUndefined()

    const troca = f!.graph.terminadasEm('/oauth/access_token').at(-1)
    expect(troca?.corpo).toMatchObject({ code: 'cod-coex' })
    expect(f!.graph.terminadasEm(`/${WABA}/subscribed_apps`)).toHaveLength(1)
    expect(f!.graph.terminadasEm(`/${FONE_ID}/register`), 'coexistência não registra').toHaveLength(0)
    const syncs = f!.graph.terminadasEm(`/${FONE_ID}/smb_app_data`).map(c => c.corpo.sync_type)
    expect(syncs).toEqual(['smb_app_state_sync', 'history'])
  })

  test('Cloud API: registra o número com um PIN de 6 dígitos', async ({ browser }) => {
    await como(browser, 'config', p =>
      conectar(p, { code: 'cod-cloud', wabaId: WABA_CLOUD, phoneNumberId: FONE_ID_CLOUD, modo: 'cloud_api' }))
    const linha = await caixa(FONE_ID_CLOUD)
    expect(linha?.is_active).toBe(true)
    expect(linha?.is_default, 'o padrão continua o primeiro').toBe(false)
    const pin = (linha?.config as Record<string, string>).pin
    expect(pin).toMatch(/^\d{6}$/)
    const registro = f!.graph.terminadasEm(`/${FONE_ID_CLOUD}/register`)
    expect(registro).toHaveLength(1)
    expect(registro[0]!.corpo).toEqual({ messaging_product: 'whatsapp', pin })
    expect(f!.graph.terminadasEm(`/${FONE_ID_CLOUD}/smb_app_data`)).toHaveLength(0)
  })

  test('a tela não recebe o token, e o formulário manual não apaga a credencial', async ({ browser }) => {
    await como(browser, 'config', async p => {
      const lista = await chamarAcao(p, 'actions/integrations.ts', 'listarNumerosWhatsApp', '/admin/settings', [])
      expect(lista.texto).toContain(FONE_ID)
      expect(lista.texto).not.toContain(TOKEN)

      const id = (await caixa(FONE_ID))!.id as string
      await chamarAcao(p, 'actions/integrations.ts', 'salvarNumeroWhatsApp', '/admin/settings',
        [id, 'official', { phoneNumberId: FONE_ID, accessToken: 'outro' }, false])
      const depois = await caixa(FONE_ID)
      expect(depois?.is_active, 'desligar vale').toBe(false)
      expect((depois?.config as Record<string, string>).accessToken, 'o token da Meta fica').toBe(TOKEN)
      await chamarAcao(p, 'actions/integrations.ts', 'salvarNumeroWhatsApp', '/admin/settings', [id, 'official', {}, true])
      expect((await caixa(FONE_ID))?.is_active).toBe(true)
    })
  })

  test('webhook da coexistência: agenda, histórico importado e mensagem do celular', async ({ page }) => {
    // 1. A agenda do aparelho dá nome à pessoa.
    await entregar(page, 'smb_app_state_sync', {
      state_sync: [{ type: 'contact', action: 'add', contact: { full_name: `Maria Agenda ${marca}`, first_name: 'Maria', phone_number: CLIENTE } }],
    })
    const pessoa = async () => (await db().from('contacts').select('id, name')
      .eq('tenant_id', f!.outra.tenantId).overlaps('identifiers', [CLIENTE]).maybeSingle()).data
    expect((await pessoa())?.name).toBe(`Maria Agenda ${marca}`)

    // 2. O histórico: meses atrás, um de cada lado.
    const velho = Math.floor(new Date('2026-03-10T12:00:00Z').getTime() / 1000)
    const historico = { history: [{ metadata: { phase: 0, chunk_order: 1, progress: 100 }, threads: [{ id: CLIENTE, messages: [
      { from: CLIENTE, id: `wamid.hist1.${marca}`, timestamp: String(velho), type: 'text', text: { body: 'Oi, tem horário?' }, history_context: { status: 'READ' } },
      { from: DA_CLINICA, to: CLIENTE, id: `wamid.hist2.${marca}`, timestamp: String(velho + 60), type: 'text', text: { body: 'Tem sim, às 10h.' }, history_context: { status: 'READ' } },
    ] }] }] }
    await entregar(page, 'history', historico)

    const conversa = async () => (await db().from('conversations')
      .select('id, unread_count, last_message, contato_id, awaiting_since')
      .eq('tenant_id', f!.outra.tenantId).overlaps('contact_aliases', [CLIENTE]).maybeSingle()).data
    const c = await conversa()
    expect(c, 'a conversa nasceu').not.toBeNull()
    expect(c!.contato_id, 'ligada à pessoa da agenda').toBe((await pessoa())!.id)
    expect(c!.unread_count, 'histórico não é não lido').toBe(0)
    expect(c!.awaiting_since, 'nem cliente aguardando').toBeNull()

    const mensagens = async () => (await db().from('messages')
      .select('external_id, direction, importada, is_read, content')
      .eq('conversation_id', c!.id).order('created_at')).data ?? []
    expect(await mensagens()).toEqual([
      { external_id: `wamid.hist1.${marca}`, direction: 'inbound',  importada: true, is_read: true, content: 'Oi, tem horário?' },
      { external_id: `wamid.hist2.${marca}`, direction: 'outbound', importada: true, is_read: true, content: 'Tem sim, às 10h.' },
    ])
    const eventos = (await db().from('domain_events').select('nome')
      .eq('tenant_id', f!.outra.tenantId).eq('entidade_id', c!.id)).data ?? []
    expect(eventos, 'importar não dispara automação').toEqual([])

    // 3. A clínica responde pelo celular, agora.
    const agora = Math.floor(Date.now() / 1000)
    await entregar(page, 'smb_message_echoes', {
      message_echoes: [{ from: DA_CLINICA, to: CLIENTE, id: `wamid.eco.${marca}`, timestamp: String(agora), type: 'text', text: { body: 'Confirmado!' } }],
    })
    const depois = await mensagens()
    expect(depois.at(-1)).toEqual({ external_id: `wamid.eco.${marca}`, direction: 'outbound', importada: false, is_read: true, content: 'Confirmado!' })
    expect((await conversa())!.last_message, 'a do celular é a última').toBe('Confirmado!')

    // 4. Um pedaço do histórico que chega DEPOIS, mais velho, não reordena a conversa;
    //    e a reentrega não duplica nada.
    await entregar(page, 'history', historico)
    expect(await mensagens()).toHaveLength(3)
    expect((await conversa())!.last_message).toBe('Confirmado!')
  })
})
