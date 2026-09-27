import { test, expect, type Request } from '@playwright/test'
import { banco, tenantId, unidadeQueAtende, PREFIXO } from './apoio/banco'
import { capturarAcao, reenviarAcao } from './apoio/acao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * Receber o plano de tratamento no check-in, pela tela do atendimento.
 *
 * O plano aceito "a receber" (sem cobrança no checkout) fica em aberto, e é na
 * primeira sessão que a recepção recebe. Até 2026-09-27 nenhum teste passava
 * por aqui. O cenário: R$ 300 em aberto; recebe entrada de R$ 100 + 2× e,
 * depois, quita o saldo à vista.
 *
 * E a trava achada no mapeamento: o agendamento passado junto só serve para o
 * histórico — e tem de ser DESTE plano. Antes, qualquer id servia, e o
 * histórico de um atendimento de outra rede ganhava "Plano recebido".
 */

const marca = Date.now().toString(36)

interface Cenario { cliente: string; plano: string; appt: string; apptAlheio: string }

test.describe.serial('receber o plano no atendimento', () => {
  let c: Cenario | null = null
  let outra: OutraRede | null = null
  let recebimento: Request | null = null

  test.beforeAll(async () => {
    const db = banco()
    const unidade = await unidadeQueAtende()
    test.skip(!unidade, 'nenhuma unidade com profissional')
    const tenant = await tenantId()
    const ins = async (tabela: string, linha: Record<string, unknown>) => {
      const { data, error } = await db.from(tabela).insert(linha).select('id').single<{ id: string }>()
      expect(error, `criar ${tabela}`).toBeNull()
      return data!.id
    }
    const { data: prof } = await db.from('users').select('id')
      .eq('branch_id', unidade!.id).eq('provides_services', true).eq('is_active', true).limit(1).single<{ id: string }>()
    const { data: proc } = await db.from('procedures').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single<{ id: string }>()

    const cliente = await ins('clients', { tenant_id: tenant, branch_id: unidade!.id, name: `${PREFIXO} Cliente recebimento ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
    await db.from('loyalty_accounts').upsert({ client_id: cliente }, { onConflict: 'client_id' })
    const plano = await ins('treatment_plans', { branch_id: unidade!.id, professional_id: prof!.id, client_id: cliente, status: 'ACCEPTED', name: `${PREFIXO} Plano recebimento ${marca}` })
    // Como o checkout "receber no atendimento" deixa: o total a receber.
    await ins('financial_transactions', {
      branch_id: unidade!.id, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
      description: 'Plano de tratamento — checkout novo paciente', amount: 300, is_paid: false,
      notes: 'Plano aceito — a receber no check-in', created_by: 'e2e',
    })
    const appt = await ins('appointments', {
      branch_id: unidade!.id, client_id: cliente, procedure_id: proc!.id, professional_id: prof!.id,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 100, status: 'CONFIRMED', treatment_plan_id: plano,
    })

    outra = await criarOutraRede(`rec${marca}`)
    const alheio = await outra.criarCliente('Cliente alheio recebimento')
    const apptAlheio = await ins('appointments', {
      branch_id: outra.branchId, client_id: alheio, procedure_id: outra.procedureId, professional_id: outra.professionalId,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED',
    })
    c = { cliente, plano, appt, apptAlheio }
  })

  test.afterAll(async () => {
    const falhas = c ? await apagarClientes([c.cliente]) : []
    await outra?.limpar()
    expect(falhas).toEqual([])
  })

  test('entrada + parcelas, e depois o saldo à vista', async ({ page }) => {
    const db = banco()
    await page.goto(`/admin/agenda/${c!.appt}`)
    await expect(page.getByText(/em aberto R\$\s300,00/)).toBeVisible()

    await page.getByRole('button', { name: /Receber R\$\s300,00/ }).click()
    const modal = page.locator('div')
      .filter({ has: page.getByText('Receber o plano de tratamento') })
      .filter({ has: page.getByRole('button', { name: 'Confirmar recebimento' }) }).last()
    await modal.getByRole('button', { name: 'Entrada + parcelas' }).click()
    const numeros = modal.locator('input[type="number"]')
    await numeros.nth(0).fill('100')   // Entrada (R$)
    await numeros.nth(1).fill('2')     // Parcelas
    const chamada = capturarAcao(page, corpo => corpo.includes(c!.plano) && corpo.includes(c!.appt))
    await modal.getByRole('button', { name: 'Confirmar recebimento' }).click()
    recebimento = await chamada

    await expect.poll(async () => {
      const { data } = await db.from('financial_transactions').select('amount, is_paid')
        .eq('treatment_plan_id', c!.plano).gt('amount', 0).order('created_at')
      return (data ?? []).map(t => `${Number(t.amount)}:${t.is_paid}`).sort()
    }, { message: 'entrada paga e saldo a receber; o lançamento antigo zera' }).toEqual(['100:true', '200:false'])

    const { data: saldo } = await db.from('financial_transactions').select('id')
      .eq('treatment_plan_id', c!.plano).eq('is_paid', false).gt('amount', 0).single()
    const { data: parcelas } = await db.from('installments').select('number, total, amount').eq('transaction_id', saldo!.id).order('number')
    expect(parcelas!.map(p => `${p.number}/${p.total}:${Number(p.amount)}`)).toEqual(['1/2:100', '2/2:100'])

    const { data: hist } = await db.from('appointment_history').select('action, description').eq('appointment_id', c!.appt).eq('action', 'PAYMENT_CONFIRMED')
    expect(hist?.[0]?.description, 'o recebimento entra no histórico da sessão').toMatch(/Plano de tratamento recebido/)

    // O banner continua, com o saldo; quitar à vista zera o plano.
    await page.reload()
    await expect(page.getByText(/em aberto R\$\s200,00/)).toBeVisible()
    await page.getByRole('button', { name: /Receber R\$\s200,00/ }).click()
    await page.getByRole('button', { name: 'Confirmar recebimento' }).click()
    await expect.poll(async () => {
      const { data } = await db.from('financial_transactions').select('id')
        .eq('treatment_plan_id', c!.plano).eq('is_paid', false).gt('amount', 0)
      return data?.length ?? -1
    }, { message: 'à vista quita o que estava em aberto' }).toBe(0)
    const { data: pagas } = await db.from('installments').select('is_paid').eq('transaction_id', saldo!.id)
    expect((pagas ?? []).every(p => p.is_paid), 'as parcelas saem pagas junto').toBe(true)
  })

  test('o histórico de um atendimento de outra rede não ganha o recebimento', async ({ page }) => {
    const db = banco()
    // Volta a haver algo em aberto, para a action passar da conferência de saldo.
    const { data: base } = await db.from('treatment_plans').select('branch_id, client_id').eq('id', c!.plano).single()
    await db.from('financial_transactions').insert({
      branch_id: base!.branch_id, client_id: base!.client_id, treatment_plan_id: c!.plano, type: 'INCOME',
      category: 'Serviços', description: `${PREFIXO} reaberto`, amount: 50, is_paid: false, created_by: 'e2e',
    })
    await page.goto(`/admin/agenda/${c!.appt}`)
    await reenviarAcao(page, recebimento!, [[c!.appt, c!.apptAlheio]])
    const { data: histLa } = await db.from('appointment_history').select('id').eq('appointment_id', c!.apptAlheio)
    expect(histLa ?? [], 'nada no histórico do atendimento de outra rede').toHaveLength(0)
    const { data: aberto } = await db.from('financial_transactions').select('amount').eq('description', `${PREFIXO} reaberto`).single()
    expect(Number(aberto!.amount), 'recusado inteiro: o que estava em aberto não mexe').toBe(50)
  })
})
