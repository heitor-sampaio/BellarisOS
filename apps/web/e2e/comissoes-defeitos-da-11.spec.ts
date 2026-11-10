import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D7 da 11ª simulação (2026-11-10): depois do cancelamento do pacote, a linha
 * ANTIGA da comissão de venda se contradizia — a liberação de R$ 33,00 (3% de
 * R$ 1.100, quando o pacote estava inteiro) passava a dizer "base cheia
 * R$ 110,00 (R$ 1.100,00, na proporção do que ficou (10%)) · 3%". O extrato
 * aplicava o fator de HOJE (`comissao_conta_detalhe`) a todos os lançamentos
 * da linha. Princípio 3: cada lançamento com a base da hora dele.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let linhaId = ''
const nomePacote = `${PREFIXO} Pacote 10 drenagens ${marca}`
const n = (v: unknown) => Number(v)

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cd11${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cd11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const cliente = await rede.criarCliente('Fernanda')
  const { data: sp, error: eSp } = await b.from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: nomePacote, total_sessions: 10, price: 1100,
  }).select('id').single<{ id: string }>()
  expect(eSp).toBeNull()
  const { data: cp, error: eCp } = await b.from('client_packages').insert({
    client_id: cliente, package_id: sp!.id, branch_id: rede.branchId, total_sessions: 10, used_sessions: 0, price: 1100,
  }).select('id').single<{ id: string }>()
  expect(eCp).toBeNull()
  // A comissão de VENDA (3%) de quem vendeu.
  const { data: l, error: eL } = await b.from('commission_lines').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, professional_id: rede.professionalId, origem: 'PACOTE_VENDA',
    client_package_id: cp!.id, regra_tipo: 'PERCENTAGE', regra_valor: 3, modo: 'INTEGRAL', preco: 1100,
  }).select('id').single<{ id: string }>()
  expect(eL).toBeNull()
  linhaId = l!.id
  // Pago inteiro: o gatilho do pagamento libera os R$ 33,00.
  expect((await b.from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, client_package_id: cp!.id, type: 'INCOME', category: 'Pacote',
    description: 'Pacote', amount: 1100, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', created_by: 'e2e',
  })).error).toBeNull()
  const { data: lib } = await b.from('commissions').select('id, type, rule_value, period_ref').eq('line_id', linhaId).eq('kind', 'LIBERACAO').single()
  expect(lib, 'a liberação dos R$ 33').not.toBeNull()
  // A liberação foi antes do cancelamento (uma hora antes: folga entre os relógios).
  expect((await b.from('commissions').update({ released_at: new Date(Date.now() - 3_600_000).toISOString() }).eq('id', lib!.id)).error).toBeNull()
  // O cancelamento: ficaram R$ 110 (10%), e o acerto lança a diferença.
  expect((await b.from('client_packages').update({ valor_cancelado: 990, cancelado_em: new Date().toISOString() }).eq('id', cp!.id)).error).toBeNull()
  expect((await b.from('commissions').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, line_id: linhaId, kind: 'AJUSTE', motivo: 'Cancelamento do pacote',
    amount: -29.7, type: lib!.type, rule_value: lib!.rule_value, period_ref: lib!.period_ref, released_at: new Date(Date.now() + 60_000).toISOString(),
  })).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('D7: cada lançamento do extrato com a base da hora dele — a liberação antiga com o pacote inteiro', async ({ browser }) => {
  const { data, error } = await db().rpc('comissoes_extrato_com_base', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_inicio: new Date(Date.now() - 2 * 864e5).toISOString(),
    p_fim: new Date(Date.now() + 864e5).toISOString(), p_profissional: rede!.professionalId,
  })
  expect(error).toBeNull()
  const daLinha = ((data ?? []) as Record<string, unknown>[]).filter(x => x.kind !== 'AGUARDANDO')
  const liberacao = daLinha.find(x => x.kind === 'LIBERACAO')!
  const ajuste = daLinha.find(x => x.kind === 'AJUSTE')!
  expect(n(liberacao.amount)).toBe(33)
  expect({ base: n(liberacao.base), fator: n(liberacao.base_fator) }, 'a liberação: o pacote inteiro').toEqual({ base: 1100, fator: 1 })
  expect({ base: n(ajuste.base), fator: n(ajuste.base_fator) }, 'o acerto do cancelamento: o que ficou').toEqual({ base: 110, fator: 0.1 })

  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro/comissoes')
    await p.getByRole('button', { name: /Extrato/ }).first().click()
    const lib = p.locator('[data-lancamento="LIBERACAO"]').filter({ hasText: nomePacote })
    await expect(lib).toContainText(/base cheia[^:]*: R\$\s1\.100,00/)
    await expect(lib).not.toContainText('proporção')
    const aj = p.locator('[data-lancamento="AJUSTE"]').filter({ hasText: nomePacote })
    await expect(aj).toContainText(/R\$\s110,00 \(R\$\s1\.100,00, na proporção do que ficou \(10%\)\)/)
  })
})
