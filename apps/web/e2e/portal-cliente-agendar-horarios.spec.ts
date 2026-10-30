import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-59 e J-60 das simulações: o agendamento novo do app não tinha "Hoje" e
 * "Amanhã" nem os horários separados em Manhã/Tarde/Noite (o remarcar já
 * tinha, `gruposDeHorario`), e nada avisava que a profissional só atende num
 * horário — a cliente escolhia a manhã de uma profissional da noite e
 * achava "Nenhum horário disponível".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
const noite = [{ de: '18:00', ate: '22:00' }]

/** O n-ésimo dia ÚTIL a partir de amanhã. */
const dia = (n: number) => {
  const uteis: string[] = []
  for (let i = 1; uteis.length < n; i++) {
    const d = new Date(Date.now() + i * 86_400_000)
    const semana = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(d)
    if (semana !== 'Sat' && semana !== 'Sun') uteis.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d))
  }
  return uteis[n - 1]!
}
const amanha = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 86_400_000))

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function noPassoDaProfissional(p: Page) {
  await p.goto(`/${slug}/cliente/agendamentos/novo`)
  const passo2 = p.getByText('Tem preferência de profissional?')
  await expect(async () => {
    if (!(await passo2.isVisible())) await p.getByRole('button', { name: new RegExp(`Proc ho${marca}`) }).click({ timeout: 2000 })
    await expect(passo2).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30_000 })
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ho${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // A unidade abre das 8 às 22; ela só atende à noite, de segunda a sexta.
  const longo = [{ de: '08:00', ate: '22:00' }]
  expect((await db().from('branches').update({ horario: { dias: { 0: [], 1: longo, 2: longo, 3: longo, 4: longo, 5: longo, 6: [] } } }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('users').update({
    branch_id: rede.branchId, provides_services: true,
    horario: { dias: { 0: [], 1: noite, 2: noite, 3: noite, 4: noite, 5: noite, 6: [] } },
  }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  cliente = await clienteComSessao(`hoc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})
test.afterAll(async () => {
  await cliente?.limpar(); await rede?.limpar()
})

test('a profissional mostra quando atende', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await noPassoDaProfissional(p)
    await expect(p.getByRole('button', { name: /Prof ho/ })).toContainText('Seg a sex, 18:00–22:00')
    await p.getByRole('button', { name: /Prof ho/ }).click()
    // No passo da data, o lembrete de quando ela atende.
    await expect(p.getByText(/atende: Seg a sex, 18:00–22:00/)).toBeVisible()
  })
})

test('a data tem Hoje e Amanhã, e os horários vêm por período', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await noPassoDaProfissional(p)
    await p.getByRole('button', { name: /Prof ho/ }).click()
    await p.getByRole('button', { name: 'Amanhã', exact: true }).click()
    await expect(p.getByLabel('Data')).toHaveValue(amanha())

    await p.getByLabel('Data').fill(dia(2))
    const noiteGrupo = p.getByRole('group', { name: 'Noite' })
    await expect(noiteGrupo.getByRole('button', { name: '18:00', exact: true })).toBeVisible()
    await expect(p.getByRole('group', { name: 'Manhã' })).toHaveCount(0)
  })
})
