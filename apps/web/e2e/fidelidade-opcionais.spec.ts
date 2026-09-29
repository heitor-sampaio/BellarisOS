import { test, expect, request, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Fidelidade — os opcionais da rede (migrations 20260929000005/6): bônus de
 * aniversário e de primeiro acesso, troca pelo portal e aviso de vencimento.
 * Todos numa rede [e2e]; as funções de rotina são chamadas com o recorte da
 * rede (`p_tenant`), para as datas escolhidas à mão não valerem para ninguém
 * de fora dela.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
const clientesAvulsos: string[] = []
const loginsAvulsos: string[] = []
const sessoes: ClienteDeTeste[] = []

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

test.beforeAll(async () => {
  rede = await criarOutraRede(`fop${marca}`)
  gestor = await criarMembro(`fopg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor opcionais',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'loyalty', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  for (const s of sessoes) await s.limpar()
  const falhas = await apagarClientes(clientesAvulsos)
  for (const id of loginsAvulsos) await db().auth.admin.deleteUser(id)
  if (gestor) await gestor.limpar()
  if (rede) await rede.limpar()
  expect(falhas).toEqual([])
})

async function configurar(campos: Record<string, unknown>) {
  const { error } = await db().from('loyalty_configs').upsert({ tenant_id: rede!.tenantId, enabled: true, ...campos }, { onConflict: 'tenant_id' })
  expect(error, 'configurar a fidelidade da rede').toBeNull()
}
const conta = async (c: string) => (await db().rpc('fidelidade_conta', { p_cliente: c })).data as string
const saldo = async (c: string) => Number((await db().rpc('saldo_de_pontos', { p_cliente: c, p_unidade: null })).data)
async function bonus(c: string) {
  const { data } = await db().from('loyalty_transactions').select('points, bonus_ref, description')
    .eq('loyalty_account_id', await conta(c)).eq('kind', 'BONUS').order('created_at')
  return data ?? []
}

/** Cliente com senha, para entrar pela TELA de login (é ela que marca o primeiro acesso). */
async function clienteComSenha(rotulo: string, jaEntrou = false) {
  const email = `e2e-fop-${rotulo}-${marca}@bellaris.invalid`
  const senha = `Senha-${marca}-1`
  const { data: auth, error: eA } = await db().auth.admin.createUser({ email, password: senha, email_confirm: true })
  expect(eA).toBeNull()
  loginsAvulsos.push(auth.user!.id)
  const { data: c, error: eC } = await db().from('clients').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, name: `${PREFIXO} ${rotulo} ${marca}`,
    phone: '5548' + String(Date.now()).slice(-9), email, auth_id: auth.user!.id, is_active: true,
    app_account_created_at: jaEntrou ? '2025-01-01T00:00:00Z' : null,
  }).select('id').single<{ id: string }>()
  expect(eC).toBeNull()
  clientesAvulsos.push(c!.id)
  await db().from('loyalty_accounts').upsert({ client_id: c!.id }, { onConflict: 'client_id' })
  expect((await db().rpc('set_client_claims', { p_auth_id: auth.user!.id, p_client_id: c!.id })).error).toBeNull()
  return { id: c!.id, email, senha }
}

async function entrarPelaTela(browser: Browser, email: string, senha: string) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const p = await ctx.newPage()
    await p.goto('/login')
    await p.locator('input[name="email"]').fill(email)
    await p.locator('input[name="password"]').fill(senha)
    await p.locator('button[type="submit"]').click()
    await p.waitForURL(/\/cliente/)
  } finally { await ctx.close() }
}

test.describe.serial('fidelidade: opcionais da rede', () => {
  test('pela tela: a rede liga os bônus, o aviso e a troca pelo portal', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: gestor!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto('/admin/settings?tab=fidelidade')
      await p.getByRole('button', { name: 'Programa desligado' }).click()
      await p.getByRole('button', { name: 'Vencem', exact: true }).click()
      await p.locator('input[name="expiry_months"]').fill('6')
      await p.getByTestId('opcional-aviso').getByRole('button', { name: 'Avisa por push' }).click()
      await p.locator('input[name="expiry_notice_days"]').fill('10')
      await p.getByTestId('opcional-aniversario').getByRole('button', { name: 'Dá pontos' }).click()
      await p.locator('input[name="birthday_bonus"]').fill('200')
      await p.getByTestId('opcional-primeiro-acesso').getByRole('button', { name: 'Dá pontos' }).click()
      await p.locator('input[name="first_access_bonus"]').fill('50')
      await p.getByRole('button', { name: 'Também o cliente' }).click()
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect(p.getByText('Salvo')).toBeVisible()

      const { data } = await db().from('loyalty_configs')
        .select('enabled, expiry_months, expiry_notice_days, birthday_bonus, first_access_bonus, client_redeem')
        .eq('tenant_id', rede!.tenantId).single()
      expect(data).toEqual({ enabled: true, expiry_months: 6, expiry_notice_days: 10, birthday_bonus: 200, first_access_bonus: 50, client_redeem: true })

      // Desligar a validade leva o aviso junto (não há o que avisar).
      await p.getByRole('button', { name: 'Não vencem' }).click()
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect(p.getByText('Salvo')).toBeVisible()
      const depois = await db().from('loyalty_configs').select('expiry_months, expiry_notice_days').eq('tenant_id', rede!.tenantId).single()
      expect(depois.data).toEqual({ expiry_months: null, expiry_notice_days: null })
    } finally { await ctx.close() }
  })

  test('primeiro acesso: o primeiro login dá o bônus uma vez; quem já tinha entrado não ganha', async ({ browser }) => {
    await configurar({ first_access_bonus: 50, expiry_months: null })
    const novo = await clienteComSenha('novo')
    await entrarPelaTela(browser, novo.email, novo.senha)
    expect(await bonus(novo.id)).toEqual([{ points: 50, bonus_ref: 'PRIMEIRO_ACESSO', description: 'Bônus de primeiro acesso' }])
    const { data: marcado } = await db().from('clients').select('app_account_created_at').eq('id', novo.id).single()
    expect(marcado!.app_account_created_at, 'o primeiro acesso ficou marcado').not.toBeNull()

    await entrarPelaTela(browser, novo.email, novo.senha)
    expect(await bonus(novo.id), 'o segundo login não dá de novo').toHaveLength(1)

    const antigo = await clienteComSenha('antigo', true)
    await entrarPelaTela(browser, antigo.email, antigo.senha)
    expect(await bonus(antigo.id)).toEqual([])
  })

  test('aniversário: uma vez por ano, e 29/02 ganha em 28/02 fora de ano bissexto', async () => {
    await configurar({ birthday_bonus: 200 })
    const hoje = hojeSP()
    const aniversariante = await rede!.criarCliente('Aniversario')
    await db().from('clients').update({ birth_date: `1990-${hoje.slice(5)}T12:00:00Z` }).eq('id', aniversariante)
    const bissexto = await rede!.criarCliente('Bissexto')
    await db().from('clients').update({ birth_date: '1992-02-29T12:00:00Z' }).eq('id', bissexto)

    const rodar = async (dia: string) => {
      const { data, error } = await db().rpc('fidelidade_bonus_aniversario', { p_hoje: dia, p_tenant: rede!.tenantId })
      expect(error).toBeNull()
      return ((data ?? []) as { client_id: string; pontos: number }[]).map(l => [l.client_id, l.pontos])
    }
    expect(await rodar(hoje)).toContainEqual([aniversariante, 200])
    expect(await rodar(hoje), 'de novo no mesmo dia: nada').toEqual([])
    expect(await bonus(aniversariante)).toEqual([{ points: 200, bonus_ref: `ANIVERSARIO:${hoje.slice(0, 4)}`, description: 'Bônus de aniversário' }])

    expect(await rodar('2027-02-28')).toEqual([[bissexto, 200]])   // 2027 não é bissexto
    expect(await rodar('2028-02-28')).toEqual([])                   // 2028 é: espera o 29
    expect(await rodar('2028-02-29')).toEqual([[bissexto, 200]])
    expect(await saldo(bissexto)).toBe(400)
  })

  test('aviso de vencimento: um aviso por lote novo na janela; sem a opção, nenhum', async () => {
    await configurar({ expiry_months: 6, expiry_notice_days: 7, birthday_bonus: 0 })
    const c = await rede!.criarCliente('Aviso')
    const agora = Date.now()
    const em = (dias: number) => new Date(agora + dias * 86_400_000).toISOString()
    for (const [pontos, dias] of [[100, 5], [50, 20]] as const) {
      const { error } = await db().from('loyalty_transactions').insert({
        loyalty_account_id: await conta(c), branch_id: rede!.branchId, kind: 'AJUSTE', points: pontos,
        description: `${PREFIXO} lote`, expires_at: em(dias), created_by: 'e2e',
      })
      expect(error).toBeNull()
    }
    const avisos = async (dias: number) => {
      const { data, error } = await db().rpc('avisos_de_vencimento', { p_agora: em(dias), p_tenant: rede!.tenantId })
      expect(error).toBeNull()
      return ((data ?? []) as { client_id: string; pontos: number }[]).filter(l => l.client_id === c).map(l => l.pontos)
    }
    expect(await avisos(0)).toEqual([100])        // janela até +7: o lote de 100
    expect(await avisos(0), 'de novo: já avisado').toEqual([])
    expect(await avisos(1)).toEqual([])           // janela até +8: nada novo
    // Dia 14: o lote de 100 venceu (a rotina expira antes de avisar) e o de 50 entrou na janela.
    expect((await db().rpc('expirar_pontos', { p_ate: em(14), p_tenant: rede!.tenantId })).error).toBeNull()
    expect(await avisos(14)).toEqual([50])

    // Sem a opção, nada — mesmo com pontos para vencer.
    const outro = await rede!.criarCliente('SemAviso')
    await db().from('loyalty_transactions').insert({
      loyalty_account_id: await conta(outro), branch_id: rede!.branchId, kind: 'AJUSTE', points: 30,
      description: `${PREFIXO} lote`, expires_at: em(3), created_by: 'e2e',
    })
    await configurar({ expiry_notice_days: null })
    const { data } = await db().rpc('avisos_de_vencimento', { p_agora: em(0), p_tenant: rede!.tenantId })
    expect((data ?? []) as unknown[]).toEqual([])
  })

  test('o cron manda o push de vencimento (e responde só com o segredo)', async () => {
    await configurar({ expiry_months: 6, expiry_notice_days: 7 })
    const c = await rede!.criarCliente('Push')
    await db().from('loyalty_transactions').insert({
      loyalty_account_id: await conta(c), branch_id: rede!.branchId, kind: 'AJUSTE', points: 80,
      description: `${PREFIXO} lote`, expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), created_by: 'e2e',
    })
    const api = await request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' })
    try {
      expect((await api.get('/api/cron/fidelidade')).status()).toBe(401)
      const r = await api.get('/api/cron/fidelidade', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
      expect(r.status()).toBe(200)
    } finally { await api.dispose() }
    const { data } = await db().from('client_notifications').select('type, body').eq('client_id', c)
    expect(data).toHaveLength(1)
    expect(data?.[0]?.type).toBe('fidelidade_vencimento')
    expect(data?.[0]?.body).toMatch(/^80 pontos vencem até/)
  })

  test('troca pelo portal: o cliente troca quando a rede deixa; sem a opção, a action recusa', async ({ browser }) => {
    // Sem bônus de primeiro acesso: a sessão do teste também é um primeiro acesso (pelo app).
    await configurar({ client_redeem: true, expiry_months: null, expiry_notice_days: null, first_access_bonus: 0 })
    const { data: rec } = await db().from('loyalty_rewards').insert({
      tenant_id: rede!.tenantId, name: `${PREFIXO} Desconto ${marca}`, type: 'DESCONTO_VALOR',
      points_cost: 100, discount_value: 20, validity_days: 30, is_active: true,
    }).select('id').single<{ id: string }>()
    const cliente = await clienteComSessao(`fopc${marca}`, { id: rede!.branchId, slug: `e2e-un-fop${marca}` }, { tenant: rede!.tenantId })
    sessoes.push(cliente)
    expect((await db().rpc('ajustar_pontos', {
      p_tenant: rede!.tenantId, p_cliente: cliente.clientId, p_unidade: rede!.branchId, p_pontos: 150, p_motivo: 'saldo do teste', p_ator: 'e2e',
    })).error).toBeNull()

    const ctx = await browser.newContext({ storageState: cliente.estado })
    try {
      const p = await ctx.newPage()
      const rota = `/${cliente.slug}/cliente/fidelidade`
      await p.goto(rota)
      await p.getByRole('button', { name: `Trocar pontos por ${PREFIXO} Desconto ${marca}` }).click()
      await p.getByRole('button', { name: 'Confirmar (100 pontos)' }).click()
      await expect(p.getByTestId('meus-vouchers')).toContainText('R$')
      await expect(p.getByTestId('saldo-do-portal')).toHaveText('50 pontos')
      const { data: v } = await db().from('loyalty_vouchers').select('created_by, status').eq('client_id', cliente.clientId)
      expect(v).toEqual([{ created_by: 'cliente', status: 'ATIVO' }])

      // Com a opção desligada: sem botão, e a action (chamada direto) não troca.
      await configurar({ client_redeem: false })
      await ajustar(cliente.clientId, 100)
      await p.goto(rota)
      await expect(p.getByText('A troca é feita na recepção.')).toBeVisible()
      await expect(p.getByRole('button', { name: /^Trocar pontos por/ })).toHaveCount(0)
      const res = await chamarAcao(p, 'actions/fidelidade-portal.ts', 'trocarPontosNoPortal', rota, [{ slug: cliente.slug, rewardId: rec!.id }])
      expect(JSON.stringify(res)).toContain('não está disponível')
      const { count } = await db().from('loyalty_vouchers').select('id', { count: 'exact', head: true }).eq('client_id', cliente.clientId)
      expect(count).toBe(1)
    } finally { await ctx.close() }
  })
})

async function ajustar(cliente: string, pontos: number) {
  expect((await db().rpc('ajustar_pontos', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_unidade: rede!.branchId, p_pontos: pontos, p_motivo: 'saldo do teste', p_ator: 'e2e',
  })).error).toBeNull()
}
