import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * As duas decisões do Heitor de 2026-11-16 sobre o "Receber" do PDV.
 *
 * - D1 da 18ª ("A comanda recebe em mais de uma forma?" — "Ok"): a comanda se
 *   recebe em duas formas ou mais ("+ Outra forma"), cada uma com o valor
 *   dela; vale onde houver "Receber" (a comanda do atendimento, da venda e do
 *   plano). Um lançamento por forma.
 * - "Crediário no atendimento avulso" — "Mesma regra de pagamentos dos
 *   outros": a comanda do avulso oferece as formas da venda — à vista (numa
 *   forma ou em várias), o crediário com entrada e parcelas, e o a receber.
 *
 * Tudo numa transação (`confirmar_pagamento_do_atendimento`): o app monta os
 * lançamentos, o banco grava.
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v)
let rede: OutraRede | null = null
let balcao: MembroDeTeste | null = null
let slug = ''
let procedimento = ''
let minutos = 5

async function como<T>(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um atendimento avulso concluído hoje: a comanda nasce (PDV3). */
async function atendimentoConcluido(cliente: string, preco = 300) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: procedimento, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: preco,
    scheduled_at: haMinutosHoje(minutos += 2), started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'concluir o atendimento').toBeNull()
  const c = (await db().from('comandas').select('id').eq('appointment_id', data!.id).single<{ id: string }>()).data!
  return { agendamento: data!.id, comanda: c.id }
}

const lancamentosDo = async (agendamento: string) =>
  ((await db().from('financial_transactions')
    .select('amount, is_paid, payment_method, cartao_vezes, parcela_grupo, parcela_numero, parcela_total, notes, created_at')
    .eq('appointment_id', agendamento).eq('type', 'INCOME').is('estorno_de', null)
    .order('parcela_numero', { ascending: true, nullsFirst: true }).order('amount', { ascending: false })).data ?? []) as {
      amount: number; is_paid: boolean; payment_method: string | null; cartao_vezes: number | null
      parcela_grupo: string | null; parcela_numero: number | null; parcela_total: number | null; notes: string | null; created_at: string
    }[]

/** A comanda paga hoje, como o PDV a lê (`pdv_comandas`, situação "Pagas"). */
const comandaPaga = async (comanda: string) => {
  const { data, error } = await db().rpc('pdv_comandas', {
    p_tenant: rede!.tenantId, p_branch: rede!.branchId, p_situacao: 'PAGAS',
    p_de: new Date(Date.now() - 86_400_000).toISOString(), p_ate: new Date(Date.now() + 86_400_000).toISOString(),
  })
  expect(error, 'ler as comandas pagas').toBeNull()
  const c = ((data ?? []) as { id: string; paga: boolean; forma: string | null; em_aberto: number; parcelas_em_aberto: number }[])
    .find(x => x.id === comanda)
  return c ? { ...c, parcelas: c.parcelas_em_aberto } : undefined
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`pvf${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const pr = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Peeling ${marca}`, category: 'e2e', duration_min: 30, price: 300 })
    .select('id').single<{ id: string }>()
  expect(pr.error).toBeNull()
  procedimento = pr.data!.id
  balcao = await criarMembro(`pvfb${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'financial', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await balcao?.limpar()
  await rede?.limpar()
})

test('a comanda do avulso recebe em duas formas: R$ 100 no Pix e R$ 200 no crédito — um lançamento por forma, a comanda fecha', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Duas formas')
  const { agendamento, comanda } = await atendimentoConcluido(cliente)

  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByRole('radio', { name: 'Crédito', exact: true }).click()
    await detalhe.locator('[data-outra-forma]').click()
    await detalhe.getByLabel('2ª forma', { exact: true }).selectOption('PIX')
    await detalhe.getByLabel('Valor da 2ª forma').fill('100')
    // A de cima fica com o que falta das outras.
    await expect(detalhe.locator('[data-valor-da-primeira-forma]')).toContainText('200,00')
    await detalhe.getByRole('button', { name: /Receber R\$\s?300,00/ }).click()
    // O botão some já no "Recebendo…": espera a gravação, não o botão.
    await expect.poll(async () => (await lancamentosDo(agendamento)).length, { timeout: 20_000 }).toBe(2)
    await expect(detalhe.getByRole('button', { name: /Receber R\$/ })).toHaveCount(0)
  })

  const linhas = await lancamentosDo(agendamento)
  expect(linhas.map(l => [n(l.amount), l.payment_method, l.is_paid]).sort()).toEqual([[100, 'PIX', true], [200, 'CREDIT_CARD', true]])
  // As formas do mesmo pagamento nascem juntas (a comissão e as vendas as agrupam por isso).
  expect(new Set(linhas.map(l => l.created_at)).size).toBe(1)
  const c = await comandaPaga(comanda)
  expect(c?.paga).toBe(true)
  // A forma da comanda é a maior paga.
  expect(c?.forma).toBe('CREDIT_CARD')
  // Nada a receber do atendimento.
  const aReceber = (await db().rpc('atendimentos_a_receber', { p_tenant: rede!.tenantId, p_agendamento: agendamento })).data as unknown[] | null
  expect(aReceber ?? []).toHaveLength(0)
})

test('o avulso no crediário: entrada de R$ 100 no Pix e 2 parcelas de R$ 100 — a comanda fecha com R$ 200 em aberto, e as parcelas se recebem nela', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Crediário avulso')
  const { agendamento, comanda } = await atendimentoConcluido(cliente)

  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByRole('radio', { name: 'Crediário' }).click()
    await detalhe.getByLabel('Entrada').fill('100')
    await detalhe.getByLabel('Forma da entrada').selectOption('PIX')
    await detalhe.getByLabel('Parcelas').selectOption('2')
    await detalhe.getByRole('button', { name: 'Fechar a comanda' }).click()
    await expect.poll(async () => (await lancamentosDo(agendamento)).length, { timeout: 20_000 }).toBeGreaterThan(0)
    await expect(detalhe.getByRole('button', { name: 'Fechar a comanda' })).toHaveCount(0)

    // A comanda paga com o crediário: as parcelas dela se recebem ali (A1 da 16ª).
    await p.goto(`/${slug}/pdv?ver=PAGAS&comanda=${comanda}`)
    await expect(p.locator('[data-parcela-em-aberto]')).toHaveCount(2)
  })

  const linhas = await lancamentosDo(agendamento)
  expect(linhas).toHaveLength(3)
  const entrada = linhas.find(l => l.is_paid)!
  expect([n(entrada.amount), entrada.payment_method]).toEqual([100, 'PIX'])
  const parcelas = linhas.filter(l => !l.is_paid)
  expect(parcelas.map(l => n(l.amount))).toEqual([100, 100])
  expect(parcelas.every(l => l.parcela_grupo && l.parcela_total === 2)).toBe(true)
  const c = await comandaPaga(comanda)
  expect(c?.paga).toBe(true)
  expect(c?.forma).toBe('CREDIARIO')
  expect(n(c?.em_aberto)).toBe(200)
  expect(c?.parcelas).toBe(2)
})

test('o avulso a receber: nada entra agora, a comanda fecha e o lançamento a receber fica com a nota', async ({ browser }) => {
  const cliente = await rede!.criarCliente('A receber avulso')
  const { agendamento, comanda } = await atendimentoConcluido(cliente)

  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByRole('radio', { name: 'A receber' }).click()
    // Os pontos e o voucher são do à vista: somem no a receber.
    await expect(detalhe.getByTestId('usar-pontos')).toHaveCount(0)
    await detalhe.getByRole('button', { name: 'Fechar a comanda' }).click()
    await expect.poll(async () => (await lancamentosDo(agendamento)).length, { timeout: 20_000 }).toBeGreaterThan(0)
    await expect(detalhe.getByRole('button', { name: 'Fechar a comanda' })).toHaveCount(0)
  })

  const linhas = await lancamentosDo(agendamento)
  expect(linhas).toHaveLength(1)
  expect(linhas[0]!.is_paid).toBe(false)
  expect(n(linhas[0]!.amount)).toBe(300)
  expect(linhas[0]!.notes).toBeTruthy()
  const c = await comandaPaga(comanda)
  expect(c?.paga).toBe(true)
  expect(c?.forma).toBe('A_RECEBER')
})

test('o mesmo envio duas vezes (duplo clique no "Receber" da comanda): recebe uma vez, e as duas respostas dizem o recebido', async ({ browser }) => {
  // O Heitor, 25/11: "As duas respostas dizem 'recebido'" (a segunda dizia "Pagamento já registrado").
  const cliente = await rede!.criarCliente('Duplo clique')
  const { agendamento, comanda } = await atendimentoConcluido(cliente)
  const envio = crypto.randomUUID()

  const respostas = await como(balcao!, browser, async p => {
    const rota = `/${slug}/pdv`
    await p.goto(`${rota}?comanda=${comanda}`)
    return Promise.all([1, 2].map(() => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'confirmPayment', rota, [null], {
      appointment_id: agendamento, slug, payment_method: 'PIX', _envio: envio,
    })))
  })
  for (const r of respostas) {
    // O valor que a action devolveu é a linha `1:` do payload; o resto é o render da página
    // (que tem `"error":"$undefined"` do Next, não da action).
    const devolvido = r.texto.split('\n').filter(l => l.startsWith('1:')).map(l => { try { return JSON.parse(l.slice(2)) } catch { return undefined } }).find(v => v !== undefined)
    expect(devolvido, 'as duas respostas dizem o recebido (nenhuma diz erro)').toEqual({})
    expect(r.texto).not.toContain('já registrado')
  }
  const linhas = await lancamentosDo(agendamento)
  expect(linhas.map(l => [n(l.amount), l.payment_method, l.is_paid]), 'um recebimento só').toEqual([[300, 'PIX', true]])
  expect((await comandaPaga(comanda))?.paga).toBe(true)
})

test('pela action: as formas que não fecham com o valor são recusadas, e os pontos fora do à vista também', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Recusas')
  const { agendamento } = await atendimentoConcluido(cliente)

  await como(balcao!, browser, async p => {
    const rota = `/${slug}/pdv`
    const naoFecha = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'confirmPayment', rota, [null], {
      appointment_id: agendamento, slug,
      pagamento: JSON.stringify({ forma: 'AVISTA', metodo: 'PIX', valor: 100, outras: [{ metodo: 'CASH', valor: 50 }] }),
    })
    expect(naoFecha.texto).toContain('não fecham o total')
    const pontosNoCrediario = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'confirmPayment', rota, [null], {
      appointment_id: agendamento, slug, pontos: '10',
      pagamento: JSON.stringify({ forma: 'A_RECEBER', vencimento: null }),
    })
    expect(pontosNoCrediario.texto).toContain('Os pontos e o voucher se usam no pagamento à vista.')
  })

  expect(await lancamentosDo(agendamento)).toHaveLength(0)
})
