import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O fechamento do dia (2026-10-21, decisão do Heitor: "Sem abertura: no fim
 * do dia, o resumo do que entrou por forma de pagamento, a conferência do
 * dinheiro em espécie e quem fechou").
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let daRede: MembroDeTeste | null = null
let slug = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // A recepção só RECEBE (cashier): não tem o financeiro, e fecha o dia.
  recepcao = await criarMembro(`fcr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
  daRede = await criarMembro(`fcd${marca}`, { tenant: rede.tenantId, rotulo: 'Financeiro rede', permissoes: [{ modulo: 'financial', nivel: 'VIEW' }] })
  const agora = new Date().toISOString()
  const base = { branch_id: rede.branchId, is_paid: true, paid_at: agora, created_by: 'e2e' }
  const { error } = await db().from('financial_transactions').insert([
    { ...base, type: 'INCOME', category: 'Atendimento', description: `Limpeza ${marca}`, amount: 100, payment_method: 'CASH' },
    { ...base, type: 'INCOME', category: 'Atendimento', description: `Peeling ${marca}`, amount: 250, payment_method: 'PIX' },
    { ...base, type: 'EXPENSE', category: 'Fornecedores', description: `Café ${marca}`, amount: 30, payment_method: 'CASH' },
  ])
  expect(error).toBeNull()
})
test.afterAll(async () => {
  if (rede) {
    await db().from('fechamentos_do_dia').delete().eq('branch_id', rede.branchId)
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await daRede?.limpar(); await rede?.limpar()
})

test.describe.serial('o fechamento do dia', () => {
  test('quem tem o PDV em Gerenciar vê o dia por forma de pagamento, conta o dinheiro e fecha', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/dashboard`)
      await p.getByRole('navigation').getByText('Fechamento do dia').click()
      await expect(p).toHaveURL(new RegExp(`/${slug}/pdv\\?fechar=1`))

      const dinheiro = p.locator('[data-forma="CASH"]')
      await expect(dinheiro).toContainText('100,00')
      await expect(dinheiro).toContainText('30,00')
      await expect(p.locator('[data-forma="PIX"]')).toContainText('250,00')
      await expect(p.locator('[data-forma="TOTAL"]')).toContainText('320,00')
      await expect(p.locator('[data-esperado]')).toContainText('70,00')

      await p.getByLabel('Dinheiro contado (R$)').fill('65')
      await p.getByLabel('Observação').fill('faltou troco')
      await p.getByRole('button', { name: 'Fechar o dia' }).click()
      await expect(p.getByText(/Fechado por/)).toBeVisible()
      await expect(p.locator('[data-diferenca]').first()).toContainText('5,00')
    })
    const { data } = await db().from('fechamentos_do_dia').select('esperado_dinheiro, contado_dinheiro, diferenca, observacao, fechado_por_nome')
      .eq('branch_id', rede!.branchId).single()
    expect(data).toMatchObject({ esperado_dinheiro: 70, contado_dinheiro: 65, diferenca: -5, observacao: 'faltou troco' })
    expect(data?.fechado_por_nome).toBeTruthy()
  })

  test('a rede vê o fechamento da unidade, sem fechar', async ({ browser }) => {
    await como(daRede!, browser, async p => {
      await p.goto(`/admin/pdv?fechar=1&unidade=${rede!.branchId}`)
      await expect(p.locator('[data-forma="TOTAL"]')).toContainText('320,00')
      await expect(p.getByText(/Fechado por/)).toBeVisible()
      await expect(p.getByRole('button', { name: 'Fechar o dia' })).toHaveCount(0)
    })
  })
})

// D3 da 43ª (FC-15, MQ-15): a despesa paga no cartão da rede não sai da forma da maquininha — é a linha
// "Cartão", à parte; o cartão por maquininha e bandeira é só o que passou nela. Num dia passado, para não
// mexer no dia de hoje dos casos acima.
test('a despesa no cartão da rede fica na linha "Cartão", sem abater o Débito da maquininha', async () => {
  const dia = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10)
  const meioDia = new Date(`${dia}T12:00:00-03:00`).toISOString()
  const base = { branch_id: rede!.branchId, is_paid: true, paid_at: meioDia, created_by: 'e2e' }
  expect((await db().from('financial_transactions').insert([
    { ...base, type: 'INCOME', category: 'Atendimento', description: `Débito ${marca}`, amount: 420, payment_method: 'DEBIT_CARD' },
    { ...base, type: 'EXPENSE', category: 'Manutenção', description: `Conserto da maca ${marca}`, amount: 270, payment_method: 'DEBIT_CARD' },
  ])).error).toBeNull()
  const janela = {
    p_tenant: rede!.tenantId, p_branch: rede!.branchId,
    p_from: new Date(`${dia}T00:00:00-03:00`).toISOString(), p_to: new Date(`${dia}T23:59:59.999-03:00`).toISOString(),
  }
  const { data, error } = await db().rpc('metrics_fechamento_do_dia', janela)
  expect(error).toBeNull()
  const forma = Object.fromEntries(((data ?? []) as { forma: string; entradas: number; saidas: number; saldo: number }[])
    .map(l => [l.forma, { entradas: Number(l.entradas), saidas: Number(l.saidas), saldo: Number(l.saldo) }]))
  expect(forma.DEBIT_CARD, 'o Débito é o da maquininha').toEqual({ entradas: 420, saidas: 0, saldo: 420 })
  expect(forma.CARTAO, 'a despesa no cartão, à parte').toEqual({ entradas: 0, saidas: 270, saldo: -270 })
  expect(forma.TOTAL?.saldo, 'o total do dia não muda').toBe(150)
  const porMaquininha = await db().rpc('metrics_fechamento_por_maquininha', janela)
  expect(porMaquininha.error).toBeNull()
  expect(((porMaquininha.data ?? []) as { saidas: number }[]).every(l => Number(l.saidas) === 0), 'sem a despesa').toBe(true)
})
