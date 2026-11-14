import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * F73 — o editor do plano lista só o que a unidade DO PLANO faz (D4 da 14ª
 * simulação; D7 da 13ª, CLAUDE.md §9.3 "a unidade OFERECE o procedimento?").
 *
 * O plano da Pampulha, aberto pelo portal da rede (/admin/planejamentos/…),
 * oferecia o "Laser" que só a Savassi faz: o editor pedia o catálogo SEM
 * unidade, e o servidor gravava. A sessão desse plano não se agendaria em
 * lugar nenhum da Pampulha. Agora:
 * - o editor lista o catálogo da unidade do plano, nos dois portais (o plano
 *   aberto pelo `getPlanoParaEditar` traz o catálogo dele);
 * - o servidor que grava as sessões recusa o procedimento que a unidade do
 *   plano não faz, com a mesma frase do agendar.
 */

test.setTimeout(180_000)

const marca = `pu${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede
let unidadeB = ''
let slugB = ''
let cliente = ''
let laserSoNaA = ''
let plano = ''
let gestor: MembroDeTeste

const NOME_DO_LASER = `${PREFIXO} Laser so na Savassi ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function opcoesDoEditor(p: Page): Promise<string[]> {
  const seletor = p.locator('select').filter({ hasText: 'Selecionar procedimento…' }).first()
  await expect(seletor).toBeVisible()
  return seletor.locator('option').allTextContents()
}

async function procedimentosGravados(): Promise<string[]> {
  const { data: sessoes } = await db().from('treatment_plan_sessions').select('id').eq('plan_id', plano)
  const ids = (sessoes ?? []).map(s => s.id as string)
  if (!ids.length) return []
  const { data } = await db().from('treatment_plan_session_procedures').select('procedure_id').in('session_id', ids)
  return (data ?? []).map(d => d.procedure_id as string)
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: ub, error: eB } = await b.from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Pampulha ${marca}`, slug: `e2e-pmp-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(eB).toBeNull()
  unidadeB = ub!.id; slugB = ub!.slug
  // O Laser é DA Savassi (a unidade A): a Pampulha não o faz.
  const { data: lz, error: eL } = await b.from('procedures')
    .insert({ tenant_id: rede.tenantId, branch_id: rede.branchId, name: NOME_DO_LASER, category: 'e2e', duration_min: 30, price: 400 })
    .select('id').single<{ id: string }>()
  expect(eL).toBeNull()
  laserSoNaA = lz!.id

  gestor = await criarMembro(`g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    // PT2 (2026-11-14): monta o plano quem ATENDE na unidade (o "Atende"), não o Prontuário.
    atendeEm: [rede.branchId, unidadeB],
    permissoes: (['agenda', 'medical_records', 'clients'] as const).map(modulo => ({ modulo, nivel: 'MANAGE' as const })),
  })

  cliente = await rede.criarCliente('Marina')
  // O plano em rascunho é da PAMPULHA, com uma sessão do procedimento da rede (feito nas duas).
  const { data: pl, error: ePl } = await b.from('treatment_plans').insert({
    branch_id: unidadeB, client_id: cliente, professional_id: rede.professionalId,
    status: 'DRAFT', name: `${PREFIXO} Plano Pampulha ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  plano = pl!.id
  const { data: ss } = await b.from('treatment_plan_sessions').insert({ plan_id: plano, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await b.from('treatment_plan_session_procedures').insert({ session_id: ss!.id, procedure_id: rede.procedureId, price: 100 })).error).toBeNull()
})

test.afterAll(async () => {
  await gestor?.limpar()
  await rede?.limpar()
})

test('D4: o plano da Pampulha aberto pela rede não oferece o Laser da Savassi', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto(`/admin/planejamentos/${plano}`)
    const opcoes = await opcoesDoEditor(p)
    expect(opcoes.some(o => o.includes(`${PREFIXO} Proc ${marca}`)), 'o procedimento da rede está').toBe(true)
    expect(opcoes.some(o => o.includes(NOME_DO_LASER)), 'o Laser só da Savassi não está').toBe(false)
  })
})

test('D4: na ficha (portal da rede e da Savassi) o plano aberto usa o catálogo da Pampulha', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=planejamento&aberto=${plano}`)
    const opcoes = await opcoesDoEditor(p)
    expect(opcoes.some(o => o.includes(NOME_DO_LASER)), 'o Laser só da Savassi não está no plano da Pampulha').toBe(false)
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'getPlanoParaEditar', `/admin/clients/${cliente}`, [plano])
    expect(r.texto, 'o catálogo do plano vem com ele').toContain('"catalogo"')
    expect(r.texto).not.toContain(NOME_DO_LASER)
  })
})

test('D4: o servidor recusa gravar o Laser da Savassi no plano da Pampulha', async ({ browser }) => {
  await como(browser, gestor, async p => {
    const rota = `/admin/planejamentos/${plano}`
    await p.goto(rota)
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'salvarPlanoDoCliente', rota, [plano, [
      { procedures: [{ procedureId: laserSoNaA, price: 400, products: [] }] },
    ], ''])
    expect(r.texto).toContain('não é feito na unidade')
    // Nada mudou: a sessão do procedimento da rede continua, o Laser não entrou.
    expect(await procedimentosGravados()).toEqual([rede.procedureId])

    // Controle: o procedimento que a Pampulha faz grava.
    const ok = await chamarAcao(p, 'actions/treatment-plans.ts', 'salvarPlanoDoCliente', rota, [plano, [
      { procedures: [{ procedureId: rede.procedureId, price: 120, products: [] }] },
      { procedures: [{ procedureId: rede.procedureId, price: 120, products: [] }] },
    ], ''])
    expect(ok.texto).not.toContain('não é feito na unidade')
    expect(await procedimentosGravados()).toEqual([rede.procedureId, rede.procedureId])
  })
  void slugB
})
