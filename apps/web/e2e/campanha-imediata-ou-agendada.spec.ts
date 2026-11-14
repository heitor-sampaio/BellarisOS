import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'
import { addDaysTZ, partsInTZ } from '../lib/datetime'

/**
 * MK1 (a revisão do Heitor, 2026-11-13: "mk1 ok"): a campanha é IMEDIATA ou
 * AGENDADA — numa data e hora, ou todo ano numa data (o Dia das Mães). Sai o
 * tipo "Automática": o aniversário, o lembrete de agenda, o pós-visita, o
 * vencimento de pacote, a confirmação, o cancelamento e os pontos viraram
 * modelos DESLIGADOS nas Automações (AU1) — a tela diz onde eles estão.
 *
 * Rede `[e2e]` própria; quem monta tem o Marketing em Gerenciar e vê as
 * Automações (o link).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let marta: MembroDeTeste

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: marta.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`mk1${marca}`)
  marta = await criarMembro(`mk1m${marca}`, {
    tenant: rede.tenantId, rotulo: 'Marketing',
    permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }, { modulo: 'automations', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('notification_campaigns').delete().eq('tenant_id', rede.tenantId)
  await marta?.limpar()
  await rede?.limpar()
})

// Uma data de todo ano que NÃO é hoje (daqui a 3 dias), no relógio de Brasília.
const dataAnual = partsInTZ(addDaysTZ(new Date(), 3))
const dd = (n: number) => String(n).padStart(2, '0')

test('MK1: só Imediata e Agendada; a agendada é numa data e hora ou todo ano; os gatilhos de cliente estão nas Automações', async ({ browser }) => {
  const nome = `${PREFIXO} Dia especial ${marca}`
  await como(browser, async p => {
    await p.goto('/admin/notificacoes/nova')
    await expect(p.getByRole('button', { name: /Imediata/ })).toBeVisible()
    await expect(p.getByRole('button', { name: /Agendada/ })).toBeVisible()
    await expect(p.getByRole('button', { name: /Automática/ }), 'o tipo "Automática" saiu').toHaveCount(0)

    // Onde foram parar os gatilhos de cada cliente.
    const nasAutomacoes = p.locator('[data-gatilhos-nas-automacoes]')
    for (const g of ['Aniversário', 'Lembrete do agendamento', 'Pós-visita', 'Vencimento de pacote', 'Confirmação', 'Cancelamento', 'Pontos de fidelidade']) {
      await expect(nasAutomacoes).toContainText(g)
    }
    await expect(nasAutomacoes.getByRole('link', { name: /Automações/ })).toHaveAttribute('href', '/admin/automacoes')

    await p.getByRole('button', { name: /Agendada/ }).click()
    const quando = p.getByRole('group', { name: 'Quando a campanha sai' })
    await expect(quando.getByRole('button', { name: /Numa data e hora/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(p.getByLabel('Data e hora do disparo')).toBeVisible()
    await quando.getByRole('button', { name: /Todo ano/ }).click()
    await expect(p.getByLabel('Data e hora do disparo')).toHaveCount(0)
    await p.getByLabel('Mês').selectOption(String(dataAnual.month))
    await p.getByLabel('Dia', { exact: true }).fill(String(dataAnual.day))
    await p.getByRole('button', { name: 'Próximo' }).click()

    await p.getByPlaceholder('ex: Aniversariantes de julho').fill(nome)
    await p.getByPlaceholder(/Feliz aniversário/).fill('Um dia especial, {{first_name}}')
    await p.getByPlaceholder(/Como presente/).fill('Venha comemorar com a gente.')
    await p.getByRole('button', { name: 'Próximo' }).click()
    await p.getByRole('button', { name: 'Próximo' }).click()
    await expect(p.locator('[data-quando-dispara]')).toContainText(`todo ano em ${dd(dataAnual.day)}/${dd(dataAnual.month)}, a partir das 09:00`)
    await p.getByRole('button', { name: /Salvar rascunho/ }).click()
    await expect(p).toHaveURL(/\/admin\/notificacoes$/)
  })

  const { data: camp, error } = await db().from('notification_campaigns')
    .select('id, type, scheduled_at, trigger_type, trigger_config, status').eq('tenant_id', rede.tenantId).eq('name', nome).single()
  expect(error).toBeNull()
  expect(camp).toMatchObject({
    type: 'SCHEDULED', scheduled_at: null, trigger_type: 'ANNUAL_DATE',
    trigger_config: { month: dataAnual.month, day: dataAnual.day }, status: 'DRAFT',
  })

  await como(browser, async p => {
    await p.goto(`/admin/notificacoes/${camp!.id}`)
    await expect(p.locator('[data-quando-dispara]')).toContainText(`todo ano em ${dd(dataAnual.day)}/${dd(dataAnual.month)}`)
    // Hoje não é a data: ninguém recebe hoje.
    await expect(p.locator('[data-receberiam-hoje]')).toContainText(`Hoje não é ${dd(dataAnual.day)}/${dd(dataAnual.month)}`, { timeout: 20_000 })

    // Ativada, a de todo ano fica ATIVA (sai todo ano) — e se pausa.
    await p.getByRole('button', { name: 'Ativar' }).click()
    await expect.poll(async () => (await db().from('notification_campaigns').select('status').eq('id', camp!.id).single()).data?.status).toBe('ACTIVE')
    await p.getByRole('button', { name: 'Pausar' }).click()
    await expect.poll(async () => (await db().from('notification_campaigns').select('status').eq('id', camp!.id).single()).data?.status).toBe('PAUSED')
  })
})

test('MK1: a action recusa a campanha "Automática" — nada se grava', async ({ browser }) => {
  const nome = `${PREFIXO} Aniversário automático ${marca}`
  await como(browser, async p => {
    await p.goto('/admin/notificacoes/nova')
    const r = await chamarAcao(p, 'actions/notification-campaigns.ts', 'createCampaign', '/admin/notificacoes/nova', [{
      name: nome, type: 'AUTOMATED', trigger_type: 'BIRTHDAY', title: 'Parabéns', body: 'x',
      notification_type: 'promotion', audience_rules: {},
    }])
    expect(r.status).toBe(200)
    // A agendada com gatilho de cliente também.
    const r2 = await chamarAcao(p, 'actions/notification-campaigns.ts', 'createCampaign', '/admin/notificacoes/nova', [{
      name: `${nome} 2`, type: 'SCHEDULED', scheduled_at: '2030-01-01T09:00', trigger_type: 'BEFORE_APPOINTMENT', trigger_config: { hours: 24 },
      title: 'Lembrete', body: 'x', notification_type: 'promotion', audience_rules: {},
    }])
    expect(r2.status).toBe(200)
  })
  const { data } = await db().from('notification_campaigns').select('id').eq('tenant_id', rede.tenantId).like('name', `${nome}%`)
  expect(data ?? []).toEqual([])
})

test('MK1: o banco não aceita mais o tipo "Automática" nem o gatilho de cliente', async () => {
  const base = { tenant_id: rede.tenantId, title: 'x', body: 'x', audience_rules: {} }
  const automatica = await db().from('notification_campaigns').insert({ ...base, name: `${PREFIXO} auto ${marca}`, type: 'AUTOMATED', trigger_type: 'BIRTHDAY' })
  expect(automatica.error, 'o tipo AUTOMATED é recusado').not.toBeNull()
  const lembrete = await db().from('notification_campaigns').insert({ ...base, name: `${PREFIXO} lembrete ${marca}`, type: 'SCHEDULED', trigger_type: 'BEFORE_APPOINTMENT', trigger_config: { hours: 2 } })
  expect(lembrete.error, 'o gatilho de cliente é recusado').not.toBeNull()
})
