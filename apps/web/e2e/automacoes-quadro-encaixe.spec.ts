import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco, nomeDeTeste } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * O quadro do editor de automações (J-14).
 *
 * Três atritos de quem monta um fluxo:
 * - o passo novo nascia SOLTO, e cada um pedia um arrasto de alça a alça;
 * - num fluxo de cinco ou seis passos, o novo nascia fora da vista, atrás do
 *   painel de configuração que abre junto com ele;
 * - a primeira ligação feita à mão deslocava o quadro inteiro (a faixa de
 *   problemas do rodapé perdia uma linha, o quadro ganhava 24 px de altura e
 *   o reenquadramento movia tudo).
 *
 * Roda numa rede `[e2e]`, com um membro que só tem Automações.
 */

const marca = Date.now().toString(36)
let f: { outra: OutraRede; membro: MembroDeTeste } | null = null
const criadas: string[] = []

test.beforeAll(async () => {
  const outra = await criarOutraRede(`qde${marca}`)
  f = {
    outra,
    membro: await criarMembro(`qde${marca}`, {
      tenant: outra.tenantId, rotulo: 'Automações',
      permissoes: [{ modulo: 'automations', nivel: 'MANAGE' }],
    }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const db = banco()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  for (const id of criadas) {
    olhar('versões', await db.from('automation_versions').delete().eq('automation_id', id))
    olhar('automação', await db.from('automations').delete().eq('id', id))
  }
  await f.membro.limpar()
  await f.outra.limpar()
  expect(falhas).toEqual([])
})

async function comoMembro(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: f!.membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function novaAutomacao(page: Page, nome: string): Promise<string> {
  await page.goto('/admin/automacoes')
  await page.getByRole('button', { name: 'Nova automação' }).click()
  // O "começar vazia" (D-4) ou o campo direto: os dois chegam ao nome.
  const vazia = page.getByRole('button', { name: /Começar vazia/ })
  if (await vazia.isVisible().catch(() => false)) await vazia.click()
  await page.getByPlaceholder('Nome da automação').fill(nome)
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await page.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
  const id = page.url().split('/').pop()!
  criadas.push(id)
  return id
}

const paleta = (page: Page) => page.getByLabel('Passos disponíveis')

/** A caixa do node inteira cabe na área visível do quadro (ao lado do painel, não atrás). */
async function noEstaAVista(page: Page, texto: string) {
  const area = (await page.locator('.react-flow').boundingBox())!
  const no = (await page.locator('.react-flow__node', { hasText: texto }).last().boundingBox())!
  return no.x >= area.x - 1 && no.y >= area.y - 1
    && no.x + no.width <= area.x + area.width + 1
    && no.y + no.height <= area.y + area.height + 1
}

test('o passo novo nasce ligado ao anterior — e o do "Se", pela saída Sim', async ({ browser }) => {
  await comoMembro(browser, async page => {
    const id = await novaAutomacao(page, nomeDeTeste(`Encaixe ${marca}`))

    await paleta(page).getByRole('button', { name: 'Quando acontecer' }).click()
    await paleta(page).getByRole('button', { name: 'Se', exact: true }).click()
    await expect(page.locator('.react-flow__edge'), 'o "Se" nasce ligado ao gatilho').toHaveCount(1)

    await paleta(page).getByRole('button', { name: 'Avisar a equipe' }).click()
    await expect(page.locator('.react-flow__edge'), 'o aviso nasce ligado ao "Se"').toHaveCount(2)

    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Salvo', { exact: true })).toBeVisible()

    const { data } = await banco().from('automations').select('grafo').eq('id', id).single()
    const grafo = data!.grafo as {
      nos: { id: string; tipo: string }[]
      ligacoes: { de: string; para: string; saida?: string }[]
    }
    const idDo = (tipo: string) => grafo.nos.find(n => n.tipo === tipo)!.id
    expect(grafo.ligacoes.map(l => ({ de: l.de, para: l.para, saida: l.saida ?? null }))).toEqual([
      { de: idDo('gatilho.evento'), para: idDo('condicao.se'), saida: null },
      { de: idDo('condicao.se'), para: idDo('acao.notificar_equipe'), saida: 'sim' },
    ])
  })
})

test('num fluxo comprido, o passo que acabou de nascer fica à vista, fora do painel', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await novaAutomacao(page, nomeDeTeste(`Comprido ${marca}`))

    const passos = ['Quando acontecer', 'Esperar', 'Avisar a equipe', 'Anotar na oportunidade', 'Marcar com tag', 'Definir responsável']
    for (const passo of passos) {
      await paleta(page).getByRole('button', { name: passo, exact: true }).click()
      await expect(page.getByLabel('Configuração do node')).toBeVisible()
      await expect.poll(() => noEstaAVista(page, passo), {
        message: `"${passo}" tem de nascer à vista`, timeout: 3_000,
      }).toBe(true)
    }
  })
})

test('ligar dois passos à mão não desloca o quadro', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await novaAutomacao(page, nomeDeTeste(`Desloca ${marca}`))

    // Dois soltos: a ação primeiro (não há anterior) e depois o gatilho (que
    // não tem entrada).
    await paleta(page).getByRole('button', { name: 'Avisar a equipe' }).click()
    await paleta(page).getByRole('button', { name: 'Quando acontecer' }).click()
    await expect(page.locator('.react-flow__edge')).toHaveCount(0)
    await expect(page.getByText(/não está ligado ao fluxo/)).toBeVisible()

    await page.getByLabel('Configuração do node').getByLabel('Fechar').click()
    await expect(page.getByLabel('Configuração do node')).toBeHidden()
    await page.waitForTimeout(700)

    const gatilho = page.locator('.react-flow__node', { hasText: 'Quando acontecer' })
    const acao    = page.locator('.react-flow__node', { hasText: 'Avisar a equipe' })
    const antes = (await gatilho.boundingBox())!

    const a = (await gatilho.locator('.react-flow__handle-right').boundingBox())!
    const b = (await acao.locator('.react-flow__handle-left').boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + 40, a.y, { steps: 5 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.up()

    await expect(page.locator('.react-flow__edge')).toHaveCount(1)
    await expect(page.getByText(/não está ligado ao fluxo/)).toHaveCount(0)
    await page.waitForTimeout(700)

    const depois = (await gatilho.boundingBox())!
    expect(Math.abs(depois.x - antes.x), 'o quadro não anda na horizontal').toBeLessThan(2)
    expect(Math.abs(depois.y - antes.y), 'o quadro não anda na vertical').toBeLessThan(2)
  })
})
