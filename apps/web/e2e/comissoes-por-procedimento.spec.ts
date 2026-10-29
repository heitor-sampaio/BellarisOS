import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { responderAnamnese } from './apoio/anamnese'

/**
 * A comissão pelo PROCEDIMENTO (pedido do Heitor, 2026-10-15): cada
 * procedimento tem uma comissão GERAL, a mesma para todo mundo, ou uma
 * diferente para cada profissional.
 *  - A geral vence a exceção e o padrão do profissional; salvá-la tira as
 *    exceções do procedimento, e a Equipe deixa de oferecê-lo como exceção.
 *  - "Por profissional" são as exceções de sempre (as da Equipe), vistas pelo
 *    procedimento; quem fica sem valor segue o padrão dele.
 *  - Também no modal de criar e de editar procedimento (pedido do Heitor, o
 *    mesmo dia): a mesma janela, gravada junto com o procedimento.
 *  - Só quem tem `financial: MANAGE` vê e muda (a action confere de novo).
 *
 * Numa rede [e2e] própria: a regra é da rede.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let soVe: MembroDeTeste
let procB = ''
let cliente = ''
const PROC_B = `${PREFIXO} Proc B ${marca}`
const NOVO = `${PREFIXO} Proc Novo ${marca}`
const FURO = `${PREFIXO} Proc Furo ${marca}`

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`cpp${marca}`)
  const r = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: PROC_B, category: 'e2e', duration_min: 30, price: 100,
  }).select('id').single<{ id: string }>()
  expect(r.error).toBeNull()
  procB = r.data!.id
  await db().from('users').update({ provides_services: true, is_active: true }).eq('id', rede.professionalId)
  // O profissional: padrão 10% e uma exceção no procedimento A (R$ 80 fixo).
  const regras = await db().from('commission_rules').insert([
    { tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true },
    { tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: rede.procedureId, type: 'FIXED_AMOUNT', value: 80, is_active: true },
  ])
  expect(regras.error).toBeNull()
  cliente = await rede.criarCliente('Comissão do procedimento')
  // A ficha de saúde respondida (as obrigatórias): desde a revisão do Heitor de
  // 2026-10-29, a obrigatória sem resposta barra o "Finalizar atendimento".
  await responderAnamnese(cliente, rede.tenantId)
  gestor = await criarMembro(`cppg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor',
    permissoes: [
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'team', nivel: 'VIEW' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' },
      { modulo: 'stock', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
  // O gestor também atende (sem regra nenhuma): é a segunda linha do "por profissional".
  await db().from('users').update({ provides_services: true }).eq('id', gestor.userId)
  // Gere o catálogo e VÊ o financeiro: não mexe em quanto cada um ganha.
  soVe = await criarMembro(`cppv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê',
    permissoes: [{ modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  await gestor?.limpar(); await soVe?.limpar()
  await rede?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const regrasDo = async (procedimento: string) => ((await db().from('commission_rules')
  .select('professional_id, type, value').eq('procedure_id', procedimento)).data ?? [])
  .map(r => ({ professional_id: r.professional_id as string | null, type: r.type as string, value: Number(r.value) }))

const nomeDoProcA = async () => (await db().from('procedures').select('name').eq('id', rede.procedureId).single()).data!.name as string

test('a mesma para todos: grava a geral e tira as exceções do procedimento', async ({ browser }) => {
  const nomeA = await nomeDoProcA()
  await como(browser, gestor, async p => {
    await p.goto('/admin/procedures')
    const chip = p.locator(`[data-comissao-procedimento="${rede.procedureId}"]`)
    await expect(chip).toHaveText('Por profissional · 1')
    await chip.click()
    const janela = p.getByRole('dialog', { name: `Comissão de ${nomeA}` })
    await janela.getByRole('button', { name: 'A mesma para todos' }).click()
    await janela.getByRole('button', { name: 'Percentual' }).click()
    await janela.getByLabel('Valor da comissão geral').fill('25')
    await janela.getByRole('button', { name: 'Salvar' }).click()
    await expect(janela).toBeHidden()
    await expect(chip).toHaveText('25% para todos')
  })
  expect(await regrasDo(rede.procedureId)).toEqual([{ professional_id: null, type: 'PERCENTAGE', value: 25 }])
})

test('por profissional: um valor para quem precisa, e quem fica no padrão não grava nada', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto('/admin/procedures')
    const chip = p.locator(`[data-comissao-procedimento="${procB}"]`)
    await expect(chip).toHaveText('Padrão de cada um')
    await chip.click()
    const janela = p.getByRole('dialog', { name: `Comissão de ${PROC_B}` })
    await expect(janela.getByRole('button', { name: 'Por profissional' })).toHaveAttribute('aria-pressed', 'true')
    const prof = janela.locator(`[data-profissional="${rede.professionalId}"]`)
    await expect(prof).toContainText('padrão: 10%')
    await expect(janela.locator(`[data-profissional="${gestor.userId}"]`)).toContainText('sem padrão')
    await prof.getByRole('button', { name: 'Valor fixo' }).click()
    await prof.getByLabel(/^Valor de /).fill('50')
    await janela.getByRole('button', { name: 'Salvar' }).click()
    await expect(janela).toBeHidden()
    await expect(chip).toHaveText('Por profissional · 1')
  })
  expect(await regrasDo(procB)).toEqual([{ professional_id: rede.professionalId, type: 'FIXED_AMOUNT', value: 50 }])
})

test('o atendimento concluído usa a geral do procedimento, não a exceção nem o padrão', async ({ browser }) => {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 200, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const ap = data!.id
  await como(browser, gestor, async p => {
    await p.goto(`/admin/agenda/${ap}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.locator('textarea[name="notes"]').fill(`${PREFIXO} comissão do procedimento`)
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', ap).single()).data?.status,
      { timeout: 20_000 }).toBe('COMPLETED')
  })
  const linhas = (await db().from('commission_lines').select('regra_tipo, regra_valor').eq('appointment_id', ap)).data ?? []
  expect(linhas.map(l => [l.regra_tipo, Number(l.regra_valor)])).toEqual([['PERCENTAGE', 25]])
  const extrato = (await db().from('commissions').select('amount').eq('appointment_id', ap)).data ?? []
  expect(extrato.reduce((s, c) => s + Number(c.amount), 0)).toBe(50)
})

test('a Equipe não oferece exceção num procedimento com comissão geral (nem pela action direta)', async ({ browser }) => {
  const nomeA = await nomeDoProcA()
  await como(browser, gestor, async p => {
    await p.goto('/admin/team')
    await p.locator(`[data-comissao="${rede.professionalId}"]`).click()
    const adicionar = p.locator('dialog[open]').getByLabel('Adicionar exceção')
    await expect(adicionar.locator('option', { hasText: PROC_B })).toHaveCount(0) // já é exceção
    await expect(adicionar.locator('option', { hasText: nomeA })).toHaveCount(0)   // tem geral
    const r = await chamarAcao(p, 'actions/comissoes.ts', 'salvarRegrasDoProfissional', '/admin/team', [rede.professionalId, {
      padrao: { tipo: 'PERCENTAGE', valor: 10 },
      excecoes: [{ procedure_id: rede.procedureId, tipo: 'FIXED_AMOUNT', valor: 80 }, { procedure_id: procB, tipo: 'FIXED_AMOUNT', valor: 50 }],
    }])
    expect(r.texto).not.toContain('"ok":true')
  })
  expect(await regrasDo(rede.procedureId)).toEqual([{ professional_id: null, type: 'PERCENTAGE', value: 25 }])
})

const procPeloNome = async (nome: string) => (await db().from('procedures').select('id').eq('tenant_id', rede.tenantId).eq('name', nome).maybeSingle()).data?.id as string | undefined

test('o modal de criar procedimento já define a comissão — a mesma para todos', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto('/admin/procedures')
    await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
    const dialogo = p.locator('dialog[open]')
    await dialogo.locator('input[name="name"]').fill(NOVO)
    await dialogo.locator('select[name="category"]').selectOption('Outros')
    await dialogo.locator('input[name="duration_min"]').fill('40')
    await dialogo.locator('input[name="price"]').fill('300,00')
    const comissao = dialogo.locator('[aria-label="Comissão do procedimento"]')
    await expect(comissao.getByRole('button', { name: 'Por profissional' })).toHaveAttribute('aria-pressed', 'true')
    await comissao.getByRole('button', { name: 'A mesma para todos' }).click()
    await comissao.getByRole('button', { name: 'Percentual' }).click()
    await comissao.getByLabel('Valor da comissão geral').fill('30')
    await dialogo.getByRole('button', { name: 'Criar procedimento' }).click()
    await expect(dialogo).toBeHidden()
  })
  const id = await procPeloNome(NOVO)
  expect(id, 'o procedimento nasceu').toBeTruthy()
  expect(await regrasDo(id!)).toEqual([{ professional_id: null, type: 'PERCENTAGE', value: 30 }])
})

test('o modal de editar abre com a comissão atual e grava a mudança junto', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto('/admin/procedures')
    await p.locator('tr', { hasText: PROC_B }).getByRole('button', { name: 'Editar' }).click()
    const dialogo = p.locator('dialog[open]')
    const comissao = dialogo.locator('[aria-label="Comissão do procedimento"]')
    await expect(comissao.getByRole('button', { name: 'Por profissional' })).toHaveAttribute('aria-pressed', 'true')
    const prof = comissao.locator(`[data-profissional="${rede.professionalId}"]`)
    await expect(prof.getByRole('button', { name: 'Valor fixo' })).toHaveAttribute('aria-pressed', 'true')
    await expect(prof.getByLabel(/^Valor de /)).toHaveValue('50')
    await prof.getByRole('button', { name: 'Padrão' }).click()
    const eu = comissao.locator(`[data-profissional="${gestor.userId}"]`)
    await eu.getByRole('button', { name: 'Percentual' }).click()
    await eu.getByLabel(/^Valor de /).fill('15')
    await dialogo.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(dialogo).toBeHidden()
    await expect(p.locator(`[data-comissao-procedimento="${procB}"]`)).toHaveText('Por profissional · 1')
  })
  expect(await regrasDo(procB)).toEqual([{ professional_id: gestor.userId, type: 'PERCENTAGE', value: 15 }])
})

test('quem só vê o financeiro não vê nem muda a comissão do procedimento', async ({ browser }) => {
  await como(browser, soVe, async p => {
    await p.goto('/admin/procedures')
    await expect(p.getByRole('heading', { name: 'Procedimentos' })).toBeVisible()
    await expect(p.locator('[data-comissao-procedimento]')).toHaveCount(0)

    await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
    const dialogo = p.locator('dialog[open]')
    await expect(dialogo.locator('[aria-label="Comissão do procedimento"]')).toHaveCount(0)
    await dialogo.locator('input[name="name"]').fill(FURO)
    await dialogo.locator('select[name="category"]').selectOption('Outros')
    await dialogo.locator('input[name="price"]').fill('100,00')
    // O campo plantado à mão (a tela não o mostra): a action recusa antes de gravar.
    await dialogo.locator('form').evaluate(form => {
      const campo = document.createElement('input')
      campo.type = 'hidden'; campo.name = 'comissao'
      campo.value = JSON.stringify({ modo: 'GERAL', geral: { tipo: 'PERCENTAGE', valor: 90 } })
      form.appendChild(campo)
    })
    await dialogo.getByRole('button', { name: 'Criar procedimento' }).click()
    await expect(dialogo.getByText('Seu cargo não muda a comissão dos procedimentos.')).toBeVisible()
    await expect.poll(() => procPeloNome(FURO)).toBeUndefined()
    await p.keyboard.press('Escape')

    const r = await chamarAcao(p, 'actions/comissoes.ts', 'salvarComissaoDoProcedimento', '/admin/procedures', [procB, {
      modo: 'GERAL', geral: { tipo: 'PERCENTAGE', valor: 90 },
    }])
    expect(r.texto).not.toContain('"ok":true')
  })
  expect(await regrasDo(procB)).toEqual([{ professional_id: gestor.userId, type: 'PERCENTAGE', value: 15 }])
})
