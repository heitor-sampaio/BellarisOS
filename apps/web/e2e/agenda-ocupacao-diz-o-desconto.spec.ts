import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { dayKeyTZ } from '../lib/datetime'

/**
 * A9 da 13ª simulação (F65): a base da ocupação dizia "N min abertos" já sem o
 * que a profissional tinha agendado na OUTRA unidade — a conta não fechava
 * com o horário da tela, e ninguém sabia por quê (princípio 3). Agora a base
 * diz o desconto: "… menos 40 min da Patrícia na Água Verde", na agenda e no
 * dashboard da unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TODO_DIA = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }
const hoje = dayKeyTZ(new Date())
const NOME = `${PREFIXO} Patrícia ${marca}`
const OUTRA = `${PREFIXO} Água Verde ${marca}`
let rede: OutraRede | null = null
let slug = ''
let unidadeB = ''
let gestor: MembroDeTeste | null = null

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`oc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('branches').update({ horario: TODO_DIA }).eq('id', rede.branchId)).error).toBeNull()
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: OUTRA, slug: `e2e-oc2-${marca}`, horario: TODO_DIA }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  unidadeB = b!.id
  expect((await db().from('users').update({ name: NOME, branch_id: rede.branchId, horario: TODO_DIA, atende_em: [rede.branchId, unidadeB] })
    .eq('id', rede.professionalId)).error).toBeNull()
  const cliente = await rede.criarCliente('Ocupa')
  // 40 min dela HOJE na outra unidade, às 03:00 (o dia inteiro está aberto).
  expect((await db().from('appointments').insert({
    branch_id: unidadeB, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 40, price: 0, scheduled_at: new Date(`${hoje}T03:00:00-03:00`).toISOString(),
  })).error).toBeNull()
  gestor = await criarMembro(`ocg${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  if (unidadeB) {
    await db().from('appointments').delete().eq('branch_id', unidadeB)
    await db().from('branches').delete().eq('id', unidadeB)
  }
  await gestor?.limpar(); await rede?.limpar()
})

test('A9: a base da ocupação diz o que ela tem na outra unidade, na agenda e no dashboard', async ({ browser }) => {
  const desconto = `menos 40 min da ${NOME} na ${OUTRA}`
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/dashboard`)
    await expect(p.locator('[data-base-da-ocupacao]').last(), 'no dashboard').toContainText(desconto)
    await p.goto(`/${slug}/agenda?date=${hoje}`)
    await expect(p.locator('[data-base-da-ocupacao]').first(), 'na agenda').toContainText(desconto)
  })
})
