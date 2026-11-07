import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { haMinutosHoje } from './apoio/datas'
import { startOfDayTZ } from '../lib/datetime'

/**
 * A21 da 9ª simulação (2026-11-07): a agenda não marcava o agendamento que
 * passou do horário e segue "Agendado" (o órfão das 00:30 da Rosana) — no dia
 * e na semana, ele parecia um agendamento como outro qualquer. Agora o cartão
 * diz "passou do horário", sem fechar nada sozinho (princípio 6: quem marca a
 * falta ou conclui é a recepção). Numa rede [e2e] própria, 24 h.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TODO_DIA = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }
let rede: OutraRede
let slug = ''
let recepcao: MembroDeTeste

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`a9${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('branches').update({ horario: TODO_DIA }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('users').update({ branch_id: rede.branchId, atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`a9r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await recepcao?.limpar()
  await rede?.limpar()
})

test('A21: o agendamento que passou do horário e segue "Agendado" é marcado no dia e na semana — e o futuro não', async ({ browser }) => {
  // Logo depois da meia-noite não há "passou do horário" de hoje.
  test.skip(Date.now() - startOfDayTZ(new Date()).getTime() < 20 * 60_000, 'meia-noite: nada de hoje já passou')
  const cliente = await rede.criarCliente('Rosana')
  const novo = async (quando: string) => {
    const { data, error } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      scheduled_at: quando, duration_min: 10, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    return data!.id
  }
  const passou = await novo(haMinutosHoje(15))
  const futuro = await novo(new Date(Date.now() + 3 * 3600_000).toISOString())

  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda`)
    for (const visao of ['Dia', 'Semana']) {
      if (visao === 'Semana') await p.getByRole('button', { name: 'Semana', exact: true }).click()
      await expect(p.locator(`[data-agendamento="${passou}"] [data-passou-sem-fechar]`), visao).toContainText('passou do horário')
      await expect(p.locator(`[data-agendamento="${futuro}"] [data-passou-sem-fechar]`)).toHaveCount(0)
    }
  })
  expect((await db().from('appointments').select('status').eq('id', passou).single()).data?.status, 'nada se fecha sozinho').toBe('SCHEDULED')
})

/**
 * A53 da 9ª simulação (2026-11-07): a ocupação ("13%") não dizia a base — a
 * Carolina não conseguiu prová-la (340 ÷ 2.720). A agenda e o dashboard da
 * unidade dizem a conta: minutos agendados de minutos abertos, de quem atende.
 */
test('A53: a ocupação diz a base na agenda e no dashboard da unidade', async ({ browser }) => {
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda`)
    await expect(p.locator('[data-base-da-ocupacao]').first()).toContainText(/min agendados de [\d.]+ min abertos \(o horário de 1 profissional que atende\)/)
    await p.goto(`/${slug}/dashboard`)
    await expect(p.locator('[data-base-da-ocupacao]')).toContainText(/min agendados de [\d.]+ min abertos \(o horário de 1 profissional que atende\)/)
  })
})
