import { test, expect } from '@playwright/test'
import { banco, tenantId, unidadeQueAtende, PREFIXO } from './apoio/banco'
import { capturarAcao, reenviarAcao } from './apoio/acao'
import { apagarClientes } from './apoio/limpeza'

/**
 * O atendimento de ponta a ponta, pela tela: check-in, iniciar, finalizar e
 * receber — e o que cada passo deixa gravado (CLAUDE.md §10).
 *
 * Até 2026-09-27 nenhum teste passava por aqui, e é onde o sistema mais grava
 * de uma vez: status, prontuário, comissão, baixa de insumo e, no pagamento, a
 * receita. O cenário foi montado para exercitar as três decisões daquele dia:
 *
 * - o insumo do procedimento pede 2 e a unidade tem 1 → o atendimento CONCLUI,
 *   a tela AVISA o que faltou e o saldo fica em −1 (não zerado);
 * - pagar com crédito interno sem saldo é RECUSADO, com a mensagem na tela;
 * - uma sessão de PACOTE não se cobra de novo — a mesma chamada de "confirmar
 *   pagamento", reenviada para ela, não lança receita.
 *
 * Fidelidade fica de fora: a rede não tem `loyalty_configs` (não há tela que a
 * crie), então o fechamento não dá ponto nenhum. Lacuna de produto, registrada
 * no DEVLOG — não se liga fidelidade na produção para um teste.
 */

const marca = Date.now().toString(36)
const PRECO = 100

interface Cenario {
  unidade: string; profissional: string; cliente: string
  procedimento: string; produto: string; regra: string
  agendamento: string; pacote: string; agendamentoDoPacote: string
}

test.describe.serial('fechar um atendimento', () => {
  let c: Cenario | null = null

  test.beforeAll(async () => {
    const unidade = await unidadeQueAtende()
    test.skip(!unidade, 'nenhuma unidade com profissional')
    const db = banco()
    const tenant = await tenantId()
    const passo = async <T>(o_que: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
      const { data, error } = await q
      expect(error, o_que).toBeNull()
      return data as T
    }

    const prof = await passo<{ id: string }>('profissional', db.from('users').select('id')
      .eq('branch_id', unidade!.id).eq('provides_services', true).eq('is_active', true).limit(1).single())
    const cli = await passo<{ id: string }>('cliente', db.from('clients')
      .insert({ tenant_id: tenant, branch_id: unidade!.id, name: `${PREFIXO} Cliente atendimento ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
      .select('id').single())
    await db.from('loyalty_accounts').upsert({ client_id: cli.id }, { onConflict: 'client_id' })
    const proc = await passo<{ id: string }>('procedimento', db.from('procedures')
      .insert({ tenant_id: tenant, name: `${PREFIXO} Proc atendimento ${marca}`, category: 'e2e', duration_min: 30, price: PRECO, is_active: true })
      .select('id').single())
    const prod = await passo<{ id: string }>('insumo', db.from('products')
      .insert({ tenant_id: tenant, name: `${PREFIXO} Insumo ${marca}`, unit: 'un', cost_price: 3 })
      .select('id').single())
    // Pede 2; a unidade tem 1 → falta 1.
    await passo('receita do insumo', db.from('procedure_products').insert({ procedure_id: proc.id, product_id: prod.id, quantity: 2 }).select('id').single())
    await passo('saldo do insumo', db.from('branch_product_stock')
      .insert({ product_id: prod.id, branch_id: unidade!.id, current_stock: 1, min_stock: 0 }).select('product_id').single())
    // Regra ESPECÍFICA do procedimento: vence qualquer regra geral do profissional.
    const regra = await passo<{ id: string }>('regra de comissão', db.from('commission_rules')
      .insert({ branch_id: unidade!.id, professional_id: prof.id, procedure_id: proc.id, type: 'PERCENTAGE', value: 10, is_active: true })
      .select('id').single())
    const ag = await passo<{ id: string }>('agendamento', db.from('appointments')
      .insert({
        branch_id: unidade!.id, client_id: cli.id, procedure_id: proc.id, professional_id: prof.id,
        scheduled_at: new Date().toISOString(), duration_min: 30, price: PRECO, status: 'SCHEDULED', source: 'INTERNAL',
      })
      .select('id').single())

    // Uma sessão de pacote, já concluída — alvo do reenvio do pagamento.
    const pac = await passo<{ id: string }>('pacote', db.from('service_packages')
      .insert({ tenant_id: tenant, procedure_id: proc.id, name: `${PREFIXO} Pacote ${marca}`, total_sessions: 5, price: 400 })
      .select('id').single())
    const cp = await passo<{ id: string }>('pacote do cliente', db.from('client_packages')
      .insert({ client_id: cli.id, package_id: pac.id, branch_id: unidade!.id, total_sessions: 5, used_sessions: 1 })
      .select('id').single())
    const agPac = await passo<{ id: string }>('agendamento do pacote', db.from('appointments')
      .insert({
        branch_id: unidade!.id, client_id: cli.id, procedure_id: proc.id, professional_id: prof.id,
        scheduled_at: new Date(Date.now() - 86_400_000).toISOString(), duration_min: 30, price: PRECO,
        status: 'COMPLETED', completed_at: new Date().toISOString(), source: 'INTERNAL',
      })
      .select('id').single())
    await passo('sessão do pacote', db.from('package_sessions')
      .insert({ client_package_id: cp.id, appointment_id: agPac.id, status: 'USED', session_number: 1 }).select('id').single())

    c = {
      unidade: unidade!.id, profissional: prof.id, cliente: cli.id, procedimento: proc.id, produto: prod.id,
      regra: regra.id, agendamento: ag.id, pacote: pac.id, agendamentoDoPacote: agPac.id,
    }
  })

  test.afterAll(async () => {
    if (!c) return
    const db = banco()
    await db.from('package_sessions').delete().eq('appointment_id', c.agendamentoDoPacote)
    await db.from('stock_movements').delete().eq('product_id', c.produto)
    await db.from('domain_events').delete().eq('entidade_id', c.produto)
    const falhas = await apagarClientes([c.cliente])
    await db.from('service_packages').delete().eq('id', c.pacote)
    await db.from('commission_rules').delete().eq('id', c.regra)
    await db.from('procedure_products').delete().eq('procedure_id', c.procedimento)
    await db.from('branch_product_stock').delete().eq('product_id', c.produto)
    await db.from('products').delete().eq('id', c.produto)
    await db.from('domain_events').delete().eq('entidade_id', c.procedimento)
    await db.from('procedures').delete().eq('id', c.procedimento)
    expect(falhas, 'a limpeza tem de apagar tudo que o teste criou').toEqual([])
  })

  test('check-in, iniciar e finalizar — com o insumo em falta avisado', async ({ page }) => {
    const db = banco()
    await page.goto(`/admin/agenda/${c!.agendamento}`)

    await page.getByRole('button', { name: 'Check-in' }).click()
    await expect.poll(async () => (await db.from('appointments').select('status').eq('id', c!.agendamento).single()).data?.status)
      .toBe('CONFIRMED')

    await page.getByRole('button', { name: 'Iniciar atendimento' }).click()
    await expect.poll(async () => (await db.from('appointments').select('status').eq('id', c!.agendamento).single()).data?.status)
      .toBe('IN_PROGRESS')

    await page.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await page.locator('textarea[name="notes"]').fill(`${PREFIXO} observação final`)
    await page.getByRole('button', { name: 'Confirmar conclusão' }).click()

    // Concluiu, e AVISOU: o modal não some calado quando falta insumo.
    const aviso = page.getByRole('alertdialog', { name: /faltou insumo/ })
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText(`${PREFIXO} Insumo ${marca}`)
    await aviso.getByRole('button', { name: 'Entendi' }).click()

    const { data: ag } = await db.from('appointments').select('status, completed_at').eq('id', c!.agendamento).single()
    expect(ag!.status).toBe('COMPLETED')
    expect(ag!.completed_at, 'a conclusão grava quando').not.toBeNull()

    const { data: entrada } = await db.from('medical_record_entries').select('notes').eq('appointment_id', c!.agendamento).single()
    expect(entrada!.notes, 'a observação vai para o prontuário').toBe(`${PREFIXO} observação final`)

    const { data: mov } = await db.from('stock_movements')
      .select('type, quantity, balance_after').eq('appointment_id', c!.agendamento).single()
    expect(mov!.type).toBe('PROCEDURE_USAGE')
    expect(Number(mov!.quantity)).toBe(-2)
    expect(Number(mov!.balance_after), 'o saldo fica NEGATIVO, para a falta aparecer').toBe(-1)
    const { data: saldo } = await db.from('branch_product_stock').select('current_stock')
      .eq('product_id', c!.produto).eq('branch_id', c!.unidade).single()
    expect(Number(saldo!.current_stock)).toBe(-1)

    const { data: com } = await db.from('commissions').select('amount, status, period_ref, professional_id')
      .eq('appointment_id', c!.agendamento).single()
    expect(Number(com!.amount), '10% de R$ 100 pela regra do procedimento').toBe(10)
    expect(com!.status).toBe('OPEN')
    expect(com!.professional_id).toBe(c!.profissional)
    expect(com!.period_ref).toMatch(/^\d{4}-\d{2}$/)

    // A receita NÃO nasce no fechamento — é o pagamento que a lança.
    const { data: rec } = await db.from('financial_transactions').select('id').eq('appointment_id', c!.agendamento)
    expect(rec ?? []).toHaveLength(0)
  })

  test('receber: crédito sem saldo é recusado; Pix lança a receita paga', async ({ page }) => {
    const db = banco()
    await page.goto(`/admin/agenda/${c!.agendamento}`)
    await page.getByRole('button', { name: 'Confirmar pagamento' }).click()
    const form = page.locator('form').filter({ has: page.locator('select[name="payment_method"]') })

    await form.locator('select[name="payment_method"]').selectOption('INTERNAL_CREDIT')
    await form.getByRole('button', { name: 'Confirmar pagamento' }).click()
    await expect(form.getByText(/crédito interno insuficiente/i), 'a recusa aparece na tela').toBeVisible()
    const { data: nada } = await db.from('financial_transactions').select('id').eq('appointment_id', c!.agendamento)
    expect(nada ?? [], 'recusado, nada pode ter entrado').toHaveLength(0)

    await form.locator('select[name="payment_method"]').selectOption('PIX')
    const chamada = capturarAcao(page, corpo => corpo.includes(c!.agendamento) && corpo.includes('PIX'))
    await form.getByRole('button', { name: 'Confirmar pagamento' }).click()
    const req = await chamada

    await expect.poll(async () => {
      const { data } = await db.from('financial_transactions')
        .select('amount, is_paid, payment_method, type').eq('appointment_id', c!.agendamento).maybeSingle()
      return data ? `${data.type}|${Number(data.amount)}|${data.is_paid}|${data.payment_method}` : null
    }, { message: 'o pagamento lança a receita do atendimento, já paga' }).toBe(`INCOME|${PRECO}|true|PIX`)

    const { data: tx } = await db.from('financial_transactions').select('id').eq('appointment_id', c!.agendamento).single()
    await expect.poll(async () => {
      const { data } = await db.from('domain_events').select('nome').eq('entidade_id', tx!.id)
      return (data ?? []).map(e => e.nome)
    }, { message: 'o gatilho emite pagamento.recebido' }).toContain('pagamento.recebido')

    // A mesma chamada, para a sessão de PACOTE: não se cobra de novo.
    await reenviarAcao(page, req, [[c!.agendamento, c!.agendamentoDoPacote]])
    const { data: dobrado } = await db.from('financial_transactions').select('id').eq('appointment_id', c!.agendamentoDoPacote)
    expect(dobrado ?? [], 'sessão de pacote não lança receita').toHaveLength(0)

    await page.goto(`/admin/agenda/${c!.agendamentoDoPacote}`)
    await expect(page.getByText('Sessão de pacote — paga na venda do pacote.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirmar pagamento' }), 'nem o botão aparece').toHaveCount(0)
  })
})
