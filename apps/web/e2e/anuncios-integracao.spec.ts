import { test, expect, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirGraphFalsa, type GraphFalsa } from './apoio/graph-falsa'

/**
 * A integração de anúncios pela tela: a volta do OAuth da Meta, a escolha da
 * conta e do pixel, as campanhas no marketing, a troca de conta, o
 * desconectar e o formulário do Google Ads.
 *
 * Roda INTEIRO numa rede `[e2e]` (`criarOutraRede`), com o membro dela: a
 * integração da rede real nem é lida. A Graph é a falsa (`config.graphBase`) —
 * nada chega à Meta. O OAuth em si (a troca do `code` com o Facebook) não se
 * simula: o teste parte do que o callback grava, e o callback tem a trava de
 * permissão provada em `api-sem-credencial.spec.ts`.
 *
 * Achados corrigidos junto:
 *  - a volta do OAuth de anúncios (`meta_step=select`) abria a seção do
 *    WhatsApp, e a conta a escolher ficava escondida;
 *  - `confirmMetaAdsSelection` e `fetchMetaAdAccounts` liam com `.single()`:
 *    rede sem a integração dava erro 500 em vez de "reconecte".
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx { graph: GraphFalsa; outra: OutraRede; config: MembroDeTeste; leitor: MembroDeTeste }
let f: Fx | null = null

const integracao = async (provider: 'meta_ads' | 'google_ads') =>
  (await db().from('integration_configs').select('config, is_active')
    .eq('tenant_id', f!.outra.tenantId).eq('provider', provider).maybeSingle()).data

const eventos = async (nome: string) =>
  (await db().from('domain_events').select('id').eq('tenant_id', f!.outra.tenantId).eq('nome', nome)).data?.length ?? 0

test.beforeAll(async () => {
  const graph = await subirGraphFalsa()
  graph.responder('/me/adaccounts', { data: [{ id: 'act_111', name: 'Conta A' }, { id: 'act_222', name: 'Conta B' }] })
  graph.responder('/me/adspixels', { data: [{ id: 'px1', name: 'Pixel 1' }] })
  graph.responder('/act_111/adspixels', { data: [{ id: 'px2', name: 'Pixel da conta A' }] })
  graph.responder('/act_222/adspixels', { data: [] })
  const campanha = (id: string, nome: string) => ({ data: [{
    id, name: nome, status: 'ACTIVE',
    insights: { data: [{ spend: '150.00', impressions: '1000', clicks: '40', ctr: '4', cpc: '3.75', cpm: '150', reach: '800' }] },
  }] })
  graph.responder('/act_222/campaigns', campanha('c222', `Campanha B ${marca}`))
  graph.responder('/act_111/campaigns', campanha('c111', `Campanha A ${marca}`))

  const outra = await criarOutraRede(`ads${marca}`)
  f = {
    graph, outra,
    config: await criarMembro(`adscfg${marca}`, {
      tenant: outra.tenantId, rotulo: 'Config anúncios',
      permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'marketing', nivel: 'VIEW' }],
    }),
    // Vê o marketing, mas não mexe em configuração.
    leitor: await criarMembro(`adsleitor${marca}`, {
      tenant: outra.tenantId, rotulo: 'Leitor anúncios',
      permissoes: [{ modulo: 'marketing', nivel: 'VIEW' }],
    }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  olhar('integrações', await b.from('integration_configs').delete().eq('tenant_id', f.outra.tenantId))
  olhar('eventos', await b.from('domain_events').delete().eq('tenant_id', f.outra.tenantId))
  await f.config.limpar()
  await f.leitor.limpar()
  await f.outra.limpar()
  await f.graph.fechar()
  expect(falhas).toEqual([])
})

/** Como o membro de configuração, numa página nova. */
async function comoConfig<T>(browser: import('@playwright/test').Browser, fn: (p: Page) => Promise<T>, quem: 'config' | 'leitor' = 'config') {
  const ctx = await browser.newContext({ storageState: f![quem].estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** A seção da Meta Ads na aba de integrações (o cartão que abre e fecha). */
const secao = (p: Page, titulo: string) =>
  p.locator('div').filter({ has: p.getByRole('button', { name: new RegExp(titulo) }) }).last()

test.describe.serial('integração de anúncios pela tela', () => {
  test('sem integração: escolher conta e buscar contas pedem para reconectar (não erro 500)', async ({ browser }) => {
    await comoConfig(browser, async p => {
      const confirmar = await chamarAcao(p, 'actions/integrations.ts', 'confirmMetaAdsSelection', '/admin/settings', ['111', 'px1'])
      expect(confirmar.status).toBe(200)
      expect(confirmar.texto).toContain('Reconecte com o Facebook primeiro')
      const buscar = await chamarAcao(p, 'actions/integrations.ts', 'fetchMetaAdAccounts', '/admin/settings', [])
      expect(buscar.status).toBe(200)
      expect(buscar.texto).toContain('Token não encontrado')
    })
    expect(await integracao('meta_ads'), 'nada nasce').toBeNull()
  })

  test('volta do OAuth: a seção abre na escolha; conta e pixel escolhidos conectam', async ({ browser }) => {
    // O que o callback grava depois de trocar o code com o Facebook.
    const { error } = await db().from('integration_configs').insert({
      tenant_id: f!.outra.tenantId, provider: 'meta_ads', is_active: false,
      config: {
        access_token: `tok-${marca}`, meta_user_name: 'Pessoa e2e',
        ad_accounts: [{ id: '111', name: 'Conta A' }, { id: '222', name: 'Conta B' }],
        pixels: [{ id: 'px1', name: 'Pixel 1' }],
        graphBase: f!.graph.url,
      },
    })
    expect(error).toBeNull()

    await comoConfig(browser, async p => {
      await p.goto('/admin/settings?tab=integrations&meta_step=select')
      // Sem clicar em nada: quem volta do Facebook cai na escolha.
      const confirmar = p.getByRole('button', { name: 'Confirmar integração' })
      await expect(confirmar).toBeVisible()
      await p.locator('select').filter({ has: p.locator('option', { hasText: 'act_222' }) }).selectOption('222')
      await p.locator('select').filter({ has: p.locator('option', { hasText: 'Pixel 1' }) }).selectOption('px1')
      await confirmar.click()
      await expect.poll(async () => (await integracao('meta_ads'))?.is_active, { message: 'conectou' }).toBe(true)
    })
    const linha = await integracao('meta_ads')
    expect(linha!.config).toEqual({
      access_token: `tok-${marca}`, meta_user_name: 'Pessoa e2e',
      adAccountId: '222', adAccountName: 'Conta B', pixelId: 'px1', pixelName: 'Pixel 1',
      graphBase: f!.graph.url,
    })
    expect(await eventos('integracao.conectada'), 'a corrente registra a conexão').toBe(1)
  })

  test('marketing: as campanhas da conta escolhida aparecem, com o token dela', async ({ browser }) => {
    await comoConfig(browser, async p => {
      await p.goto('/admin/marketing?view=meta')
      await expect(p.getByText(`Campanha B ${marca}`)).toBeVisible()
    })
    const [chamada] = f!.graph.terminadasEm('/act_222/campaigns')
    expect(chamada!.corpo).toMatchObject({ access_token: `tok-${marca}` })
  })

  test('alterar conta: busca as contas na Meta, inclui o pixel da conta e troca', async ({ browser }) => {
    await comoConfig(browser, async p => {
      await p.goto('/admin/settings?tab=integrations')
      await p.getByRole('button', { name: /Meta Ads/ }).click()
      await p.getByRole('button', { name: 'Alterar conta' }).click()
      const conta = p.locator('select').filter({ has: p.locator('option', { hasText: 'act_111' }) })
      await expect(conta).toBeVisible()
      await conta.selectOption('111')
      // Pixel pendurado na CONTA (Business Manager), não no usuário.
      await p.locator('select').filter({ has: p.locator('option', { hasText: 'Pixel da conta A' }) }).selectOption('px2')
      await p.getByRole('button', { name: 'Salvar alteração' }).click()
      await expect.poll(async () => ((await integracao('meta_ads'))?.config as Record<string, unknown>)?.adAccountId).toBe('111')
    })
    expect((await integracao('meta_ads'))!.config).toMatchObject({ adAccountName: 'Conta A', pixelId: 'px2', pixelName: 'Pixel da conta A' })
    expect(f!.graph.terminadasEm('/me/adaccounts')[0]!.corpo).toMatchObject({ access_token: `tok-${marca}` })
  })

  test('quem só vê o marketing não mexe na integração', async ({ browser }) => {
    const antes = await integracao('meta_ads')
    const buscasAntes = f!.graph.terminadasEm('/me/adaccounts').length
    await comoConfig(browser, async p => {
      const acao = (funcao: string, args: unknown[]) => chamarAcao(p, 'actions/integrations.ts', funcao, '/admin/marketing', args)
      await acao('saveAdsConfig', ['meta_ads', { adAccountId: '999', accessToken: 'invasor', pixelId: 'px9' }, true])
      await acao('confirmMetaAdsSelection', ['999', 'px9'])
      await acao('fetchMetaAdAccounts', [])
      await acao('disconnectMetaAds', [])
      await acao('saveAdsConfig', ['google_ads', { customerId: '999' }, true])
    }, 'leitor')
    expect(await integracao('meta_ads'), 'a Meta Ads segue igual').toEqual(antes)
    expect(await integracao('google_ads'), 'o Google Ads não nasce').toBeNull()
    expect(f!.graph.terminadasEm('/me/adaccounts'), 'nem consultou a Meta').toHaveLength(buscasAntes)
  })

  test('desconectar pela tela: a credencial sai e a corrente registra', async ({ browser }) => {
    await comoConfig(browser, async p => {
      await p.goto('/admin/settings?tab=integrations')
      await p.getByRole('button', { name: /Meta Ads/ }).click()
      await p.getByRole('button', { name: 'Desconectar' }).click()
      await expect.poll(async () => (await integracao('meta_ads'))?.is_active).toBe(false)
    })
    expect((await integracao('meta_ads'))!.config).toEqual({})
    expect(await eventos('integracao.desconectada')).toBe(1)
  })

  test('Google Ads pela tela: os cinco campos gravam e ativam; chave de fora não entra', async ({ browser }) => {
    await comoConfig(browser, async p => {
      await p.goto('/admin/settings?tab=integrations')
      await p.getByRole('button', { name: /Google Ads/ }).click()
      const campos: Record<string, string> = {
        customerId: '123-456-7890', developerToken: `dev-${marca}`, clientId: 'cli.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-e2e', refreshToken: '1//e2e',
      }
      for (const [nome, valor] of Object.entries(campos)) await p.locator(`input[name="${nome}"]`).fill(valor)
      await p.getByLabel('Ativar integração Google Ads').check()
      const cartao = secao(p, 'Google Ads')
      await cartao.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect.poll(async () => (await integracao('google_ads'))?.is_active).toBe(true)
      expect((await integracao('google_ads'))!.config).toEqual(campos)

      // Pela action, com chaves que a tela não manda: só as cinco gravam.
      await chamarAcao(p, 'actions/integrations.ts', 'saveAdsConfig', '/admin/settings',
        ['google_ads', { ...campos, graphBase: 'http://127.0.0.1:1', outra: 'x' }, false])
      await expect.poll(async () => (await integracao('google_ads'))?.is_active).toBe(false)
      expect((await integracao('google_ads'))!.config).toEqual(campos)

      await chamarAcao(p, 'actions/integrations.ts', 'saveAdsConfig', '/admin/settings',
        ['meta_ads', { adAccountId: '1', accessToken: 't', pixelId: 'p', graphBase: 'http://127.0.0.1:1', access_token: 'z' }, false])
      await expect.poll(async () => (await integracao('meta_ads'))?.config).toEqual({ adAccountId: '1', accessToken: 't', pixelId: 'p' })
    })
  })
})
