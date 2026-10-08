import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * As GRAVAÇÕES do Copilot no financeiro, no estoque e no CRM (fase 5,
 * 2026-10-08) — o mesmo molde da agenda: o cartão primeiro, nada gravado; o
 * Confirmar grava pelo núcleo da tela. E as travas: dar baixa é do caixa,
 * lançar é do financeiro, o estoque e o CRM pedem o módulo — e a ferramenta
 * nem é oferecida a quem não pode.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let produto: string
const db = () => banco()

async function pedir(p: Page, nome: string, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome, args }] }, { texto: 'Confira o cartão.' })
  const painel = await falarComOCopilot(p, `teste ${nome}`)
  await esperarResposta(p)
  return painel.locator('.copilot-cartao[data-cartao="acao"]').last()
}
const ultimaSaida = () => falsa.saidasDeFerramenta().at(-1)?.saida as { erro?: string } | undefined

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`ges${marca}`)
  produto = await rede.outra.criarProduto(`Seringa copges`, 3)
})

test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede.outra.branchId)
  await db().from('lead_events').delete().eq('tenant_id', rede.outra.tenantId)
  await db().from('lead_procedures').delete().in('lead_id', ((await db().from('leads').select('id').eq('tenant_id', rede.outra.tenantId)).data ?? []).map(l => l.id))
  await db().from('leads').delete().eq('tenant_id', rede.outra.tenantId)
  await rede?.limpar()
  await falsa?.fechar()
})

test('lançar despesa e dar baixa: o cartão, nada antes; o Confirmar grava', async ({ browser }) => {
  const descricao = `${PREFIXO} Conta de luz copges${marca}`
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/financeiro')
    const cartao = await pedir(p, 'lancar', { tipo: 'despesa', descricao, valor: 245.9, categoria: 'manutencao', vencimento: '2030-01-10' })
    await expect(cartao.getByText('Lançar despesa')).toBeVisible()
    await expect(cartao.getByText('R$ 245,90')).toBeVisible()
    expect((await db().from('financial_transactions').select('id').eq('description', descricao)).data).toEqual([])
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
    const { data: lancado } = await db().from('financial_transactions').select('id, type, category, amount, is_paid, created_by').eq('description', descricao).single()
    expect(lancado).toMatchObject({ type: 'EXPENSE', category: 'Manutenção', amount: 245.9, is_paid: false, created_by: rede.dono.userId })

    const baixa = await pedir(p, 'marcar_pago', { lancamento: lancado!.id, forma: 'pix' })
    await expect(baixa.getByText('Pix')).toBeVisible()
    await baixa.getByRole('button', { name: 'Confirmar' }).click()
    await expect(baixa.getByRole('status')).toContainText('Feito')
    const { data: pago } = await db().from('financial_transactions').select('is_paid, payment_method, paid_at').eq('id', lancado!.id).single()
    expect(pago).toMatchObject({ is_paid: true, payment_method: 'PIX' })
    expect(pago!.paid_at).not.toBeNull()
  })
})

test('categoria que não existe e "nem pago nem vencimento" não viram cartão', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/financeiro')
    await pedir(p, 'lancar', { tipo: 'receita', descricao: 'Avulso', valor: 10, categoria: 'Mesada', pago: true })
    expect(ultimaSaida()?.erro).toContain('não existe')
    await pedir(p, 'lancar', { tipo: 'receita', descricao: 'Avulso', valor: 10, categoria: 'Outro' })
    expect(ultimaSaida()?.erro).toContain('vencimento')
  })
})

test('estoque: entrada soma, ajuste corrige para o contado — com o saldo De → Para', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/estoque')
    const entrada = await pedir(p, 'entrada_de_estoque', { produto: produto, quantidade: 7, lote: `L${marca}`, validade: '2031-05-01' })
    await expect(entrada.getByText('3 → 10 un')).toBeVisible()
    await entrada.getByRole('button', { name: 'Confirmar' }).click()
    await expect(entrada.getByRole('status')).toContainText('Feito')
    const saldo = async () => Number((await db().from('branch_product_stock').select('current_stock').eq('product_id', produto).single()).data!.current_stock)
    expect(await saldo()).toBe(10)
    expect((await db().from('product_batches').select('batch_number').eq('product_id', produto)).data).toEqual([{ batch_number: `L${marca}` }])

    const ajuste = await pedir(p, 'ajuste_de_estoque', { produto: produto, novoSaldo: 8, motivo: 'Inventário' })
    await expect(ajuste.getByText('10 → 8 un')).toBeVisible()
    await ajuste.getByRole('button', { name: 'Confirmar' }).click()
    await expect(ajuste.getByRole('status')).toContainText('Feito')
    expect(await saldo()).toBe(8)
    const { data: movs } = await db().from('stock_movements').select('type, quantity, created_by').eq('product_id', produto).order('created_at')
    expect(movs).toEqual([
      { type: 'PURCHASE', quantity: 7, created_by: rede.dono.userId },
      { type: 'MANUAL_ADJUSTMENT', quantity: -2, created_by: rede.dono.userId },
    ])
  })
})

test('oportunidade: cria no funil e move de etapa — com o evento "via Copilot"', async ({ browser }) => {
  const nome = `${PREFIXO} Lead copges${marca}`
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/oportunidades')
    const criar = await pedir(p, 'criar_oportunidade', { nome, telefone: '48999990000', interesse: [rede.outra.procedureId] })
    await criar.getByRole('button', { name: 'Confirmar' }).click()
    await expect(criar.getByRole('status')).toContainText('Feito')
    const { data: lead } = await db().from('leads').select('id, owner_id, crm_stage_id').eq('tenant_id', rede.outra.tenantId).eq('name', nome).single()
    expect(lead!.owner_id).toBe(rede.dono.userId)
    const { data: interesse } = await db().from('lead_procedures').select('procedure_id').eq('lead_id', lead!.id)
    expect(interesse).toEqual([{ procedure_id: rede.outra.procedureId }])

    const { data: etapas } = await db().from('crm_stages').select('id, name, position').eq('tenant_id', rede.outra.tenantId).order('position')
    const segunda = etapas!.find(e => e.id !== lead!.crm_stage_id)!
    const mover = await pedir(p, 'mover_etapa', { oportunidade: lead!.id, etapa: segunda.name })
    await mover.getByRole('button', { name: 'Confirmar' }).click()
    await expect(mover.getByRole('status')).toContainText('Feito')
    expect((await db().from('leads').select('crm_stage_id').eq('id', lead!.id).single()).data!.crm_stage_id).toBe(segunda.id)
    const { data: ev } = await db().from('domain_events').select('nome, ator_nome').eq('entidade_id', lead!.id).eq('nome', 'lead.etapa_mudou').single()
    expect(ev!.ator_nome).toMatch(/\(via Copilot\)$/)
  })
})

test('as travas: o caixa dá baixa mas não lança; quem só vê o CRM não move; quem não tem estoque nem recebe', async ({ browser }) => {
  const caixa = await rede.membro('cx', [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'VIEW' }])
  await comSessao(browser, caixa.estado, async p => {
    await p.goto('/admin/dashboard')
    await pedir(p, 'lancar', { tipo: 'receita', descricao: 'Avulso', valor: 10, categoria: 'Outro', pago: true })
    const oferecidas = falsa.ferramentasOferecidas(0)
    expect(oferecidas).toContain('marcar_pago')
    for (const fora of ['lancar', 'entrada_de_estoque', 'ajuste_de_estoque', 'criar_oportunidade', 'mover_etapa']) expect(oferecidas).not.toContain(fora)
    expect(ultimaSaida()?.erro).toContain('não está liberada')
  })
})
