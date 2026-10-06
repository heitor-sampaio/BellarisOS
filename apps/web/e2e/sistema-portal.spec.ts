import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A ADMINISTRAÇÃO DO SISTEMA, só de ADMIN — desde 2026-10-06 um app próprio
 * num host próprio (admin.bellarisos.com), ao lado do suporte (outro host).
 *
 * - o ADMIN abre o sistema; o seletor leva ao host do suporte, onde a sessão
 *   é outra (cookie é do host): sem ela, o login de lá;
 * - o SUPORTE não abre o sistema (o proxy recusa, e as actions recusam pela
 *   chamada direta);
 * - o ADMIN cria planos e gente da plataforma (de suporte), pela tela.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')
const SIS = () => urlDaPlataforma('sistema')
const SUP = () => urlDaPlataforma('suporte')

const marca = Date.now().toString(36)
const db = () => banco()
const PLANO = `[e2e] Plano ${marca}`

let admin: AtendenteDeTeste
let suporte: AtendenteDeTeste
const atendentes: AtendenteDeTeste[] = []
const emailDoNovo = `e2e-plataforma-novo-${marca}@bellaris.invalid`

test.beforeAll(async () => {
  test.setTimeout(600_000)
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
  test('o ADMIN abre o sistema; o seletor leva ao host do suporte, com a sessão de lá', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/`)
      await expect(p.getByRole('heading', { name: 'Painel' })).toBeVisible()
      await expect(p.getByText('Receita recorrente (MRR)')).toBeVisible()
      await p.goto(`${SIS()}/equipe`)
      await expect(p.getByRole('heading', { name: 'Equipe da plataforma' })).toBeVisible()
      await p.goto(`${SIS()}/auditoria`)
      await expect(p.getByRole('heading', { name: 'Auditoria da plataforma' })).toBeVisible()
      // O seletor é um link para o OUTRO host: a sessão do sistema não vale lá.
      await p.getByRole('navigation', { name: 'Portal da plataforma' }).getByRole('link', { name: 'Suporte' }).click()
      await expect(p).toHaveURL(`${SUP()}/login`)
    })
    // Com a sessão do suporte (a segunda do ADMIN), o seletor volta ao sistema.
    await comSessao(browser, await admin.estadoNo('suporte'), async p => {
      await p.goto(`${SUP()}/chamados`)
      await expect(p.getByRole('heading', { name: 'Chamados' })).toBeVisible()
      const seletor = p.getByRole('navigation', { name: 'Portal da plataforma' })
      await expect(seletor.getByRole('link', { name: 'Sistema' })).toHaveAttribute('href', `${SIS()}/`)
    })
  })

  test('o SUPORTE não abre o sistema, nem pela action', async ({ browser }) => {
    // A sessão do SUPORTE gravada no host do sistema (como se ele tivesse o cookie).
    await comSessao(browser, await suporte.estadoNo('sistema'), async p => {
      await p.goto(`${SIS()}/redes`)
      await expect(p).toHaveURL(`${SIS()}/login`)
      await expect(p.getByRole('navigation', { name: 'Portal da plataforma' })).toHaveCount(0)
      // A action direta: qualquer que seja a resposta, nada é gravado.
      await chamarAcao(p, 'actions/sistema.ts', 'salvarPlano', `${SIS()}/planos`,
        [{ nome: `${PLANO} hack`, valorCentavos: 100, ativo: true }]).catch(() => null)
    })
    const { data } = await db().from('platform_plans').select('id').eq('nome', `${PLANO} hack`)
    expect(data ?? []).toHaveLength(0)
  })

  test('o ADMIN cadastra um plano pela tela', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/planos`)
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
    await comSessao(browser, await suporte.estadoNo('sistema'), async p => {
      await chamarAcao(p, 'actions/plataforma.ts', 'criarAtendente', `${SIS()}/equipe`,
        [{ nome: '[e2e] Hack', email: emailDoNovo, papel: 'ADMIN' }]).catch(() => null)
    })
    expect((await db().from('platform_staff').select('id').eq('email', emailDoNovo)).data ?? []).toHaveLength(0)

    await comSessao(browser, admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/plataforma.ts', 'criarAtendente', `${SIS()}/equipe`,
        [{ nome: `[e2e] Novo suporte ${marca}`, email: emailDoNovo, papel: 'SUPORTE' }])
      expect(r.texto).toContain('"ok":true')
    })
    const { data: staff } = await db().from('platform_staff').select('papel, auth_id').eq('email', emailDoNovo).single<{ papel: string; auth_id: string }>()
    expect(staff!.papel).toBe('SUPORTE')
    const { data: login } = await db().auth.admin.getUserById(staff!.auth_id)
    expect((login.user?.app_metadata as { plataforma?: string }).plataforma).toBe('SUPORTE')
  })

  test('reenviar o convite: o SUPORTE não reenvia; o ADMIN reenvia pela linha da pessoa, e fica na auditoria', async ({ browser }) => {
    const { data: alvo } = await db().from('platform_staff').select('id').eq('email', emailDoNovo).single<{ id: string }>()
    const reenvios = async () => ((await db().from('platform_audit_log').select('id')
      .eq('kind', 'equipe.convite_reenviado').contains('dados', { email: emailDoNovo })).data ?? []).length

    await comSessao(browser, await suporte.estadoNo('sistema'), async p => {
      await chamarAcao(p, 'actions/plataforma.ts', 'reenviarConvite', `${SIS()}/equipe`, [alvo!.id]).catch(() => null)
    })
    expect(await reenvios()).toBe(0)

    await comSessao(browser, admin.estado, async p => {
      // As pessoas [e2e] só aparecem com o filtro de teste (como as redes).
      await p.goto(`${SIS()}/equipe?teste=1`)
      await p.locator('tr', { hasText: emailDoNovo }).getByRole('button', { name: 'Reenviar convite' }).click()
      // O e-mail sai pelo SMTP do projeto, que o teste não controla: ou saiu
      // (e fica na auditoria), ou a tela diz que não saiu — nunca "enviado"
      // sem ter saído.
      const status = p.getByRole('status')
      await expect(status).toBeVisible({ timeout: 15_000 })
      const texto = (await status.textContent()) ?? ''
      if (/reenviado/i.test(texto)) expect(await reenvios()).toBe(1)
      else { expect(texto).toMatch(/e-mail/i); expect(await reenvios()).toBe(0) }
    })
  })

  test('os indicadores saem do banco (só as redes de teste, aqui)', async () => {
    const { data, error } = await db().rpc('plataforma_indicadores', { p_somente_teste: true })
    expect(error).toBeNull()
    for (const k of ['total', 'em_teste', 'ativas', 'em_atraso', 'suspensas', 'mrr_centavos', 'recebido_mes_centavos']) {
      expect(typeof (data as Record<string, unknown>)[k]).toBe('number')
    }
  })
})
