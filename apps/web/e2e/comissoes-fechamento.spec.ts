import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Comissões, fase 3 (2026-09-30): Financeiro → Comissões e o fechamento.
 * Fechar e pagar (`comissao_fechar`) grava o fechamento, a DESPESA paga e os
 * lançamentos pagos numa transação; dois cliques fecham uma vez; o que chega
 * depois (um estorno) cai no próximo; quem só vê as próprias vê só a sua; e o
 * dashboard e os relatórios não mostram a comissão da equipe a quem não vê o
 * financeiro. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let proprio: MembroDeTeste | null = null
let equipe: MembroDeTeste | null = null
let cliente = ''
const ROTA = '/admin/financeiro/comissoes'
// O período atual da rede (mensal): a chave é o dia 1 no fuso de SP.
const periodoAtual = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date())
  return `${p}-01`
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cf${marca}`)
  cliente = await rede.criarCliente('Fechamento')
  gestor = await criarMembro(`cfg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'team', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
  // Só as próprias: financeiro VIEW com escopo OWN — e atende.
  proprio = await criarMembro(`cfp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' }],
  })
  // Vê a equipe e os relatórios de profissionais, mas NÃO o financeiro.
  equipe = await criarMembro(`cfe${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão de equipe',
    permissoes: [{ modulo: 'team', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
  const { error: eAba } = await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: equipe.roleId, tab: 'profissionais' })
  expect(eAba).toBeNull()
  await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, modo: 'ATENDIMENTO', periodo: 'MENSAL' }, { onConflict: 'tenant_id' })
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    // O fechamento aponta a despesa e o profissional: sai antes deles.
    const { data: pays } = await b.from('commission_payouts').select('id, transaction_id, estorno_transaction_id').eq('tenant_id', rede.tenantId)
    await b.from('commissions').update({ payout_id: null }).in('payout_id', (pays ?? []).map(p => p.id))
    await b.from('commission_payouts').delete().eq('tenant_id', rede.tenantId)
    const txs = (pays ?? []).flatMap(p => [p.transaction_id, p.estorno_transaction_id]).filter(Boolean) as string[]
    await b.from('financial_transactions').delete().in('id', txs)
  }
  for (const m of [equipe, proprio, gestor]) if (m) {
    await b.from('role_report_tabs').delete().eq('role_id', m.roleId)
    // Os atendimentos do membro que atende saem antes dele (FK do profissional).
    const { data: aps } = await b.from('appointments').select('id').eq('professional_id', m.userId)
    const ids = (aps ?? []).map(a => a.id as string)
    if (ids.length) {
      await b.from('financial_transactions').delete().in('appointment_id', ids)
      await b.from('medical_record_entries').delete().in('appointment_id', ids)
      await b.from('appointment_history').delete().in('appointment_id', ids)
      await b.from('appointments').delete().in('id', ids)
    }
    await m.limpar()
  }
  if (rede) await rede.limpar()
})

/** Um atendimento concluído do profissional, com 10% de comissão sobre o preço. */
async function concluido(profissional: string, preco: number) {
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: profissional, procedure_id: rede!.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: preco, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { error: eFim } = await db().rpc('concluir_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: rede!.procedureId, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco }] },
  })
  expect(eFim).toBeNull()
  return ap!.id
}
const aPagar = async (prof: string) => ((await db().from('commissions').select('amount')
  .eq('professional_id', prof).eq('status', 'OPEN').is('payout_id', null)).data ?? [])
  .reduce((s, c) => Math.round((s + Number(c.amount)) * 100) / 100, 0)
const fechamentos = async (prof: string) => (await db().from('commission_payouts')
  .select('total, transaction_id').eq('professional_id', prof).order('paid_at')).data ?? []

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.describe.serial('comissões — fechamento e visibilidade', () => {
  test('fechar e pagar pela tela: despesa paga no financeiro e os lançamentos marcados pagos', async ({ browser }) => {
    const P = rede!.professionalId
    await concluido(P, 200)
    await concluido(P, 200)
    expect(await aPagar(P)).toBe(40)

    await comSessao(browser, gestor!, async p => {
      await p.goto(ROTA)
      const card = p.locator(`[data-comissoes-de="${P}"]`)
      await expect(card).toContainText('R$ 40,00')
      await card.getByRole('button', { name: 'Extrato' }).click()
      await expect(card.locator('[data-lancamento="LIBERACAO"]')).toHaveCount(2)
      await card.getByRole('button', { name: 'Fechar e pagar' }).click()
      await card.getByLabel('Forma de pagamento').selectOption('PIX')
      await card.getByRole('button', { name: 'Confirmar pagamento' }).click()
      await expect.poll(async () => (await fechamentos(P)).length, { message: 'o fechamento é gravado' }).toBe(1)
    })

    const [f] = await fechamentos(P)
    expect(Number(f!.total)).toBe(40)
    const { data: despesa } = await db().from('financial_transactions')
      .select('type, category, amount, is_paid, payment_method, branch_id').eq('id', f!.transaction_id).single()
    expect({ ...despesa, amount: Number(despesa!.amount) }).toEqual({
      type: 'EXPENSE', category: 'Comissões', amount: 40, is_paid: true, payment_method: 'PIX', branch_id: rede!.branchId,
    })
    expect(await aPagar(P)).toBe(0)
    const { data: pagos } = await db().from('commissions').select('status, payout_id').eq('professional_id', P)
    expect((pagos ?? []).every(c => c.status === 'PAID' && c.payout_id)).toBe(true)
  })

  test('o estorno depois do fechamento cai no próximo; saldo negativo não fecha; dois cliques fecham uma vez', async ({ browser }) => {
    const P = rede!.professionalId
    // Um atendimento já fechado (o do teste anterior) tem o pagamento estornado.
    const { data: ap } = await db().from('commission_lines').select('appointment_id').eq('professional_id', P).limit(1).single()
    const { data: tx, error: ePag } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap!.appointment_id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: 200 },
    })
    expect(ePag).toBeNull()
    expect((await db().rpc('estornar_transacao', { p_transacao: tx, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
    expect(await aPagar(P), 'o estorno fica a pagar (negativo) para o próximo fechamento').toBe(-20)

    await comSessao(browser, gestor!, async p => {
      const negativo = await chamarAcao(p, 'actions/comissoes.ts', 'fecharComissoes', ROTA, [P, rede!.branchId, periodoAtual(), 'PIX'])
      expect(negativo.texto).toContain('saldo do profissional está negativo')

      await concluido(P, 500) // +50 → a pagar 30
      const [r1, r2] = await Promise.all([
        chamarAcao(p, 'actions/comissoes.ts', 'fecharComissoes', ROTA, [P, rede!.branchId, periodoAtual(), 'PIX']),
        chamarAcao(p, 'actions/comissoes.ts', 'fecharComissoes', ROTA, [P, rede!.branchId, periodoAtual(), 'PIX']),
      ])
      const ok = [r1, r2].filter(r => r.texto.includes('"ok":true'))
      expect(ok, 'exatamente um fecha').toHaveLength(1)
      expect([r1, r2].some(r => r.texto.includes('Nada a pagar'))).toBe(true)
    })
    const lista = await fechamentos(P)
    expect(lista.map(f => Number(f.total))).toEqual([40, 30])
    expect(await aPagar(P)).toBe(0)
  })

  test('estornar um fechamento: a despesa volta e os lançamentos ficam a pagar; por fora, é recusado', async ({ browser }) => {
    const P = rede!.professionalId
    const { data: ultimo } = await db().from('commission_payouts').select('id, transaction_id, total')
      .eq('professional_id', P).order('paid_at', { ascending: false }).limit(1).single()
    expect(Number(ultimo!.total)).toBe(30)

    // O fechamento emitiu o fato para as automações.
    const { data: paga } = await db().from('domain_events').select('dados').eq('nome', 'comissao.paga').eq('entidade_id', ultimo!.id)
    expect(Number((paga ?? [])[0]?.dados?.valor)).toBe(30)

    // Pelo financeiro comum, a despesa do fechamento não se estorna.
    const porFora = await db().rpc('estornar_transacao', { p_transacao: ultimo!.transaction_id, p_tenant: rede!.tenantId, p_ator: 'e2e' })
    expect(porFora.error?.message).toMatch(/estorne pelo fechamento/)

    await comSessao(browser, gestor!, async p => {
      await p.goto(ROTA)
      const linha = p.locator(`[data-fechamento="${ultimo!.id}"]`)
      await linha.getByRole('button', { name: 'Estornar' }).click()
      await linha.getByLabel('Motivo do estorno').fill(`${PREFIXO} pago em dobro`)
      await linha.getByRole('button', { name: 'Confirmar estorno' }).click()
      await expect(linha).toContainText('Estornado')
    })

    const { data: f } = await db().from('commission_payouts').select('estornado_at, estorno_motivo, estorno_transaction_id').eq('id', ultimo!.id).single()
    expect(f!.estornado_at).not.toBeNull()
    expect(f!.estorno_motivo).toBe(`${PREFIXO} pago em dobro`)
    const { data: despesa } = await db().from('financial_transactions').select('notes').eq('id', ultimo!.transaction_id).single()
    expect(despesa!.notes).toBe('Estornada')
    const { data: contra } = await db().from('financial_transactions').select('type, category, amount').eq('id', f!.estorno_transaction_id).single()
    expect({ ...contra, amount: Number(contra!.amount) }).toEqual({ type: 'INCOME', category: 'Estorno', amount: 30 })
    expect(await aPagar(P), 'os lançamentos daquele fechamento voltam a pagar').toBe(30)
  })

  test('quem só vê as próprias: vai direto a elas, vê só a sua linha e não fecha', async ({ browser }) => {
    const P = rede!.professionalId
    await db().from('users').update({ provides_services: true }).eq('id', proprio!.userId)
    await concluido(proprio!.userId, 300)
    await concluido(P, 100)

    await comSessao(browser, proprio!, async p => {
      await p.goto('/admin/financeiro')
      await expect(p).toHaveURL(/\/admin\/financeiro\/comissoes/)
      await expect(p.getByRole('heading', { name: 'Minhas comissões' })).toBeVisible()
      await expect(p.locator(`[data-comissoes-de="${proprio!.userId}"]`)).toContainText('R$ 30,00')
      await expect(p.locator(`[data-comissoes-de="${P}"]`)).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Fechar e pagar' })).toHaveCount(0)

      const r = await chamarAcao(p, 'actions/comissoes.ts', 'fecharComissoes', ROTA, [P, rede!.branchId, periodoAtual(), 'PIX'])
      expect(r.texto).not.toContain('"ok":true')
    })
    expect(await aPagar(P), 'a recusa não fechou nada (30 do fechamento estornado + 10)').toBe(40)
    expect(await fechamentos(proprio!.userId)).toHaveLength(0)
  })

  test('dashboard e relatórios: a comissão da equipe só para quem vê o financeiro de todos', async ({ browser }) => {
    await comSessao(browser, equipe!, async p => {
      await p.goto('/admin/dashboard')
      await expect(p.getByText('Ranking — Vendas')).toBeVisible()
      await expect(p.getByText('Ranking — Comissão')).toHaveCount(0)
      await p.goto('/admin/reports?tab=profissionais')
      await expect(p.getByText('Atendimentos por Profissional')).toBeVisible()
      await expect(p.getByText('Comissões por Profissional')).toHaveCount(0)
      await expect(p.getByText('Comissões em Aberto')).toHaveCount(0)
    })
    // Controle: o financeiro vê o ranking, com a comissão de verdade.
    await comSessao(browser, gestor!, async p => {
      await p.goto('/admin/dashboard')
      await expect(p.getByText('Ranking — Comissão')).toBeVisible()
      await expect(p.getByText(`${PREFIXO} Profissional cfp${marca}`).first()).toBeVisible()
    })
  })
})
