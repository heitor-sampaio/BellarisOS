import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarRedeCriada } from './apoio/rede-criada'

/**
 * O primeiro acesso (/setup) retoma de onde parou.
 *
 * A simulação de um dia de clínica (2026-10-20) achou: a dona saiu no meio, e
 * ao voltar o assistente recomeçava no passo 1 VAZIO — confirmar apagava o
 * telefone da rede (o campo vazio gravava nulo), e a única saída era criar uma
 * SEGUNDA unidade. Agora os dados gravados vêm preenchidos, a rede que já tem
 * unidade vai direto ao fim, e o passo da unidade tem "Voltar".
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TELEFONE = '4833334444'

let redeSemUnidade = ''
let semUnidade: MembroDeTeste | null = null
let comUnidade: OutraRede | null = null
let donaComUnidade: MembroDeTeste | null = null

test.beforeAll(async () => {
  const { data: t, error } = await db().from('tenants').insert({
    name: `${PREFIXO} Rede do setup ${marca}`, slug: `e2e-setup-${marca}`, email: `e2e-setup-${marca}@bellaris.invalid`,
    phone: TELEFONE, plan_status: 'trial',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a rede').toBeNull()
  redeSemUnidade = t!.id
  semUnidade = await criarMembro(`stp${marca}`, {
    tenant: redeSemUnidade, rotulo: 'Dona', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  comUnidade = await criarOutraRede(`stpu${marca}`)
  donaComUnidade = await criarMembro(`stpu${marca}`, {
    tenant: comUnidade.tenantId, rotulo: 'Dona', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await semUnidade?.limpar()
  await donaComUnidade?.limpar()
  await comUnidade?.limpar()
  if (redeSemUnidade) expect(await apagarRedeCriada(redeSemUnidade)).toEqual([])
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('sem unidade: os dados da rede vêm preenchidos, confirmar não apaga o telefone, e dá para voltar', async ({ browser }) => {
  await como(browser, semUnidade!, async p => {
    await p.goto('/setup')
    await expect(p.locator('#net-phone')).toHaveValue(/3333.?4444/)
    await p.getByRole('button', { name: /Continuar/ }).click()
    await expect(p.getByText('Primeira unidade').first()).toBeVisible()
    await p.getByRole('button', { name: /Voltar/ }).click()
    await expect(p.locator('#net-phone')).toHaveValue(/3333.?4444/)
  })
  const { data } = await db().from('tenants').select('phone').eq('id', redeSemUnidade).single()
  expect((data!.phone as string | null)?.replace(/\D/g, ''), 'o telefone continua gravado').toBe(TELEFONE)
})

test('com unidade: o setup vai ao fim, sem oferecer outra unidade', async ({ browser }) => {
  await como(browser, donaComUnidade!, async p => {
    await p.goto('/setup')
    await expect(p.getByText('Tudo pronto!')).toBeVisible()
    await expect(p.locator('#br-slug')).toHaveCount(0)
  })
})
