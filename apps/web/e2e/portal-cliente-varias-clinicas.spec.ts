import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco } from './apoio/banco'
import fs from 'node:fs'
import path from 'node:path'
import { clienteComSessao, criarMembro, sessaoPorEmail, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * A mesma pessoa cliente de DUAS clínicas que usam o BellarisOS (2026-10-19).
 *
 * Decisão do Heitor: um login por pessoa, uma ficha em cada clínica. A conta é
 * dela; as fichas são de cada clínica, e cada clínica só vê a sua. Até aqui o
 * banco tinha `clients.auth_id` ÚNICO — um login, uma ficha, em qualquer rede —
 * e a segunda clínica recebia "Este e-mail já está em uso por outra conta".
 *
 * O cenário: duas redes `[e2e]` (A e B), a cliente com ficha e login na A, a
 * ficha dela na B ligada ao MESMO login, e uma outra pessoa na B (sem login) —
 * a vítima: nada dela pode aparecer.
 */

const marca = Date.now().toString(36)
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const db = () => banco()

let A: OutraRede
let B: OutraRede
let cliente: ClienteDeTeste
let loginDela = ''
let fichaB = ''
let alheia = ''
let agA = '', agB = '', agAlheio = ''

/** CPF com dígito verificador válido, do relógio mais um deslocamento (dois no mesmo ms diferem). */
function cpfDeTeste(desloca: number): string {
  const base = String(Date.now() + desloca * 7919).slice(-9).split('').map(Number)
  const dv = (nums: number[]) => {
    const r = (nums.reduce((s, n, i) => s + n * (nums.length + 1 - i), 0) * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  return [...base, d1, dv([...base, d1])].join('')
}

/** O PostgREST com a sessão da cliente — o que o navegador dela pode fazer. */
function comoEla(): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${cliente.accessToken}` } },
  })
}

async function agendamento(rede: OutraRede, clienteId: string): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: clienteId, procedure_id: rede.procedureId,
    professional_id: rede.professionalId, status: 'SCHEDULED', source: 'INTERNAL',
    scheduled_at: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(), duration_min: 30, price: 0,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o agendamento').toBeNull()
  return data!.id
}

test.describe('a mesma cliente em duas clínicas', () => {
  test.beforeAll(async () => {
    A = await criarOutraRede(`vca${marca}`)
    B = await criarOutraRede(`vcb${marca}`)
    cliente = await clienteComSessao(`vc${marca}`, { id: A.branchId, slug: `e2e-un-vca${marca}` }, { tenant: A.tenantId })
    const { data: ela } = await db().from('clients').select('auth_id').eq('id', cliente.clientId).single<{ auth_id: string }>()
    loginDela = ela!.auth_id

    fichaB = await B.criarCliente('Mesma pessoa')
    alheia = await B.criarCliente('Outra pessoa')
    const { error } = await db().from('clients').update({ auth_id: loginDela }).eq('id', fichaB)
    expect(error, 'o mesmo login ligado à ficha dela na clínica B').toBeNull()

    agA = await agendamento(A, cliente.clientId)
    agB = await agendamento(B, fichaB)
    agAlheio = await agendamento(B, alheia)
  })

  test.afterAll(async () => {
    await cliente?.limpar()
    await B?.limpar()
    await A?.limpar()
  })

  test('com o token dela, o banco mostra as fichas dela nas duas clínicas — e só as dela', async () => {
    const { error: eN } = await db().from('client_notifications').insert([
      { client_id: cliente.clientId, title: 'Aviso da A' },
      { client_id: fichaB, title: 'Aviso da B' },
      { client_id: alheia, title: 'Aviso alheio' },
    ])
    expect(eN, 'criar os avisos').toBeNull()
    const { error: eC } = await db().from('internal_credits').insert([
      { client_id: cliente.clientId, branch_id: A.branchId, amount: 10, description: 'crédito A' },
      { client_id: fichaB, branch_id: B.branchId, amount: 20, description: 'crédito B' },
      { client_id: alheia, branch_id: B.branchId, amount: 30, description: 'crédito alheio' },
    ])
    expect(eC, 'criar os créditos').toBeNull()

    const ela = comoEla()
    const ids = async (tabela: string, coluna = 'id') => {
      const { data, error } = await ela.from(tabela).select(coluna)
      expect(error, `ler ${tabela} como ela`).toBeNull()
      return ((data ?? []) as unknown as Record<string, string>[]).map(l => l[coluna]).sort()
    }
    const dela = [cliente.clientId, fichaB].sort()

    expect(await ids('clients'), 'as duas fichas dela, e não a da outra pessoa').toEqual(dela)
    expect(await ids('appointments'), 'os agendamentos dela nas duas clínicas').toEqual([agA, agB].sort())
    expect(await ids('client_notifications', 'client_id'), 'os avisos das duas clínicas').toEqual(dela)
    expect(await ids('loyalty_accounts', 'client_id'), 'as contas de pontos das duas').toEqual(dela)
    expect(await ids('internal_credits', 'client_id'), 'os créditos das duas').toEqual(dela)
    expect(agAlheio).toBeTruthy()

    // Escrever: o pedido de LGPD vai pela ficha da clínica a que se refere.
    const { error: eLgpdB } = await ela.from('lgpd_requests').insert({ client_id: fichaB, type: 'export', tenant_id: B.tenantId })
    expect(eLgpdB, 'ela pede pela ficha da B').toBeNull()
    const { error: eLgpdAlheio } = await ela.from('lgpd_requests').insert({ client_id: alheia, type: 'export', tenant_id: B.tenantId })
    expect(eLgpdAlheio, 'nunca pela ficha de outra pessoa').not.toBeNull()
  })

  // A clínica é a do ENDEREÇO: o app acha a ficha dela naquela clínica — a
  // claim `client_id` do token é só a marca "é cliente" (é a da A, aqui).
  test('no portal de cada clínica ela vê e edita a ficha DAQUELA clínica', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: cliente.estado })
    const page = await ctx.newPage()
    try {
      const procA = `Proc vca${marca}`
      const procB = `Proc vcb${marca}`

      await page.goto(`/e2e-un-vcb${marca}/cliente/home`)
      await expect(page).toHaveURL(new RegExp(`/e2e-un-vcb${marca}/cliente/home`))
      await expect(page.getByText(procB).first(), 'o agendamento da B').toBeVisible()
      await expect(page.getByText(procA), 'nada da A no portal da B').toHaveCount(0)

      await page.goto(`/e2e-un-vca${marca}/cliente/home`)
      await expect(page.getByText(procA).first(), 'o agendamento da A').toBeVisible()
      await expect(page.getByText(procB), 'nada da B no portal da A').toHaveCount(0)

      // A action também: o perfil salvo no portal da B grava a ficha da B.
      const cidade = `[e2e] Cidade B ${marca}`
      await page.goto(`/e2e-un-vcb${marca}/cliente/perfil`)
      await page.getByRole('button', { name: 'Editar' }).click()
      await page.locator('input[name="city"]').fill(cidade)
      await page.getByRole('button', { name: 'Salvar' }).click()
      await expect.poll(async () =>
        (await db().from('clients').select('city').eq('id', fichaB).single()).data?.city,
      ).toBe(cidade)
      const { data: a } = await db().from('clients').select('city').eq('id', cliente.clientId).single()
      expect(a?.city, 'a ficha da A não muda').not.toBe(cidade)
    } finally {
      await ctx.close()
    }
  })

  // A clínica B cadastra pela TELA quem já usa o BellarisOS na A: e-mail e CPF
  // batem → a ficha nova é ligada à conta que ela já tem (decisão do Heitor:
  // liga sozinho). CPF diferente, ou e-mail de alguém da equipe, é recusado.
  test('a clínica B cadastra quem já tem conta: liga a ficha à mesma conta', async ({ browser }) => {
    const pessoa = await clienteComSessao(`vd${marca}`, { id: A.branchId, slug: `e2e-un-vca${marca}` }, { tenant: A.tenantId })
    const recepcao = await criarMembro(`vdb${marca}`, {
      tenant: B.tenantId, branchId: B.branchId, permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }],
    })
    const cpf = cpfDeTeste(1)
    const emailDela = `e2e-cliente-vd${marca}@bellaris.invalid`
    await db().from('clients').update({ document: cpf }).eq('id', pessoa.clientId)
    const { data: loginP } = await db().from('clients').select('auth_id').eq('id', pessoa.clientId).single<{ auth_id: string }>()

    const ctx = await browser.newContext({ storageState: recepcao.estado })
    const page = await ctx.newPage()
    const cadastrar = async (email: string, documento: string) => {
      await page.goto(`/e2e-un-vcb${marca}/clients/new`)
      await page.locator('input[name="name"]').fill(`[e2e] Ela na B ${marca}`)
      await page.locator('input[name="phone"]').fill('48 9' + String(Date.now()).slice(-8))
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="document"]').fill(documento)
      await page.getByRole('button', { name: 'Cadastrar cliente' }).click()
    }
    const fichaNaB = async () => (await db().from('clients').select('id, auth_id')
      .eq('tenant_id', B.tenantId).eq('email', emailDela).maybeSingle<{ id: string; auth_id: string | null }>()).data
    try {
      await cadastrar(emailDela, cpfDeTeste(2))
      await expect(page.getByText(/outro CPF/i), 'CPF diferente: recusado').toBeVisible()
      expect(await fichaNaB(), 'e nada foi cadastrado').toBeNull()

      await cadastrar(`e2e-membro-vdb${marca}@bellaris.invalid`, cpfDeTeste(3))
      await expect(page.getByText('Este e-mail já está em uso por outra conta.'), 'e-mail da equipe: recusado').toBeVisible()

      await cadastrar(emailDela, cpf)
      await expect.poll(fichaNaB, { message: 'a ficha da B nasce ligada à conta dela' })
        .toMatchObject({ auth_id: loginP!.auth_id })

      // E ela entra no portal da B com a sessão que já tinha.
      const dela = await browser.newContext({ storageState: pessoa.estado })
      const p = await dela.newPage()
      await p.goto(`/e2e-un-vcb${marca}/cliente/home`)
      await expect(p).toHaveURL(new RegExp(`/e2e-un-vcb${marca}/cliente/home`))
      await dela.close()
    } finally {
      await ctx.close()
      const ficha = await fichaNaB()
      if (ficha) await apagarClientes([ficha.id])
      await recepcao.limpar()
      await pessoa.limpar()
    }
  })

  // Decisão do Heitor: no primeiro login com mais de uma clínica, ela escolhe;
  // depois, entra na última que usou. No portal, o nome da unidade no topo
  // leva de volta ao seletor.
  test('com duas clínicas: o primeiro login é o seletor; depois, a última clínica usada', async ({ browser }) => {
    await db().from('clients').update({ portal_ultima_entrada_em: null }).in('id', [cliente.clientId, fichaB])
    const email = `e2e-cliente-vc${marca}@bellaris.invalid`
    const estado = path.join(__dirname, '.auth', `cliente-vc-entrada-${marca}.json`)
    try {
      const primeira = await sessaoPorEmail(loginDela, email, estado)
      expect(primeira.destino, 'nunca escolheu: o seletor').toBe('/auth/clinicas')

      const ctx = await browser.newContext({ storageState: estado })
      const page = await ctx.newPage()
      await page.goto(primeira.destino)
      await expect(page.getByRole('button', { name: new RegExp(`Unidade vca${marca}`) })).toBeVisible()
      await page.getByRole('button', { name: new RegExp(`Unidade vcb${marca}`) }).click()
      await expect(page).toHaveURL(new RegExp(`/e2e-un-vcb${marca}/cliente`))

      // No portal, o topo leva de volta ao seletor.
      await page.getByRole('link', { name: 'Trocar de clínica' }).click()
      await expect(page).toHaveURL(/\/auth\/clinicas/)
      await ctx.close()

      const segunda = await sessaoPorEmail(loginDela, email, estado)
      expect(segunda.destino, 'a última clínica usada').toBe(`/e2e-un-vcb${marca}/cliente`)
    } finally {
      fs.rmSync(estado, { force: true })
    }
  })

  test('com UMA clínica só, o login vai direto para ela e o topo não oferece troca', async ({ browser }) => {
    const sozinha = await clienteComSessao(`vs${marca}`, { id: A.branchId, slug: `e2e-un-vca${marca}` }, { tenant: A.tenantId })
    try {
      expect(sozinha.destino).toBe(`/e2e-un-vca${marca}/cliente`)
      const ctx = await browser.newContext({ storageState: sozinha.estado })
      const page = await ctx.newPage()
      await page.goto(sozinha.destino)
      await expect(page.getByText(`[e2e] Unidade vca${marca}`).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Trocar de clínica' })).toHaveCount(0)
      await ctx.close()
    } finally {
      await sozinha.limpar()
    }
  })

  // O aparelho é registrado pela ficha da clínica em que ela estava; o aviso
  // de QUALQUER clínica dela tem de chegar nele (e nunca no de outra pessoa).
  test('os aparelhos dela recebem o aviso de qualquer clínica dela', async () => {
    const token = `e2e-tok-${marca}`
    const endpoint = `https://e2e.invalido/push/${marca}`
    const { error: eT } = await db().from('push_tokens').insert({ token, platform: 'android', client_id: cliente.clientId })
    const { error: eW } = await db().from('web_push_subscriptions')
      .insert({ client_id: cliente.clientId, endpoint, keys: { p256dh: 'e2e', auth: 'e2e' } })
    expect(eT ?? eW, 'registrar os aparelhos pela ficha da A').toBeNull()
    try {
      const { data: daB, error } = await db().rpc('aparelhos_da_cliente', { p_cliente: fichaB })
      expect(error).toBeNull()
      const lista = (daB ?? []) as { token: string | null; endpoint: string | null }[]
      expect(lista.map(a => a.token).filter(Boolean), 'o celular, pelo aviso da B').toEqual([token])
      expect(lista.map(a => a.endpoint).filter(Boolean), 'o navegador, pelo aviso da B').toEqual([endpoint])

      const { data: daAlheia } = await db().rpc('aparelhos_da_cliente', { p_cliente: alheia })
      expect(daAlheia ?? [], 'nada da outra pessoa').toEqual([])
    } finally {
      await db().from('push_tokens').delete().eq('token', token)
      await db().from('web_push_subscriptions').delete().eq('endpoint', endpoint)
    }
  })

  test('o bônus de primeiro acesso vale em cada clínica, na primeira vez que ela abre o portal dela', async ({ browser }) => {
    const { error: eC } = await db().from('loyalty_configs')
      .upsert({ tenant_id: B.tenantId, enabled: true, first_access_bonus: 50 }, { onConflict: 'tenant_id' })
    expect(eC, 'ligar a fidelidade da B com o bônus').toBeNull()
    await db().from('clients').update({ app_account_created_at: null }).eq('id', fichaB)
    const { data: conta } = await db().from('loyalty_accounts').select('id').eq('client_id', fichaB).single<{ id: string }>()

    const ctx = await browser.newContext({ storageState: cliente.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/e2e-un-vcb${marca}/cliente/home`)
      await expect.poll(async () => (await db().from('loyalty_transactions').select('id')
        .eq('loyalty_account_id', conta!.id).eq('bonus_ref', 'PRIMEIRO_ACESSO')).data?.length ?? 0,
      { message: 'o bônus da B, uma vez' }).toBe(1)
      await page.reload()
      await page.waitForLoadState('networkidle')
      expect((await db().from('loyalty_transactions').select('id')
        .eq('loyalty_account_id', conta!.id).eq('bonus_ref', 'PRIMEIRO_ACESSO')).data?.length, 'e só uma').toBe(1)
    } finally {
      await ctx.close()
    }
  })

  test('numa clínica em que ela não tem ficha, o portal não abre', async ({ browser }) => {
    const C = await criarOutraRede(`vcc${marca}`)
    const ctx = await browser.newContext({ storageState: cliente.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/e2e-un-vcc${marca}/cliente/home`)
      await expect(page).not.toHaveURL(new RegExp(`/e2e-un-vcc${marca}/`))
    } finally {
      await ctx.close()
      await C.limpar()
    }
  })

  // Por último: a B fica bloqueada até o cache da rede (60 s) vencer de novo.
  // Clínica bloqueada (assinatura, ou desligada pela plataforma) não tranca a
  // conta dela inteira: as outras seguem, e o seletor diz qual não abre.
  test('clínica bloqueada: as outras seguem abertas, e o seletor avisa', async ({ browser }) => {
    test.setTimeout(240_000)
    await db().from('tenants').update({ is_active: false }).eq('id', B.tenantId)
    const ctx = await browser.newContext({ storageState: cliente.estado })
    const page = await ctx.newPage()
    const email = `e2e-cliente-vc${marca}@bellaris.invalid`
    const estado = path.join(__dirname, '.auth', `cliente-vc-bloq-${marca}.json`)
    try {
      // O portal da B leva ao seletor (e não a "conta suspensa"), assim que o
      // cache da rede vence.
      await expect.poll(async () => {
        await page.goto(`/e2e-un-vcb${marca}/cliente/home`)
        return new URL(page.url()).pathname
      }, { timeout: 120_000, intervals: [5_000] }).toBe('/auth/clinicas')

      const b = page.getByRole('button', { name: new RegExp(`Unidade vcb${marca}`) })
      await expect(b).toBeDisabled()
      await expect(b).toContainText('Indisponível')
      await expect(page.getByRole('button', { name: new RegExp(`Unidade vca${marca}`) })).toBeEnabled()

      // A situação da rede tem cache de até 60 s em cada caminho que a lê.
      await expect.poll(async () => (await sessaoPorEmail(loginDela, email, estado)).destino,
        { message: 'o login vai para a clínica que abre', timeout: 90_000, intervals: [5_000] })
        .toBe(`/e2e-un-vca${marca}/cliente`)
    } finally {
      await ctx.close()
      fs.rmSync(estado, { force: true })
      await db().from('tenants').update({ is_active: true }).eq('id', B.tenantId)
    }
  })
})
