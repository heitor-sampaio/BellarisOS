import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Receber o saldo do plano com DUAS abas ao mesmo tempo (sobra da F9,
 * 2026-11-02: "dois envios simultâneos ainda leem o mesmo saldo"). É dinheiro:
 * as duas liam os mesmos R$ 300 em aberto e cada uma gravava o seu recebimento.
 *
 * O caminho é o PDV (o Heitor, 13/11, PV-01: "o pagamento acontece por dentro
 * desse PDV, seja do que for"; AT-13 e PV-13: a tela do atendimento não
 * recebe). Até a 28ª era o `receberDoPlano` do check-in, que saiu; a prova da
 * concorrência veio para o `receberParcelaNoPdv`: a baixa tem a guarda
 * (`is_paid = false` na própria gravação), e a segunda ouve que já está pago.
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

/** Um plano aceito com R$ 300 a receber (o lançamento) e a sessão de hoje. */
async function planoComSaldo(rotulo: string): Promise<{ plano: string; appt: string; tx: string; cliente: string }> {
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
  const tx = await ins('financial_transactions', {
    branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', amount: 300, is_paid: false, created_by: 'e2e',
  })
  const appt = await ins('appointments', {
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 100, status: 'CONFIRMED', treatment_plan_id: plano,
  })
  return { plano, appt, tx, cliente }
}

/** Os lançamentos com dinheiro do plano: "valor:pago". */
async function lancamentos(plano: string) {
  const { data, error } = await db().from('financial_transactions').select('amount, is_paid')
    .eq('treatment_plan_id', plano).gt('amount', 0)
  expect(error).toBeNull()
  return (data ?? []).map(t => `${Number(t.amount)}:${t.is_paid}`).sort()
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`rc${marca}`)
  caixa = await criarMembro(`rc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await caixa?.limpar()
  await rede?.limpar()
})

const ROTA = '/admin/pdv'
const JA_PAGO = 'Esse lançamento já está pago (ou foi estornado).'

test('o saldo à vista por duas abas ao mesmo tempo: só uma recebe', async ({ browser }) => {
  const { plano, tx } = await planoComSaldo('avista')
  const respostas = await como(browser, async p => {
    await p.goto(ROTA)
    return Promise.all([1, 2].map(() => chamarAcao(p, 'actions/pdv.ts', 'receberParcelaNoPdv', ROTA, [tx, '', { forma: 'PIX' }])))
  })
  const textos = respostas.map(r => r!.texto)
  expect(textos.filter(t => t.includes('"ok":true')), 'uma aba recebe').toHaveLength(1)
  expect(textos.filter(t => t.includes(JA_PAGO)), 'a outra ouve que já está pago').toHaveLength(1)
  expect(await lancamentos(plano), 'um recebimento só').toEqual(['300:true'])
})

/**
 * O clique duplo é o MESMO envio (a chave da tela): grava uma vez, e as DUAS
 * respostas dizem o recebido (o Heitor, 25/11: "As duas respostas dizem
 * 'recebido'" — a segunda dizia "Esse lançamento já está pago", e quem clicou
 * achava que tinha falhado). Duas abas (os casos acima, sem a chave) não mudam.
 */
test('o mesmo envio duas vezes (duplo clique): grava uma, e as duas respostas dizem o recebido', async ({ browser }) => {
  const { plano, tx } = await planoComSaldo('duplo')
  const envio = crypto.randomUUID()
  const respostas = await como(browser, async p => {
    await p.goto(ROTA)
    return Promise.all([1, 2].map(() => chamarAcao(p, 'actions/pdv.ts', 'receberParcelaNoPdv', ROTA, [tx, '', { forma: 'PIX' }, envio])))
  })
  const textos = respostas.map(r => r!.texto)
  for (const t of textos) {
    expect(t, 'as duas respostas dizem o recebido').toContain('"recebido":300')
    expect(t, 'nenhuma diz que já estava pago').not.toContain(JA_PAGO)
  }
  expect(await lancamentos(plano), 'um recebimento só').toEqual(['300:true'])
})

test('a parcela vencida do crediário do plano por duas abas ao mesmo tempo: só uma recebe, e a de depois fica', async ({ browser }) => {
  const { plano, tx, cliente } = await planoComSaldo('parcelado')
  // O crediário do plano: a entrada paga (o lançamento do saldo) e duas parcelas, a 1ª vencida.
  expect((await db().from('financial_transactions').update({ amount: 100, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX' }).eq('id', tx)).error).toBeNull()
  const ids: string[] = []
  for (const [n, dias] of [[1, -1], [2, 30]] as const) {
    const { data, error } = await db().from('financial_transactions').insert({
      branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
      description: `Plano de tratamento — parcela ${n}/2`, amount: 100, is_paid: false,
      due_date: new Date(Date.now() + dias * 86_400_000).toISOString(), parcela_numero: n, parcela_total: 2, created_by: 'e2e',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    ids.push(data!.id)
  }
  const respostas = await como(browser, async p => {
    await p.goto(ROTA)
    return Promise.all([1, 2].map(() => chamarAcao(p, 'actions/pdv.ts', 'receberParcelaNoPdv', ROTA, [ids[0], '', { forma: 'PIX' }])))
  })
  const textos = respostas.map(r => r!.texto)
  expect(textos.filter(t => t.includes('"ok":true'))).toHaveLength(1)
  expect(textos.filter(t => t.includes(JA_PAGO))).toHaveLength(1)
  expect(await lancamentos(plano), 'a entrada e a 1ª pagas; a 2ª a vencer — nada em dobro').toEqual(['100:false', '100:true', '100:true'])
})
