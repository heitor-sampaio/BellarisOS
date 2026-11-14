import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos de fidelidade da 12ª simulação (2026-11-11; a Helena, a Ana e a
 * Carla, da Margarida), numa rede [e2e] própria:
 * - A30: o estorno do pagamento da indicada não dizia que saíam os 180 pontos
 *   da Carla e os 200 do prêmio da Ana (princípio 3).
 * - A41: o extrato de pontos da ficha repetia o título na descrição
 *   ("Indicação de Carla Duarte" duas vezes).
 * - A53: com 780 pontos, a recompensa de 500 dizia só "a troca é feita na
 *   recepção", sem "você já pode trocar".
 * - A54: o "Indique uma amiga" só estava em Meus pontos, não no Início do app
 *   (só com o prêmio ligado).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let ana: ClienteDeTeste
let carla = ''
let carlaNome = ''
let anaNome = ''
let pagamentoDaCarla = ''

async function como(browser: Browser, m: { estado: MembroDeTeste['estado'] }, fn: (p: Page) => Promise<void>, largura = 1440) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: largura, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function pagamento(cliente: string, valor: number, oQue: string): Promise<string> {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, type: 'INCOME', category: 'Atendimento',
    description: `${PREFIXO} ${oQue} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fi12${marca}`)
  const b = db()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('loyalty_configs').upsert({
    tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
    client_redeem: false, indicacao_premio: 'PONTOS', indicacao_pontos: 200,
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  expect((await b.from('loyalty_rewards').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Limpeza cortesia ${marca}`, type: 'DESCONTO_VALOR', discount_value: 50, points_cost: 500, validity_days: 60,
  })).error).toBeNull()
  dona = await criarMembro(`fi12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  ana = await clienteComSessao(`fi12a${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  anaNome = (await b.from('clients').select('name').eq('id', ana.clientId).single<{ name: string }>()).data!.name
  carla = await rede.criarCliente('Carla')
  carlaNome = (await b.from('clients').select('name').eq('id', carla).single<{ name: string }>()).data!.name
  expect((await b.from('clients').update({ indicada_por: ana.clientId }).eq('id', carla)).error).toBeNull()
  // A Ana pagou R$ 580 (580 pontos); a Carla, indicada por ela, R$ 180 — 180
  // pontos para a Carla e o prêmio de 200 para a Ana (780 no total).
  await pagamento(ana.clientId, 580, 'Pacote da Ana')
  pagamentoDaCarla = await pagamento(carla, 180, 'Limpeza da Carla')
  await expect.poll(async () => Number((await b.rpc('saldo_de_pontos', { p_cliente: ana.clientId })).data ?? 0)).toBe(780)
})

test.afterAll(async () => {
  await ana?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('A30: o estorno do pagamento da indicada diz os pontos dela e o prêmio de quem indicou', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes&period=today`)
    await p.locator(`[data-lancamento="${pagamentoDaCarla}"]`).getByRole('button', { name: 'Estornar' }).click()
    const janela = p.getByRole('dialog', { name: 'Estornar este lançamento?' })
    const pontos = janela.locator('[data-pontos-do-estorno]')
    await expect(pontos).toContainText(`Saem 180 pontos de ${carlaNome}`)
    await expect(pontos).toContainText(`200 pontos do prêmio de ${anaNome} pela indicação de ${carlaNome}`)
    await janela.getByRole('button', { name: 'Voltar' }).click()
  })
})

test('A41: o extrato da ficha não repete "Indicação de …" na descrição', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/clients/${ana.clientId}`)
    const linha = p.getByTestId('fidelidade-do-cliente').getByTestId('linha-do-extrato').filter({ hasText: 'Indicação de' })
    await expect(linha).toHaveCount(1)
    const texto = (await linha.innerText()).split('Indicação de').length - 1
    expect(texto, 'o título uma vez só').toBe(1)
  })
})

test('A53 e A54: o app diz "você já pode trocar" e traz o "Indique uma amiga" ao Início', async ({ browser }) => {
  await como(browser, ana, async p => {
    await p.goto(`/${slug}/cliente/fidelidade`)
    await expect(p.locator('[data-ja-pode-trocar]')).toContainText('Você já pode trocar')
    await p.goto(`/${slug}/cliente/home`)
    const indique = p.locator('[data-indique-uma-amiga]')
    await expect(indique).toContainText('200 pontos')
    await expect(indique.getByRole('link', { name: /Meus pontos/ })).toBeVisible()
  }, 412)
})
