import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A46 da 6ª simulação: a Márcia comprou um pacote de 4 limpezas no Pix (R$ 800),
 * fez uma e desistiu; a clínica cancelou com estorno parcial. No app ela via
 * "Pacote R$ 200 Pix Pago" — o pagamento reduzido ao usado (a regra F2b) —,
 * sem nada dizendo que o pacote foi cancelado, e o estorno de R$ 600 não
 * aparecia em Pagamentos (só os pontos mostravam). Agora, no Histórico →
 * Pagamentos e no Financeiro do app: o pagamento do pacote diz "Pacote
 * cancelado em …", e o estorno aparece como saída ("− R$ 600,00 · Estorno").
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let pacote = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pcc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`pccc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  const { data, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote Limpeza ${marca}`, p_preco: 800, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 4 }], p_comissao: { venda: null, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(error, 'criar o pacote').toBeNull()
  pacote = data as string
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    for (const [o, q] of [
      ...(ids.length ? [
        ['comissão', b.from('commission_lines').delete().in('client_package_id', ids)],
        ['sessões', b.from('package_sessions').delete().in('client_package_id', ids)],
        ['lançamentos do pacote', b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)],
        ['pacotes da cliente', b.from('client_packages').delete().in('id', ids)],
      ] as const : []),
      ['pacotes', b.from('service_packages').delete().eq('tenant_id', rede.tenantId)],
    ] as const) {
      const { error } = await q
      if (error) falhas.push(`${o}: ${error.message}`)
    }
  }
  await cliente?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('o pacote cancelado com estorno parcial: o app diz "Pacote cancelado em …" e mostra o estorno em Pagamentos', async ({ browser }) => {
  const { data: cp, error } = await db().rpc('pacote_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente!.clientId, p_pacote: pacote, p_unidade: rede!.branchId, p_ator: null,
    p_lancamentos: [{ amount: 800, payment_method: 'PIX', is_paid: true }],
    p_sessoes: Array.from({ length: 4 }, () => ({ procedure_id: rede!.procedureId, preco: 200 })),
  })
  expect(error, 'vender o pacote').toBeNull()
  // Uma sessão feita (R$ 200 usados).
  expect((await db().from('package_sessions').update({ status: 'USED' }).eq('client_package_id', cp as string).eq('session_number', 1)).error).toBeNull()
  const args = { p_tenant: rede!.tenantId, p_pacote: cp, p_ator: null, p_ator_nome: 'e2e', p_motivo: 'desistiu', p_destino: 'ESTORNO', p_agendamentos: null }
  const { error: eC } = await db().rpc('pacote_cancelar_devolvendo', { ...args, p_esperado: 600, p_simular: false, p_estorno: 'PARCIAL', p_novo: null })
  expect(eC, 'cancelar com estorno parcial').toBeNull()

  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/historico`)
    await p.getByRole('button', { name: /Pagamentos/ }).click()
    const doPacote = p.locator('[data-pagamento]').filter({ hasText: `Pacote Limpeza ${marca}` }).filter({ hasNotText: 'Estorno' })
    await expect(doPacote).toContainText('R$ 200,00')
    await expect(doPacote.locator('[data-pacote-cancelado]')).toContainText('Pacote cancelado em')
    const estorno = p.locator('[data-pagamento][data-estorno]')
    await expect(estorno).toHaveCount(1)
    await expect(estorno).toContainText('600,00')
    await expect(estorno).toContainText('Estorno')

    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.locator('[data-pacote-cancelado]').first()).toContainText('Pacote cancelado em')
    await expect(p.locator('[data-estorno]')).toContainText('600,00')
  })
})
