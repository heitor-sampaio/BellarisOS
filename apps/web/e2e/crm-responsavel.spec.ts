import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O RESPONSÁVEL da oportunidade (pedido do Heitor, 2026-10-09): aparece no
 * card, troca-se no modal, e a linha do tempo diz de quem para quem. Troca
 * quem tem o CRM em Gerenciar com escopo "todos"; o "só os meus" vê e não
 * troca. E a tela diz "Responsável" em todo lugar (era "Dono" no filtro).
 *
 * Numa rede `[e2e]` própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let gestor: MembroDeTeste
let outraPessoa: MembroDeTeste
let sdr: MembroDeTeste
let funil: string
let etapa: string
let nomeDoGestor: string
let nomeDaOutra: string
const membros: MembroDeTeste[] = []
const leads: string[] = []

const nomeDe = async (m: MembroDeTeste) => (await db().from('users').select('name').eq('id', m.userId).single()).data!.name as string

async function lead(nome: string, owner: string | null, criadoEm?: string) {
  const { data, error } = await db().from('leads').insert({
    tenant_id: outra.tenantId, name: `${PREFIXO} ${nome} ${marca}`, phone: '5548' + String(Date.now() + leads.length).slice(-9),
    crm_stage_id: etapa, owner_id: owner, source: 'Instagram', ...(criadoEm ? { created_at: criadoEm } : {}),
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a oportunidade').toBeNull()
  leads.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`rsp${marca}`)
  const b = db()
  const f = await b.from('crm_funnels').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true }).select('id').single<{ id: string }>()
  expect(f.error).toBeNull(); funil = f.data!.id
  const e = await b.from('crm_stages').insert({ tenant_id: outra.tenantId, funnel_id: funil, name: 'Primeiro contato', position: 0 }).select('id').single<{ id: string }>()
  expect(e.error).toBeNull(); etapa = e.data!.id
  const m = async (chave: string, escopo?: 'OWN') => {
    const x = await criarMembro(`rsp${chave}${marca}`, { tenant: outra.tenantId, rotulo: `Resp ${chave}`,
      permissoes: [{ modulo: 'crm', nivel: 'MANAGE', ...(escopo ? { escopo } : {}) }] })
    membros.push(x); return x
  }
  gestor = await m('gestor'); outraPessoa = await m('outra'); sdr = await m('sdr', 'OWN')
  nomeDoGestor = await nomeDe(gestor); nomeDaOutra = await nomeDe(outraPessoa)
})
test.afterAll(async () => {
  const b = db()
  if (leads.length) {
    await b.from('lead_events').delete().in('lead_id', leads)
    await b.from('leads').delete().in('id', leads)
  }
  await b.from('contacts').delete().eq('tenant_id', outra.tenantId)
  await b.from('crm_stages').delete().eq('tenant_id', outra.tenantId)
  await b.from('crm_funnels').delete().eq('tenant_id', outra.tenantId)
  await b.from('crm_quadro_sinais').delete().eq('tenant_id', outra.tenantId)
  for (const x of membros) await x.limpar()
  await outra?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const quadro = () => `/admin/oportunidades?funil=${funil}`
const card = (p: Page, nome: string) => p.locator('[data-lead-id]', { hasText: `${PREFIXO} ${nome} ${marca}` })
const dono = async (id: string) => (await db().from('leads').select('owner_id').eq('id', id).single()).data!.owner_id as string | null

test('o card mostra o responsável, e o filtro do quadro se chama "Responsável"', async ({ browser }) => {
  await lead('Card Carla', gestor.userId)
  await como(browser, gestor, async p => {
    await p.goto(quadro())
    await expect(card(p, 'Card Carla').getByLabel(`Responsável: ${nomeDoGestor}`)).toBeVisible()
    await expect(p.getByRole('button', { name: /^Responsável/ })).toBeVisible()
    await expect(p.getByRole('button', { name: /^Dono/ })).toHaveCount(0)
  })
})

test('quem tem o CRM em Gerenciar troca o responsável pelo modal, e a linha do tempo diz de quem para quem', async ({ browser }) => {
  const id = await lead('Troca Tina', gestor.userId)
  await como(browser, gestor, async p => {
    await p.goto(quadro())
    await card(p, 'Troca Tina').click()
    const modal = p.locator('dialog[open]')
    const campo = modal.getByLabel('Responsável')
    await expect(campo).toHaveValue(gestor.userId)
    await campo.selectOption(outraPessoa.userId)
    await modal.getByRole('button', { name: /Salvar/ }).click()
    await expect.poll(() => dono(id)).toBe(outraPessoa.userId)
  })
  const { data: ev } = await db().from('lead_events').select('type, changes').eq('lead_id', id).eq('type', 'OWNER_CHANGED')
  expect(ev?.[0]?.changes).toEqual([{ campo: 'Responsável', de: nomeDoGestor, para: nomeDaOutra }])
})

test('"Sem responsável" tira o responsável', async ({ browser }) => {
  const id = await lead('Tira Tais', gestor.userId)
  await como(browser, gestor, async p => {
    await p.goto(quadro())
    await card(p, 'Tira Tais').click()
    const modal = p.locator('dialog[open]')
    await modal.getByLabel('Responsável').selectOption({ label: 'Sem responsável' })
    await modal.getByRole('button', { name: /Salvar/ }).click()
    await expect.poll(() => dono(id)).toBeNull()
  })
})

test('quem tem "só os meus" VÊ o responsável, mas não troca', async ({ browser }) => {
  await lead('Minha Mel', sdr.userId)
  const nomeDoSdr = await nomeDe(sdr)
  await como(browser, sdr, async p => {
    await p.goto(quadro())
    await card(p, 'Minha Mel').click()
    const modal = p.locator('dialog[open]')
    await expect(modal.getByText(nomeDoSdr)).toBeVisible()
    await expect(modal.getByRole('combobox', { name: 'Responsável' })).toHaveCount(0)
    // E o servidor diz o mesmo (é ele que decide se o campo vale).
    const r = await chamarAcao(p, 'actions/leads.ts', 'responsaveisParaOportunidade', quadro(), [])
    expect(r.texto).toContain('"pode":false')
  })
})

// "Convertido" se lia como "ganho", e o filtro só olha se a oportunidade tem um
// CLIENTE ligado (leads.client_id) — não a etapa. A tela diz isso (2026-10-09).
// E situação e período têm a forma dos outros filtros da barra (o gatilho que
// abre a lista), não a de um <select> solto.
test('a situação fala de cliente, com o seletor dos outros filtros', async ({ browser }) => {
  await lead('Sem Cadastro Sara', gestor.userId)
  await como(browser, gestor, async p => {
    await p.goto(quadro())
    await expect(p.locator('select.filtro-select', { has: p.locator('option[value="converted"]') })).toHaveCount(0)
    await expect(card(p, 'Sem Cadastro Sara')).toBeVisible()
    await p.getByRole('button', { name: 'Situação', exact: true }).click()
    await p.getByRole('button', { name: 'Já é cliente', exact: true }).click()
    await expect(card(p, 'Sem Cadastro Sara')).toHaveCount(0)
    await p.getByRole('button', { name: 'Já é cliente', exact: true }).click()   // o gatilho diz o escolhido
    await p.getByRole('button', { name: 'Ainda não é cliente', exact: true }).click()
    await expect(card(p, 'Sem Cadastro Sara')).toBeVisible()
  })
})

test('o período aceita um intervalo personalizado', async ({ browser }) => {
  await lead('Janeiro Joana', gestor.userId, '2026-01-15T15:00:00Z')
  await lead('Agora Alice', gestor.userId)
  await como(browser, gestor, async p => {
    await p.goto(quadro())
    await expect(card(p, 'Janeiro Joana')).toBeVisible()
    await p.getByRole('button', { name: 'Período', exact: true }).click()
    await expect(p.getByRole('button', { name: 'Últimos 7 dias', exact: true })).toBeVisible()
    await p.getByRole('button', { name: 'Personalizado', exact: true }).click()
    await p.getByLabel('De', { exact: true }).fill('2026-01-01')
    await p.getByLabel('Até', { exact: true }).fill('2026-01-31')
    await p.getByRole('button', { name: 'Aplicar', exact: true }).click()
    await expect(card(p, 'Agora Alice')).toHaveCount(0)
    await expect(card(p, 'Janeiro Joana')).toBeVisible()
    await expect(p.getByRole('button', { name: '01/01/26 – 31/01/26', exact: true })).toBeVisible()
  })
})

// A barra é uma só: situação e período marcam com o MESMO quadradinho dos
// outros filtros (era a bolinha de rádio), e nada os separa do responsável.
test('situação e período têm o marcador dos outros filtros, sem divisor antes', async ({ browser }) => {
  await lead('Barra Bia', gestor.userId)
  await como(browser, gestor, async p => {
    await p.goto(quadro())
    // O vizinho de antes da situação é o responsável — não um divisor.
    await expect(card(p, 'Barra Bia')).toBeVisible()
    const anterior = await p.getByRole('button', { name: 'Situação', exact: true })
      .evaluate(b => b.parentElement?.previousElementSibling?.textContent ?? '')
    expect(anterior).toBe('Responsável')
    const raio = async (gatilho: string, opcao: string) => {
      const botao = p.getByRole('button', { name: gatilho, exact: true })
      await botao.click()
      const r = await p.getByRole('button', { name: opcao, exact: true }).locator('span').first()
        .evaluate(e => getComputedStyle(e).borderRadius)
      // Fecha clicando de novo no gatilho (o clique cai no fundo do painel, que o fecha).
      const caixa = (await botao.boundingBox())!
      await p.mouse.click(caixa.x + 4, caixa.y + 4)
      await expect(p.getByRole('button', { name: opcao, exact: true })).toHaveCount(0)
      return r
    }
    const daOrigem = await raio('Origem', 'Instagram')
    expect(await raio('Situação', 'Todos os leads')).toBe(daOrigem)
    expect(await raio('Período', 'Qualquer período')).toBe(daOrigem)
  })
})
