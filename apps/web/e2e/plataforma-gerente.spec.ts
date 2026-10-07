import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { sessaoDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import {
  criarAtendente, gravarSessaoNoHost, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste,
} from './apoio/plataforma'

/**
 * O GERENTE da equipe da plataforma (2026-10-07, pedido do Heitor): VÊ o
 * sistema inteiro (painel, redes, planos, cobrança, equipe, auditoria,
 * configurações) e não EDITA nada. Só o sistema: o suporte (chamados,
 * "entrar como") fica com Suporte e Admin — decisão dele.
 *
 * A trava de verdade é a action (só ADMIN grava); a tela vem travada para não
 * oferecer o que não vai acontecer.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = Date.now().toString(36)
const db = () => banco()
const SIS = () => urlDaPlataforma('sistema')
const SENHA = `Senha-e2e-${marca}`

let admin: AtendenteDeTeste
let gerente: AtendenteDeTeste
let outra: OutraRede

test.beforeAll(async () => {
  test.setTimeout(240_000)
  admin = await criarAtendente(`grad${marca}`, { papel: 'ADMIN' })
  gerente = await criarAtendente(`grge${marca}`, { papel: 'GERENTE' })
  outra = await criarOutraRede(`gr${marca}`)
  expect((await db().auth.admin.updateUserById(gerente.authId, { password: SENHA })).error).toBeNull()
})

test.afterAll(async () => {
  if (outra) {
    await db().from('tenant_subscriptions').delete().eq('tenant_id', outra.tenantId)
    await db().from('platform_audit_log').delete().eq('tenant_id', outra.tenantId)
    await outra.limpar()
  }
  await db().from('platform_plans').delete().like('nome', `[e2e]%${marca}%`)
  const { data: criados } = await db().from('platform_staff').select('id, auth_id').like('email', `e2e-gerente-novo-${marca}%`)
  for (const c of (criados ?? []) as { id: string; auth_id: string }[]) {
    await db().from('platform_audit_log').delete().eq('staff_id', c.id)
    await db().from('platform_staff').delete().eq('id', c.id)
    await db().auth.admin.deleteUser(c.auth_id)
  }
  for (const a of [gerente, admin]) if (a) await a.limpar()
})

async function com(browser: Browser, estado: string | null, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado ?? { cookies: [], origins: [] } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.describe.serial('o Gerente da plataforma: vê o sistema, não edita', () => {
  test('o Admin cadastra um Gerente pela Equipe', async ({ browser }) => {
    const email = `e2e-gerente-novo-${marca}@bellaris.invalid`
    await com(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/equipe`)
      // O cadastro abre num modal pelo botão (2026-10-07: o formulário solto na
      // página ficava num card enorme, alinhado à direita).
      // Na mesma linha do título, à direita (pedido do Heitor).
      const titulo = (await p.getByRole('heading', { name: 'Equipe da plataforma', level: 1 }).boundingBox())!
      const botao = (await p.getByRole('button', { name: 'Adicionar pessoa' }).boundingBox())!
      expect(botao.y, 'na linha do título').toBeLessThan(titulo.y + titulo.height)
      expect(botao.y + botao.height, 'na linha do título').toBeGreaterThan(titulo.y)
      expect(botao.x, 'à direita do título').toBeGreaterThan(titulo.x + titulo.width)
      await p.getByRole('button', { name: 'Adicionar pessoa' }).click()
      const form = p.getByRole('dialog', { name: 'Adicionar pessoa à equipe' })
      await form.getByLabel('Nome').fill(`[e2e] Gerente novo ${marca}`)
      await form.getByLabel('E-mail').fill(email)
      await form.getByLabel('Papel').selectOption({ label: 'Gerente (só vê o sistema)' })
      await form.getByRole('button', { name: 'Cadastrar' }).click()
      await expect(p.getByText(/Cadastrado/)).toBeVisible({ timeout: 15_000 })
      await expect(form, 'o modal fecha ao cadastrar').toHaveCount(0)
    })
    const { data } = await db().from('platform_staff').select('papel, auth_id').eq('email', email).single<{ papel: string; auth_id: string }>()
    expect(data!.papel).toBe('GERENTE')
    const { data: u } = await db().auth.admin.getUserById(data!.auth_id)
    expect(u.user?.app_metadata?.plataforma).toBe('GERENTE')
  })

  test('o Gerente vê cada tela do sistema', async ({ browser }) => {
    await com(browser, gerente.estado, async p => {
      for (const [caminho, titulo] of [
        ['/', 'Painel'], ['/redes', 'Redes'], ['/planos', 'Planos'], ['/equipe', 'Equipe da plataforma'],
        ['/auditoria', 'Auditoria da plataforma'], ['/configuracoes', 'Configurações'],
      ] as const) {
        await p.goto(`${SIS()}${caminho}`)
        await expect(p.getByRole('heading', { name: titulo, exact: true }), caminho).toBeVisible({ timeout: 20_000 })
      }
      await p.goto(`${SIS()}/redes/${outra.tenantId}`)
      await expect(p.getByRole('heading', { name: 'Assinatura' })).toBeVisible({ timeout: 20_000 })
    })
  })

  test('as telas vêm só para ver: nenhum controle de edição ativo', async ({ browser }) => {
    await com(browser, gerente.estado, async p => {
      await p.goto(`${SIS()}/redes/${outra.tenantId}`)
      await expect(p.getByRole('button', { name: 'Salvar plano e valor' })).toBeDisabled({ timeout: 20_000 })
      await expect(p.getByText('Só para ver: o Gerente não edita.')).toBeVisible()
      await p.goto(`${SIS()}/planos`)
      await expect(p.getByRole('button', { name: 'Criar plano' })).toBeDisabled()
      await p.goto(`${SIS()}/equipe`)
      await expect(p.getByRole('button', { name: 'Adicionar pessoa' })).toBeDisabled()
      // Criar rede é escrita: a entrada nem aparece, e a página recusa.
      await p.goto(`${SIS()}/redes`)
      await expect(p.getByRole('link', { name: /Nova rede/ })).toHaveCount(0)
    })
  })

  test('e as actions recusam o Gerente (o banco não muda)', async ({ browser }) => {
    const antes = await db().from('tenant_subscriptions').select('tenant_id').eq('tenant_id', outra.tenantId)
    await com(browser, gerente.estado, async p => {
      const rota = `${SIS()}/redes/${outra.tenantId}`
      const tentativas: [string, unknown[]][] = [
        ['definirAssinatura', [outra.tenantId, { planoId: null, valorCentavos: 12345 }]],
        ['salvarPlano', [{ nome: `[e2e] Plano do gerente ${marca}`, valorCentavos: 100, ativo: true }]],
        ['salvarConfiguracoes', [{ diasDeTeste: 30, diasDeCarencia: 30 }]],
        ['definirAdicional', [outra.tenantId, { chave: 'whatsapp', quantidade: 1, valorCentavos: 100 }]],
      ]
      for (const [funcao, args] of tentativas) {
        const r = await chamarAcao(p, 'actions/sistema.ts', funcao, rota, args).catch(e => ({ texto: String(e) }))
        expect(r.texto, funcao).not.toContain('"ok":true')
      }
      const equipe = await chamarAcao(p, 'actions/plataforma.ts', 'criarAtendente', `${SIS()}/equipe`,
        [{ nome: 'Intruso', email: `e2e-gerente-intruso-${marca}@bellaris.invalid`, papel: 'ADMIN' }]).catch(e => ({ texto: String(e) }))
      expect(equipe.texto).not.toContain('"ok":true')
    })
    expect((await db().from('tenant_subscriptions').select('tenant_id').eq('tenant_id', outra.tenantId)).data).toEqual(antes.data)
    expect((await db().from('platform_plans').select('id').eq('nome', `[e2e] Plano do gerente ${marca}`)).data ?? []).toHaveLength(0)
    expect((await db().from('platform_staff').select('id').like('email', `e2e-gerente-intruso-${marca}%`)).data ?? []).toHaveLength(0)
  })

  test('o suporte não é do Gerente: o login recusa, e a sessão que ele trouxer não abre nada', async ({ browser }) => {
    await com(browser, null, async p => {
      await p.goto(`${urlDaPlataforma('suporte')}/login`)
      await p.locator('input[name="email"]').fill(gerente.email)
      await p.locator('input[name="password"]').fill(SENHA)
      await p.getByRole('button', { name: /Entrar/ }).click()
      await expect(p.getByText(/só do atendimento/i)).toBeVisible({ timeout: 15_000 })
      await expect(p).toHaveURL(/\/login/)
    })
    const { sessao } = await sessaoDeTeste(gerente.authId, gerente.email)
    const arq = `${gerente.estado}.no-suporte.json`
    await gravarSessaoNoHost(sessao, urlDaPlataforma('suporte'), arq)
    await com(browser, arq, async p => {
      await p.goto(`${urlDaPlataforma('suporte')}/redes`)
      await expect(p).toHaveURL(/\/login/)
      await expect(p.getByRole('heading', { name: 'Redes' })).toHaveCount(0)
    })
  })

  test('nem o banco abre sessão de suporte para o Gerente', async () => {
    const { error } = await db().rpc('suporte_sessao_abrir', {
      p_tenant: outra.tenantId, p_target: null, p_staff: gerente.staffId, p_ticket: null, p_motivo: 'teste do gerente', p_ip: null, p_ua: null,
    })
    expect(error?.message ?? '').toMatch(/atendimento/i)
  })
})
