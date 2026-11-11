import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarRedeCriada } from './apoio/rede-criada'
import { cartaoNaGradeDoDia } from './apoio/agenda'
import { addDaysTZ, dayKeyTZ, instanteNoFuso } from '../lib/datetime'

/**
 * F62 — o fuso da clínica (o Heitor, 2026-11-11: "Não, deixa a clinica
 * configurar o seu fuso"). A Acácia é de Manaus (UTC−4) e o sistema inteiro
 * trabalhava no horário de Brasília: o agendamento das 00:00 na tela era às
 * 23:00 no relógio da parede, e o "hoje", o Fechamento e as campanhas das
 * 09:00 seguiam Brasília.
 *
 * A unidade tem "Fuso horário" (Configurações → Unidade, o "Nova unidade" e o
 * setup), com o horário de Brasília como padrão — quem não mexer não vê nada
 * mudar —, e o CEP sugere o fuso pelo estado.
 *
 * Uma rede `[e2e]` só deste spec, com a unidade em Manaus.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestora: MembroDeTeste | null = null

async function como<T>(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fz${marca}`)
  gestora = await criarMembro(`fzg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora', permissoes: [
      { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'reports', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('branches').delete().eq('tenant_id', rede.tenantId).neq('id', rede.branchId)
  await gestora?.limpar()
  await rede?.limpar()
})

test.describe('o campo', () => {
  test('a unidade nasce no horário de Brasília, e Configurações → Unidade troca o fuso', async ({ browser }) => {
    const { data: antes } = await db().from('branches').select('fuso').eq('id', rede!.branchId).single<{ fuso: string }>()
    expect(antes?.fuso, 'o padrão, sem ninguém mexer').toBe('America/Sao_Paulo')

    await como(browser, gestora!, async p => {
      await p.goto(`/admin/branches/${rede!.branchId}`)
      const fuso = p.getByLabel('Fuso horário')
      await expect(fuso).toHaveValue('America/Sao_Paulo')
      await expect(fuso.locator('option:checked')).toHaveText(/Horário de Brasília/)
      await fuso.selectOption('America/Manaus')
      await p.getByRole('button', { name: 'Salvar alterações' }).click()
      await expect(p.getByText('Dados salvos com sucesso.')).toBeVisible()
    })
    const { data: depois } = await db().from('branches').select('fuso').eq('id', rede!.branchId).single<{ fuso: string }>()
    expect(depois?.fuso).toBe('America/Manaus')
  })

  test('o banco só aceita um fuso da lista', async () => {
    const { error } = await db().from('branches').update({ fuso: 'Europe/Lisbon' }).eq('id', rede!.branchId)
    expect(error?.message ?? '').toMatch(/branches_fuso_valido/)
  })

  test('o "Nova unidade" sugere o fuso pelo estado do CEP, e a unidade nasce com ele', async ({ browser }) => {
    const nome = `${PREFIXO} Cuiabá ${marca}`
    await como(browser, gestora!, async p => {
      await p.route('https://viacep.com.br/**', r => r.fulfill({
        json: { logradouro: 'Avenida Getúlio Vargas', bairro: 'Centro', localidade: 'Cuiabá', uf: 'MT' },
      }))
      await p.goto('/admin/settings?tab=unidades')
      await p.getByRole('button', { name: 'Nova unidade' }).click()
      const janela = p.getByRole('dialog', { name: 'Nova unidade' })
      await janela.locator('#br-name').fill(nome)
      await expect(janela.getByLabel('Fuso horário')).toHaveValue('America/Sao_Paulo')
      await janela.getByLabel('CEP').pressSequentially('78005000')
      await expect(janela.locator('#br-city')).toHaveValue('Cuiabá')
      await expect(janela.getByLabel('Fuso horário')).toHaveValue('America/Cuiaba')
      await expect(janela.locator('[data-fuso-sugerido]')).toContainText('MT')
      await janela.getByRole('button', { name: 'Criar unidade' }).click()
      await janela.getByRole('alertdialog', { name: 'Unidade sem CNPJ' }).getByRole('button', { name: 'Criar sem CNPJ' }).click()
      await expect(janela).toBeHidden({ timeout: 15_000 })
    })
    const { data } = await db().from('branches').select('fuso').eq('tenant_id', rede!.tenantId).eq('name', nome).single<{ fuso: string }>()
    expect(data?.fuso).toBe('America/Cuiaba')
  })

  test('o detalhe da unidade, com o CEP de outro fuso, sugere sem trocar sozinho', async ({ browser }) => {
    await db().from('branches').update({ fuso: 'America/Sao_Paulo' }).eq('id', rede!.branchId)
    await como(browser, gestora!, async p => {
      await p.route('https://viacep.com.br/**', r => r.fulfill({
        json: { logradouro: 'Rua Rio Negro', bairro: 'Adrianópolis', localidade: 'Manaus', uf: 'AM' },
      }))
      await p.goto(`/admin/branches/${rede!.branchId}`)
      const cep = p.getByLabel('CEP')
      await cep.fill('')
      await cep.pressSequentially('69057000')
      await expect(p.locator('#be-city')).toHaveValue('Manaus')
      await expect(p.getByLabel('Fuso horário'), 'nada se move sozinho').toHaveValue('America/Sao_Paulo')
      await expect(p.locator('[data-fuso-sugerido]')).toContainText('horário de Manaus')
      await p.locator('[data-fuso-sugerido]').getByRole('button', { name: 'Usar este' }).click()
      await expect(p.getByLabel('Fuso horário')).toHaveValue('America/Manaus')
    })
  })

  test('o setup sugere o fuso pelo CEP, e a primeira unidade nasce nele', async ({ browser }) => {
    const { data: t, error } = await db().from('tenants').insert({
      name: `${PREFIXO} Rede fuso setup ${marca}`, slug: `e2e-fzs-${marca}`, email: `e2e-fzs-${marca}@bellaris.invalid`,
      plan_status: 'trial',
    }).select('id').single<{ id: string }>()
    expect(error, 'criar a rede').toBeNull()
    const dona = await criarMembro(`fzs${marca}`, { tenant: t!.id, rotulo: 'Dona', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
    try {
      await como(browser, dona, async p => {
        await p.route('https://viacep.com.br/**', r => r.fulfill({
          json: { logradouro: 'Rua Rio Negro', bairro: 'Adrianópolis', localidade: 'Manaus', uf: 'AM' },
        }))
        await p.goto('/setup')
        await p.getByRole('button', { name: /Continuar/ }).click()
        await expect(p.getByText('Primeira unidade').first()).toBeVisible()
        await p.locator('#br-name').fill(`${PREFIXO} Adrianópolis ${marca}`)
        await p.locator('#br-zip').pressSequentially('69057000')
        await expect(p.locator('#br-city')).toHaveValue('Manaus')
        await expect(p.getByLabel('Fuso horário')).toHaveValue('America/Manaus')
        await expect(p.locator('[data-fuso-sugerido]')).toContainText('AM')
        await p.getByRole('button', { name: /Continuar/ }).click()
        await p.getByRole('alertdialog', { name: 'Unidade sem CNPJ' }).getByRole('button', { name: 'Criar sem CNPJ' }).click()
        await expect(p.getByText('Tudo pronto!')).toBeVisible()
      })
      const { data: b } = await db().from('branches').select('fuso').eq('tenant_id', t!.id).single<{ fuso: string }>()
      expect(b?.fuso).toBe('America/Manaus')
    } finally {
      await dona.limpar()
      await db().from('branches').delete().eq('tenant_id', t!.id)
      expect(await apagarRedeCriada(t!.id)).toEqual([])
    }
  })
})

/**
 * A agenda e o agendar no fuso da unidade: a unidade de Manaus abre das 08:00
 * às 20:00 no relógio DELA. O navegador está no horário de Brasília (a
 * recepção pode estar em qualquer lugar): a grade, o Agendar e o app da
 * cliente seguem a unidade, não o navegador nem o servidor.
 */
test.describe('a agenda e o agendar', () => {
  const MANAUS = 'America/Manaus'
  let unidade: OutraRede | null = null
  let recepcao: MembroDeTeste | null = null
  let cliente: ClienteDeTeste | null = null
  let slugM = ''
  let clienteDaFicha = ''
  let ocupado = ''
  // Daqui a 3 dias, no relógio de Manaus.
  const DIA = dayKeyTZ(addDaysTZ(new Date(), 3, MANAUS), MANAUS)

  async function naUnidade<T>(browser: Browser, quem: MembroDeTeste | ClienteDeTeste, fn: (p: Page) => Promise<T>) {
    const ctx = await browser.newContext({ storageState: quem.estado, viewport: { width: 1440, height: 900 }, timezoneId: 'America/Sao_Paulo' })
    try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
  }

  test.beforeAll(async () => {
    unidade = await criarOutraRede(`fza${marca}`)
    const b = db()
    const expediente = [{ de: '08:00', ate: '20:00' }]
    expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', unidade.tenantId)).error).toBeNull()
    expect((await b.from('branches').update({
      fuso: MANAUS, horario: { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, expediente])) },
    }).eq('id', unidade.branchId)).error).toBeNull()
    expect((await b.from('users').update({ atende_em: [unidade.branchId], provides_services: true }).eq('id', unidade.professionalId)).error).toBeNull()
    expect((await b.from('procedures').update({ duration_min: 60, visible_on_client_app: true }).eq('id', unidade.procedureId)).error).toBeNull()
    slugM = (await b.from('branches').select('slug').eq('id', unidade.branchId).single<{ slug: string }>()).data!.slug
    clienteDaFicha = await unidade.criarCliente(`Cliente fuso fza${marca}`)
    // 09:00 em Manaus = 13:00 UTC (= 10:00 em Brasília).
    const { data, error } = await b.from('appointments').insert({
      branch_id: unidade.branchId, client_id: clienteDaFicha, procedure_id: unidade.procedureId, professional_id: unidade.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', duration_min: 60, price: 0, scheduled_at: instanteNoFuso(DIA, '09:00', MANAUS).toISOString(),
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    ocupado = data!.id
    recepcao = await criarMembro(`fzr${marca}`, {
      tenant: unidade.tenantId, branchId: unidade.branchId, rotulo: 'Recepcao',
      permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' }],
    })
    cliente = await clienteComSessao(`fzc${marca}`, { id: unidade.branchId, slug: slugM }, { tenant: unidade.tenantId })
  })

  test.afterAll(async () => {
    if (unidade) await db().from('appointments').delete().eq('branch_id', unidade.branchId)
    await cliente?.limpar()
    await recepcao?.limpar()
    await unidade?.limpar()
  })

  test('a grade mostra o agendamento na hora de Manaus, e diz o fuso', async ({ browser }) => {
    await naUnidade(browser, recepcao!, async p => {
      await p.goto(`/${slugM}/agenda?date=${DIA}`)
      const cartao = await cartaoNaGradeDoDia(p, ocupado)
      await expect(cartao).toContainText('09:00')
      await expect(p.locator('[data-nota-do-fuso]').first()).toHaveText('Horário de Manaus')
    })
  })

  test('o Agendar grava a hora escolhida no relógio de Manaus', async ({ browser }) => {
    await naUnidade(browser, recepcao!, async p => {
      await p.goto(`/${slugM}/agenda?date=${DIA}`)
      await p.getByRole('button', { name: 'Agendar', exact: true }).click()
      const janela = p.getByRole('dialog', { name: 'Novo agendamento' })
      await janela.getByPlaceholder('Buscar cliente por nome ou telefone…').fill(`Cliente fuso fza${marca}`)
      await janela.getByText(`Cliente fuso fza${marca}`).first().click()
      await janela.getByLabel('Procedimento *').selectOption(unidade!.procedureId)
      await janela.getByLabel('Profissional *').selectOption(unidade!.professionalId)
      await janela.getByLabel('Data e hora *').fill(`${DIA}T14:00`)
      await janela.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect(janela).toBeHidden({ timeout: 15_000 })
    })
    await expect.poll(async () => {
      const { data } = await db().from('appointments').select('scheduled_at')
        .eq('branch_id', unidade!.branchId).neq('id', ocupado).neq('client_id', cliente!.clientId)
      return (data ?? []).map(a => new Date(a.scheduled_at as string).toISOString())
    }).toEqual([instanteNoFuso(DIA, '14:00', MANAUS).toISOString()])
  })

  test('o app da cliente oferece os livres no relógio de Manaus e grava nele', async ({ browser }) => {
    await naUnidade(browser, cliente!, async p => {
      await p.goto(`/${slugM}/cliente/agendamentos/novo`)
      const passo = p.getByText('Escolha a data e o horário disponível.')
      await expect(async () => {
        if (!(await passo.isVisible())) await p.getByRole('button', { name: new RegExp(`Proc fza${marca}`) }).click({ timeout: 2000 })
        await expect(passo).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 30_000 })
      await p.getByLabel('Data').fill(DIA)
      const manha = p.getByRole('group', { name: 'Manhã' })
      // O das 09:00 de Manaus está ocupado; o das 10:00, livre.
      await expect(manha.getByRole('button', { name: '08:00', exact: true })).toBeVisible()
      await expect(manha.getByRole('button', { name: '10:00', exact: true })).toBeVisible()
      await expect(manha.getByRole('button', { name: '09:00', exact: true })).toHaveCount(0)
      await manha.getByRole('button', { name: '08:00', exact: true }).click()
      await p.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect(p).toHaveURL(new RegExp(`/${slugM}/cliente/(agendamentos|documentos)([?]|$)`), { timeout: 15_000 })
    })
    await expect.poll(async () => {
      const { data } = await db().from('appointments').select('scheduled_at').eq('client_id', cliente!.clientId)
      return (data ?? []).map(a => new Date(a.scheduled_at as string).toISOString())
    }).toEqual([instanteNoFuso(DIA, '08:00', MANAUS).toISOString()])
  })
})

/**
 * O "hoje" e o Fechamento do dia no fuso da unidade: o pagamento das 23:30 de
 * Manaus (00:30 do dia seguinte em Brasília) é do dia de Manaus em que entrou.
 */
test.describe('o Fechamento do dia', () => {
  const MANAUS = 'America/Manaus'
  let unidade: OutraRede | null = null
  let recepcao: MembroDeTeste | null = null
  let slugF = ''
  const ONTEM = dayKeyTZ(addDaysTZ(new Date(), -1, MANAUS), MANAUS)

  test.beforeAll(async () => {
    unidade = await criarOutraRede(`fzb${marca}`)
    const b = db()
    expect((await b.from('branches').update({ fuso: MANAUS }).eq('id', unidade.branchId)).error).toBeNull()
    slugF = (await b.from('branches').select('slug').eq('id', unidade.branchId).single<{ slug: string }>()).data!.slug
    // Tudo no banco ANTES de qualquer tela abrir.
    const pagoEm = instanteNoFuso(ONTEM, '23:30', MANAUS).toISOString()
    expect((await b.from('financial_transactions').insert({
      branch_id: unidade.branchId, is_paid: true, paid_at: pagoEm, created_by: 'e2e',
      type: 'INCOME', category: 'Atendimento', description: `Noite de Manaus ${marca}`, amount: 77, payment_method: 'CASH',
    })).error).toBeNull()
    recepcao = await criarMembro(`fzf${marca}`, {
      tenant: unidade.tenantId, branchId: unidade.branchId, rotulo: 'Recepcao', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
    })
  })

  test.afterAll(async () => {
    if (unidade) {
      await db().from('fechamentos_do_dia').delete().eq('branch_id', unidade.branchId)
      await db().from('financial_transactions').delete().eq('branch_id', unidade.branchId)
    }
    await recepcao?.limpar()
    await unidade?.limpar()
  })

  test('o pagamento das 23:30 de Manaus fecha no dia de Manaus, não no seguinte', async ({ browser }) => {
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slugF}/fechamento?dia=${ONTEM}`)
      await expect(p.locator('[data-forma="TOTAL"]')).toContainText('77,00')
      await p.goto(`/${slugF}/fechamento`)
      await expect(p.locator('[data-forma="TOTAL"]')).toBeVisible()
      await expect(p.locator('[data-forma="TOTAL"]')).not.toContainText('77,00')
    })
  })
})

/**
 * Os indicadores da unidade no fuso dela: o período ("ontem", "este mês") e o
 * dia de cada barra do gráfico saem no relógio da unidade. O pagamento das
 * 23:30 de Manaus é de ontem em Manaus — em Brasília já era hoje.
 */
test.describe('os indicadores da unidade', () => {
  const MANAUS = 'America/Manaus'
  let unidade: OutraRede | null = null
  let financeiro: MembroDeTeste | null = null
  let slugI = ''
  const ONTEM = dayKeyTZ(addDaysTZ(new Date(), -1, MANAUS), MANAUS)
  const HOJE = dayKeyTZ(new Date(), MANAUS)

  test.beforeAll(async () => {
    unidade = await criarOutraRede(`fzc${marca}`)
    const b = db()
    expect((await b.from('branches').update({ fuso: MANAUS }).eq('id', unidade.branchId)).error).toBeNull()
    slugI = (await b.from('branches').select('slug').eq('id', unidade.branchId).single<{ slug: string }>()).data!.slug
    // Tudo no banco ANTES de qualquer tela abrir.
    expect((await b.from('financial_transactions').insert({
      branch_id: unidade.branchId, is_paid: true, paid_at: instanteNoFuso(ONTEM, '23:30', MANAUS).toISOString(), created_by: 'e2e',
      type: 'INCOME', category: 'Atendimento', description: `Noite de Manaus ${marca}`, amount: 77, payment_method: 'CASH',
    })).error).toBeNull()
    financeiro = await criarMembro(`fzi${marca}`, {
      tenant: unidade.tenantId, branchId: unidade.branchId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'VIEW' }],
    })
  })

  test.afterAll(async () => {
    if (unidade) await db().from('financial_transactions').delete().eq('branch_id', unidade.branchId)
    await financeiro?.limpar()
    await unidade?.limpar()
  })

  test('o período do Financeiro é o dia de Manaus', async ({ browser }) => {
    await como(browser, financeiro!, async p => {
      const receita = p.locator('.card', { hasText: 'Receita Bruta' })
      await p.goto(`/${slugI}/financeiro?period=custom&from=${ONTEM}&to=${ONTEM}`)
      await expect(receita).toContainText('77,00')
      await p.goto(`/${slugI}/financeiro?period=custom&from=${HOJE}&to=${HOJE}`)
      await expect(receita).toBeVisible()
      await expect(receita).not.toContainText('77,00')
    })
  })

  // F62b: a tabela dizia "00:30" do dia seguinte (o relógio do navegador, aqui o de Brasília).
  test('a linha do lançamento diz o dia e a hora de Manaus', async ({ browser }) => {
    await como(browser, financeiro!, async p => {
      await p.goto(`/${slugI}/financeiro?period=custom&from=${ONTEM}&to=${ONTEM}`)
      const linha = p.locator('tr[data-lancamento]', { hasText: `Noite de Manaus ${marca}` })
      const [, mes, dia] = ONTEM.split('-')
      await expect(linha.locator('td[data-label="Data"]')).toContainText(`${dia}/${mes}`)
      await expect(linha.locator('td[data-label="Data"]')).toContainText('23:30')
    })
  })

  test('a barra do gráfico é a do dia de Manaus', async () => {
    const { data, error } = await db().rpc('metrics_series', {
      p_tenant: unidade!.tenantId, p_branch_ids: [unidade!.branchId],
      p_from: instanteNoFuso(ONTEM, '00:00', MANAUS).toISOString(), p_to: new Date().toISOString(),
      p_granularity: 'day', p_professional_id: null,
    })
    expect(error).toBeNull()
    const barras = (data as { bucket: string; revenue: number }[]).map(r => ({ dia: new Date(r.bucket).toISOString(), receita: Number(r.revenue) }))
    expect(barras).toEqual([{ dia: instanteNoFuso(ONTEM, '00:00', MANAUS).toISOString(), receita: 77 }])
  })
})

/**
 * F62b — os indicadores que leem um DIA sem hora ("cliente desde", "última
 * visita antes do sistema") e o "a partir de hoje" da busca. O dia vira
 * instante na meia-noite da UNIDADE da cliente (Manaus: 04:00 UTC), não na de
 * Brasília (03:00 UTC): a cliente de Manaus "desde 10/03" era nova em 09/03
 * no relatório de lá.
 */
test.describe('os indicadores do dia sem hora (F62b)', () => {
  const MANAUS = 'America/Manaus'
  const DIA = '2026-03-10'
  const MEIA_NOITE = instanteNoFuso(DIA, '00:00', MANAUS).toISOString() // 2026-03-10T04:00:00.000Z
  const TAG = `fzd${marca}`
  let unidade: OutraRede | null = null
  let cliente = ''
  let daBusca = ''
  const nomeDaBusca = `Busca fuso fzd${marca}`

  test.beforeAll(async () => {
    unidade = await criarOutraRede(`fzd${marca}`)
    const b = db()
    expect((await b.from('branches').update({ fuso: MANAUS }).eq('id', unidade.branchId)).error).toBeNull()
    cliente = await unidade.criarCliente(`Cliente desde fzd${marca}`)
    expect((await b.from('clients').update({ cliente_desde: DIA, ultima_visita_antes: DIA, tags: [TAG] }).eq('id', cliente)).error).toBeNull()
    daBusca = await unidade.criarCliente(nomeDaBusca)
    // 23:30 de ontem em Manaus (= 03:30 UTC de hoje, já "hoje" em Brasília) e 23:00 de hoje em Manaus.
    const ontem = dayKeyTZ(addDaysTZ(new Date(), -1, MANAUS), MANAUS)
    const hoje = dayKeyTZ(new Date(), MANAUS)
    for (const quando of [instanteNoFuso(ontem, '23:30', MANAUS), instanteNoFuso(hoje, '23:00', MANAUS)]) {
      expect((await b.from('appointments').insert({
        branch_id: unidade.branchId, client_id: daBusca, procedure_id: unidade.procedureId, professional_id: unidade.professionalId,
        status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando.toISOString(),
      })).error).toBeNull()
    }
  })

  test.afterAll(async () => {
    if (unidade) await db().from('appointments').delete().eq('branch_id', unidade.branchId)
    await unidade?.limpar()
  })

  test('a cliente "desde 10/03" é nova em 10/03 de Manaus, não em 09/03', async () => {
    const dia = async (d: string) => {
      const { data, error } = await db().rpc('metrics_by_branch', {
        p_tenant: unidade!.tenantId, p_from: instanteNoFuso(d, '00:00', MANAUS).toISOString(),
        p_to: new Date(instanteNoFuso(d, '00:00', MANAUS).getTime() + 86_400_000 - 1).toISOString(),
      })
      expect(error).toBeNull()
      return Number((data as { branch_id: string; new_clients: number }[]).find(r => r.branch_id === unidade!.branchId)?.new_clients)
    }
    expect(await dia('2026-03-09'), 'na véspera, em Manaus, ainda não era cliente').toBe(0)
    expect(await dia(DIA)).toBe(1)
  })

  test('a última visita de antes do sistema é a meia-noite de Manaus', async () => {
    const { data, error } = await db().rpc('ultimas_visitas', { p_tenant: unidade!.tenantId, p_branch: unidade!.branchId })
    expect(error).toBeNull()
    const minha = (data as { client_id: string; ultima: string }[]).find(r => r.client_id === cliente)
    expect(new Date(minha!.ultima).toISOString()).toBe(MEIA_NOITE)

    for (const [fn, args] of [
      ['metrics_clientes_para_reativar_rede', { p_tenant: unidade!.tenantId, p_desde: new Date().toISOString(), p_limite: 50 }],
      ['metrics_clientes_para_reativar', { p_tenant: unidade!.tenantId, p_branch_id: unidade!.branchId, p_tag: TAG, p_desde: new Date().toISOString(), p_limite: 50 }],
    ] as const) {
      const r = await db().rpc(fn, args)
      expect(r.error, fn).toBeNull()
      const linha = (r.data as { lista: { id: string; ultima_visita: string }[] }).lista.find(x => x.id === cliente)
      expect(new Date(linha!.ultima_visita).toISOString(), fn).toBe(MEIA_NOITE)
    }
  })

  test('o público da campanha corta o "cliente desde" e o "sem retorno" no dia de Manaus', async () => {
    // 03:30 UTC de 10/03 = 23:30 de 09/03 em Manaus: ela ainda não era cliente, nem tinha vindo.
    const corte = '2026-03-10T03:30:00.000Z'
    const publico = async (filtros: Record<string, unknown>) => {
      const { data, error } = await db().rpc('clientes_do_publico', { p_tenant: unidade!.tenantId, p_filtros: filtros })
      expect(error).toBeNull()
      return (data as { id: string }[]).map(c => c.id)
    }
    expect(await publico({ cliente_desde_antes: corte })).not.toContain(cliente)
    expect(await publico({ sem_retorno_desde: corte, tags: [TAG] })).not.toContain(cliente)
    expect(await publico({ cliente_desde_antes: '2026-03-10T04:30:00.000Z' })).toContain(cliente)
  })

  test('a faixa etária aceita o fuso do recorte', async () => {
    const { data, error } = await db().rpc('metrics_faixa_etaria', { p_nascimento: '1990-05-01T00:00:00Z', p_fuso: MANAUS })
    expect(error).toBeNull()
    expect(data).toBe('35–44')
  })

  test('a busca acha os agendamentos "de hoje em diante" pelo dia de Manaus', async () => {
    const { data, error } = await db().rpc('busca_universal', {
      p_tenant: unidade!.tenantId, p_termo: nomeDaBusca, p_tipos: ['agendamento'], p_limite: 20,
    })
    expect(error).toBeNull()
    const quandos = (data as { tipo: string; extra: { quando: string } }[]).map(r => new Date(r.extra.quando).getTime())
    expect(quandos, 'só o de hoje em Manaus; o das 23:30 de ontem lá já passou').toHaveLength(1)
  })
})
