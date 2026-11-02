import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * "Reforça", item 8 da 5ª simulação: a "Minha agenda" da Renata, que só atende
 * das 07 às 12, mostrava a grade da UNIDADE (07:00–21:00) toda livre, com "Dia
 * livre". A grade da Minha agenda é o horário DELA (unidade ∩ ela), e o dia em
 * que ela não atende diz isso.
 */

const marca = `mh${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let renata: MembroDeTeste | null = null
const DIA = diaEmQueAUnidadeAbre(2)

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  renata = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Renata',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  // Só as manhãs, de segunda a sábado (a unidade abre 08–20, o padrão).
  const manha = [{ de: '07:00', ate: '12:00' }]
  expect((await db().from('users').update({
    provides_services: true,
    horario: { dias: { 0: [], 1: manha, 2: manha, 3: manha, 4: manha, 5: manha, 6: manha } },
  }).eq('id', renata.userId)).error).toBeNull()
})

test.afterAll(async () => { await renata?.limpar(); await rede?.limpar() })

test('a grade da Minha agenda é o horário dela, não o da unidade', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: renata!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    const grade = p.locator('[data-grade-minha-agenda]')
    // Unidade 08–20 ∩ ela 07–12 = 08–12.
    await expect(grade.getByText('08:00', { exact: true })).toBeVisible()
    await expect(grade.getByText('11:00', { exact: true })).toBeVisible()
    await expect(grade.getByText('14:00', { exact: true })).toHaveCount(0)
    await expect(grade.getByText('19:00', { exact: true })).toHaveCount(0)
  } finally { await ctx.close() }
})
