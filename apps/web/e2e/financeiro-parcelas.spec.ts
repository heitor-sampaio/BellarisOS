import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Cada parcela é um lançamento (pedido do Heitor, 2026-09-30 — migration
 * 20260930000023). Um parcelado virava UM lançamento com o saldo inteiro,
 * mostrado no mês da venda e quitado de uma vez pelo "Pagar".
 *
 * Agora: a entrada no dia, e cada parcela no MÊS DELA, com "parcela n/3" na
 * descrição e o "Vence dd/mm"; o "Pagar" quita uma parcela só. O período da
 * lista é pela data de referência (pago → dia do pagamento; em aberto →
 * vencimento). Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''
let pacoteId = ''

/** O mês `n` meses à frente, em Brasília: { de, ate, dia15 } ('YYYY-MM-DD'). */
function mes(n: number) {
  const [a, m] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number)
  const d = new Date(Date.UTC(a!, m! - 1 + n, 1))
  const aa = d.getUTCFullYear(), mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const ultimo = new Date(Date.UTC(aa, d.getUTCMonth() + 1, 0)).getUTCDate()
  return { de: `${aa}-${mm}-01`, ate: `${aa}-${mm}-${ultimo}`, dia15: `${aa}-${mm}-15`, br15: `15/${mm}/${aa}` }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fp${marca}`)
  cliente = await rede.criarCliente('Parcelas')
  const { data: pac, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote ${marca}`, p_preco: 800, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 4 }],
  })
  expect(error, 'criar o pacote').toBeNull()
  pacoteId = pac as string
  gestor = await criarMembro(`fpg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro',
    permissoes: [
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  if (!rede) return
  const b = db()
  const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
  const ids = (cps ?? []).map(c => c.id as string)
  if (ids.length) {
    await b.from('package_sessions').delete().in('client_package_id', ids)
    await b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
    await b.from('client_packages').delete().in('id', ids)
  }
  await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
  // A despesa não tem cliente: não sai com os clientes, e prenderia a unidade.
  const { error } = await b.from('financial_transactions').delete().eq('branch_id', rede.branchId).is('client_id', null)
  expect(error, 'apagar as despesas de teste').toBeNull()
  if (gestor) await gestor.limpar()
  await rede.limpar()
})

async function comSessao<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('parcelado: a entrada no dia, cada parcela no mês dela, e o "Pagar" quita uma parcela só', async ({ browser }) => {
  const [m1, m2] = [mes(1), mes(2)]
  await comSessao(browser, async p => {
    // Entrada de 200 + 3 parcelas de 200, a primeira no dia 15 do mês que vem.
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/admin/clients/${cliente}`, [
      cliente, pacoteId, rede!.branchId,
      { forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 200, parcelas: 3, primeiroVencimento: new Date(`${m1.dia15}T12:00:00-03:00`).toISOString() },
    ])
    expect(r.texto).toContain('clientPackageId')

    const linhas = p.locator('tbody tr').filter({ hasText: `${PREFIXO} Pacote ${marca}` })

    // Este mês: só a entrada (a venda não joga o parcelado inteiro aqui).
    await p.goto('/admin/financeiro?period=month')
    await expect(linhas).toHaveCount(1)
    await expect(linhas.first()).toContainText('— entrada')

    // Mês que vem: a parcela 1/3, com o vencimento.
    await p.goto(`/admin/financeiro?period=custom&from=${m1.de}&to=${m1.ate}`)
    await expect(linhas).toHaveCount(1)
    await expect(linhas.first()).toContainText('parcela 1/3')
    await expect(linhas.first()).toContainText(`Vence ${m1.br15}`)

    // O mês seguinte: a 2/3.
    await p.goto(`/admin/financeiro?period=custom&from=${m2.de}&to=${m2.ate}`)
    await expect(linhas).toHaveCount(1)
    await expect(linhas.first()).toContainText('parcela 2/3')

    // "Pagar" na 2/3: só ela sai paga.
    await linhas.first().getByRole('button', { name: 'Pagar' }).click()
    await expect.poll(async () => {
      const { data } = await db().from('financial_transactions').select('parcela_numero, is_paid')
        .eq('branch_id', rede!.branchId).not('parcela_numero', 'is', null).order('parcela_numero')
      return (data ?? []).map(t => `${t.parcela_numero}:${t.is_paid}`)
    }, { message: 'só a parcela paga muda' }).toEqual(['1:false', '2:true', '3:false'])
  })
})

test('despesa parcelada pela tela: uma despesa por parcela, cada uma no seu vencimento', async ({ browser }) => {
  const m1 = mes(1)
  const descricao = `${PREFIXO} Equipamento ${marca}`
  await comSessao(browser, async p => {
    await p.goto('/admin/financeiro')
    await p.getByRole('button', { name: 'Novo lançamento' }).click()
    const dialogo = p.locator('dialog[open]')
    await dialogo.locator('select').first().selectOption(rede!.branchId)
    await dialogo.getByRole('button', { name: 'Despesa' }).click()
    await dialogo.locator('input[name="description"]').fill(descricao)
    await dialogo.locator('select[name="category"]').selectOption({ index: 1 })
    await dialogo.getByPlaceholder('0,00').first().fill('100')
    await dialogo.getByRole('button', { name: 'Parcelado' }).click()
    await dialogo.getByPlaceholder('Ex: 12').fill('3')
    await dialogo.locator('input[type="date"]').last().fill(m1.dia15)
    await dialogo.getByRole('button', { name: 'Lançar' }).click()
    await expect(dialogo).toBeHidden()
  })
  const { data } = await db().from('financial_transactions').select('description, amount, is_paid, due_date, parcela_numero, parcela_total')
    .eq('branch_id', rede!.branchId).like('description', `${descricao}%`).order('parcela_numero')
  expect((data ?? []).map(t => [t.description.replace(`${descricao} — `, ''), Number(t.amount), t.is_paid])).toEqual([
    ['parcela 1/3', 33.33, false], ['parcela 2/3', 33.33, false], ['parcela 3/3', 33.34, false],
  ])
  expect(new Date(data![0]!.due_date as string).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })).toBe(m1.dia15)
})
