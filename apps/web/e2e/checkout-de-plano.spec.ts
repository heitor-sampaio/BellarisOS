import { test, expect, type Request } from '@playwright/test'
import { banco, tenantId, unidadeQueAtende, PREFIXO } from './apoio/banco'
import { capturarAcao, reenviarAcao } from './apoio/acao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * O checkout de um plano de tratamento, pela tela, do "Confirmar plano" ao
 * "Concluir" — e o que ele deixa no financeiro.
 *
 * É a venda do sistema: um plano aceito vira receita, parcelas e termos
 * assinados. Até 2026-09-27 nenhum teste passava por aqui, e a varredura achou
 * as actions do checkout aceitando plano, termo e prontuário de QUALQUER rede.
 *
 * O cenário: plano de R$ 400 em uma sessão, pago com entrada de R$ 100 e o
 * saldo em 3×. Termos confirmados em papel (o caminho que não exige desenhar).
 * Depois, três reenvios das chamadas legítimas apontando para um plano de outra
 * rede — cada um tem de não mexer em nada lá.
 */

const marca = Date.now().toString(36)
const TOTAL = 400

test.describe.serial('checkout de plano', () => {
  let outra: OutraRede | null = null
  let alheio: { planId: string; recordId: string; termId: string | null } | null = null
  let alheioSemTermo: { planId: string; recordId: string } | null = null
  let cliente = ''
  let plano = ''
  let prontuario = ''
  const chamadas: { termo?: Request; termos?: Request; checkout?: Request } = {}

  test.beforeAll(async () => {
    const db = banco()
    const unidade = await unidadeQueAtende()
    test.skip(!unidade, 'nenhuma unidade com profissional')
    const tenant = await tenantId()
    const { data: prof } = await db.from('users').select('id')
      .eq('branch_id', unidade!.id).eq('provides_services', true).eq('is_active', true).limit(1).single<{ id: string }>()
    const { data: proc } = await db.from('procedures').select('id')
      .eq('tenant_id', tenant).eq('is_active', true).limit(1).single<{ id: string }>()

    const { data: cli, error: eCli } = await db.from('clients')
      .insert({ tenant_id: tenant, branch_id: unidade!.id, name: `${PREFIXO} Cliente checkout ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
      .select('id').single<{ id: string }>()
    expect(eCli).toBeNull()
    cliente = cli!.id
    await db.from('loyalty_accounts').upsert({ client_id: cliente }, { onConflict: 'client_id' })
    // O wizard não passa do primeiro passo sem prontuário.
    const { data: rec } = await db.from('medical_records').upsert({ client_id: cliente }, { onConflict: 'client_id' }).select('id').single<{ id: string }>()
    prontuario = rec!.id

    const { data: pl, error: ePl } = await db.from('treatment_plans')
      .insert({ branch_id: unidade!.id, professional_id: prof!.id, client_id: cliente, status: 'PROPOSED', name: `${PREFIXO} Plano ${marca}`, professional_notes: `${PREFIXO} notas` })
      .select('id').single<{ id: string }>()
    expect(ePl).toBeNull()
    plano = pl!.id
    const { data: ses } = await db.from('treatment_plan_sessions').insert({ plan_id: plano, sort_order: 0 }).select('id').single<{ id: string }>()
    await db.from('treatment_plan_session_procedures').insert({ session_id: ses!.id, procedure_id: proc!.id, price: TOTAL })

    outra = await criarOutraRede(`chk${marca}`)
    alheio = await outra.criarPlanoProposto('alheio')
    alheioSemTermo = await outra.criarPlanoProposto('sem termo', { semTermo: true })
  })

  test.afterAll(async () => {
    const falhas = cliente ? await apagarClientes([cliente]) : []
    await outra?.limpar()
    expect(falhas, 'a limpeza tem de apagar tudo que o teste criou').toEqual([])
  })

  test('do "Confirmar plano" ao "Concluir": termos, entrada e parcelas', async ({ page }) => {
    const db = banco()
    // Imprimir abre o diálogo do sistema; no teste, não há impressora.
    await page.addInitScript(() => { window.print = () => {} })
    await page.goto(`/admin/checkout/${plano}`)

    const termos = capturarAcao(page, corpo => corpo.includes(plano) && corpo.includes(prontuario))
    await page.getByRole('button', { name: 'Confirmar plano' }).click()
    chamadas.termos = await termos

    const papel = page.getByRole('button', { name: /Imprimir e confirmar em papel/ })
    await expect(papel).toHaveCount(2)
    const termo = capturarAcao(page, corpo => /"[0-9a-f-]{36}"/.test(corpo) && !corpo.includes(plano))
    await papel.first().click()
    chamadas.termo = await termo
    await expect(papel).toHaveCount(1)
    await papel.first().click()

    await page.getByRole('button', { name: 'Ir para pagamento' }).click()
    await page.getByRole('button', { name: 'Entrada + parcelas' }).click()
    await page.getByPlaceholder('0,00').first().fill('100')
    await page.getByRole('button', { name: 'Ir para o agendamento' }).click()

    const checkout = capturarAcao(page, corpo => corpo.includes(plano))
    await page.getByRole('button', { name: 'Concluir sem agendar' }).click()
    chamadas.checkout = await checkout

    await expect.poll(async () => (await db.from('treatment_plans').select('status').eq('id', plano).single()).data?.status,
      { message: 'o plano aceito vira ACCEPTED' }).toBe('ACCEPTED')

    const { data: ts } = await db.from('consent_terms').select('title, status, signed_via').eq('treatment_plan_id', plano)
    expect((ts ?? []).map(t => t.title).sort()).toEqual(['Contrato de Prestação de Serviços', 'Termo de Anamnese'])
    for (const t of ts ?? []) {
      expect(t.status).toBe('SIGNED')
      expect(t.signed_via).toBe('paper')
    }

    const { data: fts } = await db.from('financial_transactions')
      .select('id, amount, is_paid, payment_method, due_date, type').eq('treatment_plan_id', plano).order('created_at')
    expect(fts, 'uma entrada paga e um saldo a receber').toHaveLength(2)
    const entrada = fts!.find(f => f.is_paid)!
    const saldo   = fts!.find(f => !f.is_paid)!
    expect(Number(entrada.amount)).toBe(100)
    expect(entrada.payment_method).toBe('PIX')
    expect(Number(saldo.amount)).toBe(TOTAL - 100)
    expect(saldo.due_date, 'o saldo tem vencimento').not.toBeNull()

    const { data: parcelas } = await db.from('installments').select('number, total, amount, is_paid')
      .eq('transaction_id', saldo.id).order('number')
    expect(parcelas!.map(p => `${p.number}/${p.total}:${Number(p.amount)}:${p.is_paid}`))
      .toEqual(['1/3:100:false', '2/3:100:false', '3/3:100:false'])

    await expect.poll(async () => {
      const { data } = await db.from('domain_events').select('nome').in('entidade_id', [plano, entrada.id])
      return (data ?? []).map(e => e.nome).sort()
    }, { message: 'aceitar o plano e receber a entrada viram eventos' }).toEqual(expect.arrayContaining(['pagamento.recebido', 'plano.aceito']))
  })

  test('as mesmas chamadas, para um plano de outra rede, não mexem em nada lá', async ({ page }) => {
    const db = banco()
    await page.goto(`/admin/checkout`)

    // Termos no prontuário de outra pessoa, de outra rede.
    // (`expect.soft`: os três reenvios são conferidos mesmo que um falhe.)
    await reenviarAcao(page, chamadas.termos!, [[plano, alheioSemTermo!.planId], [prontuario, alheioSemTermo!.recordId]])
    const { data: termosLa } = await db.from('consent_terms').select('id').eq('treatment_plan_id', alheioSemTermo!.planId)
    expect.soft(termosLa ?? [], 'nenhum termo plantado no prontuário de outra rede').toHaveLength(0)

    // Assinar o termo de outra rede.
    const idDoMeuTermo = (chamadas.termo!.postData() ?? '').match(/[0-9a-f]{8}-[0-9a-f-]{27}/)![0]
    await reenviarAcao(page, chamadas.termo!, [[idDoMeuTermo, alheio!.termId!]])
    const { data: termoLa } = await db.from('consent_terms').select('status').eq('id', alheio!.termId).single()
    expect.soft(termoLa!.status, 'o termo de outra rede continua pendente').toBe('PENDING')

    // Aceitar o plano de outra rede — que lançaria receita lá.
    await reenviarAcao(page, chamadas.checkout!, [[plano, alheio!.planId]])
    const { data: planoLa } = await db.from('treatment_plans').select('status').eq('id', alheio!.planId).single()
    expect.soft(planoLa!.status, 'o plano de outra rede continua proposto').toBe('PROPOSED')
    const { data: receitaLa } = await db.from('financial_transactions').select('id').eq('treatment_plan_id', alheio!.planId)
    expect.soft(receitaLa ?? [], 'nenhuma receita no plano de outra rede').toHaveLength(0)
  })
})
