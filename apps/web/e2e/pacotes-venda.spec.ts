import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarClientes } from './apoio/limpeza'

/**
 * Pacotes (2026-09-30): o catálogo em Procedimentos, a venda na ficha do
 * cliente (`pacote_vender`: pacote, sessões e dinheiro numa transação) e a
 * comissão da sessão de pacote no modo "quando o cliente paga", liberada na
 * proporção do que o pacote recebeu. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let cliente = ''
let pacoteId = ''
let vendido = ''
let procB = ''
const conversas: string[] = []
/** O cliente que a tela cadastra no "Vender pacote" de quem ainda não é cliente. */
let cadastrado = ''
const NOME = `${PREFIXO} Pacote ${marca}`

test.beforeAll(async () => {
  rede = await criarOutraRede(`pv${marca}`)
  cliente = await rede.criarCliente('Pacote')
  // Um pacote é um conjunto de procedimentos: A (tabela R$ 300) e B (R$ 100).
  await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)
  const { data: b, error: eB } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Proc B ${marca}`, category: 'e2e', duration_min: 45, price: 100,
  }).select('id').single<{ id: string }>()
  expect(eB).toBeNull()
  procB = b!.id
  await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)
  const { error: eR } = await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })
  expect(eR).toBeNull()
  await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, modo: 'PAGAMENTO' }, { onConflict: 'tenant_id' })
  gestor = await criarMembro(`pvg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção e gestão',
    permissoes: [
      { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'VIEW' },
      { modulo: 'crm', nivel: 'MANAGE' },
    ],
  })
  soVe = await criarMembro(`pvv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê procedimentos',
    permissoes: [{ modulo: 'procedures', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await apagarConversas(conversas)
  if (cadastrado) {
    // Cadastrar pela tela cria o login do cliente: sai junto.
    const { data: c } = await db().from('clients').select('auth_id').eq('id', cadastrado).maybeSingle()
    const ids = ((await db().from('client_packages').select('id').eq('client_id', cadastrado)).data ?? []).map(x => x.id as string)
    if (ids.length) {
      await db().from('package_sessions').delete().in('client_package_id', ids)
      await db().from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
      await db().from('client_packages').delete().in('id', ids)
    }
    const falhas = await apagarClientes([cadastrado])
    if (c?.auth_id) await db().auth.admin.deleteUser(c.auth_id as string)
    expect(falhas).toEqual([])
  }
  if (soVe) await soVe.limpar()
  if (gestor) await gestor.limpar()
  if (rede) {
    const b = db()
    const falhas: string[] = []
    const { data: cps } = await b.from('client_packages').select('id').eq('client_id', cliente)
    const ids = (cps ?? []).map(c => c.id as string)
    // O pacote vendido aponta o do catálogo, que aponta o procedimento: sai
    // tudo antes do limpar() da rede (que apaga os procedimentos).
    if (ids.length) {
      const r = await b.from('package_sessions').delete().in('client_package_id', ids)
      if (r.error) falhas.push(r.error.message)
      await b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
      await b.from('commission_lines').update({ client_package_id: null }).in('client_package_id', ids)
      const r1 = await b.from('client_packages').delete().in('id', ids)
      if (r1.error) falhas.push(r1.error.message)
    }
    const r2 = await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
    if (r2.error) falhas.push(r2.error.message)
    await rede.limpar()
    expect(falhas).toEqual([])
  }
})

/** CPF com dígito verificador válido, a partir do relógio (o CPF é único por rede). */
function cpfDeTeste(): string {
  const base = String(Date.now()).slice(-9).split('').map(Number)
  const dv = (nums: number[]) => {
    const soma = nums.reduce((s, n, i) => s + n * (nums.length + 1 - i), 0)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  return [...base, d1, dv([...base, d1])].join('')
}

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const devido = async (ap: string) => ((await db().from('commissions').select('amount').eq('appointment_id', ap)).data ?? [])
  .reduce((s, c) => Math.round((s + Number(c.amount)) * 100) / 100, 0)

test.describe.serial('pacotes — catálogo, venda e comissão', () => {
  test('catálogo: cria um pacote em Vendas → Pacotes; quem só vê não grava', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      await p.goto('/admin/pacotes')
      const card = p.locator('[aria-label="Pacotes"]')
      await card.getByRole('button', { name: 'Novo pacote' }).click()
      await card.getByLabel('Nome do pacote').fill(NOME)
      await card.getByLabel('Procedimento 1', { exact: true }).selectOption(rede!.procedureId)
      await card.getByLabel('Sessões do procedimento 1').fill('2')
      await card.getByRole('button', { name: 'Adicionar procedimento' }).click()
      await card.getByLabel('Procedimento 2', { exact: true }).selectOption(procB)
      await card.getByLabel('Sessões do procedimento 2').fill('2')
      await expect(card).toContainText('4 sessões no pacote · avulsas sairiam por R$ 800,00')
      await card.getByLabel('Preço do pacote').fill('800')
      await card.getByLabel('Validade do pacote').fill('90')
      await card.getByRole('button', { name: 'Salvar pacote' }).click()
      await expect(card).toContainText(NOME)
      await expect(card).toContainText(`2× ${PREFIXO} Proc pv${marca} + 2× ${PREFIXO} Proc B ${marca}`)
    })
    const { data } = await db().from('service_packages').select('id, total_sessions, price, validity_days, branch_id, is_active')
      .eq('tenant_id', rede!.tenantId).eq('name', NOME).single()
    expect({ ...data, price: Number(data!.price), id: undefined }).toEqual({
      id: undefined, total_sessions: 4, price: 800, validity_days: 90, branch_id: null, is_active: true,
    })
    pacoteId = data!.id as string
    const { data: itens } = await db().from('service_package_items').select('procedure_id, quantity').eq('package_id', pacoteId).order('sort_order')
    expect((itens ?? []).map(i => [i.procedure_id, i.quantity])).toEqual([[rede!.procedureId, 2], [procB, 2]])

    await comSessao(browser, soVe!, async p => {
      await p.goto('/admin/pacotes')
      await expect(p.locator('[aria-label="Pacotes"]').getByRole('button', { name: 'Novo pacote' })).toHaveCount(0)
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'salvarPacote', '/admin/pacotes',
        [{ name: `${PREFIXO} Invasor ${marca}`, itens: [{ procedure_id: rede!.procedureId, quantity: 3 }], price: 1, validity_days: null, is_active: true }])
      expect(r.texto).not.toContain('"ok":true')
    })
    const { count } = await db().from('service_packages').select('id', { count: 'exact', head: true }).eq('tenant_id', rede!.tenantId)
    expect(count).toBe(1)
  })

  test('venda na ficha: entrada + parcelas; as sessões nascem; o dinheiro fica separado', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await p.getByRole('button', { name: 'Vender pacote' }).click()
      const dlg = p.getByRole('dialog', { name: 'Vender pacote' })
      await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacoteId)
      await expect(dlg.locator('[data-resumo-do-pacote]')).toContainText('4 sessões')
      await dlg.getByRole('button', { name: 'Entrada + parcelas' }).click()
      await dlg.getByLabel('Entrada').fill('100')
      await dlg.getByLabel('Parcelas').selectOption('3')
      await dlg.getByRole('button', { name: /Vender por/ }).click()
      await expect.poll(async () => (await db().from('client_packages').select('id').eq('client_id', cliente)).data?.length,
        { message: 'a venda grava' }).toBe(1)
    })

    const { data: cp } = await db().from('client_packages').select('id, price, total_sessions, used_sessions, expires_at').eq('client_id', cliente).single()
    vendido = cp!.id as string
    expect([Number(cp!.price), cp!.total_sessions, cp!.used_sessions, !!cp!.expires_at]).toEqual([800, 4, 0, true])
    // Cada sessão com o SEU procedimento e a sua parte do preço: R$ 800 pelo
    // preço de tabela (300, 300, 100, 100).
    const { data: sessoes } = await db().from('package_sessions').select('status, session_number, procedure_id, preco').eq('client_package_id', vendido).order('session_number')
    expect((sessoes ?? []).map(s => [s.session_number, s.status, s.procedure_id, Number(s.preco)])).toEqual([
      [1, 'AVAILABLE', rede!.procedureId, 300], [2, 'AVAILABLE', rede!.procedureId, 300],
      [3, 'AVAILABLE', procB, 100], [4, 'AVAILABLE', procB, 100],
    ])
    const { data: txs } = await db().from('financial_transactions').select('id, amount, is_paid, installments(amount)')
      .eq('client_package_id', vendido).order('is_paid', { ascending: false })
    expect((txs ?? []).map(t => [Number(t.amount), t.is_paid, (t.installments as { amount: number }[]).length])).toEqual([[100, true, 0], [700, false, 3]])
  })

  test('comissão da sessão, quando o cliente paga: na proporção do que o pacote recebeu', async ({ browser }) => {
    // A primeira sessão, agendada com um preço "do navegador" que não é a base.
    const { data: ap } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 999, status: 'IN_PROGRESS', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    await db().from('package_sessions').update({ appointment_id: ap!.id }).eq('client_package_id', vendido).eq('session_number', 1)

    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/agenda/${ap!.id}`)
      await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
      await p.locator('textarea[name="notes"]').fill(`${PREFIXO} sessão 1`)
      await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
      await expect.poll(async () => (await db().from('appointments').select('status').eq('id', ap!.id).single()).data?.status,
        { timeout: 20_000 }).toBe('COMPLETED')
    })
    const { data: linha } = await db().from('commission_lines').select('origem, preco, client_package_id').eq('appointment_id', ap!.id).single()
    expect({ ...linha, preco: Number(linha!.preco) }).toEqual({ origem: 'PACOTE', preco: 300, client_package_id: vendido })
    // A parte da sessão (300) × 10% = 30; recebido 100 de 800 → 3,75.
    expect(await devido(ap!.id)).toBe(3.75)

    // O saldo é pago (baixa no financeiro): completa.
    const { data: saldo } = await db().from('financial_transactions').select('id').eq('client_package_id', vendido).eq('is_paid', false).single()
    await db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', saldo!.id)
    expect(await devido(ap!.id)).toBe(30)

    // Estornar a entrada volta à proporção do que sobrou: 700 de 800 → 26,25.
    const { data: entrada } = await db().from('financial_transactions').select('id').eq('client_package_id', vendido).eq('amount', 100).single()
    expect((await db().rpc('estornar_transacao', { p_transacao: entrada!.id, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
    expect(await devido(ap!.id)).toBe(26.25)
  })

  test('recusas: pagamento que não fecha, forma inválida e a sessão pelo PostgREST', async ({ browser }) => {
    const naoFecha = await db().rpc('pacote_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacoteId, p_unidade: rede!.branchId, p_ator: null,
      p_lancamentos: [{ amount: 350, payment_method: 'PIX', is_paid: true }],
    })
    expect(naoFecha.error?.message).toMatch(/não fecha/)
    const naoBate = await db().rpc('pacote_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacoteId, p_unidade: rede!.branchId, p_ator: null,
      p_lancamentos: [{ amount: 800, payment_method: 'PIX', is_paid: true }],
      p_sessoes: [1, 2, 3, 4].map(() => ({ procedure_id: rede!.procedureId, preco: 200 })),
    })
    expect(naoBate.error?.message).toMatch(/não batem/)

    await comSessao(browser, gestor!, async p => {
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/admin/clients/${cliente}`,
        [cliente, pacoteId, rede!.branchId, { forma: 'AVISTA', metodo: 'BITCOIN' }])
      expect(r.texto).not.toContain('clientPackageId')

      // A sessão 3 é de B: agendá-la como A é recusado no servidor.
      const { data: s3 } = await db().from('package_sessions').select('id').eq('client_package_id', vendido).eq('session_number', 3).single()
      const outro = await chamarAcao(p, 'actions/appointments.ts', 'schedulePackageSession', `/admin/clients/${cliente}`, [{
        packageSessionId: s3!.id, branchId: rede!.branchId, professionalId: rede!.professionalId,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), clientId: cliente,
        procedureId: rede!.procedureId, price: 1, durationMin: 30, slug: '',
      }])
      expect(outro.texto).toContain('outro procedimento')
    })
    await comSessao(browser, soVe!, async p => {
      // Quem não recebe dinheiro não vende.
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/admin/clients/${cliente}`,
        [cliente, pacoteId, rede!.branchId, { forma: 'AVISTA', metodo: 'PIX' }])
      expect(r.texto).not.toContain('clientPackageId')
    })

    const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${gestor!.accessToken}` } },
    })
    const cp = await api.from('client_packages').insert({
      client_id: cliente, package_id: pacoteId, branch_id: rede!.branchId, total_sessions: 10, used_sessions: 0,
    }).select('id')
    expect(cp.error, 'sessão de graça pela chave pública').not.toBeNull()
    const sp = await api.from('service_packages').insert({
      tenant_id: rede!.tenantId, procedure_id: rede!.procedureId, name: `${PREFIXO} x`, total_sessions: 2, price: 0,
    }).select('id')
    expect(sp.error).not.toBeNull()
    const upd = await api.from('service_packages').update({ price: 1 }).eq('id', pacoteId).select('id')
    expect(upd.data ?? []).toHaveLength(0)

    const { data: vendas } = await db().from('client_packages').select('id').eq('client_id', cliente)
    expect(vendas).toHaveLength(1)
  })

  test('a receber SEM data: a venda passa e o valor fica em aberto, sem vencimento', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await p.getByRole('button', { name: 'Vender pacote' }).click()
      const dlg = p.getByRole('dialog', { name: 'Vender pacote' })
      await dlg.getByLabel('Pacote', { exact: true }).selectOption(pacoteId)
      await dlg.getByRole('button', { name: 'A receber' }).click()
      await expect(dlg.getByLabel('Vencimento')).toHaveValue('')
      await dlg.getByRole('button', { name: /Vender por/ }).click()
      await expect.poll(async () => (await db().from('client_packages').select('id').eq('client_id', cliente)).data?.length,
        { message: 'a segunda venda grava' }).toBe(2)
    })
    const { data: cp } = await db().from('client_packages').select('id').eq('client_id', cliente).neq('id', vendido).single()
    const { data: txs } = await db().from('financial_transactions').select('amount, is_paid, due_date').eq('client_package_id', cp!.id)
    expect((txs ?? []).map(t => [Number(t.amount), t.is_paid, t.due_date])).toEqual([[800, false, null]])
  })

  test('na conversa: com cliente, "Vender pacote" abre a venda; sem cliente, cadastra e depois vende', async ({ browser }) => {
    const conversa = async (linha: Record<string, unknown>) => {
      const { data, error } = await db().from('conversations').insert({
        tenant_id: rede!.tenantId, status: 'open', channel: 'whatsapp', provider: 'uazapi',
        last_message_at: new Date().toISOString(), last_message: 'oi', ...linha,
      }).select('id').single<{ id: string }>()
      expect(error, 'criar a conversa').toBeNull()
      conversas.push(data!.id)
      return data!.id
    }
    const comCliente = await conversa({ contact_name: `${PREFIXO} Conversa cliente ${marca}`, contact_phone: '5548911110001', client_id: cliente })
    const semCliente = await conversa({ contact_name: `${PREFIXO} Conversa sem ficha ${marca}`, contact_phone: '5548911110002' })

    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/inbox?c=${comCliente}`)
      const vender = p.getByRole('button', { name: 'Vender pacote' })
      await expect(vender).toBeVisible()
      await vender.click()
      const dlg = p.getByRole('dialog', { name: 'Vender pacote' })
      await expect(dlg.getByLabel('Pacote', { exact: true })).toBeVisible()
      await dlg.getByRole('button', { name: 'Cancelar' }).click()

      // Sem ficha, o botão aparece do mesmo jeito: primeiro o cadastro...
      await p.goto(`/admin/inbox?c=${semCliente}`)
      await p.getByRole('button', { name: 'Vender pacote' }).click()
      await expect(p.getByText('Para vender o pacote, primeiro o cadastro.')).toBeVisible()
      await p.locator('input[name="email"]').fill(`e2e-pv${marca}@bellaris.invalid`)
      await p.locator('input[name="document"]').fill(cpfDeTeste())
      await p.getByRole('button', { name: 'Cadastrar cliente' }).last().click()

      // ...e a venda abre sozinha, já para o cliente que acabou de nascer.
      const dlg2 = p.getByRole('dialog', { name: 'Vender pacote' })
      await expect(dlg2.getByLabel('Pacote', { exact: true })).toBeVisible({ timeout: 20_000 })
      const { data: novo } = await db().from('conversations').select('client_id').eq('id', semCliente).single()
      expect(novo?.client_id, 'o cadastro liga a conversa ao cliente novo').toBeTruthy()
      cadastrado = novo!.client_id as string
      await dlg2.getByRole('button', { name: /^Vender por/ }).click()
      await expect(dlg2).toBeHidden({ timeout: 15_000 })
      const { data: cp } = await db().from('client_packages').select('id, price').eq('client_id', cadastrado)
      expect((cp ?? []).map(c => Number(c.price))).toEqual([800])
    })
  })
})
