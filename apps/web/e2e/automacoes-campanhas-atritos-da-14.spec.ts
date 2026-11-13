import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * A9 e A11 da 14ª simulação (F71; princípios 3 e 7: renomear, dar texto e
 * link, sem tirar recurso).
 *
 * - A9: o item "Marketing" mostrava só anúncios (Meta e Google), e nada dizia a
 *   diferença entre a campanha (aviso a um público) e a automação (reação a um
 *   fato) — a Úrsula montou o lembrete nas duas. O item dos anúncios se chama
 *   "Anúncios", e cada tela diz em uma frase quando usar a outra, com o link.
 * - A11: a dica do nome do passo era jargão (`{{passos.um_dia_antes.…}}`), e a
 *   espera "1 dia antes" não dizia o que acontece com o agendamento marcado
 *   com menos de 1 dia: o motor segue na hora, e agora a tela diz.
 */

test.setTimeout(150_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let lembrete = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`at14${marca}`)
  const { data, error } = await db().from('automations').insert({
    tenant_id: rede.tenantId, nome: `${PREFIXO} Lembrete ${marca}`, status: 'RASCUNHO', gatilhos: ['agendamento.criado'],
    grafo: {
      nos: [
        { id: 'g1', tipo: 'gatilho.evento', nome: 'Quando acontecer', pos: { x: 80, y: 120 }, config: { evento: 'agendamento.criado' } },
        { id: 'e1', tipo: 'espera.ate', nome: 'Um dia antes', pos: { x: 360, y: 120 }, config: { campo: 'evento.dados.agendadoPara', minutos: -1440 } },
        { id: 'a1', tipo: 'acao.notificar_equipe', nome: 'Avisar', pos: { x: 640, y: 120 },
          config: { alvo: 'usuario', alvoId: rede.professionalId, titulo: 'Lembrete', corpo: 'Amanhã.' } },
      ],
      ligacoes: [{ id: 'l1', de: 'g1', para: 'e1' }, { id: 'l2', de: 'e1', para: 'a1' }],
    },
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  lembrete = data!.id
  dona = await criarMembro(`at14d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  await db().from('automation_versions').delete().eq('tenant_id', rede.tenantId)
  await db().from('automations').delete().eq('tenant_id', rede.tenantId)
  await dona?.limpar(); await rede?.limpar()
})

test('A9: o item dos anúncios se chama "Anúncios", e a tela diz o que é', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/dashboard')
    const menu = p.getByRole('complementary').getByRole('navigation')
    await expect(menu.getByRole('link', { name: 'Anúncios', exact: true })).toHaveAttribute('href', '/admin/marketing')
    await p.goto('/admin/marketing')
    await expect(p.getByRole('heading', { level: 1, name: 'Anúncios' })).toBeVisible()
  })
})

test('A9: a campanha e a automação dizem quando usar uma ou outra, com o link', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/notificacoes')
    const naCampanha = p.locator('[data-campanha-ou-automacao]')
    await expect(naCampanha).toContainText('para reagir a um fato de cada cliente')
    await naCampanha.getByRole('link', { name: 'Automações' }).click()
    await expect(p).toHaveURL(/\/admin\/automacoes$/)
    const naAutomacao = p.locator('[data-campanha-ou-automacao]')
    await expect(naAutomacao).toContainText('para mandar um aviso a um público de uma vez')
    await naAutomacao.getByRole('link', { name: /campanhas/i }).click()
    await expect(p).toHaveURL(/\/admin\/notificacoes$/)
  })
})

test('A11: o passo diz em português como os seguintes o leem, e a espera diz o agendamento em cima da hora', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/automacoes/${lembrete}`)
    await p.locator('.react-flow__node', { hasText: 'Esperar até' }).click()
    const painel = p.getByLabel('Configuração do node')
    await expect(painel).toContainText('Marcado com menos de 1 dia de antecedência: sai na hora')
    await expect(painel).not.toContainText('{{passos.')
  })
})
