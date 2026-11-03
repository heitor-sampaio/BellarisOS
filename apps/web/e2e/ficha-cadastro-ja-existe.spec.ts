import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes, apagarAgendamentos } from './apoio/limpeza'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * r2-cli-01 (o Heitor, revisão de 2026-11-03): "antes de gravar no banco,
 * confere se já existe; se já existir, retorna avisando que já existe,
 * perguntando se deseja cadastrar mesmo assim ou atualizar a ficha
 * existente". Mesmo CPF, mesmo telefone, ou mesmo nome com a mesma data de
 * nascimento:
 * - nada se grava;
 * - "Já existe a ficha de X…", com "Cadastrar mesmo assim" e "Atualizar a ficha
 *   de X" — esta grava na ficha existente só o que foi preenchido agora, sem
 *   apagar o que está lá, e abre a ficha.
 * Substitui a trava calada dos 60 s: sem chave, o segundo envio também cai na
 * pergunta. Vale para o formulário e para o "+ Agendar" com nome e telefone.
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const agendamentos: string[] = []
const nome = (r: string) => `${PREFIXO} Já existe ${r} ${marca}`
let seq = 0
const telefone = () => `(47) 9${String(Date.now()).slice(-4)}-${String(3000 + ++seq).slice(-4)}`

const fichasDe = async (n: string) => ((await db().from('clients').select('id')
  .eq('tenant_id', rede!.tenantId).ilike('name', n)).data ?? []) as { id: string }[]

async function ficha(n: string, fone: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db().from('clients').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, name: n, phone: fone, is_active: true, tags: [], ...extra,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O formulário de cliente novo, com nome e telefone (repetindo até a hidratação). */
async function digitar(p: Page, n: string, fone: string) {
  await p.goto('/admin/clients/new')
  await expect(async () => {
    await p.locator('input[name="name"]').fill(n)
    await p.locator('input[name="phone"]').fill('')
    await p.locator('input[name="phone"]').fill(fone)
    await expect(p.locator('input[name="phone"]')).toHaveValue(/\(\d\d\)/, { timeout: 1000 })
  }).toPass()
  await p.locator('input[name="phone"]').blur()
}

const cadastrar = (p: Page, campos: Record<string, string>) => chamarAcaoComFormulario(
  p, 'actions/clients.ts', 'addClient', '/admin/clients/new', [undefined],
  { _branchId: rede!.branchId, _slug: 'admin', tags: '[]', email: '', document: '', document_type: 'CPF', birth_date: '', gender: '', notes: '', ...campos },
)

test.beforeAll(async () => {
  rede = await criarOutraRede(`je${marca}`)
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`je${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const falhas = await apagarAgendamentos(agendamentos)
  const { data } = await db().from('clients').select('id').eq('tenant_id', rede!.tenantId).ilike('name', `%Já existe%${marca}`)
  expect(await apagarClientes((data ?? []).map(c => c.id as string), falhas)).toEqual([])
  await recepcao?.limpar()
  await rede?.limpar()
})

test('o mesmo telefone: "Já existe a ficha de X", nada se grava; "Atualizar a ficha" grava só o preenchido, sem apagar o que ela tem, e abre a ficha', async ({ browser }) => {
  const fone = telefone()
  const valdir = nome('Valdir')
  const id = await ficha(valdir, fone, { document: '52998224725', birth_date: '1980-01-01', notes: 'Prefere manhã' })
  await como(browser, async p => {
    await digitar(p, valdir, fone)
    const aviso = p.getByRole('alert').filter({ hasText: 'Já existe a ficha de' })
    await expect(aviso).toContainText(`Já existe a ficha de ${valdir} com este telefone.`)
    await expect(aviso.getByRole('button', { name: 'Cadastrar mesmo assim' })).toBeVisible()
    expect(await fichasDe(valdir), 'nada se grava antes da resposta').toHaveLength(1)
    await p.locator('input[name="email"]').fill(`je${marca}@bellaris.invalid`)
    await p.locator('textarea[name="notes"]').fill('Alérgica a látex')
    await aviso.getByRole('button', { name: `Atualizar a ficha de ${valdir}` }).click()
    await expect(p).toHaveURL(new RegExp(`/clients/${id}`))
  })
  expect(await fichasDe(valdir), 'nenhuma ficha nova').toHaveLength(1)
  const { data } = await db().from('clients').select('email, notes, birth_date, document').eq('id', id).single()
  expect(data!.email, 'o e-mail preenchido agora entra').toBe(`je${marca}@bellaris.invalid`)
  expect(data!.notes, 'as observações somam').toBe('Prefere manhã\nAlérgica a látex')
  expect(String(data!.birth_date).slice(0, 10), 'o nascimento em branco não apaga o dela').toBe('1980-01-01')
  expect(data!.document, 'o CPF dela fica').toBe('52998224725')
})

test('o mesmo telefone: "Cadastrar mesmo assim" cria a ficha nova (mãe e filha), e a outra fica como está', async ({ browser }) => {
  const fone = telefone()
  const mae = nome('mãe')
  await ficha(mae, fone, { document: '11144477735' })
  const filha = nome('filha')
  await como(browser, async p => {
    await digitar(p, filha, fone)
    const aviso = p.getByRole('alert').filter({ hasText: 'Já existe a ficha de' })
    await expect(aviso).toContainText(mae)
    await aviso.getByRole('button', { name: 'Cadastrar mesmo assim' }).click()
    await expect(aviso).toBeHidden()
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p).toHaveURL(/\/clients\/[0-9a-f-]{36}/)
  })
  expect(await fichasDe(filha)).toHaveLength(1)
  expect(await fichasDe(mae)).toHaveLength(1)
})

test('o mesmo nome com a mesma data de nascimento, de outro telefone, também pergunta — no envio, sem gravar', async ({ browser }) => {
  const rosa = nome('Rosa Lima')
  await ficha(rosa, telefone(), { birth_date: '1990-05-05' })
  await como(browser, async p => {
    await digitar(p, rosa.toLowerCase(), telefone())
    await p.locator('input[name="birth_date"]').fill('1990-05-05')
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    const aviso = p.getByRole('alert').filter({ hasText: 'Já existe a ficha de' })
    await expect(aviso).toContainText(`Já existe a ficha de ${rosa} com este nome e esta data de nascimento.`)
    expect(await fichasDe(rosa), 'nada se grava').toHaveLength(1)
    await aviso.getByRole('button', { name: 'Cadastrar mesmo assim' }).click()
    await expect(p).toHaveURL(/\/clients\/[0-9a-f-]{36}/)
  })
  expect(await fichasDe(rosa), 'a pessoa decidiu: duas fichas').toHaveLength(2)
})

test('o mesmo CPF: só "Atualizar a ficha" — o CPF é único na clínica', async ({ browser }) => {
  const dono = nome('dona do CPF')
  const id = await ficha(dono, telefone(), { document: '39053344705' })
  await como(browser, async p => {
    await digitar(p, nome('outro nome'), telefone())
    await p.getByLabel('Número do documento').fill('390.533.447-05')
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    const aviso = p.getByRole('alert').filter({ hasText: 'Já existe a ficha de' })
    await expect(aviso).toContainText(`Já existe a ficha de ${dono} com este CPF.`)
    await expect(aviso.getByRole('button', { name: 'Cadastrar mesmo assim' })).toHaveCount(0)
    await aviso.getByRole('button', { name: `Atualizar a ficha de ${dono}` }).click()
    await expect(p).toHaveURL(new RegExp(`/clients/${id}`))
  })
  const { data: doCpf } = await db().from('clients').select('id, name').eq('tenant_id', rede!.tenantId).eq('document', '39053344705')
  // Uma ficha só, a que existia — com o nome preenchido agora (o "Atualizar"
  // grava o que foi preenchido; decisão da F14, para o Heitor revisar).
  expect(doCpf, 'nenhuma ficha nova').toEqual([{ id, name: nome('outro nome') }])
})

test('sem a chave da tela, o segundo envio do mesmo cadastro também pergunta — não vira o mesmo cadastro calado (era a trava dos 60 s)', async ({ browser }) => {
  const n = nome('dois envios')
  const fone = telefone()
  await como(browser, async p => {
    await p.goto('/admin/clients/new')
    const primeiro = await cadastrar(p, { name: n, phone: fone })
    expect(primeiro.texto, primeiro.texto.slice(0, 300)).toMatch(/"success":true/)
    const segundo = await cadastrar(p, { name: n, phone: fone })
    expect(segundo.texto, segundo.texto.slice(0, 300)).toContain('"jaExiste"')
    expect(segundo.texto).not.toMatch(/"success":true/)
  })
  expect(await fichasDe(n)).toHaveLength(1)
})

test('o "+ Agendar" com nome e telefone de quem já tem ficha pergunta — "Atualizar a ficha" agenda nela, sem ficha nova', async ({ browser }) => {
  const fone = telefone()
  const marli = nome('Marli')
  const id = await ficha(marli, fone)
  const dia = diaEmQueAUnidadeAbre(9)
  await como(browser, async p => {
    await p.goto(`/admin/agenda?date=${dia}`)
    await p.getByRole('button', { name: 'Agendar' }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await p.getByRole('button', { name: /Não é cliente ainda/ }).click()
    await modal.locator('input[name="client_name"]').fill(marli)
    await modal.locator('input[name="client_phone"]').fill(fone)
    const procedimento = modal.locator('select[name="procedure_id"]')
    await expect(procedimento.locator('option')).not.toHaveCount(1)
    await procedimento.selectOption(rede!.procedureId)
    await modal.locator('select[name="professional_id"]').selectOption(rede!.professionalId)
    await modal.locator('input[type="datetime-local"]').fill(`${dia}T15:00`)
    await modal.getByRole('button', { name: 'Confirmar agendamento' }).click()
    const aviso = modal.getByRole('alert').filter({ hasText: 'Já existe a ficha de' })
    await expect(aviso).toContainText(`Já existe a ficha de ${marli} com este telefone.`)
    await expect(aviso.getByRole('button', { name: 'Cadastrar mesmo assim' })).toBeVisible()
    expect((await db().from('appointments').select('id').eq('client_id', id)).data ?? [], 'nada agendado antes da resposta').toHaveLength(0)
    await aviso.getByRole('button', { name: `Atualizar a ficha de ${marli}` }).click()
    await expect(modal).toBeHidden()
  })
  const { data: ags } = await db().from('appointments').select('id').eq('client_id', id)
  expect(ags ?? [], 'agendado na ficha que existia').toHaveLength(1)
  agendamentos.push(...(ags ?? []).map(a => a.id as string))
  expect(await fichasDe(marli), 'nenhuma ficha nova').toHaveLength(1)
})

test('o agendar pelo CRM com nome e telefone de quem já tem ficha também pergunta; respondido "Atualizar", agenda nela', async ({ browser }) => {
  const fone = telefone()
  const lia = nome('Lia')
  const id = await ficha(lia, fone)
  const dia = diaEmQueAUnidadeAbre(10)
  const pedido = (jaExiste?: string) => ({
    leadId: '', conversationId: null, branchId: rede!.branchId, professionalId: rede!.professionalId, procedureId: rede!.procedureId,
    scheduledAt: new Date(`${dia}T16:00:00-03:00`).toISOString(), contato: { nome: lia, telefone: fone }, ...(jaExiste ? { jaExiste } : {}),
  })
  await como(browser, async p => {
    await p.goto('/admin/inbox')
    const pergunta = await chamarAcao(p, 'actions/crm-scheduling.ts', 'createCrmAppointment', '/admin/inbox', [pedido()])
    expect(pergunta.texto, pergunta.texto.slice(0, 300)).toContain('"jaExiste"')
    expect((await db().from('appointments').select('id').eq('client_id', id)).data ?? [], 'nada agendado').toHaveLength(0)
    const r = await chamarAcao(p, 'actions/crm-scheduling.ts', 'createCrmAppointment', '/admin/inbox', [pedido(`atualizar:${id}`)])
    expect(r.texto, r.texto.slice(0, 300)).toMatch(/"id":"[0-9a-f-]{36}"/)
  })
  const { data: ags } = await db().from('appointments').select('id').eq('client_id', id)
  expect(ags ?? []).toHaveLength(1)
  agendamentos.push(...(ags ?? []).map(a => a.id as string))
  expect(await fichasDe(lia)).toHaveLength(1)
})
