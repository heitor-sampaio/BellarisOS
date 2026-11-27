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
    // A "Minha agenda" é a vista pessoal (SM2, o Heitor, 2026-11-23): atende e
    // não tem a Agenda (era a Agenda "só os meus", que saiu — SM1).
    permissoes: [{ modulo: 'agenda', nivel: 'NONE' }],
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

// D9 da 39ª (AG-23): na folga com um encaixe marcado, a Minha agenda mostrava o
// cartão e não dizia "Você não atende neste dia" (só com o dia vazio).
test('a folga com um encaixe mostra o cartão e diz "Você não atende neste dia"', async ({ browser }) => {
  const d = new Date(`${DIA}T12:00:00-03:00`)
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7))
  const domingo = d.toISOString().slice(0, 10)
  const cliente = await rede!.criarCliente('Encaixe na folga')
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: renata!.userId,
    scheduled_at: new Date(`${domingo}T10:00:00-03:00`).toISOString(), duration_min: 30,
    price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, 'o encaixe no domingo').toBeNull()
  const ctx = await browser.newContext({ storageState: renata!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda?date=${domingo}`)
    await expect(p.locator(`[data-grade-minha-agenda] [data-cartao-minha-agenda="${ag!.id}"]`), 'o cartão do encaixe').toBeVisible()
    await expect(p.locator('[data-nao-atende-no-dia]')).toHaveText('Você não atende neste dia')
  } finally { await ctx.close() }
})
