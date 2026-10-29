import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os planejamentos (planos de tratamento) com a agenda "só os meus" (decisão
 * do Heitor, 2026-10-28: "quem tem 'só os meus' vê 'só os meus', em qualquer
 * lugar").
 *
 * A frente G achou: `listarPlanejamentos` (a tela Planejamentos, que confere
 * `agenda: VIEW`) mostrava os planos de todas as profissionais, e o plano
 * abria pelo id. "Dela" é `treatment_plans.professional_id` — o mesmo recorte
 * dos planos aguardando checkout no dashboard.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let ela: MembroDeTeste | null = null
let todos: MembroDeTeste | null = null
let slug = ''
const planos: Record<'dela' | 'deOutra', { id: string; nome: string }> = {} as never

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const ARQ = 'actions/treatment-plans.ts'

test.beforeAll(async () => {
  rede = await criarOutraRede(`pl${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  ela = await criarMembro(`plp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  todos = await criarMembro(`pla${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Agenda de todos',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  const cliente = await rede.criarCliente('Cliente do plano')
  for (const [chave, prof] of [['dela', ela.userId], ['deOutra', rede.professionalId]] as const) {
    const nome = `${PREFIXO} Plano ${chave} ${marca}`
    const { data, error } = await db().from('treatment_plans').insert({
      branch_id: rede.branchId, client_id: cliente, professional_id: prof, status: 'DRAFT', name: nome,
    }).select('id').single<{ id: string }>()
    expect(error, `plano ${chave}`).toBeNull()
    planos[chave] = { id: data!.id, nome }
  }
})

test.afterAll(async () => {
  const falhas: string[] = []
  const ids = Object.values(planos).map(p => p.id)
  if (ids.length) {
    const r = await db().from('treatment_plans').delete().in('id', ids)
    if (r.error) falhas.push(`planos: ${r.error.message}`)
  }
  await ela?.limpar()
  await todos?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('a lista de Planejamentos, com a agenda "só os meus", mostra só os planos dela', async ({ browser }) => {
  await como(ela!, browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    await expect(p.getByText(planos.dela.nome)).toBeVisible()
    await expect(p.getByText(planos.deOutra.nome), 'plano de outra profissional').toHaveCount(0)
  })
  await como(todos!, browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    await expect(p.getByText(planos.dela.nome)).toBeVisible()
    await expect(p.getByText(planos.deOutra.nome)).toBeVisible()
  })
})

test('pelo id: o plano de outra não abre, não se edita nem se renomeia', async ({ browser }) => {
  const tela = `/${slug}/planejamentos/${planos.dela.id}`
  await como(ela!, browser, async p => {
    await p.goto(tela)
    for (const funcao of ['getCabecalhoDoPlano', 'getPlanoParaEditar']) {
      const r = await chamarAcao(p, ARQ, funcao, tela, [planos.deOutra.id])
      expect(r.texto, `${funcao} chegou à action`).not.toContain('Server action not found')
      expect(r.texto, funcao).toContain('Plano não encontrado')
    }
    await chamarAcao(p, ARQ, 'renomearPlano', tela, [planos.deOutra.id, 'invasão'])
    const meu = await chamarAcao(p, ARQ, 'getCabecalhoDoPlano', tela, [planos.dela.id])
    expect(meu.texto, 'o dela abre').toContain(planos.dela.nome)
  })
  const { data } = await db().from('treatment_plans').select('name').eq('id', planos.deOutra.id).single<{ name: string }>()
  expect(data!.name, 'o de outra não foi renomeado').toBe(planos.deOutra.nome)

  // A página do plano de outra, pela URL, não mostra o plano.
  await como(ela!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planos.deOutra.id}`)
    await expect(p.getByText(planos.deOutra.nome)).toHaveCount(0)
  })
  // Controle: com a agenda de todos, abre.
  await como(todos!, browser, async p => {
    await p.goto(tela)
    const r = await chamarAcao(p, ARQ, 'getCabecalhoDoPlano', tela, [planos.deOutra.id])
    expect(r.texto).toContain(planos.deOutra.nome)
  })
})
