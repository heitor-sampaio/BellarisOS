import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * A cliente de balcão (2026-10-21, decisão do Heitor; atrito da simulação de
 * um dia de clínica): "Novo cliente" exigia e-mail e CPF e sempre criava o
 * acesso ao app — a recepção só cadastrava quem chegava sem e-mail pela Agenda.
 *
 * Agora nome e telefone bastam; e-mail e CPF são opcionais; o acesso ao app é
 * uma caixa marcada, que só se marca com os dois. E quem não ganhou o acesso
 * no cadastro ganha depois, pela aba Dados da ficha.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const nome = (r: string) => `${PREFIXO} Balcão ${r} ${marca}`
let seq = 0

function cpfDeTeste(): string {
  const base = (String(Date.now()).slice(-8) + String(seq++ % 10)).split('').map(Number)
  const dv = (nums: number[]) => {
    const r = (nums.reduce((s, n, i) => s + n * (nums.length + 1 - i), 0) * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  return [...base, d1, dv([...base, d1])].join('')
}
const telefone = () => '48 9' + String(Date.now()).slice(-8)

const fichaDe = async (n: string) => (await db().from('clients').select('id, email, document, auth_id')
  .eq('tenant_id', rede!.tenantId).eq('name', n).maybeSingle<{ id: string; email: string | null; document: string | null; auth_id: string | null }>()).data

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function preencher(p: Page, n: string, extra: { email?: string; cpf?: string } = {}) {
  await p.goto('/admin/clients/new')
  await p.locator('input[name="name"]').fill(n)
  await p.locator('input[name="phone"]').fill(telefone())
  if (!extra.email || !extra.cpf) return
  // Preenchido antes da hidratação, o estado fica vazio: repete até a caixa do acesso acordar.
  await expect(async () => {
    await p.locator('input[name="email"]').fill('')
    await p.locator('input[name="email"]').fill(extra.email!)
    await p.locator('input[name="document"]').fill('')
    await p.locator('input[name="document"]').fill(extra.cpf!)
    await expect(p.getByRole('checkbox', { name: 'Criar o acesso ao app' })).toBeEnabled({ timeout: 1000 })
  }).toPass()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`bc${marca}`)
  recepcao = await criarMembro(`bc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const { data } = await db().from('clients').select('id, auth_id').eq('tenant_id', rede!.tenantId).like('name', `%Balcão%${marca}`)
  for (const c of (data ?? []) as { id: string; auth_id: string | null }[]) {
    if (c.auth_id) await db().auth.admin.deleteUser(c.auth_id)
  }
  expect(await apagarClientes((data ?? []).map(c => c.id as string))).toEqual([])
  await recepcao?.limpar()
  await rede?.limpar()
})

test.describe.serial('a cliente de balcão', () => {
  test('só nome e telefone: cadastra, sem acesso ao app — e a caixa do acesso não se marca', async ({ browser }) => {
    await como(browser, async p => {
      await preencher(p, nome('so telefone'))
      await expect(p.getByRole('checkbox', { name: 'Criar o acesso ao app' })).toBeDisabled()
      await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
      await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
    })
    expect(await fichaDe(nome('so telefone'))).toMatchObject({ email: null, document: null, auth_id: null })
  })

  test('com e-mail e CPF, o acesso só nasce se marcar', async ({ browser }) => {
    await como(browser, async p => {
      await preencher(p, nome('sem marcar'), { email: `e2e-bc1${marca}@bellaris.invalid`, cpf: cpfDeTeste() })
      await expect(p.getByRole('checkbox', { name: 'Criar o acesso ao app' })).not.toBeChecked()
      await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
      await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)

      await preencher(p, nome('marcado'), { email: `e2e-bc2${marca}@bellaris.invalid`, cpf: cpfDeTeste() })
      await p.getByRole('checkbox', { name: 'Criar o acesso ao app' }).check()
      await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
      await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
    })
    const semMarcar = await fichaDe(nome('sem marcar'))
    expect(semMarcar?.document, 'o CPF fica').toMatch(/^\d{11}$/)
    expect(semMarcar?.auth_id, 'sem acesso').toBeNull()
    expect((await fichaDe(nome('marcado')))?.auth_id, 'marcado, o acesso nasce').toBeTruthy()
  })

  test('na ficha, "Dar acesso ao app" cria o login de quem já tem e-mail e CPF', async ({ browser }) => {
    const ficha = await fichaDe(nome('sem marcar'))
    await como(browser, async p => {
      await p.goto(`/admin/clients/${ficha!.id}?aba=dados`)
      await p.getByRole('button', { name: 'Dar acesso ao app' }).click()
      await expect(p.getByText('Acesso criado: login = e-mail, senha = CPF.')).toBeVisible()
    })
    expect((await fichaDe(nome('sem marcar')))?.auth_id).toBeTruthy()
  })
})
