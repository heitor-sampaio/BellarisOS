import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D18 (simulação de 2026-10-29): o histórico do atendimento registrava
 * "Pagamento confirmado via CREDIT_CARD em 3x" e "via CASH" — o código da
 * forma, cru, enquanto o cabeçalho da mesma tela dizia "Crédito 3x" e
 * "Dinheiro". O histórico usa os MESMOS nomes da tela (`rotuloDaForma`,
 * lib/financeiro/formas.ts).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let proc = ''
let cliente = ''
const PRECO = 150

async function pagoComo(dados: Record<string, unknown>): Promise<string> {
  const { data: a, error: eA } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: PRECO, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eA).toBeNull()
  expect((await db().rpc('concluir_atendimento', {
    p_agendamento: a!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [] },
  })).error, 'concluir').toBeNull()
  // Com quem recebeu (p_ator): é aí que a linha do tempo é escrita.
  expect((await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: a!.id, p_tenant: rede!.tenantId, p_ator: rede!.professionalId, p_ator_nome: `${PREFIXO} Recepção`,
    p_dados: { pontos: 0, desconto: 0, valor_final: PRECO, ...dados },
  })).error, 'pagar').toBeNull()
  const { data: h, error: eH } = await db().from('appointment_history').select('description')
    .eq('appointment_id', a!.id).eq('action', 'PAYMENT_CONFIRMED').single<{ description: string }>()
  expect(eH).toBeNull()
  return h!.description
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`hf${marca}`)
  const { data: pr, error } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Toxina ${marca}`, category: 'e2e', duration_min: 30, price: PRECO })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  proc = pr!.id
  cliente = await rede.criarCliente('Pagante')
})

test.afterAll(async () => {
  await rede?.limpar()
})

test('o histórico do pagamento diz a forma em português, como a tela', async () => {
  expect(await pagoComo({ metodo: 'CREDIT_CARD', cartao_vezes: 3 })).toBe('Pagamento confirmado via Crédito 3x')
  expect(await pagoComo({ metodo: 'CASH' })).toBe('Pagamento confirmado via Dinheiro')
  expect(await pagoComo({ metodo: 'PIX' })).toBe('Pagamento confirmado via Pix')
  expect(await pagoComo({ metodo: 'DEBIT_CARD' })).toBe('Pagamento confirmado via Débito')
})

// O histórico GRAVADO antes do D18 ficou em inglês ("via CREDIT_CARD em 3x",
// "PIX à vista", "3x em CREDIT_CARD"). A frente de cadastro (2026-10-29, pedido
// do Heitor) o traduz em todas as redes com os MESMOS nomes de
// `private.rotulo_da_forma` — a tradução é `historico_forma_em_portugues`.
test('o histórico antigo: cada formato gravado em inglês vira o nome da tela', async () => {
  const casos: [string, string][] = [
    ['Pagamento confirmado via CASH', 'Pagamento confirmado via Dinheiro'],
    ['Pagamento confirmado via CREDIT_CARD em 3x', 'Pagamento confirmado via Crédito 3x'],
    ['Pagamento confirmado via PIX, com desconto de R$ 10,00', 'Pagamento confirmado via Pix, com desconto de R$ 10,00'],
    ['Pagamento confirmado via DEBIT_CARD', 'Pagamento confirmado via Débito'],
    ['Pagamento confirmado via INTERNAL_CREDIT', 'Pagamento confirmado via Crédito interno'],
    ['Checkout concluído — R$ 200,00 — 3x em CREDIT_CARD', 'Checkout concluído — R$ 200,00 — 3x em Crédito'],
    ['Checkout concluído — R$ 200,00 — CREDIT_CARD em 6x', 'Checkout concluído — R$ 200,00 — Crédito 6x'],
    ['Plano de tratamento recebido — R$ 150,00 — PIX à vista', 'Plano de tratamento recebido — R$ 150,00 — Pix à vista'],
    ['Plano de tratamento recebido — R$ 200,00 — entrada + 3x em PIX', 'Plano de tratamento recebido — R$ 200,00 — entrada + 3x em Pix'],
    ['Pagamento confirmado via Crédito 3x', 'Pagamento confirmado via Crédito 3x'],
  ]
  for (const [antes, depois] of casos) {
    const { data, error } = await db().rpc('historico_forma_em_portugues', { p_texto: antes })
    expect(error, antes).toBeNull()
    expect(data, antes).toBe(depois)
  }
})

test('nenhuma linha do histórico, em rede nenhuma, guarda o código da forma', async () => {
  const { count, error } = await db().from('appointment_history').select('id', { count: 'exact', head: true })
    .or('description.like.%via CASH%,description.like.%via PIX%,description.like.%via DEBIT_CARD%,description.like.%via CREDIT_CARD%,description.like.%via INTERNAL_CREDIT%,description.like.%em CREDIT_CARD%,description.like.%em PIX%,description.like.%em CASH%,description.like.%em DEBIT_CARD%,description.like.%PIX à vista%,description.like.%CASH à vista%,description.like.%CARD à vista%,description.like.%CREDIT_CARD em %')
  expect(error).toBeNull()
  expect(count).toBe(0)
})
