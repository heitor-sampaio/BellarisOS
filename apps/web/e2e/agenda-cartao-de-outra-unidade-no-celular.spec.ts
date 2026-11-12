import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje } from './apoio/datas'

/**
 * A8 da 13ª simulação (F65): no celular, o cartão curto da "Minha agenda" com
 * o selo "Na unidade X" (o dela numa outra unidade em que atende) ficava sem o
 * NOME da cliente — o selo, sem encolher, empurrava o nome para fora. O nome
 * da cliente nunca some: o selo vai para a linha do procedimento e encolhe
 * com reticências (o nome inteiro fica na dica).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let unidadeB = ''
let ela: MembroDeTeste | null = null
const CLIENTE = `${PREFIXO} Mariana Albuquerque ${marca}`
const OUTRA = `${PREFIXO} Centro Médico Água Verde Shopping ${marca}`

test.use({ viewport: { width: 360, height: 760 } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`cc${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: OUTRA, slug: `e2e-cc2-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  unidadeB = b!.id
  ela = await criarMembro(`cc${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ atende_em: [rede.branchId, unidadeB] }).eq('id', ela.userId)).error).toBeNull()
  const cliente = await rede.criarCliente('x')
  expect((await db().from('clients').update({ name: CLIENTE }).eq('id', cliente)).error).toBeNull()
  expect((await db().from('appointments').insert({
    branch_id: unidadeB, client_id: cliente, procedure_id: rede.procedureId, professional_id: ela.userId,
    status: 'CONFIRMED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: haMinutosHoje(30),
  })).error).toBeNull()
})
test.afterAll(async () => {
  if (unidadeB) {
    await db().from('appointments').delete().eq('branch_id', unidadeB)
    await db().from('branches').delete().eq('id', unidadeB)
  }
  await ela?.limpar(); await rede?.limpar()
})

test('A8: no celular, o cartão curto da outra unidade mostra o nome da cliente, e o selo cabe', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ela!.estado, viewport: { width: 360, height: 760 } })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda`)
    const cartao = p.locator('[data-outra-unidade]').first()
    await expect(cartao).toBeVisible()
    const nome = cartao.locator('[data-cliente-do-cartao]')
    await expect(nome).toBeVisible()
    const caixaDoNome = (await nome.boundingBox())!
    expect(caixaDoNome.width, 'o nome da cliente tem lugar no cartão').toBeGreaterThan(60)
    const caixaDoCartao = (await cartao.boundingBox())!
    const selo = cartao.locator('[data-unidade-do-cartao]')
    await expect(selo).toBeVisible()
    const caixaDoSelo = (await selo.boundingBox())!
    expect(caixaDoSelo.x + caixaDoSelo.width, 'o selo não sai do cartão').toBeLessThanOrEqual(caixaDoCartao.x + caixaDoCartao.width + 1)
    await expect(cartao, 'o nome inteiro da unidade fica na dica').toHaveAttribute('title', new RegExp(OUTRA.replace(/[[\]]/g, '\\$&')))
  } finally { await ctx.close() }
})
