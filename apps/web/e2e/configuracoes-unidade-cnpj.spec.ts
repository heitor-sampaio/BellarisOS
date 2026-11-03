import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * cfg-01 (revisão do Heitor de 2026-11-02, "mudar"): a unidade nova herdava o
 * CNPJ da rede sem dizer nada (a Magnólia abriu a Zona Sul sem CNPJ e a filial
 * ficou com o da matriz). A nota dele: "se em branco, avisa e confirma
 * decisão. Talvez uma clínica possa ter 2 unidades físicas operando no mesmo
 * CNPJ. Uma unidade física não precisa necessariamente de um novo CNPJ.
 * Flexibilidade é a palavra."
 *
 * - CNPJ em branco: a tela AVISA, com "Usar o CNPJ da clínica (…)" e "Criar
 *   sem CNPJ"; nada é criado antes da resposta.
 * - Duas unidades com o MESMO CNPJ podem existir.
 * - O servidor faz a mesma pergunta: sem o campo, nada de herdar calado.
 */

const marca = Date.now().toString(36)
const db = () => banco()
// O documento da rede é único no banco: um por rodada.
const CNPJ = ('4' + Date.now()).slice(-14)
const CNPJ_COM_MASCARA = `${CNPJ.slice(0, 2)}.${CNPJ.slice(2, 5)}.${CNPJ.slice(5, 8)}/${CNPJ.slice(8, 12)}-${CNPJ.slice(12)}`
let rede: OutraRede | null = null
let gestora: MembroDeTeste | null = null

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: gestora!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const unidade = async (nome: string) =>
  (await db().from('branches').select('id, document').eq('tenant_id', rede!.tenantId).eq('name', nome)).data ?? []

async function abrirNovaUnidade(p: Page, nome: string) {
  await p.goto('/admin/settings?tab=unidades')
  await p.getByRole('button', { name: 'Nova unidade' }).click()
  const janela = p.getByRole('dialog', { name: 'Nova unidade' })
  await janela.locator('#br-name').fill(nome)
  return janela
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cn${marca}`)
  expect((await db().from('tenants').update({ document: CNPJ }).eq('id', rede.tenantId)).error).toBeNull()
  gestora = await criarMembro(`cng${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('branches').delete().eq('tenant_id', rede.tenantId).neq('id', rede.branchId)
  await gestora?.limpar()
  await rede?.limpar()
})

test.describe.serial('o CNPJ da unidade nova', () => {
  test('em branco, a tela avisa e oferece o CNPJ da clínica — nada é criado antes da resposta', async ({ browser }) => {
    const nome = `${PREFIXO} Zona Sul ${marca}`
    await como(browser, async p => {
      const janela = await abrirNovaUnidade(p, nome)
      await janela.getByRole('button', { name: 'Criar unidade' }).click()
      const aviso = janela.getByRole('alertdialog', { name: 'Unidade sem CNPJ' })
      await expect(aviso).toBeVisible({ timeout: 15_000 })
      await expect(aviso).toContainText('A unidade vai ficar sem CNPJ')
      expect(await unidade(nome), 'nada criado antes da resposta').toHaveLength(0)

      // A clínica tem UMA unidade: o texto fala "clínica" (F8).
      await aviso.getByRole('button', { name: `Usar o CNPJ da clínica (${CNPJ_COM_MASCARA})` }).click()
      await expect(janela).toBeHidden({ timeout: 15_000 })
    })
    const criadas = await unidade(nome)
    expect(criadas).toHaveLength(1)
    expect(criadas[0]!.document?.replace(/\D/g, ''), 'o CNPJ da rede, escolhido').toBe(CNPJ)
  })

  test('"Criar sem CNPJ" cria a unidade sem CNPJ', async ({ browser }) => {
    const nome = `${PREFIXO} Centro ${marca}`
    await como(browser, async p => {
      const janela = await abrirNovaUnidade(p, nome)
      await janela.getByRole('button', { name: 'Criar unidade' }).click()
      const aviso = janela.getByRole('alertdialog', { name: 'Unidade sem CNPJ' })
      // Duas unidades: o texto volta a falar "rede".
      await expect(aviso.getByRole('button', { name: `Usar o CNPJ da rede (${CNPJ_COM_MASCARA})` })).toBeVisible({ timeout: 15_000 })
      await aviso.getByRole('button', { name: 'Criar sem CNPJ' }).click()
      await expect(janela).toBeHidden({ timeout: 15_000 })
    })
    expect((await unidade(nome)).map(u => u.document)).toEqual([null])
  })

  test('duas unidades com o MESMO CNPJ podem existir — e o preenchido não pergunta', async ({ browser }) => {
    const nome = `${PREFIXO} Moinhos ${marca}`
    await como(browser, async p => {
      const janela = await abrirNovaUnidade(p, nome)
      await janela.getByLabel('CNPJ').pressSequentially(CNPJ)
      await expect(janela.getByLabel('CNPJ')).toHaveValue(CNPJ_COM_MASCARA)
      await janela.getByRole('button', { name: 'Criar unidade' }).click()
      await expect(janela).toBeHidden({ timeout: 15_000 })
    })
    expect((await unidade(nome)).map(u => u.document?.replace(/\D/g, ''))).toEqual([CNPJ])
    const { data: comOMesmo } = await db().from('branches').select('id').eq('tenant_id', rede!.tenantId).eq('document', CNPJ_COM_MASCARA)
    expect((comOMesmo ?? []).length, 'a Zona Sul e a Moinhos dividem o CNPJ').toBe(2)
  })

  test('o servidor faz a mesma pergunta: sem o CNPJ, não herda calado; com a resposta, cria', async ({ browser }) => {
    const nome = `${PREFIXO} Direto ${marca}`
    await como(browser, async p => {
      const r = await chamarAcaoComFormulario(p, 'actions/branches.ts', 'createBranch', '/admin/settings?tab=unidades',
        ['$undefined'], { name: nome })
      expect(r.texto).toMatch(/^1:{"perguntaCnpj":/m)
      expect(await unidade(nome), 'sem o campo, nada criado (era o CNPJ da rede, calado)').toHaveLength(0)

      const r2 = await chamarAcaoComFormulario(p, 'actions/branches.ts', 'createBranch', '/admin/settings?tab=unidades',
        ['$undefined'], { name: nome, _cnpj: 'sem' })
      expect(r2.texto).toMatch(/^1:{"success":true}/m)
    })
    expect((await unidade(nome)).map(u => u.document)).toEqual([null])
  })

  test('o mesmo envio duas vezes ao mesmo tempo cria UMA unidade (D10)', async ({ browser }) => {
    const nome = `${PREFIXO} Duplo ${marca}`
    const envio = crypto.randomUUID()
    await como(browser, async p => {
      const campos = { name: nome, document: CNPJ_COM_MASCARA, _envio: envio }
      const [a, b] = await Promise.all([1, 2].map(() => chamarAcaoComFormulario(p, 'actions/branches.ts', 'createBranch',
        '/admin/settings?tab=unidades', ['$undefined'], campos)))
      expect(a!.texto).toMatch(/^1:{"success":true}/m)
      expect(b!.texto).toMatch(/^1:{"success":true}/m)
    })
    expect(await unidade(nome)).toHaveLength(1)
  })
})
