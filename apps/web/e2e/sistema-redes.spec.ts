import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import { apagarRedeCriada } from './apoio/rede-criada'

/**
 * As REDES no sistema (o app do host admin.*, 2026-10-06) e o portão da rede bloqueada.
 *
 * - o ADMIN cria a rede pela tela (o responsável recebe o convite e cai no
 *   /setup no primeiro acesso) e edita os dados; o SUPORTE não cria;
 * - desligar a rede manda a equipe para /conta-suspensa e deixa o portal do
 *   paciente indisponível; religar devolve;
 * - a regra de tempo (teste vencido → atraso → suspensa pela carência) e o
 *   "marcar como em dia".
 */

test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')
const SIS = () => urlDaPlataforma('sistema')

const marca = Date.now().toString(36)
const db = () => banco()
const NOME = `[e2e] Rede nova ${marca}`
const EMAIL = `e2e-rede-${marca}@bellaris.invalid`
const DOCUMENTO = `9${String(Date.now()).slice(-10)}`

let admin: AtendenteDeTeste
let suporte: AtendenteDeTeste
let outra: OutraRede
let gestor: MembroDeTeste
let cliente: ClienteDeTeste | null = null
let redeNova: string | null = null

test.beforeAll(async () => {
  test.setTimeout(600_000)
  admin = await criarAtendente(`srad${marca}`, { papel: 'ADMIN' })
  suporte = await criarAtendente(`srsu${marca}`, { papel: 'SUPORTE' })
  outra = await criarOutraRede(`sr${marca}`)
  gestor = await criarMembro(`srgest${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  cliente = await clienteComSessao(`sr${marca}`, { id: outra.branchId, slug: `e2e-un-sr${marca}` }, { tenant: outra.tenantId })
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (redeNova) falhas.push(...await apagarRedeCriada(redeNova))
  if (cliente) await cliente.limpar()
  if (gestor) {
    await db().from('user_notifications').delete().eq('user_id', gestor.userId)
    await gestor.limpar()
  }
  if (outra) {
    await db().from('platform_audit_log').delete().eq('tenant_id', outra.tenantId)
    await db().from('tenant_subscriptions').delete().eq('tenant_id', outra.tenantId)
    await outra.limpar()
  }
  for (const a of [admin, suporte]) if (a) await a.limpar()
  expect(falhas).toEqual([])
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function situacao(tenantId: string) {
  const { data } = await db().from('tenants').select('plan_status, is_active, em_atraso_desde').eq('id', tenantId)
    .single<{ plan_status: string; is_active: boolean; em_atraso_desde: string | null }>()
  return data!
}

test.describe.serial('redes no sistema', () => {
  test('o SUPORTE não cria rede pela action direta', async ({ browser }) => {
    // A sessão do SUPORTE gravada no host do sistema (como se ele tivesse o cookie).
    await comSessao(browser, await suporte.estadoNo('sistema'), async p => {
      await chamarAcao(p, 'actions/sistema.ts', 'criarRede', `${SIS()}/redes/nova`, [{
        nomeDaRede: `${NOME} hack`, documento: DOCUMENTO, emailDoResponsavel: `hack-${EMAIL}`, nomeDoResponsavel: 'Hack', inicio: 'teste',
      }]).catch(() => null)
    })
    expect((await db().from('tenants').select('id').eq('name', `${NOME} hack`)).data ?? []).toHaveLength(0)
  })

  test('o ADMIN cria a rede pela tela; o responsável entra e cai no /setup', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/redes/nova`)
      await p.locator('input[name="nome"]').fill(NOME)
      await p.locator('input[name="documento"]').fill(DOCUMENTO)
      await p.locator('input[name="responsavel"]').fill(`Responsável ${marca}`)
      await p.locator('input[name="email"]').fill(EMAIL)
      await p.locator('input[name="dias"]').fill('10')
      await p.getByRole('button', { name: 'Criar rede' }).click()
      await expect(p).toHaveURL(new RegExp(`^${SIS()}/redes/[0-9a-f-]{36}`), { timeout: 30_000 })
      redeNova = p.url().split('/').pop()!
      await expect(p.getByRole('heading', { name: NOME })).toBeVisible()
    })
    const { data: t } = await db().from('tenants').select('plan_status, trial_ends_at, document, email').eq('id', redeNova!)
      .single<{ plan_status: string; trial_ends_at: string; document: string; email: string }>()
    expect(t!.plan_status).toBe('trial')
    expect(t!.document).toBe(DOCUMENTO)
    const dias = (Date.parse(t!.trial_ends_at) - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(9)
    expect(dias).toBeLessThan(11.1)
    const { data: membro } = await db().from('users').select('auth_id, tenant_roles(key)').eq('tenant_id', redeNova!).single()
    expect((membro!.tenant_roles as unknown as { key: string }).key).toBe('NETWORK_ADMIN')
    const { data: login } = await db().auth.admin.getUserById(membro!.auth_id as string)
    expect((login.user?.app_metadata as { tenant_id?: string }).tenant_id).toBe(redeNova)
    const { data: reg } = await db().from('platform_audit_log').select('id').eq('tenant_id', redeNova!).eq('kind', 'rede.criada')
    expect(reg ?? []).toHaveLength(1)

    // O responsável (com uma senha posta aqui, no lugar do e-mail do convite).
    const senha = `Senha-${marca}-9x`
    await db().auth.admin.updateUserById(membro!.auth_id as string, { password: senha })
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const p = await ctx.newPage()
      await p.goto('/login')
      await p.locator('#email').fill(EMAIL)
      await p.locator('#password').fill(senha)
      await p.getByRole('button', { name: 'Entrar' }).click()
      await expect(p).toHaveURL(/\/setup/, { timeout: 30_000 })
    } finally { await ctx.close() }
  })

  test('o ADMIN edita os dados da rede pela tela', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/redes/${redeNova}`)
      await p.locator('form', { hasText: 'Salvar dados' }).locator('input[name="telefone"]').fill('(48) 99999-0000')
      await p.getByRole('button', { name: 'Salvar dados' }).click()
      await expect(p.getByText('Dados da rede salvos.')).toBeVisible({ timeout: 15_000 })
    })
    const { data } = await db().from('tenants').select('phone').eq('id', redeNova!).single<{ phone: string }>()
    expect(data!.phone).toBe('(48) 99999-0000')
  })

  test('desligar manda a equipe para /conta-suspensa e fecha o portal do paciente; religar devolve', async ({ browser }) => {
    // O gestor abre a clínica ANTES: a situação da rede fica no cache do
    // processo da clínica (60 s). Sem esquentá-lo, o teste passaria sem provar
    // que o sistema expira o cache de OUTRO processo.
    await comSessao(browser, gestor.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(p).toHaveURL(/\/admin\/dashboard/)
    })
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/redes/${outra.tenantId}`)
      await p.getByRole('button', { name: 'Desligar rede…' }).click()
      await p.getByLabel('Motivo para desligar').fill('Teste de desligamento')
      await p.getByRole('button', { name: 'Desligar', exact: true }).click()
      await expect(p.getByText('Rede desligada.')).toBeVisible({ timeout: 15_000 })
    })
    expect((await situacao(outra.tenantId)).is_active).toBe(false)

    await comSessao(browser, gestor.estado, async p => {
      // Na hora — bem abaixo dos 60 s do cache, que só o aviso à clínica expira.
      await p.goto('/admin/dashboard')
      await expect(p).toHaveURL(/\/conta-suspensa/, { timeout: 10_000 })
      await expect(p.getByRole('heading', { name: 'Acesso desligado' })).toBeVisible()
    })
    await comSessao(browser, cliente!.estado, async p => {
      await p.goto(`/e2e-un-sr${marca}/cliente`)
      await expect(p).toHaveURL(/\/conta-suspensa/, { timeout: 30_000 })
      await expect(p.getByRole('heading', { name: 'Portal indisponível' })).toBeVisible()
    })
    // A action direta também cai no portão (nada é gravado)...
    await comSessao(browser, gestor.estado, async p => {
      await chamarAcao(p, 'actions/suporte-autorizacao.ts', 'autorizarSuporte', '/admin/settings',
        [{ userId: gestor.userId, horas: 24 }]).catch(() => null)
    })
    expect((await db().from('support_grants').select('id').eq('target_user_id', gestor.userId)).data ?? []).toHaveLength(0)
    // ...e o PostgREST com o token do membro não alcança mais a rede.
    const rest = async () => {
      const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tenants?select=id&id=eq.${outra.tenantId}`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${gestor.accessToken}` },
      })
      const corpo = await r.json().catch(() => [])
      return Array.isArray(corpo) ? corpo.length : -1
    }
    expect(await rest(), 'rede bloqueada: o token não lê nada').toBe(0)

    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/redes/${outra.tenantId}`)
      await p.getByRole('button', { name: 'Religar rede' }).click()
      await expect(p.getByText('Rede religada.')).toBeVisible({ timeout: 15_000 })
    })
    await comSessao(browser, gestor.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(p).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 })
    })
    // Controle: religada, o mesmo token volta a ler a rede.
    expect(await rest()).toBe(1)
  })

  test('teste vencido → atraso (com o aviso) → suspensa pela carência; em dia devolve', async ({ browser }) => {
    const b = db()
    expect((await b.from('tenants').update({ plan_status: 'trial', trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
      .eq('id', outra.tenantId)).error).toBeNull()
    // A regra com o recorte da rede de teste (nunca nas redes reais).
    const { data: r1, error: e1 } = await b.rpc('assinaturas_aplicar_regras', { p_tenant: outra.tenantId })
    expect(e1).toBeNull()
    expect(r1).toEqual([{ tenant_id: outra.tenantId, de: 'trial', para: 'past_due' }])
    await comSessao(browser, gestor.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(p.getByText(/Pagamento em atraso/)).toBeVisible({ timeout: 30_000 })
    })

    // Daqui a 30 dias, passou a carência: suspensa (e só uma vez).
    const daqui30 = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const { data: r2 } = await b.rpc('assinaturas_aplicar_regras', { p_agora: daqui30, p_tenant: outra.tenantId })
    expect(r2).toEqual([{ tenant_id: outra.tenantId, de: 'past_due', para: 'suspended' }])
    const { data: r3 } = await b.rpc('assinaturas_aplicar_regras', { p_agora: daqui30, p_tenant: outra.tenantId })
    expect(r3).toEqual([])
    // No app, quem roda a regra (o cron) expira o cache da rede na hora; aqui a
    // regra foi chamada direto no banco, então uma ação do admin faz esse papel
    // (salvar os dados como estão expira a mesma marca).
    const { data: atual } = await b.from('tenants').select('name, document, email, phone').eq('id', outra.tenantId)
      .single<{ name: string; document: string | null; email: string; phone: string | null }>()
    await comSessao(browser, admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/sistema.ts', 'editarRede', `${SIS()}/redes/${outra.tenantId}`,
        [outra.tenantId, { nome: atual!.name, documento: atual!.document ?? '', email: atual!.email, telefone: atual!.phone }])
      expect(r.texto).toContain('"ok":true')
    })
    await comSessao(browser, gestor.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(p).toHaveURL(/\/conta-suspensa/, { timeout: 30_000 })
      await expect(p.getByRole('heading', { name: 'Acesso suspenso por falta de pagamento' })).toBeVisible()
    })

    await comSessao(browser, admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/sistema.ts', 'marcarEmDia', `${SIS()}/redes/${outra.tenantId}`, [outra.tenantId, 'Pagou por fora (teste)'])
      expect(r.texto).toContain('"ok":true')
    })
    expect((await situacao(outra.tenantId))).toMatchObject({ plan_status: 'active', em_atraso_desde: null })
    await comSessao(browser, gestor.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(p).toHaveURL(/\/admin\/dashboard/, { timeout: 30_000 })
    })
  })
})
