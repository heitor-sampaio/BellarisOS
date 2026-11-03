import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * ven-03 da revisão das decisões (2026-11-02; o Heitor: "flexibilidade,
 * precisamos dar as opções para que a rede possa operar da maneira que melhor
 * lhe convier"). "A Bruna dá R$ 50 de troco sem ter recebido espécie no dia; o
 * Fechamento avisa 'espécie saindo a mais'" — não havia fundo de troco.
 *
 * O Fechamento do dia ganha um "Fundo de troco" OPCIONAL: informado, o
 * dinheiro esperado na gaveta é o fundo + o saldo em espécie do dia (a conta
 * é de lib/metrics), e o fechamento guarda o fundo no retrato. Sem fundo,
 * segue como hoje. Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let recepcao: MembroDeTeste
let slug = ''
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fdt${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`fdt${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    await db().from('fechamentos_do_dia').delete().eq('branch_id', rede.branchId)
    await db().from('fundos_de_troco').delete().eq('branch_id', rede.branchId)
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test('sem fundo, segue como hoje: o campo é opcional e o esperado é só o dia', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/fechamento`)
    await expect(p.locator('[data-fundo-de-troco]')).toContainText('Sem fundo de troco')
    await expect(p.locator('[data-esperado]')).toHaveText('R$ 0,00')
  })
})

test('com R$ 100 de fundo, o troco de R$ 50 em espécie não é "saída a mais": esperado R$ 50, e o fechamento guarda o fundo', async ({ browser }) => {
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
    type: 'EXPENSE', category: 'Outros', description: `Troco ${marca}`, amount: 50, payment_method: 'CASH',
  })).error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/${slug}/fechamento`)
    // Sem fundo: a espécie saiu a mais.
    await expect(p.locator('[data-aviso="dinheiro-negativo"]')).toBeVisible()
    const fundo = p.locator('[data-fundo-de-troco]')
    await fundo.getByRole('button', { name: 'Informar fundo de troco' }).click()
    await fundo.getByLabel('Fundo de troco (R$)').fill('100')
    await fundo.getByRole('button', { name: 'Salvar fundo' }).click()
    await expect(fundo).toContainText('Fundo de troco: R$ 100,00')
    await expect(p.locator('[data-esperado]')).toHaveText('R$ 50,00')
    await expect(p.locator('[data-esperado-conta]')).toContainText('R$ 100,00 de fundo')
    await expect(p.locator('[data-aviso="dinheiro-negativo"]'), 'com o fundo, não sai a mais').toHaveCount(0)
    await p.getByLabel(/Dinheiro contado/).fill('50')
    await p.getByRole('button', { name: 'Fechar o dia' }).click()
    await expect.poll(async () => (await db().from('fechamentos_do_dia')
      .select('fundo_de_troco, esperado_dinheiro, contado_dinheiro, diferenca').eq('branch_id', rede.branchId)).data
      ?.map(f => ({ fundo: Number(f.fundo_de_troco), esperado: Number(f.esperado_dinheiro), dif: Number(f.diferenca) })))
      .toEqual([{ fundo: 100, esperado: 50, dif: 0 }])
  })
})

test('o servidor recusa fundo negativo e confere a unidade', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/fechamento`)
    const r = await chamarAcao(p, 'actions/fechamento.ts', 'informarFundoDeTroco', `/${slug}/fechamento`, [rede.branchId, hoje(), -10])
    expect(r!.texto).toContain('Informe o fundo de troco')
    const outra = await chamarAcao(p, 'actions/fechamento.ts', 'informarFundoDeTroco', `/${slug}/fechamento`, ['00000000-0000-4000-8000-000000000000', hoje(), 10])
    expect(outra!.texto).toContain('Unidade não encontrada')
  })
  const { data } = await db().from('fundos_de_troco').select('valor').eq('branch_id', rede.branchId)
  expect((data ?? []).map(f => Number(f.valor))).toEqual([100])
})
