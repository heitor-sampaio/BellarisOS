import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { dayKeyTZ, addDaysTZ } from '../lib/datetime'

/**
 * Os lembretes do CRM (9ª simulação, 2026-11-07), pelo cron de verdade.
 * Princípio 6: são AVISOS no sino de quem tem o lead — o card não anda.
 * - A42: o dia do retorno combinado chega → "Retorno de hoje: X".
 * - A45 (desde 2026-11-18, auditoria das regras): o ganho a marcar NÃO é mais
 *   do cron — é o modelo "Marque o ganho" das Automações (rascunho). A compra
 *   da cliente ligada grava o fato `lead.cliente_comprou` (gatilho no banco),
 *   e o cron do CRM não avisa nada dela. O plano é compra no PRIMEIRO
 *   recebimento, não no aceite (C-1, varredura de 18/11), e o pacote trazido
 *   de fora não é compra (CRM-02).
 * Uma vez: rodar o cron de novo não repete. Compartilhado: chama o cron
 * (que passa por todas as redes); os dados são de uma rede [e2e] própria.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let sdr: MembroDeTeste

test.beforeAll(async () => {
  rede = await criarOutraRede(`crl${marca}`)
  sdr = await criarMembro(`crls${marca}`, { tenant: rede.tenantId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await sdr?.limpar()
  await rede?.limpar()
})

test('A42: o cron avisa quem tem o lead do retorno do dia, uma vez, sem mover o card; o ganho a marcar é o fato das Automações', async ({ request }) => {
  const segredo = process.env.CRON_SECRET
  test.skip(!segredo, 'CRON_SECRET não está no .env.local')
  const { data: f } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'Vendas', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  const { data: novo } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: f!.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' }).select('id').single<{ id: string }>()
  await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: f!.id, name: 'Fechado', color: '#c34d6b', position: 1, outcome: 'WON' })

  const dono = sdr.userId
  const amanha = dayKeyTZ(addDaysTZ(new Date(), 1))
  const lead = async (rotulo: string, campos: Record<string, unknown>) => {
    const { data, error } = await db().from('leads').insert({
      tenant_id: rede.tenantId, name: nome(rotulo), phone: '5548' + String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9),
      crm_stage_id: novo!.id, owner_id: dono, ...campos,
    }).select('id').single<{ id: string }>()
    expect(error, rotulo).toBeNull()
    return data!.id
  }
  const ontem = dayKeyTZ(addDaysTZ(new Date(), -1))
  const deHoje = await lead('Retorno atrasado', { retornar_em: ontem, retornar_obs: 'Ligar sobre o orçamento' })
  await lead('Retorno amanhã', { retornar_em: amanha })
  const renata = await rede.criarCliente('Renata')
  const comprou = await lead('Renata comprou', { client_id: renata })
  const { data: plano, error: ePlano } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: renata, professional_id: rede.professionalId, status: 'ACCEPTED',
    name: 'Plano Harmonização', aceito_em: new Date(Date.now() + 1000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(ePlano).toBeNull()
  const fatosDe = async (leadId: string) => ((await db().from('domain_events').select('nome, dados, origem')
    .eq('tenant_id', rede.tenantId).eq('nome', 'lead.cliente_comprou').eq('entidade_id', leadId)).data ?? []) as
    { nome: string; dados: unknown; origem: string }[]
  // C-1 da varredura de 18/11 (o Heitor: "Uma coisa só foi vendida se foi
  // paga."): o plano ACEITO, sem dinheiro, ainda não é compra.
  expect(await fatosDe(comprou), 'o aceite não é a venda').toHaveLength(0)
  // O primeiro recebimento do plano é a venda (uma parcela a receber, não).
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: renata, treatment_plan_id: plano!.id, type: 'INCOME', category: 'Serviços',
    description: 'Plano Harmonização — parcela 2', amount: 500, is_paid: false, payment_method: 'PIX', created_by: 'e2e',
  })).error).toBeNull()
  expect(await fatosDe(comprou), 'a parcela a receber não é a venda').toHaveLength(0)
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: renata, treatment_plan_id: plano!.id, type: 'INCOME', category: 'Serviços',
    description: 'Plano Harmonização — entrada', amount: 500, is_paid: true, paid_at: new Date(Date.now() + 2000).toISOString(),
    payment_method: 'PIX', created_by: 'e2e',
  })).error).toBeNull()
  // CRM-02: o pacote trazido de fora não é venda — nem o fato, nem o "Comprou" do card.
  const paula = await rede.criarCliente('Paula')
  const trouxe = await lead('Paula trouxe pacote', { client_id: paula })
  expect((await db().rpc('pacote_trazer', {
    p_tenant: rede.tenantId, p_cliente: paula, p_unidade: rede.branchId, p_procedimento: rede.procedureId,
    p_total: 10, p_usadas: 3, p_validade: null, p_valor: 1000, p_ator: null,
  })).error).toBeNull()
  expect(await fatosDe(trouxe), 'o pacote de fora não é compra').toHaveLength(0)
  const { data: sinais } = await db().rpc('crm_sinais_do_quadro', { p_tenant: rede.tenantId, p_clientes: [paula, renata] })
  const sinal = (id: string) => ((sinais ?? []) as { client_id: string; compra: string | null }[]).find(x => x.client_id === id)
  expect(sinal(paula)?.compra ?? null, 'o card não diz "Comprou" o pacote de fora').toBeNull()
  expect(sinal(renata)?.compra).toBe('Plano Harmonização')

  const rodar = async () => {
    const r = await request.get('/api/cron/crm-lembretes', { headers: { authorization: `Bearer ${segredo}` } })
    expect(r.status()).toBe(200)
  }
  const avisos = async () => ((await db().from('user_notifications').select('title, body, data').eq('user_id', dono)).data ?? []) as
    { title: string; body: string; data: { leadId?: string; caminho?: string } }[]

  await rodar()
  const lista = await avisos()
  expect(lista.map(a => a.title).sort()).toEqual([
    `Retorno atrasado: ${nome('Retorno atrasado')} (${ontem.slice(8, 10)}/${ontem.slice(5, 7)})`,
  ])
  const retorno = lista.find(a => a.data.leadId === deHoje)!
  expect(retorno.body).toContain('Ligar sobre o orçamento')
  expect(retorno.data.caminho).toBe(`/admin/oportunidades?lead=${deHoje}`)
  expect(lista.find(a => a.data.leadId === comprou)).toBeUndefined()
  // A compra virou o fato do motor, uma linha para a oportunidade aberta.
  const fatos = await fatosDe(comprou)
  expect(fatos).toHaveLength(1)
  expect(fatos![0]!.origem).toBe('banco')
  expect((fatos![0]!.dados as { compra?: string; responsavelId?: string })).toMatchObject({ compra: 'Plano Harmonização', responsavelId: dono })

  // Nada se move sozinho, e o aviso não se repete.
  expect((await db().from('leads').select('crm_stage_id').eq('id', comprou).single()).data?.crm_stage_id).toBe(novo!.id)
  await rodar()
  expect(await avisos()).toHaveLength(1)
})
