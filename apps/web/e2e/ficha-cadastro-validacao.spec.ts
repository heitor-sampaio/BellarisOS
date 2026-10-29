import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * O cadastro completo confere o que a recepção digita (D12 e D13 da
 * simulação de 2026-10-29):
 * - D12: o CPF 11111111111 passava (só o tamanho era conferido) e, com o
 *   acesso ao app marcado, a tela mostrava o erro do Auth em inglês;
 * - D13: "(41) 9920" e o telefone de OUTRA cliente passavam sem aviso.
 * O telefone repetido AVISA e deixa confirmar — mãe e filha dividem número.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const nome = (r: string) => `${PREFIXO} Validação ${r} ${marca}`
const telefone = (fim: string) => `(41) 9${String(Date.now()).slice(-4)}-${fim}`

const fichasDe = async (n: string) => ((await db().from('clients').select('id, name, phone, auth_id')
  .eq('tenant_id', rede!.tenantId).eq('name', n)).data ?? []) as { id: string; name: string; phone: string; auth_id: string | null }[]

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Preenche o cadastro (repetindo até a hidratação: antes dela, o estado dos campos controlados fica vazio). */
async function preencher(p: Page, dados: { nome: string; telefone: string; email?: string; cpf?: string }) {
  await p.goto('/admin/clients/new')
  await expect(async () => {
    await p.locator('input[name="name"]').fill(dados.nome)
    await p.locator('input[name="phone"]').fill('')
    await p.locator('input[name="phone"]').fill(dados.telefone)
    await expect(p.locator('input[name="phone"]')).toHaveValue(/\(\d\d\)/, { timeout: 1000 })
    if (dados.email && dados.cpf) {
      await p.locator('input[name="email"]').fill('')
      await p.locator('input[name="email"]').fill(dados.email)
      await p.locator('input[name="document"]').fill('')
      await p.locator('input[name="document"]').fill(dados.cpf)
      await expect(p.getByRole('checkbox', { name: 'Criar o acesso ao app' })).toBeEnabled({ timeout: 1000 })
    }
  }).toPass()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cv${marca}`)
  recepcao = await criarMembro(`cv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const { data } = await db().from('clients').select('id, auth_id').eq('tenant_id', rede!.tenantId).like('name', `%Validação%${marca}`)
  for (const c of (data ?? []) as { id: string; auth_id: string | null }[]) {
    if (c.auth_id) await db().auth.admin.deleteUser(c.auth_id)
  }
  expect(await apagarClientes((data ?? []).map(c => c.id as string))).toEqual([])
  await recepcao?.limpar()
  await rede?.limpar()
})

test('D12: o CPF pelos dígitos verificadores — 111.111.111-11 é recusado, em português, sem login nem ficha', async ({ browser }) => {
  const email = `e2e-cv1${marca}@bellaris.invalid`
  await como(browser, async p => {
    await preencher(p, { nome: nome('cpf repetido'), telefone: telefone('0001'), email, cpf: '111.111.111-11' })
    await p.getByRole('checkbox', { name: 'Criar o acesso ao app' }).check()
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.getByText(/CPF inválido/)).toBeVisible()
    await expect(p.getByText(/Password|weak/i)).toHaveCount(0)
    // E o CPF com o verificador errado também.
    await p.locator('input[name="document"]').fill('529.982.247-24')
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.getByText(/CPF inválido/)).toBeVisible()
  })
  expect(await fichasDe(nome('cpf repetido'))).toEqual([])
  const { data: logins } = await db().auth.admin.listUsers({ perPage: 1000 })
  expect(logins.users.some(u => u.email === email), 'nenhum login nasceu').toBe(false)
})

test('D13: o telefone incompleto é recusado', async ({ browser }) => {
  await como(browser, async p => {
    await preencher(p, { nome: nome('fone curto'), telefone: '(41) 9920' })
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.getByText(/Telefone incompleto/)).toBeVisible()
  })
  expect(await fichasDe(nome('fone curto'))).toEqual([])
})

test('D13: o telefone de outra cliente AVISA, e a recepção confirma (mãe e filha)', async ({ browser }) => {
  const fone = telefone('0002')
  const { data: mae, error } = await db().from('clients').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, name: nome('mãe'), phone: fone, document: '52998224725', is_active: true,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()

  await como(browser, async p => {
    await preencher(p, { nome: nome('filha'), telefone: fone })
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    const aviso = p.getByRole('alert').filter({ hasText: 'já é de' })
    await expect(aviso).toContainText(nome('mãe'))
    expect(await fichasDe(nome('filha')), 'o aviso não cadastra').toEqual([])
    // O nome digitado continua no campo: confirmar não pede para digitar de novo.
    await expect(p.locator('input[name="name"]')).toHaveValue(nome('filha'))

    await aviso.getByRole('button', { name: 'Cadastrar mesmo assim' }).click()
    await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
  })
  expect(await fichasDe(nome('filha'))).toHaveLength(1)
  const [daMae] = await fichasDe(nome('mãe'))
  expect(daMae?.id, 'a ficha da mãe continua a dela').toBe(mae!.id)
})
