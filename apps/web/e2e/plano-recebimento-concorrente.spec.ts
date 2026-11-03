import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Receber o plano no check-in, com DUAS chegadas ao mesmo tempo (sobra da F9,
 * 2026-11-02: "dois envios simultâneos ainda leem o mesmo saldo"). É dinheiro:
 * as duas liam os mesmos R$ 300 em aberto, e cada uma gravava a sua entrada e
 * as suas parcelas — R$ 600 combinados de um plano de R$ 300.
 *
 * - Duas abas (envios DIFERENTES) ao mesmo tempo: uma recebe, a outra ouve
 *   que o saldo já foi recebido. O banco trava o plano e confere o saldo.
 * - O MESMO envio duas vezes (o duplo clique): grava uma, e as duas respostas
 *   dizem o que foi recebido (`umaVez`, lib/envio-unico.ts).
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: caixa!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um plano aceito com R$ 300 a receber no check-in e a sessão de hoje. */
async function planoComSaldo(rotulo: string): Promise<{ plano: string; appt: string }> {
  const cliente = await rede!.criarCliente(`Cliente ${rotulo}`)
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await db().from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const plano = await ins('treatment_plans', {
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente, status: 'ACCEPTED',
    name: `${PREFIXO} Plano ${rotulo} ${marca}`,
  })
  await ins('financial_transactions', {
    branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento — checkout novo paciente', amount: 300, is_paid: false,
    notes: 'Plano aceito — a receber no check-in', created_by: 'e2e',
  })
  const appt = await ins('appointments', {
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 100, status: 'CONFIRMED', treatment_plan_id: plano,
  })
  return { plano, appt }
}

/** Os lançamentos com dinheiro do plano: "valor:pago". */
async function lancamentos(plano: string) {
  const { data, error } = await db().from('financial_transactions').select('amount, is_paid')
    .eq('treatment_plan_id', plano).gt('amount', 0)
  expect(error).toBeNull()
  return (data ?? []).map(t => `${Number(t.amount)}:${t.is_paid}`).sort()
}

const PARCELADO = () => ({
  forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 2,
  primeiroVencimento: new Date(Date.now() + 30 * 86_400_000).toISOString(),
})

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`rc${marca}`)
  caixa = await criarMembro(`rc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await db().from('envios_unicos').delete().eq('tenant_id', rede?.tenantId ?? '')
  await caixa?.limpar()
  await rede?.limpar()
})

test('entrada + parcelas por duas abas ao mesmo tempo: só uma recebe', async ({ browser }) => {
  const { plano, appt } = await planoComSaldo('parcelado')
  const rota = `/admin/agenda/${appt}`
  const respostas = await como(browser, async p => {
    await p.goto(rota)
    return Promise.all([1, 2].map(() => chamarAcao(p, 'actions/treatment-plans.ts', 'receberDoPlano', rota, [plano, PARCELADO(), appt, ''])))
  })
  const textos = respostas.map(r => r!.texto)
  expect(textos.filter(t => t.includes('"recebido":300')), 'uma chegada recebe').toHaveLength(1)
  expect(textos.filter(t => /já foi recebido|Não há valor em aberto/.test(t)), 'a outra ouve que o saldo já foi recebido').toHaveLength(1)
  expect(await lancamentos(plano), 'uma entrada e duas parcelas — não duas de cada').toEqual(['100:false', '100:false', '100:true'])
})

test('à vista por duas abas ao mesmo tempo: só uma recebe', async ({ browser }) => {
  const { plano, appt } = await planoComSaldo('avista')
  const rota = `/admin/agenda/${appt}`
  const respostas = await como(browser, async p => {
    await p.goto(rota)
    return Promise.all([1, 2].map(() => chamarAcao(p, 'actions/treatment-plans.ts', 'receberDoPlano', rota,
      [plano, { forma: 'AVISTA', metodo: 'PIX' }, appt, ''])))
  })
  const textos = respostas.map(r => r!.texto)
  expect(textos.filter(t => t.includes('"recebido":300'))).toHaveLength(1)
  expect(textos.filter(t => /já foi recebido|Não há valor em aberto/.test(t))).toHaveLength(1)
  expect(await lancamentos(plano)).toEqual(['300:true'])
  const { data: hist } = await db().from('appointment_history').select('id').eq('appointment_id', appt).eq('action', 'PAYMENT_CONFIRMED')
  expect(hist ?? [], 'o histórico ganha UM recebimento').toHaveLength(1)
})

test('o mesmo envio duas vezes (duplo clique): grava uma, e as duas respostas dizem o recebido', async ({ browser }) => {
  const { plano, appt } = await planoComSaldo('envio')
  const rota = `/admin/agenda/${appt}`
  const chave = crypto.randomUUID()
  const respostas = await como(browser, async p => {
    await p.goto(rota)
    return Promise.all([1, 2].map(() => chamarAcao(p, 'actions/treatment-plans.ts', 'receberDoPlano', rota, [plano, PARCELADO(), appt, '', chave])))
  })
  expect(respostas.map(r => r!.texto).filter(t => t.includes('"recebido":300'))).toHaveLength(2)
  expect(await lancamentos(plano)).toEqual(['100:false', '100:false', '100:true'])
})
