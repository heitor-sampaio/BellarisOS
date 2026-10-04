import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, totp, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O portal da plataforma (/suporte), fase 1 do suporte (2026-10-03).
 *
 * - quem é da plataforma vê todas as redes, e abrir uma fica registrado;
 * - plataforma e redes não se misturam: o atendente não entra no /admin nem
 *   na unidade, e o membro de rede não entra no /suporte;
 * - sem a verificação em duas etapas (aal2) o painel não abre, nem as actions;
 * - Equipe e Auditoria são só do admin da plataforma, e plano também;
 * - o cadastro do autenticador funciona pela tela (código calculado aqui).
 *
 * Numa rede `[e2e]` própria, com atendentes `[e2e]` criados pelo teste.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const SEM_ACESSO = 'Você não tem acesso a esta área'

interface Fx {
  outra: OutraRede; membro: MembroDeTeste; desativado: MembroDeTeste
  suporte: AtendenteDeTeste; admin: AtendenteDeTeste; semMfa: AtendenteDeTeste; novo: AtendenteDeTeste
  nomeDaRede: string; slug: string
}
let f: Fx | null = null
const criado: { outra?: OutraRede; membros: MembroDeTeste[]; atendentes: AtendenteDeTeste[] } = { membros: [], atendentes: [] }

test.beforeAll(async () => {
  test.setTimeout(240_000)
  const outra = await criarOutraRede(`pl${marca}`)
  criado.outra = outra
  const membro = await criarMembro(`plm${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gerente', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  criado.membros.push(membro)
  const desativado = await criarMembro(`pld${marca}`, {
    tenant: outra.tenantId, rotulo: 'Desativado', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  criado.membros.push(desativado)
  expect((await db().from('users').update({ is_active: false }).eq('id', desativado.userId)).error).toBeNull()

  const atendente = async (chave: string, opcoes: Parameters<typeof criarAtendente>[1]) => {
    const a = await criarAtendente(`${chave}${marca}`, opcoes)
    criado.atendentes.push(a); return a
  }
  const suporte = await atendente('sup', { papel: 'SUPORTE' })
  const admin   = await atendente('adm', { papel: 'ADMIN' })
  const semMfa  = await atendente('aal1', { papel: 'SUPORTE', semVerificacao: true })
  const novo    = await atendente('novo', { papel: 'SUPORTE', semVerificacao: true })

  const { data: rede } = await db().from('tenants').select('name').eq('id', outra.tenantId).single<{ name: string }>()
  f = { outra, membro, desativado, suporte, admin, semMfa, novo, nomeDaRede: rede!.name, slug: `e2e-un-pl${marca}` }
})

test.afterAll(async () => {
  for (const a of criado.atendentes) await a.limpar()
  for (const m of criado.membros) await m.limpar()
  if (criado.outra) {
    const { error } = await db().from('platform_audit_log').delete().eq('tenant_id', criado.outra.tenantId)
    expect(error).toBeNull()
    await criado.outra.limpar()
  }
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function registros(staffId: string, kind: string): Promise<number> {
  const { data, error } = await db().from('platform_audit_log').select('id')
    .eq('staff_id', staffId).eq('kind', kind).eq('tenant_id', f!.outra.tenantId)
  expect(error).toBeNull()
  return (data ?? []).length
}

test.describe.serial('portal da plataforma', () => {
  test('o atendente vê as redes, e abrir uma fica registrado', async ({ browser }) => {
    await comSessao(browser, f!.suporte.estado, async p => {
      // A entrada do portal é a fila de chamados (fase 3); as redes, a aba ao lado.
      await p.goto('/suporte')
      await expect(p).toHaveURL(/\/suporte\/chamados/)
      await p.getByRole('link', { name: 'Redes', exact: true }).click()
      await expect(p).toHaveURL(/\/suporte\/redes/)
      // As redes de teste só com o filtro ligado.
      await expect(p.getByRole('link', { name: f!.nomeDaRede })).toHaveCount(0)
      await p.goto('/suporte/redes?teste=1')
      await p.getByRole('link', { name: f!.nomeDaRede }).click()
      await expect(p).toHaveURL(new RegExp(`/suporte/redes/${f!.outra.tenantId}`))
      await expect(p.getByText(`Gerente plm${marca}`).first()).toBeVisible()
    })
    await expect.poll(() => registros(f!.suporte.staffId, 'rede.visualizada')).toBe(1)
  })

  test('o atendente não entra nos portais das redes', async ({ browser }) => {
    await comSessao(browser, f!.suporte.estado, async p => {
      await p.goto('/admin/dashboard')
      await expect(p).toHaveURL(/\/suporte/)
      await p.goto(`/${f!.slug}/dashboard`)
      await expect(p).toHaveURL(/\/suporte/)
    })
  })

  test('o membro da rede não entra no /suporte', async ({ browser }) => {
    await comSessao(browser, f!.membro.estado, async p => {
      await p.goto(`/suporte/redes/${f!.outra.tenantId}`)
      await expect(p).not.toHaveURL(/\/suporte/)
    })
  })

  test('sem a verificação em duas etapas, nem o painel nem as actions', async ({ browser }) => {
    await comSessao(browser, f!.semMfa.estado, async p => {
      await p.goto('/suporte/redes')
      await expect(p).toHaveURL(/\/suporte\/verificacao/)
      // A action direta, com o mesmo login sem aal2: não reativa ninguém.
      await chamarAcao(p, 'actions/plataforma.ts', 'reativarMembroDaRede', `/suporte/redes/${f!.outra.tenantId}`,
        [f!.outra.tenantId, f!.desativado.userId])
    })
    const { data } = await db().from('users').select('is_active').eq('id', f!.desativado.userId).single<{ is_active: boolean }>()
    expect(data!.is_active).toBe(false)
    expect(await registros(f!.semMfa.staffId, 'membro.reativado')).toBe(0)
  })

  test('Equipe e Auditoria só para o admin da plataforma', async ({ browser }) => {
    await comSessao(browser, f!.suporte.estado, async p => {
      await p.goto('/suporte/equipe')
      await expect(p.getByText(SEM_ACESSO)).toBeVisible()
      await p.goto('/suporte/auditoria')
      await expect(p.getByText(SEM_ACESSO)).toBeVisible()
    })
    await comSessao(browser, f!.admin.estado, async p => {
      await p.goto('/suporte/equipe')
      await expect(p.getByRole('heading', { name: 'Equipe da plataforma' })).toBeVisible()
      await p.goto('/suporte/auditoria')
      await expect(p.getByRole('heading', { name: 'Auditoria da plataforma' })).toBeVisible()
    })
  })

  test('o suporte reativa um membro pela tela; o plano é só do admin', async ({ browser }) => {
    await comSessao(browser, f!.suporte.estado, async p => {
      await p.goto(`/suporte/redes/${f!.outra.tenantId}`)
      const linha = p.locator('tr', { hasText: `Desativado pld${marca}` })
      await linha.getByRole('button', { name: 'Reativar' }).click()
      await expect(p.getByText('Membro reativado.')).toBeVisible({ timeout: 15_000 })
      // O plano: o suporte não muda, nem pela action direta.
      await chamarAcao(p, 'actions/plataforma.ts', 'alterarPlanoDaRede', `/suporte/redes/${f!.outra.tenantId}`,
        [f!.outra.tenantId, { planName: 'Hack', planStatus: 'active', trialEndsAt: null }])
    })
    const { data: membro } = await db().from('users').select('is_active').eq('id', f!.desativado.userId).single<{ is_active: boolean }>()
    expect(membro!.is_active).toBe(true)
    expect(await registros(f!.suporte.staffId, 'membro.reativado')).toBe(1)
    const { data: antes } = await db().from('tenants').select('plan_name').eq('id', f!.outra.tenantId).single<{ plan_name: string | null }>()
    expect(antes!.plan_name).not.toBe('Hack')

    await comSessao(browser, f!.admin.estado, async p => {
      await chamarAcao(p, 'actions/plataforma.ts', 'alterarPlanoDaRede', `/suporte/redes/${f!.outra.tenantId}`,
        [f!.outra.tenantId, { planName: 'Essencial', planStatus: 'active', trialEndsAt: null }])
    })
    const { data: depois } = await db().from('tenants').select('plan_name, plan_status').eq('id', f!.outra.tenantId)
      .single<{ plan_name: string | null; plan_status: string }>()
    expect(depois).toEqual({ plan_name: 'Essencial', plan_status: 'active' })
    expect(await registros(f!.admin.staffId, 'plano.alterado')).toBe(1)
  })

  test('cadastrar o autenticador pela tela abre o painel', async ({ browser }) => {
    await comSessao(browser, f!.novo.estado, async p => {
      await p.goto('/suporte')
      await expect(p).toHaveURL(/\/suporte\/verificacao/)
      await p.getByRole('button', { name: 'Cadastrar autenticador' }).click()
      const segredo = (await p.getByTestId('segredo-totp').textContent())?.trim() ?? ''
      expect(segredo.length).toBeGreaterThan(10)
      await p.getByLabel('Código de 6 dígitos').fill(totp(segredo))
      await p.getByRole('button', { name: 'Confirmar' }).click()
      await expect(p).toHaveURL(/\/suporte\/chamados/, { timeout: 20_000 })
    })
  })
})
