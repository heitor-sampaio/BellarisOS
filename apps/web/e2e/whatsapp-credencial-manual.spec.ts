import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirGraphFalsa, type GraphFalsa } from './apoio/graph-falsa'

/**
 * A API oficial com a credencial colada à mão (o app PRÓPRIO da clínica na
 * Meta) — F7c, achados do Heitor em 2026-11-02:
 *
 *  - o salvar manual não inscrevia a conta (WABA) nos webhooks
 *    (`subscribed_apps`): o número ficava "conectado" e nenhuma mensagem
 *    chegava. Agora o salvar com o número ligado faz a inscrição com o token
 *    informado, e o que der errado vira AVISO na tela;
 *  - o "Testar conexão" testava o número PADRÃO da rede, não o do formulário,
 *    e dizia só "Conectado": o Heitor via o antigo conectado e achava que era
 *    o novo. Agora testa o número da tela e diz qual é (o telefone e o nome
 *    verificado na Meta).
 *
 * Numa rede [e2e] própria, com a Graph falsa (`config.graphBase`, a costura
 * de teste gravada direto no banco).
 */

const marca = Date.now().toString(36)
const sufixo = String(Date.now()).slice(-7)
const FONE_ANTIGO = `5${sufixo}01`
const FONE_NOVO = `5${sufixo}02`
const WABA_NOVO = `4${sufixo}02`
const db = () => banco()

let graph: GraphFalsa | null = null
let rede: OutraRede | null = null
let config: MembroDeTeste | null = null
let antigo = ''
let novo = ''

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: config!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  graph = await subirGraphFalsa()
  graph.responder(`/${FONE_ANTIGO}`, { id: FONE_ANTIGO, display_phone_number: '+55 48 3333-0101', verified_name: `Antigo ${marca}` })
  graph.responder(`/${FONE_NOVO}`, { id: FONE_NOVO, display_phone_number: '+55 48 3333-0202', verified_name: `Novo ${marca}` })
  rede = await criarOutraRede(`cm${marca}`)
  config = await criarMembro(`cmcfg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Configura o WhatsApp',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  const ins = async (linha: Record<string, unknown>) => {
    const { data, error } = await db().from('whatsapp_numbers').insert(linha).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    return data!.id
  }
  // O número que já estava no ar (o padrão) e o novo, colado à mão, ainda desligado.
  antigo = await ins({
    tenant_id: rede.tenantId, provider: 'official', label: `${PREFIXO} Antigo ${marca}`,
    is_active: true, is_default: true, phone_number_id: FONE_ANTIGO,
    config: { provider: 'official', phoneNumberId: FONE_ANTIGO, accessToken: 'tok-antigo', verifyToken: 'v', appSecret: 's', graphBase: graph.url },
  })
  novo = await ins({
    tenant_id: rede.tenantId, provider: 'official', label: `${PREFIXO} Novo ${marca}`,
    is_active: false, is_default: false, phone_number_id: FONE_NOVO,
    config: { provider: 'official', phoneNumberId: FONE_NOVO, accessToken: 'tok-velho', verifyToken: 'v', appSecret: 's', graphBase: graph.url },
  })
})

test.afterAll(async () => {
  if (rede) {
    const { error } = await db().from('whatsapp_numbers').delete().eq('tenant_id', rede.tenantId)
    expect(error).toBeNull()
  }
  await config?.limpar()
  await rede?.limpar()
  await graph?.fechar()
})

const salvar = (p: Page, campos: Record<string, string>, ativo: boolean) =>
  chamarAcao(p, 'actions/integrations.ts', 'salvarNumeroWhatsApp', '/admin/settings',
    [novo, 'official', { phoneNumberId: FONE_NOVO, verifyToken: 'v', appSecret: 's', modo: 'cloud_api', ...campos }, ativo])

test.describe.serial('API oficial com credencial colada à mão', () => {
  test('"Testar conexão" testa o número DA TELA e diz qual é', async ({ browser }) => {
    const r = await como(browser, p =>
      chamarAcao(p, 'actions/integrations.ts', 'testWhatsAppConnection', '/admin/settings', ['official', novo]))
    expect(r.texto, 'o telefone do número testado').toContain('+55 48 3333-0202')
    expect(r.texto, 'e o nome verificado na Meta').toContain(`Novo ${marca}`)
    expect(r.texto, 'não o padrão da rede').not.toContain('3333-0101')
  })

  test('salvar ligado inscreve a conta nos webhooks com o token informado', async ({ browser }) => {
    const r = await como(browser, p => salvar(p, { wabaId: WABA_NOVO, accessToken: 'tok-manual' }, true))
    expect(r.texto).toContain('"ok":true')
    const inscricoes = graph!.terminadasEm(`/${WABA_NOVO}/subscribed_apps`).filter(c => c.metodo === 'POST')
    expect(inscricoes, 'a inscrição da WABA').toHaveLength(1)
    expect(inscricoes[0]!.token, 'com o token colado').toBe('tok-manual')
    // A costura de teste continua na caixa (senão o próximo envio iria à Meta de verdade).
    const { data } = await db().from('whatsapp_numbers').select('config, is_active').eq('id', novo).single<{ config: Record<string, unknown>; is_active: boolean }>()
    expect(data!.is_active).toBe(true)
    expect(data!.config.graphBase).toBe(graph!.url)
  })

  test('a Meta recusa a inscrição: salva, e a tela AVISA que nenhuma mensagem vai chegar', async ({ browser }) => {
    graph!.falharPost(`/${WABA_NOVO}/subscribed_apps`, { code: 200, message: 'Permissions error' })
    try {
      const r = await como(browser, p => salvar(p, { wabaId: WABA_NOVO, accessToken: 'tok-manual' }, true))
      expect(r.texto).toContain('"ok":true')
      expect(r.texto).toContain('não aceitou inscrever')
      expect(r.texto).toContain('nenhuma mensagem')
    } finally {
      graph!.falharPost(`/${WABA_NOVO}/subscribed_apps`, null)
    }
  })

  test('sem o WABA ID: salva, e a tela avisa que a inscrição fica com a conta da clínica', async ({ browser }) => {
    const antes = graph!.terminadasEm('/subscribed_apps').length
    const r = await como(browser, p => salvar(p, { accessToken: 'tok-manual' }, true))
    expect(r.texto).toContain('"ok":true')
    expect(r.texto).toContain('WABA')
    expect(graph!.terminadasEm('/subscribed_apps'), 'sem conta, não há o que inscrever').toHaveLength(antes)
  })

  test('desligado: não inscreve nada', async ({ browser }) => {
    const antes = graph!.terminadasEm('/subscribed_apps').length
    await como(browser, p => salvar(p, { wabaId: WABA_NOVO, accessToken: 'tok-manual' }, false))
    expect(graph!.terminadasEm('/subscribed_apps')).toHaveLength(antes)
    expect(antigo).not.toBe('')
  })
})
