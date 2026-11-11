import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { addDaysTZ, dayKeyTZ } from '../lib/datetime'

/**
 * Os defeitos da agenda da 12ª simulação (2026-11-10/11, a Heloísa e a Bianca
 * da [sim] Clínica Acácia), numa rede [e2e] própria:
 *
 * - D7: às 23:10 a Heloísa abriu o Agendar, que veio em 23:30 (a hora de agora
 *   arredondada) — e o último início da unidade era 23:00. Sem ela mexer no
 *   campo, o "próximo livre" trocou dia e hora em silêncio e gravou 11/11
 *   00:00. A hora que se vê nunca muda calada (princípio 3): o próximo livre só
 *   preenche quando a hora de abertura não cabe, e diz que trocou.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
// A unidade abre das 00:00 às 23:30 todo dia: o último início de 30 min é 23:00.
const ATE_AS_2330 = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '23:30' }]])) }
let rede: OutraRede
let recepcao: MembroDeTeste
let slug = ''
let nomeDaProfissional = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 }, timezoneId: 'America/Sao_Paulo' })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ag12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('branches').update({ horario: ATE_AS_2330 }).eq('id', rede.branchId)).error).toBeNull()
  // Tudo pelo banco ANTES de qualquer tela abrir (as listas da unidade ficam em cache).
  expect((await b.from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('procedures').update({ duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  nomeDaProfissional = (await b.from('users').select('name').eq('id', rede.professionalId).single<{ name: string }>()).data!.name
  recepcao = await criarMembro(`ag12r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await recepcao?.limpar()
  await rede?.limpar()
})

test('D7: às 23:30, sem horário que caiba hoje, o Agendar vai para amanhã 00:00 e DIZ que trocou', async ({ browser }) => {
  const hoje = dayKeyTZ(new Date())
  const amanha = dayKeyTZ(addDaysTZ(new Date(), 1))
  await como(browser, recepcao, async p => {
    await p.clock.setFixedTime(new Date(`${hoje}T23:30:00-03:00`))
    await p.goto(`/${slug}/agenda?date=${hoje}`)
    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    // A única profissional vem escolhida (A2 da 10ª), e o próximo livre dela é amanhã.
    await expect(modal.locator('#ag-profissional')).toHaveValue(rede.professionalId)
    await expect(modal.locator('#ag-quando')).toHaveValue(`${amanha}T00:00`)
    await expect(modal.locator('[data-proximo-livre]'))
      .toHaveText(`Hoje não há mais horário livre para ${nomeDaProfissional}. O próximo é amanhã, 00:00.`)
  })
})

test('D7: a hora de abertura que cabe fica, sem aviso', async ({ browser }) => {
  const depois = dayKeyTZ(addDaysTZ(new Date(), 2))
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?date=${depois}`)
    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.locator('#ag-profissional')).toHaveValue(rede.professionalId)
    // O dia da tela abre às 08:00, que cabe: o próximo livre não o troca (era 00:00).
    await expect(modal.getByRole('button', { name: 'Confirmar agendamento' })).toBeVisible()
    // A conferência do próximo livre chega sozinha depois: dá a ela o tempo de trocar, se fosse trocar.
    await p.waitForTimeout(2000)
    await expect(modal.locator('#ag-quando')).toHaveValue(`${depois}T08:00`)
    await expect(modal.locator('[data-proximo-livre]')).toHaveCount(0)
  })
})
