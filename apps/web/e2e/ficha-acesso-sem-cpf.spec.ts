import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Decisão 1 do Heitor (7ª simulação, 2026-11-05: "concordo"): a Sophie
 * (passaporte 19FR54321) fechou um plano de R$ 7.200 e não via sessões,
 * parcelas nem agenda — a regra de 29/10 era "sem CPF, sem acesso ao app por
 * enquanto", porque a senha inicial é o CPF. Agora a senha inicial é o número
 * do documento da ficha (passaporte, RNE), PROVISÓRIA como a do CPF, e o aviso
 * diz qual é. Sem documento nenhum, segue sem acesso, e a tela diz por quê.
 * "Dar acesso a quem já tem conta" sem CPF: a mesma pessoa só se liga com o
 * MESMO documento (o §5 do CLAUDE.md). Em redes [e2e] próprias.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let A: OutraRede
let B: OutraRede
let recepcaoA: MembroDeTeste
let recepcaoB: MembroDeTeste
const nome = (r: string) => `${PREFIXO} Sem CPF ${r} ${marca}`
const telefone = (fim: string) => `(41) 9${String(Date.now()).slice(-4)}-${fim}`
const PASSAPORTE = `FR${String(Date.now()).slice(-7)}`
const EMAIL = `e2e-scpf${marca}@bellaris.invalid`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function preencher(p: Page, d: { nome: string; telefone: string; tipo?: 'Passaporte' | 'RNE'; numero?: string; email?: string }) {
  await p.goto('/admin/clients/new')
  await expect(async () => {
    await p.locator('input[name="name"]').fill(d.nome)
    await p.locator('input[name="phone"]').fill('')
    await p.locator('input[name="phone"]').fill(d.telefone)
    await expect(p.locator('input[name="phone"]')).toHaveValue(/\(\d\d\)/, { timeout: 1000 })
    if (d.tipo) {
      await p.getByLabel('Tipo do documento').selectOption({ label: d.tipo })
      await p.locator('input[name="document"]').fill(d.numero!)
      await expect(p.locator('input[name="document"]')).toHaveValue(d.numero!.toUpperCase(), { timeout: 1000 })
    }
    if (d.email) await p.locator('input[name="email"]').fill(d.email)
  }).toPass()
}

const fichaDe = async (tenant: string, n: string) => (await db().from('clients')
  .select('id, auth_id, documento_tipo, documento_numero').eq('tenant_id', tenant).eq('name', n).maybeSingle<{
    id: string; auth_id: string | null; documento_tipo: string | null; documento_numero: string | null
  }>()).data

const marcaProvisoria = async (authId: string) =>
  ((await db().auth.admin.getUserById(authId)).data.user?.app_metadata as { senha_provisoria?: boolean } | undefined)?.senha_provisoria ?? null

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  A = await criarOutraRede(`sca${marca}`)
  B = await criarOutraRede(`scb${marca}`)
  const permissoes = [{ modulo: 'clients' as const, nivel: 'MANAGE' as const }]
  recepcaoA = await criarMembro(`scra${marca}`, { tenant: A.tenantId, rotulo: 'Recepção', permissoes })
  recepcaoB = await criarMembro(`scrb${marca}`, { tenant: B.tenantId, rotulo: 'Recepção', permissoes })
})

test.afterAll(async () => {
  for (const t of [A, B]) {
    const { data } = await db().from('clients').select('auth_id').eq('tenant_id', t?.tenantId ?? '').not('auth_id', 'is', null)
    for (const c of (data ?? []) as { auth_id: string }[]) await db().auth.admin.deleteUser(c.auth_id).catch(() => {})
  }
  await recepcaoA?.limpar(); await recepcaoB?.limpar()
  await A?.limpar(); await B?.limpar()
})

test('com passaporte e e-mail, o cadastro cria o acesso: a senha inicial é o passaporte, provisória, e o aviso diz qual é', async ({ browser }) => {
  await como(browser, recepcaoA, async p => {
    await preencher(p, { nome: nome('Sophie'), telefone: telefone('0101'), tipo: 'Passaporte', numero: PASSAPORTE, email: EMAIL })
    const caixa = p.getByRole('checkbox', { name: 'Criar o acesso ao app' })
    await expect(caixa).toBeEnabled()
    await expect(p.getByText(/senha inicial = o número do passaporte/)).toBeVisible()
    await caixa.check()
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.getByText(`a senha inicial é o número do passaporte, ${PASSAPORTE} (em maiúsculas)`)).toBeVisible()
    await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
  })
  const ficha = await fichaDe(A.tenantId, nome('Sophie'))
  expect(ficha?.auth_id, 'o login nasceu').toBeTruthy()
  expect(ficha).toMatchObject({ documento_tipo: 'PASSAPORTE', documento_numero: PASSAPORTE })
  expect(await marcaProvisoria(ficha!.auth_id!), 'provisória, como a do CPF').toBe(true)

  // Ela entra com o e-mail e o passaporte — e cai na troca da senha.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const p = await ctx.newPage()
    await p.goto('/login')
    await expect(async () => {
      await p.locator('#email').fill(EMAIL)
      await p.locator('#password').fill(PASSAPORTE)
      await p.getByRole('button', { name: 'Entrar' }).click()
      await expect(p).toHaveURL(/\/update-password\?primeiro=1/, { timeout: 10_000 })
    }).toPass({ timeout: 40_000 })
  } finally {
    await ctx.close()
  }
})

test('na aba Dados, a ficha com RNE e e-mail ganha "Dar acesso ao app", com a senha dita', async ({ browser }) => {
  const cliente = await A.criarCliente(`RNE ${marca}`)
  const rne = `V${String(Date.now()).slice(-6)}-7`
  const email = `e2e-scrne${marca}@bellaris.invalid`
  expect((await db().from('clients').update({ document: null, documento_tipo: 'RNE', documento_numero: rne, email }).eq('id', cliente)).error).toBeNull()
  await como(browser, recepcaoA, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=dados`)
    await expect(p.getByText('O login é o e-mail, e a senha inicial, o número do RNE.')).toBeVisible()
    await p.getByRole('button', { name: 'Dar acesso ao app' }).click()
    await expect(p.getByText(`a senha inicial é o número do RNE, ${rne} (em maiúsculas)`)).toBeVisible()
  })
  const { data } = await db().from('clients').select('auth_id').eq('id', cliente).single<{ auth_id: string | null }>()
  expect(data?.auth_id).toBeTruthy()
  expect(await marcaProvisoria(data!.auth_id!)).toBe(true)
})

test('sem documento nenhum, segue sem acesso — e a tela diz por quê', async ({ browser }) => {
  await como(browser, recepcaoA, async p => {
    await preencher(p, { nome: nome('Sem documento'), telefone: telefone('0102'), email: `e2e-scsd${marca}@bellaris.invalid` })
    await expect(p.getByRole('checkbox', { name: 'Criar o acesso ao app' })).toBeDisabled()
    await expect(p.getByText(/precisa do e-mail e de um documento \(CPF, passaporte ou RNE\)/)).toBeVisible()
  })
  const cliente = await A.criarCliente(`Sem doc ${marca}`)
  expect((await db().from('clients').update({ document: null, email: `e2e-scsd2${marca}@bellaris.invalid` }).eq('id', cliente)).error).toBeNull()
  await como(browser, recepcaoA, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=dados`)
    await expect(p.getByText('Esta cliente ainda não tem acesso ao app. Para dar, salve o e-mail e um documento dela (CPF, passaporte ou RNE).')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Dar acesso ao app' })).toBeDisabled()
  })
})

test('em outra clínica, o mesmo e-mail com o MESMO passaporte liga a ficha à conta; com outro, recusa', async ({ browser }) => {
  // A Sophie do primeiro teste já tem conta (rede A). Outro passaporte com o
  // mesmo e-mail é outra pessoa: recusa, e nada nasce.
  await como(browser, recepcaoB, async p => {
    await preencher(p, { nome: nome('Outra pessoa'), telefone: telefone('0104'), tipo: 'Passaporte', numero: `ZZ${String(Date.now()).slice(-6)}`, email: EMAIL })
    await p.getByRole('checkbox', { name: 'Criar o acesso ao app' }).check()
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.getByText('Este e-mail já tem uma conta no BellarisOS com outro documento. Confira o e-mail e o documento da cliente.')).toBeVisible()
  })
  expect(await fichaDe(B.tenantId, nome('Outra pessoa'))).toBeNull()

  // O MESMO passaporte: a ficha da rede B entra na conta dela.
  await como(browser, recepcaoB, async p => {
    await preencher(p, { nome: nome('Sophie na B'), telefone: telefone('0103'), tipo: 'Passaporte', numero: PASSAPORTE, email: EMAIL })
    await p.getByRole('checkbox', { name: 'Criar o acesso ao app' }).check()
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    await expect(p.getByText('Ficha ligada à conta que já existe')).toBeVisible()
  })
  const naA = await fichaDe(A.tenantId, nome('Sophie'))
  const naB = await fichaDe(B.tenantId, nome('Sophie na B'))
  expect(naB?.auth_id, 'a mesma conta').toBe(naA?.auth_id)
})
