import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { chamarAcao } from './apoio/acao-direta'

/**
 * CANCELAR PACOTE (F2b da 5ª simulação; decisão do Heitor, 2026-11-01:
 * "concordo"). A cliente compra 6, faz 2 e desiste — e até aqui não havia o
 * que fazer.
 *
 * - "Cancelar pacote" na ficha mostra as sessões restantes e o valor delas (o
 *   rateio do pacote, com o desconto), e a recepção devolve como ESTORNO (o
 *   dinheiro, pelo estorno de sempre) ou como CRÉDITO na clínica.
 * - Com crediário em aberto, as parcelas que passam do que foi usado caem
 *   ANTES de devolver qualquer coisa, e a tela diz a conta.
 * - A comissão de venda volta na proporção do que foi devolvido (também a
 *   prevista, quando ainda aguardava o pagamento integral — H4); a de execução
 *   das sessões feitas fica.
 * - Os pontos seguem a regra do estorno.
 * - Os agendamentos futuros das sessões: cancelar ou manter como avulso.
 * - Quando o que volta é MENOR que um pagamento, a recepção escolhe (r2-ven-05,
 *   o Heitor: "dar as duas opções (...) flexibilidade"): o ESTORNO PARCIAL (o
 *   pagamento passa a valer o usado e um "Estorno parcial" leva o resto) ou
 *   ESTORNAR O PAGAMENTO INTEIRO E LANÇAR O USADO DE NOVO, na forma que ela
 *   escolher. No cartão (crédito e débito) o parcial não existe (r2-fin-03:
 *   "estornar no cartão estorna a venda inteira, todas as operadoras fazem
 *   assim").
 * - Uma transação (`pacote_cancelar_devolvendo`). `financial: MANAGE` e a unidade ao alcance.
 *
 * E a venda cancelada sai das Vendas pelo que caiu (o pré-pago com unidade
 * cancelada também).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let deFora: MembroDeTeste | null = null
let outraUnidade = ''
let cliente = ''
let proc = ''
/** 6 sessões de R$ 550 (R$ 3.300); venda 10% para quem vendeu; execução pela regra do profissional (10%). */
let pacote = ''
const NOME = `${PREFIXO} Pacote 6 lasers ${marca}`
const n = (v: unknown) => Number(v ?? 0)
const centavos = (v: number) => Math.round(v * 100) / 100
const amanha = () => new Date(Date.now() + 2 * 86_400_000).toISOString()
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function vender(lancamentos: unknown[]) {
  const { data, error } = await db().rpc('pacote_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacote, p_unidade: rede!.branchId, p_ator: gestor!.userId,
    p_lancamentos: lancamentos, p_sessoes: Array.from({ length: 6 }, () => ({ procedure_id: proc, preco: 550 })),
  })
  expect(error, 'vender o pacote').toBeNull()
  return data as string
}
const soma = (linhas: { amount: unknown }[] | null) => centavos((linhas ?? []).reduce((s, c) => s + n(c.amount), 0))
async function devidoDaVenda(cp: string) {
  const { data: l, error } = await db().from('commission_lines').select('id')
    .eq('client_package_id', cp).is('appointment_id', null).single()
  expect(error, 'a linha da venda').toBeNull()
  return soma((await db().from('commissions').select('amount').eq('line_id', l!.id)).data)
}
async function devidoDasSessoes(aps: string[]) {
  return soma((await db().from('commissions').select('amount').in('appointment_id', aps)).data)
}
async function atendimento(extra: Record<string, unknown> = {}) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 550, status: 'IN_PROGRESS', source: 'INTERNAL', ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o atendimento').toBeNull()
  return data!.id
}
async function ligar(cp: string, numero: number, ap: string) {
  expect((await db().from('package_sessions').update({ appointment_id: ap })
    .eq('client_package_id', cp).eq('session_number', numero)).error).toBeNull()
}
/** Uma sessão do pacote feita (concluída pelo banco, como a tela faz). */
async function sessaoFeita(cp: string, numero: number) {
  const ap = await atendimento()
  await ligar(cp, numero, ap)
  const { error } = await db().rpc('concluir_atendimento', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem: 'PACOTE', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 550 }] },
  })
  expect(error, 'concluir').toBeNull()
  return ap
}
/** Uma sessão agendada para depois de amanhã. */
async function sessaoAgendada(cp: string, numero: number) {
  const ap = await atendimento({ status: 'SCHEDULED', scheduled_at: amanha() })
  await ligar(cp, numero, ap)
  return ap
}
async function sessoes(cp: string) {
  const { data } = await db().from('package_sessions').select('session_number, status, appointment_id')
    .eq('client_package_id', cp).order('session_number')
  return (data ?? []).map(s => s.status as string)
}
async function lancamentos(cp: string) {
  const { data } = await db().from('financial_transactions').select('id, amount, is_paid, notes, parcela_numero, category, type')
    .eq('client_package_id', cp).order('created_at').order('parcela_numero', { nullsFirst: true })
  return data ?? []
}
async function credito() {
  return soma(((await db().from('internal_credits').select('amount').eq('client_id', cliente)).data ?? []))
}
async function pontos() {
  const { data: conta } = await db().from('loyalty_accounts').select('id').eq('client_id', cliente).maybeSingle()
  if (!conta) return 0
  const { data } = await db().from('loyalty_transactions').select('points').eq('loyalty_account_id', conta.id)
  return (data ?? []).reduce((s, l) => s + n(l.points), 0)
}
async function vendasDoDia() {
  const dia = hoje()
  const { data, error } = await db().rpc('metrics_vendas', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: `${dia}T00:00:00-03:00`, p_to: `${dia}T23:59:59-03:00`,
  })
  expect(error).toBeNull()
  return (data ?? []) as { id: string; tipo: string; valor: number }[]
}
async function resumo(quem: string) {
  const { data, error } = await db().rpc('comissoes_resumo', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_inicio: new Date(Date.now() - 86_400_000).toISOString(),
    p_fim: new Date(Date.now() + 86_400_000).toISOString(), p_profissional: quem,
  })
  expect(error).toBeNull()
  const r = (data as Record<string, unknown>[]).find(x => x.professional_id === quem)
  return { aPagar: n(r?.a_pagar), aguardando: n(r?.aguardando) }
}

async function abrirCancelamento(p: Page) {
  await p.goto(`/admin/clients/${cliente}`)
  await p.getByRole('button', { name: 'Cancelar pacote' }).first().click()
  const dlg = p.getByRole('dialog', { name: 'Cancelar pacote' })
  await expect(dlg.locator('[data-conta-do-cancelamento]')).toBeVisible()
  return dlg
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pcan${marca}`)
  proc = rede.procedureId
  expect((await db().from('procedures').update({ name: `${PREFIXO} Laser ${marca}`, price: 550 }).eq('id', proc)).error).toBeNull()
  cliente = await rede.criarCliente('Desistiu do pacote')
  await responderAnamnese(cliente, rede.tenantId)
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })).error).toBeNull()
  // A fidelidade ligada, 1 ponto por real pago.
  expect((await db().from('loyalty_configs').upsert({ tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 }, { onConflict: 'tenant_id' })).error).toBeNull()
  const { data: b2, error: eB2 } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Outra unidade ${marca}`, slug: `e2e-pcan2-${marca}` }).select('id').single<{ id: string }>()
  expect(eB2).toBeNull()
  outraUnidade = b2!.id
  const tudo = [
    { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
    { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
  ] as const
  gestor = await criarMembro(`pcang${marca}`, { tenant: rede.tenantId, rotulo: 'Gestão', permissoes: [...tudo] })
  soVe = await criarMembro(`pcanv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro só vê',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  deFora = await criarMembro(`pcanf${marca}`, { tenant: rede.tenantId, rotulo: 'Gestão da outra unidade', branchId: outraUnidade, permissoes: [...tudo] })
  const { data, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: NOME, p_preco: 3300, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: proc, quantity: 6 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 10 }, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(error, 'criar o pacote').toBeNull()
  pacote = data as string
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    const rl = await b.from('commission_lines').delete().eq('tenant_id', rede.tenantId)
    if (rl.error) falhas.push(`comissão: ${rl.error.message}`)
    const { data: cps } = await b.from('client_packages').select('id').eq('client_id', cliente)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      const r1 = await b.from('package_sessions').delete().in('client_package_id', ids)
      if (r1.error) falhas.push(`sessões: ${r1.error.message}`)
      const r2 = await b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
      if (r2.error) falhas.push(`lançamentos: ${r2.error.message}`)
      const r3 = await b.from('client_packages').delete().in('id', ids)
      if (r3.error) falhas.push(`pacotes do cliente: ${r3.error.message}`)
    }
    const r4 = await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
    if (r4.error) falhas.push(`pacotes: ${r4.error.message}`)
    const { data: vendas } = await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)
    const vIds = (vendas ?? []).map(v => v.id as string)
    if (vIds.length) {
      await b.from('financial_transactions').update({ procedure_sale_id: null }).in('procedure_sale_id', vIds)
      const r5 = await b.from('procedure_sale_units').delete().in('sale_id', vIds)
      if (r5.error) falhas.push(`unidades pré-pagas: ${r5.error.message}`)
      const r6 = await b.from('procedure_sales').delete().in('id', vIds)
      if (r6.error) falhas.push(`pré-pagos: ${r6.error.message}`)
    }
  }
  await gestor?.limpar(); await soVe?.limpar(); await deFora?.limpar()
  if (outraUnidade) await db().from('branches').delete().eq('id', outraUnidade)
  if (rede) await db().from('commission_configs').delete().eq('tenant_id', rede.tenantId)
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('cancelar pacote', () => {
  test('pela ficha: 6 sessões, 2 feitas, no Pix — cancelar com crédito na clínica e cancelar o agendamento', async ({ browser }) => {
    const cp = await vender([{ amount: 3300, payment_method: 'PIX', is_paid: true }])
    const feitas = [await sessaoFeita(cp, 1), await sessaoFeita(cp, 2)]
    const agendada = await sessaoAgendada(cp, 3)
    expect([await devidoDaVenda(cp), await devidoDasSessoes(feitas)], 'antes: a venda e as duas sessões liberadas').toEqual([330, 110])
    const pontosAntes = await pontos()

    await comSessao(browser, gestor!, async p => {
      const dlg = await abrirCancelamento(p)
      const conta = dlg.locator('[data-conta-do-cancelamento]')
      await expect(conta).toContainText('4 de 6 sessões restantes')
      await expect(conta).toContainText('R$ 2.200,00')
      await expect(conta).toContainText('A devolver')
      await expect(dlg.locator('[data-agendamentos-do-pacote]')).toContainText('1 sessão já agendada')
      await dlg.getByLabel('Motivo do cancelamento *').fill('Mudou de cidade')
      await expect(dlg.getByRole('button', { name: 'Cancelar pacote' }), 'sem dizer como devolver, não cancela').toBeDisabled()
      await dlg.getByRole('radio', { name: /Crédito na clínica/ }).check()
      await expect(dlg.getByRole('button', { name: 'Cancelar pacote' }), 'sem dizer o que fazer com o agendamento, não cancela').toBeDisabled()
      await dlg.getByRole('radio', { name: /Cancelar os agendamentos/ }).check()
      await dlg.getByRole('button', { name: 'Cancelar pacote' }).click()
      await expect(dlg).toBeHidden()

      // A ficha: o pacote saiu do "Tratamento em andamento" e o cancelamento está no histórico.
      await expect(p.getByText('Nenhum pacote ativo.')).toBeVisible()
      await p.getByRole('tab', { name: 'Histórico' }).click()
      await expect(p.getByText(`Pacote cancelado: ${NOME}`)).toBeVisible()
    })

    expect(await sessoes(cp)).toEqual(['USED', 'USED', 'CANCELLED', 'CANCELLED', 'CANCELLED', 'CANCELLED'])
    const { data: ag } = await db().from('appointments').select('status, cancellation_reason').eq('id', agendada).single()
    expect(ag!.status).toBe('CANCELLED')
    expect(ag!.cancellation_reason).toContain('Mudou de cidade')
    const { data: cpLido } = await db().from('client_packages').select('cancelado_em, valor_cancelado, cancelamento_motivo').eq('id', cp).single()
    expect({ cancelado: !!cpLido!.cancelado_em, valor: n(cpLido!.valor_cancelado), motivo: cpLido!.cancelamento_motivo })
      .toEqual({ cancelado: true, valor: 2200, motivo: 'Mudou de cidade' })
    expect(await credito(), 'os R$ 2.200 viram crédito na clínica').toBe(2200)
    const txs = await lancamentos(cp)
    expect(txs.map(t => ({ v: n(t.amount), pago: t.is_paid, notes: t.notes })), 'o dinheiro fica: virou crédito')
      .toEqual([{ v: 3300, pago: true, notes: null }])
    expect(await pontos(), 'crédito não mexe nos pontos: o dinheiro não voltou').toBe(pontosAntes)
    expect(await devidoDaVenda(cp), 'a comissão de venda volta na proporção: 10% de R$ 1.100').toBe(110)
    expect(await devidoDasSessoes(feitas), 'a de execução das feitas fica').toBe(110)
    const venda = (await vendasDoDia()).find(v => v.id === cp)
    expect(n(venda?.valor), 'nas Vendas, o pacote vale o que foi usado').toBe(1100)

    // Não se cancela duas vezes.
    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'cancelarPacote', `/admin/clients/${cliente}`,
        [cp, { motivo: 'De novo', destino: 'CREDITO', agendamentos: 'CANCELAR', esperado: 0 }])
      expect(r.texto).toMatch(/já foi cancelado/i)
    })
  })

  test('entrada de R$ 2.000 + 2 × R$ 650 a receber: as parcelas caem, o que passou do usado volta pelo estorno, e o agendamento fica avulso', async ({ browser }) => {
    const cp = await vender([
      { amount: 2000, payment_method: 'PIX', is_paid: true },
      ...[1, 2].map(i => ({ amount: 650, payment_method: 'PIX', is_paid: false, parcela_numero: i, parcela_total: 2 })),
    ])
    const feitas = [await sessaoFeita(cp, 1), await sessaoFeita(cp, 2)]
    const agendada = await sessaoAgendada(cp, 3)
    const pontosAntes = await pontos()

    await comSessao(browser, gestor!, async p => {
      const dlg = await abrirCancelamento(p)
      const conta = dlg.locator('[data-conta-do-cancelamento]')
      // A conta na tela: usado R$ 1.100; pago R$ 2.000 + a receber R$ 1.300.
      await expect(conta).toContainText('Parcelas a receber que caem')
      await expect(conta).toContainText('R$ 1.300,00')
      await expect(conta.locator('[data-a-devolver]')).toContainText('R$ 900,00')
      await dlg.getByLabel('Motivo do cancelamento *').fill('Não gostou do resultado')
      await dlg.getByRole('radio', { name: /^Estorno —/ }).check()
      // O que volta (R$ 900) é menor que a entrada de R$ 2.000: a recepção escolhe como estornar.
      await expect(dlg.getByRole('button', { name: 'Cancelar pacote' }), 'sem dizer como estornar a entrada, não cancela').toBeDisabled()
      await dlg.getByRole('radio', { name: /Estorno parcial/ }).check()
      await dlg.getByRole('radio', { name: /Manter como avulso/ }).check()
      await dlg.getByRole('button', { name: 'Cancelar pacote' }).click()
      await expect(dlg).toBeHidden()
    })

    const txs = await lancamentos(cp)
    expect(txs.map(t => ({ v: n(t.amount), pago: t.is_paid, notes: t.notes })), 'a entrada fica com o usado; as duas parcelas caem')
      .toEqual([
        { v: 1100, pago: true, notes: null },
        { v: 650, pago: false, notes: 'Estornada' },
        { v: 650, pago: false, notes: 'Estornada' },
      ])
    const { data: estorno } = await db().from('financial_transactions').select('amount, type, payment_method, estorno_motivo')
      .eq('client_id', cliente).eq('category', 'Estorno').order('created_at', { ascending: false }).limit(1).single()
    expect({ v: n(estorno!.amount), tipo: estorno!.type, forma: estorno!.payment_method, motivo: estorno!.estorno_motivo })
      .toEqual({ v: 900, tipo: 'EXPENSE', forma: 'PIX', motivo: 'Não gostou do resultado' })
    expect(await pontos(), 'os pontos dos R$ 900 estornados saem').toBe(pontosAntes - 900)
    expect(await devidoDaVenda(cp), 'quitado pelo que ficou: 10% de R$ 1.100').toBe(110)
    expect(await devidoDasSessoes(feitas)).toBe(110)

    const { data: ag } = await db().from('appointments').select('status, price').eq('id', agendada).single()
    expect({ status: ag!.status, preco: n(ag!.price) }, 'o agendamento fica, como avulso').toEqual({ status: 'SCHEDULED', preco: 550 })
    const { data: s3 } = await db().from('package_sessions').select('status, appointment_id').eq('client_package_id', cp).eq('session_number', 3).single()
    expect(s3).toEqual({ status: 'CANCELLED', appointment_id: null })
  })

  test('entrada de R$ 300 + 3 × R$ 1.000: a parcela que passa do usado diminui, e a comissão prevista acompanha até a última entrar', async ({ browser }) => {
    const cp = await vender([
      { amount: 300, payment_method: 'PIX', is_paid: true },
      ...[1, 2, 3].map(i => ({ amount: 1000, payment_method: 'PIX', is_paid: false, parcela_numero: i, parcela_total: 3 })),
    ])
    const feitas = [await sessaoFeita(cp, 1), await sessaoFeita(cp, 2)]
    const antesGestor = await resumo(gestor!.userId)
    const antesProf = await resumo(rede!.professionalId)

    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      const previa = await chamarAcao(p, 'actions/pacotes.ts', 'previaDoCancelamentoDoPacote', `/admin/clients/${cliente}`, [cp])
      expect(previa.texto).toMatch(/"devolver":0/)
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'cancelarPacote', `/admin/clients/${cliente}`,
        [cp, { motivo: 'Desistiu', destino: null, agendamentos: null, esperado: 0 }])
      expect(r.texto).toMatch(/"ok":true/)
    })

    const txs = await lancamentos(cp)
    expect(txs.map(t => ({ v: n(t.amount), pago: t.is_paid, notes: t.notes })), 'cai R$ 2.200: a 3ª e a 2ª inteiras, e a 1ª fica com R$ 800')
      .toEqual([
        { v: 300, pago: true, notes: null },
        { v: 800, pago: false, notes: null },
        { v: 1000, pago: false, notes: 'Estornada' },
        { v: 1000, pago: false, notes: 'Estornada' },
      ])
    expect(await credito(), 'nada a devolver: o crédito não muda').toBe(2200)
    expect([await devidoDaVenda(cp), await devidoDasSessoes(feitas)], 'ainda aguarda o integral').toEqual([0, 0])
    const depoisGestor = await resumo(gestor!.userId)
    const depoisProf = await resumo(rede!.professionalId)
    expect(centavos(antesGestor.aguardando - depoisGestor.aguardando), 'a venda prevista cai de R$ 330 para R$ 110').toBe(220)
    expect(depoisProf.aguardando, 'a execução prevista das feitas fica').toBe(antesProf.aguardando)

    // A última parcela que ficou entra: libera a venda (sobre o usado) e as sessões.
    const parcela = txs.find(t => !t.is_paid && !t.notes)!
    expect((await db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', parcela.id)).error).toBeNull()
    expect([await devidoDaVenda(cp), await devidoDasSessoes(feitas)]).toEqual([110, 110])
  })

  test('Pix de R$ 3.300, 2 feitas: "estornar o pagamento inteiro e lançar o usado de novo" — o Pix volta inteiro e R$ 1.100 entram no Pix de novo (r2-ven-05)', async ({ browser }) => {
    const cp = await vender([{ amount: 3300, payment_method: 'PIX', is_paid: true }])
    const feitas = [await sessaoFeita(cp, 1), await sessaoFeita(cp, 2)]
    const pontosAntes = await pontos()

    await comSessao(browser, gestor!, async p => {
      const dlg = await abrirCancelamento(p)
      await dlg.getByLabel('Motivo do cancelamento *').fill('Vai viajar')
      await dlg.getByRole('radio', { name: /^Estorno —/ }).check()
      const como = dlg.locator('[data-como-estornar]')
      await expect(como).toContainText('Pix de R$ 3.300,00')
      await expect(como.getByRole('radio', { name: /Estorno parcial/ }), 'no Pix, as duas formas').toBeEnabled()
      await como.getByRole('radio', { name: /Estornar o pagamento inteiro e lançar o usado de novo/ }).check()
      await expect(como).toContainText('R$ 1.100,00')
      await como.getByLabel('Forma do pagamento do usado').selectOption('PIX')
      await dlg.getByRole('button', { name: 'Cancelar pacote' }).click()
      await expect(dlg).toBeHidden()
    })

    const txs = await lancamentos(cp)
    expect(txs.map(t => ({ v: n(t.amount), pago: t.is_paid, notes: t.notes })), 'o Pix estornado inteiro, e o usado lançado de novo')
      .toEqual([{ v: 3300, pago: true, notes: 'Estornada' }, { v: 1100, pago: true, notes: null }])
    const novo = (await db().from('financial_transactions').select('payment_method, cartao_vezes, type').eq('id', txs[1]!.id).single()).data
    expect(novo).toEqual({ payment_method: 'PIX', cartao_vezes: null, type: 'INCOME' })
    const { data: estorno } = await db().from('financial_transactions').select('amount, payment_method')
      .eq('client_id', cliente).eq('category', 'Estorno').order('created_at', { ascending: false }).limit(1).single()
    expect({ v: n(estorno!.amount), forma: estorno!.payment_method }, 'o estorno é do Pix inteiro').toEqual({ v: 3300, forma: 'PIX' })
    expect(await pontos(), 'saem os pontos dos R$ 3.300 e entram os dos R$ 1.100').toBe(pontosAntes - 3300 + 1100)
    expect(await devidoDaVenda(cp), 'a comissão de venda: 10% do usado, liberada').toBe(110)
    expect(await devidoDasSessoes(feitas)).toBe(110)
    expect(n((await vendasDoDia()).find(v => v.id === cp)?.valor), 'nas Vendas, o usado').toBe(1100)
    const { data: cpLido } = await db().from('client_packages').select('cancelamento').eq('id', cp).single()
    expect((cpLido!.cancelamento as Record<string, unknown>).estorno).toBe('INTEIRO')
  })

  test('no cartão (crédito 3x) o estorno parcial fica desligado com o motivo, e o banco o recusa (r2-fin-03)', async ({ browser }) => {
    const cp = await vender([{ amount: 3300, payment_method: 'CREDIT_CARD', is_paid: true, cartao_vezes: 3 }])
    await sessaoFeita(cp, 1)
    await sessaoFeita(cp, 2)
    const [venda] = await lancamentos(cp)

    // Pelo banco: sem escolher, ou escolhendo o parcial no cartão, recusa.
    const args = { p_tenant: rede!.tenantId, p_pacote: cp, p_ator: gestor!.userId, p_ator_nome: 'e2e', p_motivo: 'teste', p_destino: 'ESTORNO', p_agendamentos: null, p_esperado: 2200, p_simular: false }
    for (const extra of [{}, { p_estorno: 'PARCIAL', p_novo: null }]) {
      const fn = Object.keys(extra).length ? 'pacote_cancelar_devolvendo' : 'pacote_cancelar'
      const { error } = await db().rpc(fn, { ...args, ...extra })
      expect(error?.message, `${fn} ${JSON.stringify(extra)}`).toMatch(/No cartão, o estorno é do pagamento inteiro/)
    }
    expect((await db().from('client_packages').select('cancelado_em').eq('id', cp).single()).data!.cancelado_em).toBeNull()

    await comSessao(browser, gestor!, async p => {
      const dlg = await abrirCancelamento(p)
      await dlg.getByLabel('Motivo do cancelamento *').fill('Desistiu')
      await dlg.getByRole('radio', { name: /^Estorno —/ }).check()
      const como = dlg.locator('[data-como-estornar]')
      await expect(como).toContainText('Crédito 3x de R$ 3.300,00')
      await expect(como.getByRole('radio', { name: /Estorno parcial/ })).toBeDisabled()
      await expect(como).toContainText('No cartão, a operadora estorna o pagamento inteiro')
      await expect(como.getByRole('radio', { name: /Estornar o pagamento inteiro e lançar o usado de novo/ }), 'no cartão, já vem escolhido').toBeChecked()
      await como.getByLabel('Forma do pagamento do usado').selectOption('PIX')
      await dlg.getByRole('button', { name: 'Cancelar pacote' }).click()
      await expect(dlg).toBeHidden()
    })
    const txs = await lancamentos(cp)
    expect(txs.map(t => ({ v: n(t.amount), notes: t.notes }))).toEqual([{ v: 3300, notes: 'Estornada' }, { v: 1100, notes: null }])
    // As 3 parcelas da operadora caem juntas (nenhuma tinha vencido).
    const { data: rec } = await db().from('recebiveis_do_cartao').select('cancelada_em').eq('transaction_id', venda!.id)
    expect((rec ?? []).map(r => r.cancelada_em != null)).toEqual([true, true, true])
  })

  test('quem só vê o financeiro, e quem é de outra unidade, não cancela — nada muda', async ({ browser }) => {
    const cp = await vender([{ amount: 3300, payment_method: 'PIX', is_paid: true }])
    for (const quem of [soVe!, deFora!]) {
      await comSessao(browser, quem, async p => {
        await p.goto(`/admin/clients/${cliente}`)
        const r = await chamarAcao(p, 'actions/pacotes.ts', 'cancelarPacote', `/admin/clients/${cliente}`,
          [cp, { motivo: 'Tentativa', destino: 'CREDITO', agendamentos: null, esperado: 3300 }])
        expect(r.texto).not.toMatch(/"ok":true/)
      })
    }
    // Quem só vê nem vê o botão.
    await comSessao(browser, soVe!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await expect(p.getByText('TRATAMENTO EM ANDAMENTO')).toBeVisible()
      await expect(p.getByRole('button', { name: 'Cancelar pacote' })).toHaveCount(0)
    })
    const { data } = await db().from('client_packages').select('cancelado_em').eq('id', cp).single()
    expect(data!.cancelado_em).toBeNull()
    expect(await sessoes(cp)).toEqual(Array(6).fill('AVAILABLE'))
  })

  test('o pré-pago com unidade cancelada vale menos nas Vendas', async () => {
    const { data: v, error } = await db().rpc('procedimento_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_procedimento: proc, p_unidade: rede!.branchId,
      p_ator: null, p_quantidade: 3, p_desconto: 0, p_validade_dias: null,
      p_lancamentos: [{ amount: 1650, payment_method: 'PIX', is_paid: true }],
      p_unidades: Array.from({ length: 3 }, () => ({ preco: 550 })),
    })
    expect(error).toBeNull()
    const { data: us } = await db().from('procedure_sale_units').select('id').eq('sale_id', v as string).order('numero')
    expect((await db().rpc('procedimento_cancelar_unidade', { p_tenant: rede!.tenantId, p_unidade: us![2]!.id, p_ator: null, p_motivo: 'e2e' })).error).toBeNull()
    expect(n((await vendasDoDia()).find(x => x.id === v)?.valor)).toBe(1100)
  })
})
