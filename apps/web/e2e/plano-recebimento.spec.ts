import { test, expect } from '@playwright/test'
import { banco, tenantId, unidadeQueAtende, PREFIXO } from './apoio/banco'
import { chamarAcao } from './apoio/acao-direta'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * O saldo do plano de tratamento: a tela do atendimento DIZ, o PDV RECEBE.
 *
 * O plano aceito "a receber" fica em aberto. Até a 28ª simulação a tela do
 * atendimento tinha a própria janela de receber o plano no check-in (o
 * `receberDoPlano`); saiu pelas regras do PDV — o Heitor, 13/11 (PV-01): "o
 * pagamento acontece por dentro desse PDV, seja do que for"; a tela do
 * atendimento não recebe (AT-13, PV-13); do plano, o PDV cobra só o que venceu
 * (DP-06). O cenário: R$ 300 em aberto, que a tela do atendimento mostra com o
 * "Receber no PDV" e o PDV da cliente recebe; depois, duas parcelas combinadas
 * (a vencer: a tela só informa) e uma que venceu (volta a aparecer).
 *
 * E a trava: o lançamento de OUTRA rede não se recebe pelo id (era a prova de
 * que o histórico de um atendimento alheio não ganhava o recebimento — o
 * caminho novo não escreve histórico; a trava é a do lançamento).
 */

const marca = Date.now().toString(36)

interface Cenario { cliente: string; plano: string; appt: string; unidade: string; txAlheio: string }

test.describe.serial('o saldo do plano: a tela do atendimento diz, o PDV recebe', () => {
  let c: Cenario | null = null
  let outra: OutraRede | null = null

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
    await ins('financial_transactions', {
      branch_id: unidade!.id, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
      description: 'Plano de tratamento', amount: 300, is_paid: false, created_by: 'e2e',
    })
    const appt = await ins('appointments', {
      branch_id: unidade!.id, client_id: cliente, procedure_id: proc!.id, professional_id: prof!.id,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 100, status: 'CONFIRMED', treatment_plan_id: plano,
    })

    outra = await criarOutraRede(`rec${marca}`)
    const alheio = await outra.criarCliente('Cliente alheio recebimento')
    const txAlheio = await ins('financial_transactions', {
      branch_id: outra.branchId, client_id: alheio, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} a receber alheio ${marca}`, amount: 50, is_paid: false, created_by: 'e2e',
    })
    c = { cliente, plano, appt, unidade: unidade!.id, txAlheio }
  })

  test.afterAll(async () => {
    const falhas = c ? await apagarClientes([c.cliente]) : []
    await outra?.limpar()
    expect(falhas).toEqual([])
  })

  test('a tela do atendimento mostra o saldo e leva ao PDV; o PDV recebe; o combinado só se informa', async ({ page }) => {
    const db = banco()
    await page.goto(`/admin/agenda/${c!.appt}`)
    const saldo = page.locator('[data-plano-em-aberto]')
    await expect(saldo).toContainText(/em aberto R\$\s300,00/)
    await expect(page.getByRole('button', { name: /Receber R\$/ }), 'a tela do atendimento não recebe (AT-13)').toHaveCount(0)
    const ir = saldo.getByRole('link', { name: 'Receber no PDV' })
    await expect(ir).toHaveAttribute('href', new RegExp(`/pdv\\?.*cliente=${c!.cliente}`))
    await ir.click()

    const emAberto = page.getByRole('region', { name: 'Vender' }).locator('[data-parcela-em-aberto]', { hasText: 'R$ 300,00' })
    await emAberto.getByRole('button', { name: 'Receber esta parcela' }).click()
    const janela = page.getByRole('dialog', { name: 'Receber a parcela' })
    await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
    await janela.getByRole('button', { name: /^Receber R\$\s300,00$/ }).click()
    await expect.poll(async () => {
      const { data } = await db.from('financial_transactions').select('amount, is_paid, payment_method')
        .eq('treatment_plan_id', c!.plano).gt('amount', 0)
      return (data ?? []).map(t => `${Number(t.amount)}:${t.is_paid}:${t.payment_method}`)
    }, { message: 'o PDV recebeu o saldo do plano' }).toEqual(['300:true:PIX'])

    // Duas parcelas combinadas, a vencer no mês que vem: a tela só informa.
    const mesQueVem = new Date(Date.now() + 30 * 86_400_000).toISOString()
    for (const n of [1, 2]) {
      expect((await db.from('financial_transactions').insert({
        branch_id: c!.unidade, client_id: c!.cliente, treatment_plan_id: c!.plano, type: 'INCOME', category: 'Serviços',
        description: `Plano de tratamento — parcela ${n}/2`, amount: 100, is_paid: false, due_date: mesQueVem,
        parcela_numero: n, parcela_total: 2, created_by: 'e2e',
      })).error).toBeNull()
    }
    await page.goto(`/admin/agenda/${c!.appt}`)
    await expect(saldo).toContainText(/R\$\s200,00 a vencer/)
    await expect(saldo.getByRole('link', { name: 'Receber no PDV' }), 'nada venceu: nada a receber').toHaveCount(0)

    // A parcela que VENCEU volta a aparecer — só ela.
    const ontem = new Date(Date.now() - 86_400_000).toISOString()
    await db.from('financial_transactions').update({ due_date: ontem })
      .eq('treatment_plan_id', c!.plano).eq('parcela_numero', 1).eq('is_paid', false)
    await page.reload()
    await expect(saldo).toContainText(/em aberto R\$\s100,00/)
    await expect(saldo).toContainText(/Mais R\$\s100,00 a vencer/)
    await expect(saldo.getByRole('link', { name: 'Receber no PDV' })).toBeVisible()
  })

  test('o lançamento de outra rede não se recebe pelo id', async ({ page }) => {
    const db = banco()
    const r = await chamarAcao(page, 'actions/pdv.ts', 'receberParcelaNoPdv', '/admin/pdv', [c!.txAlheio, '', { forma: 'PIX' }])
    expect(r.texto).toContain('Lançamento não encontrado.')
    const { data } = await db.from('financial_transactions').select('is_paid, payment_method').eq('id', c!.txAlheio).single()
    expect(data, 'recusado inteiro: o de outra rede não mexe').toEqual({ is_paid: false, payment_method: null })
  })
})
