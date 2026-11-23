import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Sai o "só os meus" e cada passo do atendimento é um módulo (o Heitor,
 * 2026-11-23 — docs/revisao.md, SM1–SM6 e UM1–UM5).
 *
 * - SM1: o cargo não diz mais "o que enxerga"; a tela de Cargos não tem o
 *   "Enxerga", e o escopo que chegar à action grava "todos".
 * - SM2: as vistas pessoais. Quem ATENDE e não tem a Agenda vê a Minha agenda
 *   (só os horários dela, sem agendar nem iniciar); quem atende ou tem
 *   comissão de venda e não tem o Financeiro vê as Minhas comissões.
 * - UM1/UM2: a tela do atendimento abre com o Atendimento em Ver; iniciar é do
 *   Atendimento em Gerenciar. A Agenda sozinha não abre a tela.
 */

const marca = `vp${Date.now().toString(36)}`
const db = () => banco()
const SEM_ACESSO = 'Você não tem acesso a esta área'

let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let ana: MembroDeTeste          // atende, sem módulo nenhum
let soAgenda: MembroDeTeste     // Agenda em Gerenciar, sem o Atendimento
let soVer: MembroDeTeste        // Agenda e Atendimento em Ver
let vendedora: MembroDeTeste    // não atende, tem comissão de venda
let ninguem: MembroDeTeste      // não atende, sem comissão, sem módulo
let daAna = ''
let deOutra = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Hoje às `hora` em Brasília, como o banco grava. */
function hojeAs(hora: string): string {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  return new Date(`${dia}T${hora}:00-03:00`).toISOString()
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()

  const base = { tenant: rede.tenantId, branchId: rede.branchId }
  dona = await criarMembro(`d${marca}`, { ...base, rotulo: 'Admin da rede', donoDaRede: true, permissoes: [] })
  ana = await criarMembro(`a${marca}`, {
    ...base, rotulo: 'Atende, sem módulo', atendeEm: [rede.branchId],
    permissoes: [{ modulo: 'agenda', nivel: 'NONE' }, { modulo: 'atendimento', nivel: 'NONE' }, { modulo: 'financial', nivel: 'NONE' }],
  })
  soAgenda = await criarMembro(`g${marca}`, {
    ...base, rotulo: 'Só a Agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'atendimento', nivel: 'NONE' }],
  })
  soVer = await criarMembro(`v${marca}`, {
    ...base, rotulo: 'Atendimento em Ver',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'atendimento', nivel: 'VIEW' }],
  })
  vendedora = await criarMembro(`c${marca}`, { ...base, rotulo: 'Comissão de venda', permissoes: [{ modulo: 'financial', nivel: 'NONE' }] })
  ninguem = await criarMembro(`n${marca}`, { ...base, rotulo: 'Sem nada', permissoes: [{ modulo: 'financial', nivel: 'NONE' }] })
  // Antes da primeira requisição dela: o membro em cache já nasce com a comissão.
  expect((await db().from('users').update({ comissao_venda_pct: 3 }).eq('id', vendedora.userId)).error).toBeNull()

  const cliente = await rede.criarCliente(`cli ${marca}`)
  const agendar = async (professional_id: string, hora: string) => {
    const { data, error } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id,
      scheduled_at: hojeAs(hora), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(error, error?.message).toBeNull()
    return data!.id
  }
  daAna = await agendar(ana.userId, '13:00')
  deOutra = await agendar(rede.professionalId, '14:00')
})

test.afterAll(async () => {
  for (const m of [dona, ana, soAgenda, soVer, vendedora, ninguem]) await m?.limpar()
  await rede?.limpar()
})

const cartaoDaMinhaAgenda = (p: Page, id: string) =>
  p.locator(`[data-cartao-minha-agenda="${id}"], [data-atendimento-da-semana="${id}"]`)

test('SM2: quem atende e não tem a Agenda vê a Minha agenda, só com os horários dela, sem agendar', async ({ browser }) => {
  await como(browser, ana.estado, async p => {
    await p.goto(`/${slug}/agenda`)
    await expect(p.getByRole('heading', { name: 'Minha agenda' })).toBeVisible()
    await expect(cartaoDaMinhaAgenda(p, daAna).first()).toBeAttached()
    await expect(cartaoDaMinhaAgenda(p, deOutra)).toHaveCount(0)
    // A vista só mostra: agendar é da Agenda em Gerenciar.
    await expect(p.locator('button, a').filter({ hasText: /^\s*Agendar\s*$/ })).toHaveCount(0)
  })
})

test('SM2/UM2: pela vista pessoal, a tela do atendimento DELA abre sem Iniciar; a de outra pessoa, não; a action recusa', async ({ browser }) => {
  await como(browser, ana.estado, async p => {
    await p.goto(`/${slug}/agenda/${daAna}`)
    await expect(p.getByText(SEM_ACESSO)).toHaveCount(0)
    await expect(p.getByText(`cli ${marca}`, { exact: false }).first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Iniciar atendimento' })).toHaveCount(0)
    await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', `/${slug}/agenda/${daAna}`, [daAna, slug])

    await p.goto(`/${slug}/agenda/${deOutra}`)
    await expect(p.getByText(SEM_ACESSO)).toBeVisible()
  })
  const { data } = await db().from('appointments').select('status').eq('id', daAna).single<{ status: string }>()
  expect(data!.status, 'a vista pessoal não inicia o atendimento').toBe('SCHEDULED')
})

test('UM1: com a Agenda em Gerenciar e sem o Atendimento, a tela do atendimento não abre', async ({ browser }) => {
  await como(browser, soAgenda.estado, async p => {
    await p.goto(`/${slug}/agenda/${deOutra}`)
    await expect(p.getByText(SEM_ACESSO)).toBeVisible()
  })
})

test('UM1/UM2: com o Atendimento em Ver, a tela abre sem Iniciar, e a action não inicia', async ({ browser }) => {
  await como(browser, soVer.estado, async p => {
    await p.goto(`/${slug}/agenda/${deOutra}`)
    await expect(p.getByText(SEM_ACESSO)).toHaveCount(0)
    await expect(p.getByText(`cli ${marca}`, { exact: false }).first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Iniciar atendimento' })).toHaveCount(0)
    await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', `/${slug}/agenda/${deOutra}`, [deOutra, slug])
  })
  const { data } = await db().from('appointments').select('status').eq('id', deOutra).single<{ status: string }>()
  expect(data!.status, 'o Atendimento em Ver não inicia').toBe('SCHEDULED')
})

test('SM2: a comissão de venda abre as Minhas comissões sem o Financeiro; sem ela (e sem atender), não abre', async ({ browser }) => {
  await como(browser, vendedora.estado, async p => {
    await p.goto(`/${slug}/financeiro/comissoes`)
    await expect(p.getByRole('heading', { name: 'Minhas comissões' })).toBeVisible()
  })
  await como(browser, ninguem.estado, async p => {
    await p.goto(`/${slug}/financeiro/comissoes`)
    await expect(p.getByText(SEM_ACESSO)).toBeVisible()
  })
})

test('SM1: a tela de Cargos não tem o "Enxerga", e o escopo que chegar à action grava "todos"', async ({ browser }) => {
  const { data: cargo, error } = await db().from('tenant_roles')
    .insert({ tenant_id: rede.tenantId, key: `VP_${marca}`.toUpperCase(), label: `${PREFIXO} Cargo vp ${marca}`, is_system: false })
    .select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  try {
    await como(browser, dona.estado, async p => {
      await p.goto('/admin/settings?tab=permissions')
      await expect(p.locator('[data-modulo="crm"]').first()).toBeVisible()
      await expect(p.getByText('Enxerga', { exact: true })).toHaveCount(0)
      await expect(p.getByText('Só os meus', { exact: false })).toHaveCount(0)
      const r = await chamarAcaoComFormulario(p, 'actions/permissions.ts', 'saveRolePermissions',
        '/admin/settings?tab=permissions', [undefined], { roleId: cargo!.id, 'level:crm': 'MANAGE', 'scope:crm': 'OWN' })
      expect(r.texto, 'chegou à action').not.toContain('Server action not found')
    })
    const { data: linhas } = await db().from('role_permissions').select('module, level, scope').eq('role_id', cargo!.id).eq('module', 'crm')
    expect(linhas ?? []).toEqual([{ module: 'crm', level: 'MANAGE', scope: 'ALL' }])
  } finally {
    await db().from('role_permissions').delete().eq('role_id', cargo!.id)
    await db().from('tenant_roles').delete().eq('id', cargo!.id)
  }
})
