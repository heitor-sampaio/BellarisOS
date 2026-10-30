import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * D-11 (decisão do Heitor, frente de cadastro de 2026-10-29): o campo CPF
 * vira "Documento" com tipo — CPF, Passaporte ou RNE. A estrangeira sem CPF
 * não tinha como entrar com documento nenhum. O CPF continua com a máscara, a
 * conta dos verificadores e a unicidade de sempre; passaporte e RNE aceitam
 * texto livre razoável. Sem CPF, a cliente fica SEM acesso ao app por
 * enquanto (a senha inicial do app é o CPF): a tela diz isso e não oferece
 * criar o acesso. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const nome = (r: string) => `${PREFIXO} Documento ${r} ${marca}`
const telefone = (fim: string) => `(41) 9${String(Date.now()).slice(-4)}-${fim}`

type Ficha = { id: string; document: string | null; documento_tipo: string | null; documento_numero: string | null }
const fichaDe = async (n: string) => (await db().from('clients').select('id, document, documento_tipo, documento_numero')
  .eq('tenant_id', rede!.tenantId).eq('name', n).maybeSingle<Ficha>()).data

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function preencher(p: Page, dados: { nome: string; telefone: string; tipo: 'Passaporte' | 'RNE'; numero: string; email?: string }) {
  await p.goto('/admin/clients/new')
  await expect(async () => {
    await p.locator('input[name="name"]').fill(dados.nome)
    await p.locator('input[name="phone"]').fill('')
    await p.locator('input[name="phone"]').fill(dados.telefone)
    await expect(p.locator('input[name="phone"]')).toHaveValue(/\(\d\d\)/, { timeout: 1000 })
    await p.getByLabel('Tipo do documento').selectOption({ label: dados.tipo })
    await p.locator('input[name="document"]').fill(dados.numero)
    await expect(p.locator('input[name="document"]')).toHaveValue(dados.numero.toUpperCase(), { timeout: 1000 })
    if (dados.email) await p.locator('input[name="email"]').fill(dados.email)
  }).toPass()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dc${marca}`)
  recepcao = await criarMembro(`dc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const { data } = await db().from('clients').select('id').eq('tenant_id', rede!.tenantId).like('name', `%Documento%${marca}`)
  expect(await apagarClientes((data ?? []).map(c => c.id as string))).toEqual([])
  await recepcao?.limpar()
  await rede?.limpar()
})

test('passaporte no cadastro: grava o tipo e o número, sem CPF — e o acesso ao app não é oferecido', async ({ browser }) => {
  await como(browser, async p => {
    await preencher(p, { nome: nome('passaporte'), telefone: telefone('0101'), tipo: 'Passaporte', numero: 'ab123456', email: `e2e-dc1${marca}@bellaris.invalid` })
    await expect(p.getByText('Sem CPF, a cliente fica sem acesso ao app por enquanto')).toBeVisible()
    await expect(p.getByRole('checkbox', { name: 'Criar o acesso ao app' })).toHaveCount(0)
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
  })
  const ficha = await fichaDe(nome('passaporte'))
  expect(ficha).toMatchObject({ document: null, documento_tipo: 'PASSAPORTE', documento_numero: 'AB123456' })

  // A aba Dados mostra o tipo e o número, diz por que não há acesso, e troca para RNE.
  await como(browser, async p => {
    await p.goto(`/admin/clients/${ficha!.id}?aba=dados`)
    await expect(p.getByLabel('Tipo do documento')).toHaveValue('PASSAPORTE')
    await expect(p.getByLabel('Número do documento')).toHaveValue('AB123456')
    await expect(p.getByText(/sem CPF.*não tem acesso ao app por enquanto/i)).toBeVisible()
    await expect(p.getByRole('button', { name: 'Dar acesso ao app' })).toHaveCount(0)
    await p.getByLabel('Tipo do documento').selectOption('RNE')
    await p.getByLabel('Número do documento').fill('V123456-7')
    await p.getByRole('button', { name: /Salvar dados/ }).click()
    await expect(p.getByRole('button', { name: 'Salvo' })).toBeVisible()
  })
  expect(await fichaDe(nome('passaporte'))).toMatchObject({ document: null, documento_tipo: 'RNE', documento_numero: 'V123456-7' })
})

test('documento ilegível é recusado, e o passaporte repetido na rede também', async ({ browser }) => {
  const { error } = await db().from('clients').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, name: nome('dona do passaporte'), phone: telefone('0102'),
    documento_tipo: 'PASSAPORTE', documento_numero: 'ZZ998877', is_active: true,
  })
  expect(error).toBeNull()

  await como(browser, async p => {
    await preencher(p, { nome: nome('ilegível'), telefone: telefone('0103'), tipo: 'Passaporte', numero: 'a#1' })
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.getByText(/Documento inválido/)).toBeVisible()

    await p.locator('input[name="document"]').fill('ZZ998877')
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.getByText('Já existe uma cliente com este passaporte nesta rede.')).toBeVisible()
  })
  expect(await fichaDe(nome('ilegível'))).toBeNull()
})
