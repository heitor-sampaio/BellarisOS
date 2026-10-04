import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarAtendente, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A ADMINISTRAÇÃO DO SISTEMA (/sistema), o portal só de ADMIN — ao lado do
 * /suporte, que é o atendimento (2026-10-03).
 *
 * - o ADMIN abre os dois portais e troca pelo seletor;
 * - o SUPORTE não abre o /sistema (o proxy desvia, e as actions recusam pela
 *   chamada direta);
 * - equipe e auditoria mudaram do /suporte para cá (as rotas antigas desviam);
 * - o ADMIN cria planos e gente da plataforma (de suporte), pela tela.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const PLANO = `[e2e] Plano ${marca}`

let admin: AtendenteDeTeste
let suporte: AtendenteDeTeste
const atendentes: AtendenteDeTeste[] = []
const emailDoNovo = `e2e-plataforma-novo-${marca}@bellaris.invalid`

test.beforeAll(async () => {
  test.setTimeout(180_000)
  admin = await criarAtendente(`sisadm${marca}`, { papel: 'ADMIN' })
  suporte = await criarAtendente(`sissup${marca}`, { papel: 'SUPORTE' })
  atendentes.push(admin, suporte)
})

test.afterAll(async () => {
  const b = db()
  const falhas: string[] = []
  const { error: ePlano } = await b.from('platform_plans').delete().like('nome', `[e2e]%${marca}%`)
  if (ePlano) falhas.push(`plano: ${ePlano.message}`)
  const { data: novo } = await b.from('platform_staff').select('id, auth_id').eq('email', emailDoNovo).maybeSingle<{ id: string; auth_id: string }>()
  if (novo) {
    await b.from('platform_audit_log').delete().eq('staff_id', novo.id)
    const { error } = await b.from('platform_staff').delete().eq('id', novo.id)
    if (error) falhas.push(`atendente novo: ${error.message}`)
    await b.auth.admin.deleteUser(novo.auth_id)
  }
  for (const a of atendentes) {
    // O registro do que o admin fez sem rede (plano, equipe) sai junto.
    await b.from('platform_audit_log').delete().eq('staff_id', a.staffId)
    await a.limpar()
  }
  expect(falhas).toEqual([])
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.describe.serial('administração do sistema', () => {
  test('o ADMIN abre o /sistema e troca de portal pelo seletor', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto('/sistema')
      await expect(p.getByRole('heading', { name: 'Painel' })).toBeVisible()
      await expect(p.getByText('Receita recorrente (MRR)')).toBeVisible()
      const seletor = p.getByRole('navigation', { name: 'Portal da plataforma' })
      await seletor.getByRole('link', { name: 'Suporte' }).click()
      await expect(p).toHaveURL(/\/suporte\/chamados/)
      await p.getByRole('navigation', { name: 'Portal da plataforma' }).getByRole('link', { name: 'Sistema' }).click()
      await expect(p).toHaveURL(/\/sistema$/)
      // Equipe e auditoria moram aqui; as rotas antigas do /suporte desviam.
      await p.goto('/suporte/equipe')
      await expect(p).toHaveURL(/\/sistema\/equipe/)
      await expect(p.getByRole('heading', { name: 'Equipe da plataforma' })).toBeVisible()
      await p.goto('/sistema/auditoria')
      await expect(p.getByRole('heading', { name: 'Auditoria da plataforma' })).toBeVisible()
    })
  })

  test('o SUPORTE não abre o /sistema, nem pela action', async ({ browser }) => {
    await comSessao(browser, suporte.estado, async p => {
      await p.goto('/sistema')
      await expect(p).toHaveURL(/\/suporte/)
      await p.goto('/sistema/redes')
      await expect(p).not.toHaveURL(/\/sistema/)
      await expect(p.getByRole('navigation', { name: 'Portal da plataforma' })).toHaveCount(0)
      // A action direta: qualquer que seja a resposta, nada é gravado.
      await chamarAcao(p, 'actions/sistema.ts', 'salvarPlano', '/sistema/planos',
        [{ nome: `${PLANO} hack`, valorCentavos: 100, ativo: true }]).catch(() => null)
    })
    const { data } = await db().from('platform_plans').select('id').eq('nome', `${PLANO} hack`)
    expect(data ?? []).toHaveLength(0)
  })

  test('o ADMIN cadastra um plano pela tela', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto('/sistema/planos')
      const form = p.locator('form', { hasText: 'Novo plano' })
      await form.locator('input[name="nome"]').fill(PLANO)
      await form.locator('input[name="valor"]').fill('199,90')
      await form.locator('input[name="descricao"]').fill('1 unidade')
      await form.getByRole('button', { name: 'Criar plano' }).click()
      await expect(p.getByText('Plano criado.')).toBeVisible({ timeout: 15_000 })
      await expect(p.locator('tr', { hasText: PLANO })).toContainText('199,90')
    })
    const { data } = await db().from('platform_plans').select('valor_centavos, ativo').eq('nome', PLANO).single()
    expect(data).toEqual({ valor_centavos: 19990, ativo: true })
  })

  test('o ADMIN cria gente de suporte; o SUPORTE não', async ({ browser }) => {
    await comSessao(browser, suporte.estado, async p => {
      await chamarAcao(p, 'actions/plataforma.ts', 'criarAtendente', '/sistema/equipe',
        [{ nome: '[e2e] Hack', email: emailDoNovo, papel: 'ADMIN' }]).catch(() => null)
    })
    expect((await db().from('platform_staff').select('id').eq('email', emailDoNovo)).data ?? []).toHaveLength(0)

    await comSessao(browser, admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/plataforma.ts', 'criarAtendente', '/sistema/equipe',
        [{ nome: `[e2e] Novo suporte ${marca}`, email: emailDoNovo, papel: 'SUPORTE' }])
      expect(r.texto).toContain('"ok":true')
    })
    const { data: staff } = await db().from('platform_staff').select('papel, auth_id').eq('email', emailDoNovo).single<{ papel: string; auth_id: string }>()
    expect(staff!.papel).toBe('SUPORTE')
    const { data: login } = await db().auth.admin.getUserById(staff!.auth_id)
    expect((login.user?.app_metadata as { plataforma?: string }).plataforma).toBe('SUPORTE')
  })

  test('os indicadores saem do banco (só as redes de teste, aqui)', async () => {
    const { data, error } = await db().rpc('plataforma_indicadores', { p_somente_teste: true })
    expect(error).toBeNull()
    for (const k of ['total', 'em_teste', 'ativas', 'em_atraso', 'suspensas', 'mrr_centavos', 'recebido_mes_centavos']) {
      expect(typeof (data as Record<string, unknown>)[k]).toBe('number')
    }
  })
})
