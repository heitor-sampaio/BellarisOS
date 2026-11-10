import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * A indicação que premia (A43 da 10ª simulação e o caso da Ana Clara e da
 * Marina; decisão do Heitor, 2026-11-10: "1 - sim"):
 * - "Indicada por" é a ligação a OUTRA ficha da clínica, escolhida no Novo
 *   cliente, no Agendar (cliente nova) e na ficha (aba Dados); a importação liga
 *   pelo nome quando bate e, senão, guarda o texto e diz que não ligou;
 * - em Fidelidade, o "Prêmio por indicação" NASCE DESLIGADO: N pontos ou uma
 *   recompensa para QUEM INDICOU, quando a indicada PAGA o primeiro atendimento
 *   ou a primeira venda, uma vez por indicada; o estorno desse pagamento tira o
 *   prêmio;
 * - a ficha de quem indicou diz "Indicou: Marina (prêmio dado em 10/11)", e o
 *   extrato de pontos, "Indicação de Marina";
 * - no app, "Indique uma amiga" só com o prêmio ligado (a cliente não cadastra a amiga).
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let ana: ClienteDeTeste | null = null
let anaNome = ''
let recompensa = ''
const agendamentos: string[] = []

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const fone = () => '(48) 9' + String(Date.now()).slice(-4) + '-' + String(Math.floor(Math.random() * 9000) + 1000)

/** Um pagamento da cliente, no Pix (o gatilho do pagamento é quem premia). */
async function pagamento(cliente: string, valor: number): Promise<string> {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Atendimento',
    description: `${PREFIXO} Limpeza`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

async function regra(premio: 'DESLIGADO' | 'PONTOS' | 'RECOMPENSA', pontos = 300) {
  expect((await db().from('loyalty_configs').update({
    indicacao_premio: premio, indicacao_pontos: pontos, indicacao_recompensa_id: premio === 'RECOMPENSA' ? recompensa : null,
  }).eq('tenant_id', rede!.tenantId)).error).toBeNull()
}

const extratoDa = async (cliente: string) => {
  const { data: conta } = await db().from('loyalty_accounts').select('id').eq('client_id', cliente).single<{ id: string }>()
  const { data } = await db().from('loyalty_transactions').select('kind, points, description, bonus_ref')
    .eq('loyalty_account_id', conta!.id).order('created_at')
  return (data ?? []) as { kind: string; points: number; description: string; bonus_ref: string | null }[]
}
const saldoDa = async (cliente: string) => Number((await db().rpc('saldo_de_pontos', { p_cliente: cliente })).data ?? 0)

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`fin${marca}`)
  const b = db()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('loyalty_configs').upsert(
    { tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 }, { onConflict: 'tenant_id' })).error).toBeNull()
  const { data: rec, error: eRec } = await b.from('loyalty_rewards').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Desconto amiga ${marca}`, type: 'DESCONTO_VALOR', discount_value: 50, points_cost: 500, validity_days: 60,
  }).select('id').single<{ id: string }>()
  expect(eRec).toBeNull()
  recompensa = rec!.id
  dona = await criarMembro(`find${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  ana = await clienteComSessao(`fina${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  anaNome = (await b.from('clients').select('name').eq('id', ana.clientId).single<{ name: string }>()).data!.name
})

test.afterAll(async () => {
  if (agendamentos.length) await db().from('appointments').delete().in('id', agendamentos)
  await ana?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('o prêmio por indicação nasce desligado, e a dona liga em Configurações → Fidelidade', async ({ browser }) => {
  const { data: cfg } = await db().from('loyalty_configs').select('indicacao_premio').eq('tenant_id', rede!.tenantId).single()
  expect(cfg!.indicacao_premio).toBe('DESLIGADO')
  await como(browser, dona!.estado, async p => {
    await p.goto('/admin/settings?tab=fidelidade')
    const bloco = p.getByTestId('opcional-indicacao')
    await expect(bloco).toContainText('Prêmio por indicação')
    await bloco.getByRole('button', { name: 'Pontos' }).click()
    await bloco.getByLabel('Pontos para quem indicou').fill('300')
    await expect(bloco).toContainText('quando a indicada pagar o primeiro atendimento ou a primeira compra')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(p.getByText('Salvo')).toBeVisible()
  })
  const { data: depois } = await db().from('loyalty_configs').select('indicacao_premio, indicacao_pontos').eq('tenant_id', rede!.tenantId).single()
  expect(depois).toMatchObject({ indicacao_premio: 'PONTOS', indicacao_pontos: 300 })
})

test('Novo cliente: "Indicada por" liga a ficha nova à de quem indicou', async ({ browser }) => {
  const nome = `${PREFIXO} Marina ${marca}`
  await como(browser, dona!.estado, async p => {
    await p.goto(`/${slug}/clients/new`)
    await p.locator('input[name="name"]').fill(nome)
    await p.locator('input[name="phone"]').fill(fone())
    const campo = p.getByLabel('Indicada por', { exact: true })
    await campo.fill(anaNome)
    await p.getByRole('option', { name: new RegExp(anaNome.replace(/[[\]]/g, '\\$&')) }).click()
    await expect(p.locator('[data-indicada-por-escolhida]')).toContainText(anaNome)
    await p.getByRole('button', { name: /^Cadastrar/ }).click()
    await expect(p).toHaveURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 30_000 })
  })
  const { data: marina } = await db().from('clients').select('id, indicada_por').eq('tenant_id', rede!.tenantId).eq('name', nome).single()
  expect(marina!.indicada_por).toBe(ana!.clientId)
})

test('o primeiro pagamento da indicada premia quem indicou, uma vez; o estorno tira o prêmio', async ({ browser }) => {
  const { data: marina } = await db().from('clients').select('id, name').eq('tenant_id', rede!.tenantId).eq('name', `${PREFIXO} Marina ${marca}`).single<{ id: string; name: string }>()
  const antes = await saldoDa(ana!.clientId)
  const primeiro = await pagamento(marina!.id, 170)
  await expect.poll(async () => (await extratoDa(ana!.clientId)).filter(l => l.description === `Indicação de ${marina!.name}`).length).toBe(1)
  expect(await saldoDa(ana!.clientId)).toBe(antes + 300)
  // O segundo pagamento não premia de novo.
  const segundo = await pagamento(marina!.id, 90)
  expect(await saldoDa(ana!.clientId)).toBe(antes + 300)

  // A ficha da Ana diz quem ela indicou e o prêmio; o extrato, "Indicação de Marina".
  await como(browser, dona!.estado, async p => {
    await p.goto(`/${slug}/clients/${ana!.clientId}`)
    const indicacao = p.locator('[data-indicacao-da-ficha]')
    await expect(indicacao).toContainText(`Indicou: ${marina!.name}`)
    await expect(indicacao).toContainText(/prêmio dado em \d{2}\/\d{2}/)
    await expect(p.getByText(`Indicação de ${marina!.name}`).first()).toBeVisible()
  })
  // E a da Marina, quem a indicou.
  await como(browser, dona!.estado, async p => {
    await p.goto(`/${slug}/clients/${marina!.id}`)
    await expect(p.locator('[data-indicacao-da-ficha]')).toContainText(`Indicada por: ${anaNome}`)
  })

  // O estorno do segundo pagamento não mexe no prêmio; o do primeiro (o que
  // premiou), sem outro pagamento de pé, tira os 300.
  expect((await db().rpc('estornar_transacao', { p_transacao: segundo, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
  expect(await saldoDa(ana!.clientId)).toBe(antes + 300)
  expect((await db().rpc('estornar_transacao', { p_transacao: primeiro, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
  await expect.poll(() => saldoDa(ana!.clientId)).toBe(antes)
  expect((await extratoDa(ana!.clientId)).some(l => l.points === -300 && l.description.startsWith('Estorno da indicação'))).toBe(true)
  // Sem pagamento de pé, ela paga de novo: o prêmio volta, uma vez.
  await pagamento(marina!.id, 100)
  await expect.poll(() => saldoDa(ana!.clientId)).toBe(antes + 300)
})

test('o prêmio pode ser uma recompensa: o voucher sai para quem indicou e cai com o estorno', async () => {
  await regra('RECOMPENSA')
  const indicada = await rede!.criarCliente('Joana')
  expect((await db().from('clients').update({ indicada_por: ana!.clientId }).eq('id', indicada)).error).toBeNull()
  const pago = await pagamento(indicada, 200)
  await expect.poll(async () => (await db().from('loyalty_vouchers').select('id, status, points_cost')
    .eq('client_id', ana!.clientId).eq('reward_id', recompensa)).data ?? []).toHaveLength(1)
  const { data: v } = await db().from('loyalty_vouchers').select('id, status, points_cost').eq('client_id', ana!.clientId).eq('reward_id', recompensa).single()
  expect(v).toMatchObject({ status: 'ATIVO', points_cost: 0 })
  expect((await db().rpc('estornar_transacao', { p_transacao: pago, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
  await expect.poll(async () => (await db().from('loyalty_vouchers').select('status').eq('id', v!.id).single()).data!.status).toBe('CANCELADO')
  await regra('PONTOS')
})

test('o estorno do pagamento que premiou, com outro pagamento dela de pé: o prêmio passa para ele (uma vez)', async () => {
  const indicada = await rede!.criarCliente('Lia')
  expect((await db().from('clients').update({ indicada_por: ana!.clientId }).eq('id', indicada)).error).toBeNull()
  const antes = await saldoDa(ana!.clientId)
  const a = await pagamento(indicada, 120)
  await pagamento(indicada, 80)
  await expect.poll(() => saldoDa(ana!.clientId)).toBe(antes + 300)
  expect((await db().rpc('estornar_transacao', { p_transacao: a, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
  // Saiu (−300) e voltou (+300) pelo pagamento que ficou: o saldo é o mesmo, e há um prêmio ativo só.
  await expect.poll(() => saldoDa(ana!.clientId)).toBe(antes + 300)
  const { data: premios } = await db().from('indicacao_premios').select('estornado_em').eq('indicada_id', indicada)
  expect((premios ?? []).filter(p => p.estornado_em == null)).toHaveLength(1)
  expect(premios).toHaveLength(2)
})

test('com o prêmio desligado, nada sai; e a ficha de outra clínica ou a própria não se escolhem', async () => {
  await regra('DESLIGADO')
  const indicada = await rede!.criarCliente('Paula')
  expect((await db().from('clients').update({ indicada_por: ana!.clientId }).eq('id', indicada)).error).toBeNull()
  const antes = await saldoDa(ana!.clientId)
  await pagamento(indicada, 150)
  expect(await saldoDa(ana!.clientId)).toBe(antes)
  await regra('PONTOS')
  // O banco recusa a ficha de outra rede e a própria ficha.
  const outra = await criarOutraRede(`fino${marca}`)
  try {
    const deFora = await outra.criarCliente('De fora')
    expect((await db().from('clients').update({ indicada_por: deFora }).eq('id', indicada)).error?.message).toMatch(/outra clínica/)
    expect((await db().from('clients').update({ indicada_por: indicada }).eq('id', indicada)).error?.message).toMatch(/ela mesma/)
  } finally { await outra.limpar() }
})

test('Agendar com cliente nova: o campo "Indicada por" está lá e a ficha nasce ligada', async ({ browser }) => {
  const nome = `${PREFIXO} Rafaela ${marca}`
  await como(browser, dona!.estado, async p => {
    await p.goto(`/${slug}/agenda`)
    await p.getByRole('button', { name: 'Agendar' }).first().click()
    await p.getByRole('button', { name: /Não é cliente ainda/ }).click()
    await expect(p.getByLabel('Indicada por', { exact: true })).toBeVisible()
    const dia = diaEmQueAUnidadeAbre(20)
    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
      _branchId: rede!.branchId, _slug: slug, client_name: nome, client_phone: fone(), indicada_por: ana!.clientId,
      procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      scheduled_at: new Date(`${dia}T10:00:00-03:00`).toISOString(), notes: '',
    })
    const id = /"id":"([0-9a-f-]{36})"/.exec(r.texto)?.[1]
    expect(id, r.texto.slice(0, 400)).toBeTruthy()
    agendamentos.push(id!)
  })
  const { data } = await db().from('clients').select('indicada_por').eq('tenant_id', rede!.tenantId).eq('name', nome).single()
  expect(data!.indicada_por).toBe(ana!.clientId)
})

test('Ficha → Dados: "Indicada por" se escolhe e se grava; a ficha de outra rede é recusada pela action', async ({ browser }) => {
  const sem = await rede!.criarCliente('Helena')
  await como(browser, dona!.estado, async p => {
    await p.goto(`/${slug}/clients/${sem}?aba=dados`)
    const campo = p.getByLabel('Indicada por', { exact: true })
    await campo.fill(anaNome)
    await p.getByRole('option', { name: new RegExp(anaNome.replace(/[[\]]/g, '\\$&')) }).click()
    await p.getByRole('button', { name: /Salvar dados/ }).click()
    await expect.poll(async () => (await db().from('clients').select('indicada_por').eq('id', sem).single()).data!.indicada_por).toBe(ana!.clientId)
    // O id de uma ficha de outra rede: recusado, nada muda.
    const outra = await criarOutraRede(`find2${marca}`)
    try {
      const deFora = await outra.criarCliente('Fora')
      const r = await chamarAcao(p, 'actions/clients.ts', 'updateClientContactData', `/${slug}/clients/${sem}`,
        [sem, { document: null, phone: null, email: null, birthDate: null, zipCode: null, address: null, addressNumber: null, addressComplement: null, neighborhood: null, city: null, state: null, indicadaPor: deFora }, slug])
      expect(r.texto).toMatch(/não é desta clínica/)
      expect((await db().from('clients').select('indicada_por').eq('id', sem).single()).data!.indicada_por).toBe(ana!.clientId)
    } finally { await outra.limpar() }
  })
})

test('a importação liga pelo nome quando bate; quando não bate, guarda o texto e diz que não ligou', async ({ browser }) => {
  const marinaImp = `${PREFIXO} Bianca ${marca}`
  const semFicha = `${PREFIXO} Carla ${marca}`
  const csv = [
    'Nome;Celular;Indicado por',
    // O nome da Ana sem caixa nem acento liga; "Fulana" não existe.
    `${marinaImp};${fone()};${anaNome.toUpperCase()}`,
    `${semFicha};${fone()};Fulana Que Nao Existe ${marca}`,
  ].join('\r\n')
  await como(browser, dona!.estado, async p => {
    await p.goto('/admin/settings?tab=importacoes')
    await p.getByLabel('Arquivo CSV').setInputFiles({ name: `indicacao-${marca}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') })
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(p.getByLabel('Campo da coluna Indicado por')).toHaveValue('referred_by')
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    await p.getByRole('button', { name: /Importar 2 linhas/ }).click()
    const resultado = p.locator('[data-importacao]')
    await expect(resultado).toContainText('Concluída', { timeout: 60_000 })
    await expect(resultado.locator('[data-importadas-com-aviso]')).toContainText(`${semFicha}: Indicada por “Fulana Que Nao Existe ${marca}”: nenhuma ficha com esse nome — ficou o texto, sem ligar.`)
  })
  const { data: bianca } = await db().from('clients').select('indicada_por, referred_by').eq('tenant_id', rede!.tenantId).eq('name', marinaImp).single()
  expect(bianca!.indicada_por).toBe(ana!.clientId)
  const { data: carla } = await db().from('clients').select('indicada_por, referred_by').eq('tenant_id', rede!.tenantId).eq('name', semFicha).single()
  expect(carla).toMatchObject({ indicada_por: null, referred_by: `Fulana Que Nao Existe ${marca}` })
})

test('no app, "Indique uma amiga" aparece só com o prêmio ligado, e diz o prêmio', async ({ browser }) => {
  await regra('PONTOS', 300)
  await como(browser, ana!.estado, async p => {
    await p.goto(`/${slug}/cliente/fidelidade`)
    const card = p.locator('[data-indique-uma-amiga]')
    await expect(card).toContainText('Indique uma amiga')
    await expect(card).toContainText('300 pontos')
    // A cliente não cadastra a amiga pelo app: a clínica faz a ficha.
    await expect(card).toContainText('na recepção')
    await expect(card.getByRole('textbox')).toHaveCount(0)
  })
  await regra('DESLIGADO')
  await como(browser, ana!.estado, async p => {
    await p.goto(`/${slug}/cliente/fidelidade`)
    await expect(p.getByRole('heading', { name: 'Meus pontos' })).toBeVisible()
    await expect(p.locator('[data-indique-uma-amiga]')).toHaveCount(0)
  })
})
