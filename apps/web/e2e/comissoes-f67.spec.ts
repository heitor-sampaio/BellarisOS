import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * As comissões da F67 (o levantamento das regras, 2026-11-12):
 * - C40 (D13): a regra do item vence mesmo com 0%. O pacote com "De venda"
 *   em 0% não cai na regra de venda da pessoa — o banco usava `valor > 0`.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`cf67${marca}`)
})

test.afterAll(async () => {
  if (rede) {
    const b = db()
    const { data: ls } = await b.from('commission_lines').select('id').eq('tenant_id', rede.tenantId)
    const ids = (ls ?? []).map(l => l.id as string)
    if (ids.length) {
      await b.from('commissions').delete().in('line_id', ids)
      await b.from('commission_lines').delete().in('id', ids)
    }
  }
  await rede?.limpar()
})

test('C40: o pacote com "De venda" em 0% não gera a comissão de venda da pessoa', async () => {
  const b = db()
  // A vendedora tem 8% de venda na regra dela (Equipe).
  expect((await b.from('users').update({ comissao_venda_pct: 8 }).eq('id', rede!.professionalId)).error).toBeNull()
  const { data: pacote, error } = await b.rpc('pacote_salvar', {
    p_tenant: rede!.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote zero ${marca}`, p_preco: 400, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede!.procedureId, quantity: 2 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 0 }, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(error, 'criar o pacote').toBeNull()
  const cliente = await rede!.criarCliente('Pacote zero')
  const { data: cp, error: e2 } = await b.rpc('pacote_vender_com_equipe', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacote, p_unidade: rede!.branchId, p_ator: rede!.professionalId,
    p_vendedor: rede!.professionalId, p_responsavel: null,
    p_lancamentos: [{ amount: 400, payment_method: 'PIX', is_paid: true }],
    p_sessoes: [{ procedure_id: rede!.procedureId, preco: 200 }, { procedure_id: rede!.procedureId, preco: 200 }],
    p_desconto: 0,
  })
  expect(e2, 'vender o pacote').toBeNull()
  const { data: linhas } = await b.from('commission_lines').select('origem, regra_de, regra_valor')
    .eq('client_package_id', cp as string).eq('origem', 'PACOTE_VENDA').neq('status', 'CANCELADA')
  expect((linhas ?? []).filter(l => Number(l.regra_valor) > 0), 'a regra do pacote (0%) vence a da pessoa (8%)').toEqual([])
})
