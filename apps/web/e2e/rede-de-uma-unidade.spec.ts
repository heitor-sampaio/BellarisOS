import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * D-19 (decisão do Heitor, 2026-10-29): "Com UMA unidade ativa, somem os termos
 * e gráficos de rede ('TOTAL REDE', 'por filial', os rankings de filial,
 * 'Voltar para a rede') e o seletor de unidade. O modelo não muda: tudo volta
 * quando nascer a segunda unidade."
 *
 * F8 da 5ª simulação (2026-11-02): o D-19 limpou o dashboard e os Relatórios, e
 * o resto da clínica de uma unidade seguia falando "rede" e "filial" — o menu,
 * o cargo no cabeçalho, Equipe, Procedimentos, Estoque, Financeiro, Documentos,
 * Planejamentos, o checkout, as Configurações. O teste percorre as telas dos
 * dois portais e não pode achar as palavras; com a segunda unidade, elas voltam.
 *
 * O cliente típico tem UMA clínica (CLAUDE.md §1). Rede `[e2e]` própria, com a
 * dona; a segunda unidade nasce pela action da tela (createBranch), que é o que
 * expira o cache das unidades.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
let segunda: string | null = null
let produto = ''

/** As palavras de rede, como palavra inteira ("Redefinir" e "redes sociais" passam). */
const DE_REDE = /\b(rede|filial|filiais)\b/i

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** As linhas VISÍVEIS do modal aberto que falam de rede ou filial. */
async function falasDoModal(p: Page, onde: string): Promise<string[]> {
  const modal = p.locator('dialog[open]')
  await expect(modal).toBeVisible()
  const texto = await modal.innerText()
  return texto.split('\n').map(l => l.trim()).filter(l => DE_REDE.test(l)).map(l => `${onde} → ${l}`)
}

/** Abre a tela e devolve as linhas VISÍVEIS que falam de rede ou filial. */
async function falasDeRede(p: Page, url: string): Promise<string[]> {
  await p.goto(url)
  await expect(p.locator('main')).toBeVisible()
  // A tela termina de chegar (as seções em streaming e os loading.tsx).
  await p.waitForLoadState('networkidle').catch(() => {})
  await expect(p.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 }).catch(() => {})
  const texto = await p.locator('body').innerText()
  return texto.split('\n').map(l => l.trim()).filter(l => DE_REDE.test(l)).map(l => `${url} → ${l}`)
}

const TELAS_DA_DONA = [
  '/admin/dashboard', '/admin/agenda', '/admin/clients', '/admin/clients/new', '/admin/team', '/admin/procedures',
  '/admin/estoque', '/admin/financeiro', '/admin/documentos', '/admin/planejamentos', '/admin/checkout',
  '/admin/reports',
  ...['unidades', 'permissions', 'fichas', 'documentos', 'integrations', 'fidelidade', 'comissoes', 'lgpd',
    'assinatura', 'general', 'tags', 'importacoes', 'eventos', 'lotes']
    .map(aba => `/admin/settings?tab=${aba}`),
]
const telasDaUnidade = () => [
  `/${slug}/dashboard`, `/${slug}/agenda`, `/${slug}/clients`, `/${slug}/clients/new`, `/${slug}/team`,
  `/${slug}/procedures`, `/${slug}/estoque`, `/${slug}/financeiro`, `/${slug}/documentos`,
  `/${slug}/planejamentos`, `/${slug}/checkout`,
  ...['unidade', 'permissions', 'fichas', 'documentos', 'integrations', 'general', 'tags']
    .map(aba => `/${slug}/settings?tab=${aba}`),
]

test.beforeAll(async () => {
  rede = await criarOutraRede(`uu${marca}`)
  // O nome da rede é dado da clínica, não vocabulário: sem "rede" no nome, o
  // que sobrar na tela é texto do sistema.
  expect((await db().from('tenants').update({
    name: `${PREFIXO} Clínica uu${marca}`,
    // O portal da rede manda ao /setup a rede sem onboarding.
    onboarding_completed_at: new Date().toISOString(),
  }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // Um produto com saldo (o modal do estoque) e uma cliente (o crédito para cliente).
  await rede.criarProduto('Serum', 5)
  produto = `${PREFIXO} Serum uu${marca}`
  await rede.criarCliente('Cliente')
  dona = await criarMembro(`uud${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  if (segunda) {
    const { error } = await db().from('branches').delete().eq('id', segunda)
    expect(error).toBeNull()
  }
  await dona?.limpar()
  await rede?.limpar()
})

test.describe.serial('a clínica de uma unidade só', () => {
  test('com UMA unidade, os termos e quadros de rede somem', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto('/admin/dashboard')
      await expect(p.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible()
      await expect(p.getByText('Visão geral da rede')).toHaveCount(0)
      await expect(p.getByText('Ranking de filiais')).toHaveCount(0)
      await expect(p.getByText('Hoje na rede')).toHaveCount(0)
      await expect(p.getByText(/por filial/i)).toHaveCount(0)

      await p.goto('/admin/financeiro')
      await expect(p.getByText('Movimentações').first()).toBeVisible()
      await expect(p.getByText('Por filial', { exact: true })).toHaveCount(0)
      await expect(p.getByText(/total rede/i)).toHaveCount(0)
      await expect(p.getByText('Todas as filiais')).toHaveCount(0)

      await p.goto('/admin/reports')
      await expect(p.getByText('Evolução do Período')).toBeVisible()
      await expect(p.getByText('Faturamento por Unidade')).toHaveCount(0)
      await expect(p.getByText('✦ Rede', { exact: true })).toHaveCount(0)

      await p.goto(`/${slug}/dashboard`)
      await expect(p.getByRole('navigation').first()).toBeVisible()
      await expect(p.getByText('Voltar para a rede')).toHaveCount(0)
    })
  })

  test('com UMA unidade, nenhuma tela dos dois portais fala "rede" ou "filial" (F8)', async ({ browser }) => {
    test.setTimeout(15 * 60_000)
    await como(browser, async p => {
      const achados: string[] = []
      for (const url of [...TELAS_DA_DONA, ...telasDaUnidade()]) achados.push(...await falasDeRede(p, url))

      // Os modais: o select de unidade obrigatório vem PREENCHIDO com a única
      // (era "Selecionar filial…", vazio), e a pergunta que não tem o que
      // perguntar some.
      await p.goto('/admin/estoque')
      await p.locator('tr, [role="row"], div').filter({ hasText: produto })
        .filter({ has: p.getByTitle('Gerenciar estoque') }).last()
        .getByTitle('Gerenciar estoque').click()
      const estoque = p.locator('dialog[open]')
      await expect(estoque.locator('select[name="branchId"]').first(), 'a entrada vem com a unidade').toHaveValue(rede!.branchId)
      achados.push(...await falasDoModal(p, 'Estoque → Entrada'))
      await estoque.getByRole('button', { name: 'Perda', exact: true }).click()
      await expect(estoque.locator('select[name="branchId"]').first(), 'a perda vem com a unidade').toHaveValue(rede!.branchId)
      achados.push(...await falasDoModal(p, 'Estoque → Perda'))

      await p.goto('/admin/team')
      await p.getByRole('button', { name: 'Adicionar membro' }).click()
      await expect(p.locator('dialog[open] #tm-branch'), 'o membro novo vem com a unidade').toHaveValue(rede!.branchId)
      achados.push(...await falasDoModal(p, 'Equipe → Adicionar membro'))

      await p.goto('/admin/procedures')
      await p.getByRole('button', { name: 'Novo procedimento' }).click()
      achados.push(...await falasDoModal(p, 'Procedimentos → Novo'))
      await expect(p.locator('dialog[open]').getByText('DISPONÍVEL NAS UNIDADES')).toHaveCount(0)

      await p.goto('/admin/financeiro')
      await p.getByRole('button', { name: 'Crédito para cliente' }).click()
      achados.push(...await falasDoModal(p, 'Financeiro → Crédito para cliente'))
      await expect(p.locator('dialog[open]').getByText('Unidade *', { exact: true }), 'sem a pergunta da unidade').toHaveCount(0)

      expect(achados).toEqual([])
    })
  })

  test('nasce a segunda unidade: tudo volta', async ({ browser }) => {
    await como(browser, async p => {
      const r = await chamarAcaoComFormulario(p, 'actions/branches.ts', 'createBranch', '/admin/settings?tab=unidades',
        ['$undefined'], { name: `${PREFIXO} Segunda ${marca}` })
      // A resposta traz a tela de Configurações re-renderizada (com props "error"
      // dela): o que vale é a linha do resultado da action.
      expect(r.texto).toMatch(/^1:{"success":true}/m)
      const { data } = await db().from('branches').select('id').eq('tenant_id', rede!.tenantId).neq('id', rede!.branchId)
      expect(data ?? []).toHaveLength(1)
      segunda = data![0]!.id as string

      await p.goto('/admin/dashboard')
      await expect(p.getByText('Visão geral da rede')).toBeVisible()
      await expect(p.getByText('Ranking de filiais')).toBeVisible()

      await p.goto('/admin/financeiro')
      await expect(p.getByText('Por filial', { exact: true })).toBeVisible()

      await p.goto(`/${slug}/dashboard`)
      await expect(p.getByText('Voltar para a rede')).toBeVisible()

      // O vocabulário de rede volta com a segunda unidade (o controle do F8).
      expect(await falasDeRede(p, '/admin/team')).not.toEqual([])
      expect(await falasDeRede(p, '/admin/procedures')).not.toEqual([])
    })
  })
})
