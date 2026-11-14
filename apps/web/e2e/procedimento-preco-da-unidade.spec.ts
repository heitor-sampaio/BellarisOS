import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * D2 da 9ª simulação (2026-11-07): o preço por unidade era salvo e ignorado.
 * Na Menino Deus a criolipólise foi salva a R$ 590 ("1 unidade com preço
 * próprio"), e o agendar listou e gravou R$ 650, a cliente pagou R$ 650 e a
 * comissão saiu de R$ 650. A lista de procedimentos dizia "Toda a rede".
 *
 * Decidido pelo princípio 3: o preço da unidade vale em TODO caminho de preço
 * (`lib/procedimentos/preco-na-unidade.ts`) — o agendar (o núcleo: agenda, app,
 * Copilot, CRM), o Vender (pré-pago e o rateio do pacote), o editor do plano —,
 * e a lista diz "R$ 590,00 na Menino Deus".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let moinhos = ''
let slugMoinhos = ''
let menino = ''
let slugMenino = ''
const nomeMenino = `${PREFIXO} Menino Deus pu${marca}`
let drenagem = ''
let pacote = ''
let dona: MembroDeTeste | null = null
let luana: ClienteDeTeste | null = null
let cliente = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`pu${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  moinhos = rede.branchId
  slugMoinhos = (await db().from('branches').select('slug').eq('id', moinhos).single<{ slug: string }>()).data!.slug
  slugMenino = `e2e-md-pu${marca}`
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: nomeMenino, slug: slugMenino }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  menino = b!.id
  // A criolipólise a R$ 650 na rede e R$ 590 na Menino Deus; a drenagem sem preço próprio.
  expect((await db().from('procedures').update({ price: 650, duration_min: 60, visible_on_client_app: true }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('procedure_branch_pricing').insert({ procedure_id: rede.procedureId, branch_id: menino, price: 590 })).error).toBeNull()
  const { data: d, error: eD } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Drenagem pu${marca}`, category: 'e2e', duration_min: 50, price: 100 })
    .select('id').single<{ id: string }>()
  expect(eD).toBeNull()
  drenagem = d!.id
  // O pacote: 1 criolipólise + 1 drenagem por R$ 690.
  const { data: pk, error: ePk } = await db().from('service_packages')
    .insert({ tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: `${PREFIXO} Pacote pu${marca}`, total_sessions: 2, price: 690 })
    .select('id').single<{ id: string }>()
  expect(ePk).toBeNull()
  pacote = pk!.id
  expect((await db().from('service_package_items').insert([
    { tenant_id: rede.tenantId, package_id: pacote, procedure_id: rede.procedureId, quantity: 1, sort_order: 0 },
    { tenant_id: rede.tenantId, package_id: pacote, procedure_id: drenagem, quantity: 1, sort_order: 1 },
  ])).error).toBeNull()
  // A Priscila atende nas duas.
  expect((await db().from('users').update({ atende_em: [moinhos, menino] }).eq('id', rede.professionalId)).error).toBeNull()
  cliente = await rede.criarCliente('Fernanda')
  dona = await criarMembro(`pud${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  luana = await clienteComSessao(`pul${marca}`, { id: moinhos, slug: slugMoinhos }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  // A rede inteira sai com o limpar() (agendamentos, vendas, pacote, a 2ª unidade).
  await luana?.limpar(); await dona?.limpar()
  await rede?.limpar()
})

test('D2: a lista de procedimentos diz o preço da unidade, não "Toda a rede"', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    await p.goto('/admin/procedures')
    const linha = p.locator('tr').filter({ hasText: `${PREFIXO} Proc pu${marca}` })
    await expect(linha.locator('[data-preco-da-unidade]')).toContainText(`R$ 590,00 na ${nomeMenino}`)
  })
})

test('D2: o agendar lista e grava o preço da unidade (a Menino Deus a R$ 590, a Moinhos a R$ 650)', async ({ browser }) => {
  const dia = diaEmQueAUnidadeAbre(4)
  await como(browser, dona!.estado, async p => {
    const lista = async (unidade: string) => {
      const r = await chamarAcao(p, 'actions/appointments.ts', 'dadosParaAgendar', `/${slugMenino}/agenda`, [unidade])
      const m = new RegExp(`"id":"${rede!.procedureId}"[^}]*"price":([0-9.]+)`).exec(r.texto)
      return Number(m?.[1])
    }
    expect(await lista(menino), 'o agendar da Menino Deus lista R$ 590').toBe(590)
    expect(await lista(moinhos), 'a Moinhos segue a R$ 650').toBe(650)
    for (const [unidade, slug, hora] of [[menino, slugMenino, '10:00'], [moinhos, slugMoinhos, '14:00']] as const) {
      const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
        _branchId: unidade, _slug: slug, client_id: cliente, procedure_id: rede!.procedureId,
        professional_id: rede!.professionalId, scheduled_at: new Date(`${dia}T${hora}:00-03:00`).toISOString(), notes: '',
      })
      expect(r.texto, 'agendou').toContain('"success":true')
    }
  })
  const { data } = await db().from('appointments').select('branch_id, price').eq('client_id', cliente)
  const preco = (u: string) => Number((data ?? []).find(a => a.branch_id === u)?.price)
  expect(preco(menino), 'o agendamento da Menino Deus grava R$ 590').toBe(590)
  expect(preco(moinhos), 'o da Moinhos, R$ 650').toBe(650)
})

test('D2: o Vender cobra o preço da unidade — o pré-pago e o rateio do pacote', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    const rota = '/admin/pdv'
    const v = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', rota,
      [cliente, rede!.procedureId, menino, 1, null, { forma: 'AVISTA', metodo: 'PIX' }, null, null, {}])
    expect(v.texto, 'vendeu o pré-pago').toContain('saleId')
    const k = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota,
      [cliente, pacote, menino, { forma: 'AVISTA', metodo: 'PIX' }, null, null, {}])
    expect(k.texto, 'vendeu o pacote').toContain('clientPackageId')
  })
  const venda = (await db().from('procedure_sales').select('preco_unitario_tabela, price').eq('client_id', cliente).single()).data!
  expect(Number(venda.preco_unitario_tabela), 'o pré-pago na Menino Deus é R$ 590').toBe(590)
  expect(Number(venda.price)).toBe(590)
  const cp = (await db().from('client_packages').select('id').eq('client_id', cliente).single<{ id: string }>()).data!
  const { data: sessoes } = await db().from('package_sessions').select('procedure_id, preco').eq('client_package_id', cp.id)
  // R$ 690 rateados por 590 : 100 (a tabela da Menino Deus), não por 650 : 100.
  expect(Number(sessoes!.find(s => s.procedure_id === rede!.procedureId)?.preco), 'a sessão da criolipólise vale R$ 590').toBe(590)
  expect(Number(sessoes!.find(s => s.procedure_id === drenagem)?.preco)).toBe(100)
})

test('D2: o app da cliente mostra o preço da unidade do endereço', async ({ browser }) => {
  await como(browser, luana!.estado, async p => {
    await p.goto(`/${slugMenino}/cliente/agendamentos/novo`)
    const item = p.getByRole('button', { name: new RegExp(`${PREFIXO} Proc pu${marca}`.replace(/[[\]]/g, '\\$&')) })
    await expect(item).toContainText('590')
    await expect(item).not.toContainText('650')
  })
})
