import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * A10 da 14ª simulação (F71; H1 do levantamento das regras, princípios 3 e 6):
 * a janela "Ligar a automação?" vale para TODO fluxo que chega à cliente. Na
 * rede sem WhatsApp o modelo nasce com o aviso no celular (push), e a janela só
 * abria para o canal WhatsApp — a Xênia ligou a "Reativação de quem sumiu" sem
 * saber para quantas ia. A conta do push é a do disparo da campanha
 * (`publico_com_aparelho`: o app ou o navegador com avisos).
 *
 * O fluxo que só avisa a EQUIPE não chega à cliente: liga direto.
 */

test.setTimeout(150_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let porPush = ''
let soEquipe = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`aut71${marca}`)
  const comApp = await rede.criarCliente('Com o app')
  await rede.criarCliente('Sem o app')
  await rede.criarCliente('Também sem')
  expect((await db().from('push_tokens').insert({ token: `e2e-f71-${marca}`, platform: 'android', client_id: comApp })).error).toBeNull()

  const { data: a, error: eA } = await db().from('automations').insert({
    tenant_id: rede.tenantId, nome: `${PREFIXO} Reativação por push ${marca}`, status: 'RASCUNHO', gatilhos: [],
    grafo: {
      nos: [
        { id: 'g1', tipo: 'gatilho.agenda', nome: 'Todo dia', pos: { x: 80, y: 120 }, config: { frequencia: 'diaria', hora: '09:00' } },
        { id: 'b1', tipo: 'buscar.clientes', nome: 'Todas', pos: { x: 360, y: 120 }, config: { limite: 200 } },
        { id: 'm1', tipo: 'acao.mensagem', nome: 'Convite', pos: { x: 640, y: 120 }, config: { canal: 'push', texto: 'Oi, {{cliente.nome}}!' } },
      ],
      ligacoes: [{ id: 'l1', de: 'g1', para: 'b1' }, { id: 'l2', de: 'b1', para: 'm1' }],
    },
  }).select('id').single<{ id: string }>()
  expect(eA, eA?.message).toBeNull()
  porPush = a!.id

  const { data: e, error: eE } = await db().from('automations').insert({
    tenant_id: rede.tenantId, nome: `${PREFIXO} Só a equipe ${marca}`, status: 'RASCUNHO', gatilhos: ['cliente.criado'],
    grafo: {
      nos: [
        { id: 'g1', tipo: 'gatilho.evento', nome: 'Quando acontecer', pos: { x: 80, y: 120 }, config: { evento: 'cliente.criado' } },
        { id: 'a1', tipo: 'acao.notificar_equipe', nome: 'Avisar', pos: { x: 360, y: 120 },
          config: { alvo: 'usuario', alvoId: rede.professionalId, titulo: `${PREFIXO} nova ${marca}`, corpo: 'Conferir.' } },
      ],
      ligacoes: [{ id: 'l1', de: 'g1', para: 'a1' }],
    },
  }).select('id').single<{ id: string }>()
  expect(eE, eE?.message).toBeNull()
  soEquipe = e!.id

  dona = await criarMembro(`aut71d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  await db().from('automation_versions').delete().eq('tenant_id', rede.tenantId)
  await db().from('automations').delete().eq('tenant_id', rede.tenantId)
  await db().from('push_tokens').delete().eq('token', `e2e-f71-${marca}`)
  await dona?.limpar(); await rede?.limpar()
})

test('A10: ligar o fluxo que manda aviso no celular abre a janela, com quantas vão receber', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/automacoes/${porPush}`)
    await p.getByRole('button', { name: 'Ligar' }).click()
    const janela = p.locator('[data-antes-de-ligar]')
    await expect(janela).toContainText('Hoje a busca acharia 3 clientes, e 1 vai receber o aviso no celular', { timeout: 20_000 })
    await expect(janela).toContainText('só chega a quem tem o app da clínica ou os avisos ligados no navegador')
    await janela.getByRole('button', { name: 'Agora não' }).click()
    await expect(p.locator('[data-antes-de-ligar]')).toHaveCount(0)
  })
  const { data } = await db().from('automations').select('status').eq('id', porPush).single<{ status: string }>()
  expect(data?.status, '"Agora não" não liga').toBe('RASCUNHO')
})

test('A10: o fluxo que só avisa a equipe não chega à cliente e liga direto', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/automacoes/${soEquipe}`)
    await p.getByRole('button', { name: 'Ligar' }).click()
    await expect(p.getByRole('button', { name: 'Desligar' })).toBeVisible({ timeout: 20_000 })
    await expect(p.locator('[data-antes-de-ligar]')).toHaveCount(0)
  })
  const { data } = await db().from('automations').select('status').eq('id', soEquipe).single<{ status: string }>()
  expect(data?.status).toBe('ATIVA')
})
