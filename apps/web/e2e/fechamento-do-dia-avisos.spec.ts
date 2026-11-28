import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-49 (simulação de 2026-10-30): o Fechamento do dia não avisava de nada.
 * Desde a CX5 (o PDV, fase 4 — a revisão do Heitor, 2026-11-13) os avisos
 * ficam DOIS, com os números do banco:
 * 1. há comanda aberta (era "há dinheiro a receber": os concluídos sem
 *    pagamento viraram as comandas abertas do PDV, CX3);
 * 2. entrou dinheiro DEPOIS do último fechamento (fechar de novo).
 * O "saiu mais dinheiro em espécie do que entrou" virou a linha do Dinheiro
 * (o registrado negativo), e as taxas da maquininha estimadas foram para o
 * Financeiro (CX6), no período dele.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let atendimento = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const lancar = async (linhas: Record<string, unknown>[]) => {
  const agora = new Date().toISOString()
  const { error } = await db().from('financial_transactions').insert(linhas.map(l => ({
    branch_id: rede!.branchId, is_paid: true, paid_at: agora, created_by: 'e2e', category: 'Atendimento', ...l,
  })))
  expect(error).toBeNull()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fav${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`favr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
  financeiro = await criarMembro(`favf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'VIEW' }],
  })
  // A taxa do Pix e do crédito em 3x (Configurações → Comissões).
  expect((await db().rpc('comissao_taxas_definir', { p_tenant: rede.tenantId, p_taxas: [
    { metodo: 'PIX', parcelas: 1, taxa_pct: 1 }, { metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 5 },
  ] })).error).toBeNull()
  // O dia: R$ 200 no Pix (taxa R$ 2), R$ 300 no crédito 3x (taxa R$ 15), e
  // R$ 50 de despesa paga em dinheiro sem nenhuma entrada em dinheiro.
  await lancar([
    { type: 'INCOME', description: `Peeling ${marca}`, amount: 200, payment_method: 'PIX' },
    { type: 'INCOME', description: `Laser ${marca}`, amount: 300, payment_method: 'CREDIT_CARD', cartao_vezes: 3 },
    { type: 'EXPENSE', category: 'Fornecedores', description: `Café ${marca}`, amount: 50, payment_method: 'CASH' },
  ])
  // Um atendimento concluído e não pago: R$ 180 a receber.
  cliente = await rede.criarCliente('A receber')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 180, status: 'COMPLETED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  atendimento = data!.id
})

test.afterAll(async () => {
  if (rede) {
    await db().from('fechamentos_do_dia').delete().eq('branch_id', rede.branchId)
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('payment_fees').delete().eq('tenant_id', rede.tenantId)
    if (atendimento) await db().from('appointments').delete().eq('id', atendimento)
  }
  await recepcao?.limpar(); await financeiro?.limpar(); await rede?.limpar()
})

test.describe.serial('os avisos do fechamento do dia', () => {
  test('a comanda aberta e, depois de fechar, o dinheiro que entrou; a espécie negativa na linha do Dinheiro', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/pdv?fechar=1`)
      const avisos = p.locator('[data-avisos-do-fechamento]')
      // O atendimento concluído e não pago é uma comanda aberta (CX3/CX5).
      await expect(avisos.locator('[data-aviso="comandas-abertas"]')).toContainText('Há 1 comanda aberta')
      await expect(avisos.locator('[data-aviso]')).toHaveCount(1)
      // Saiu R$ 50 em espécie sem entrada: a linha do Dinheiro diz −R$ 50,00 na gaveta.
      await expect(p.locator('[data-forma="CASH"] [data-registrado]')).toContainText('-R$ 50,00')
      // As taxas estimadas moram no Financeiro (CX6).
      await expect(p.locator('[data-taxas-do-dia]')).toHaveCount(0)

      await p.getByLabel('Dinheiro contado (R$)').fill('0')
      await p.getByRole('button', { name: 'Fechar o dia' }).click()
      await expect(p.getByText(/Fechado por/)).toBeVisible()
      await expect(avisos.locator('[data-aviso="movimento-depois"]')).toHaveCount(0)
    })

    // Um recebimento depois do fechamento.
    await lancar([{ type: 'INCOME', description: `Depois ${marca}`, amount: 80, payment_method: 'CASH' }])
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/pdv?fechar=1`)
      await expect(p.locator('[data-aviso="movimento-depois"]')).toContainText(/Houve movimento depois do fechamento das \d{2}:\d{2} \(entrou R\$\s80,00\): confira e feche de novo/)
    })
  })

  test('CX6: as taxas da maquininha estimadas estão no Financeiro, no período', async ({ browser }) => {
    await como(financeiro!, browser, async p => {
      await p.goto(`/${slug}/financeiro?aba=movimentacoes&period=today`)
      // Informativo: R$ 2 do Pix + R$ 15 do crédito 3x.
      await expect(p.locator('[data-taxas-estimadas]')).toContainText('Taxas da maquininha no período (estimadas): R$ 17,00')
    })
  })

  test('FC-08: entrou e saiu depois do fechamento, sem se anular — o Pix novo e a despesa estornada entram, os estornos às clientes saem', async ({ browser }) => {
    // FC-08 ("o estorno conta como 'saiu'"); decisão do Claude, 28/11 (pela FC-08 e pela FC-11): X é
    // todo dinheiro que entrou no caixa depois do retrato, Y os estornos às clientes e as saídas novas.
    // O aviso dizia "entrou R$ 85,00 e saiu R$ 255,00": o estorno do débito de hoje anulava o Pix novo.
    const ids = async (descricoes: string[]) => {
      const { data, error } = await db().from('financial_transactions').select('id, description')
        .eq('branch_id', rede!.branchId).in('description', descricoes)
      expect(error).toBeNull()
      return Object.fromEntries((data ?? []).map(t => [t.description as string, t.id as string]))
    }
    const antes = [`D08 débito ${marca}`, `D10 Pix ${marca}`, `D11 Pix ${marca}`, `Energia ${marca}`]
    await lancar([
      { type: 'INCOME', description: antes[0], amount: 150, payment_method: 'DEBIT_CARD' },
      { type: 'INCOME', description: antes[1], amount: 165, payment_method: 'PIX' },
      { type: 'INCOME', description: antes[2], amount: 90, payment_method: 'PIX' },
      { type: 'EXPENSE', category: 'Fornecedores', description: antes[3], amount: 85, payment_method: 'PIX' },
    ])
    // O fechamento (o retrato) depois desses lançamentos — o dia é o do fechamento do primeiro teste.
    const { data: primeiro } = await db().from('fechamentos_do_dia').select('dia').eq('branch_id', rede!.branchId)
      .order('fechado_em', { ascending: false }).limit(1).single<{ dia: string }>()
    await new Promise(r => setTimeout(r, 1_100))
    expect((await db().from('fechamentos_do_dia').insert({
      tenant_id: rede!.tenantId, branch_id: rede!.branchId, dia: primeiro!.dia, resumo: [],
      esperado_dinheiro: 0, contado_dinheiro: 0, fechado_por_nome: 'e2e',
    })).error).toBeNull()
    await new Promise(r => setTimeout(r, 1_100))
    // Depois: os três estornos às clientes, a despesa estornada e o débito recebido de novo no Pix.
    const id = await ids(antes)
    for (const d of antes) {
      expect((await db().rpc('estornar_transacao', { p_transacao: id[d], p_tenant: rede!.tenantId, p_ator: 'e2e', p_motivo: 'e2e' })).error, d).toBeNull()
    }
    await lancar([{ type: 'INCOME', description: `D08 de novo no Pix ${marca}`, amount: 150, payment_method: 'PIX' }])
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/pdv?fechar=1`)
      await expect(p.locator('[data-aviso="movimento-depois"]')).toContainText(/\(entrou R\$\s235,00 e saiu R\$\s405,00\): confira e feche de novo/)
    })
  })
})
