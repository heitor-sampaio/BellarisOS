import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * "Reativar clientes" (dashboard da unidade, metrics_clientes_para_reativar):
 * quem não vem há mais de 90 dias. A simulação de um dia de clínica
 * (2026-10-20) viu a lista sugerir uma ficha criada NO DIA — cliente nova
 * não é cliente sumida.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => { rede = await criarOutraRede(`rv${marca}`) })
test.afterAll(async () => { await rede?.limpar() })

test('cadastrada há pouco não é "para reativar"; cadastrada há meses e sem vir, é', async () => {
  const nova = await rede!.criarCliente('Nova')
  const antiga = await rede!.criarCliente('Antiga')
  const { data: un } = await db().from('branches').select('name').eq('id', rede!.branchId).single<{ name: string }>()
  const tag = `Unidade: ${un!.name}`
  const haDias = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
  for (const [id, criada] of [[nova, haDias(0)], [antiga, haDias(200)]] as const) {
    const { error } = await db().from('clients').update({ tags: [tag], is_active: true, created_at: criada }).eq('id', id)
    expect(error).toBeNull()
  }

  const { data, error } = await db().rpc('metrics_clientes_para_reativar', {
    p_tenant: rede!.tenantId, p_branch_id: rede!.branchId, p_tag: tag, p_desde: haDias(90), p_limite: 10,
  })
  expect(error).toBeNull()
  const ids = ((data as { lista: { id: string }[] }).lista).map(c => c.id)
  expect(ids, 'a antiga, sem visita, entra').toContain(antiga)
  expect(ids, 'a recém-cadastrada não').not.toContain(nova)
})

test('o card do mês no dashboard da unidade: clientes no mês (não "funil de leads"), com o número de cada etapa', async ({ browser }) => {
  const { criarMembro } = await import('./apoio/sessao')
  const membro = await criarMembro(`rvm${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Caixa', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'MANAGE' }],
  })
  const cliente = await rede!.criarCliente('Do mês')
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date().toISOString(),
  })
  expect(error).toBeNull()
  const { data: un } = await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()
  const ctx = await browser.newContext({ storageState: membro.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${un!.slug}/dashboard`)
    await expect(p.getByRole('heading', { name: 'Clientes no mês' })).toBeVisible()
    await expect(p.getByText('Funil de leads')).toHaveCount(0)
    await expect(p.locator('[data-etapa="Agendamentos"]'), 'o número aparece, fora da barra').toContainText('1')
    await expect(p.locator('[data-etapa="Concluídos"]'), 'o zero também').toContainText('0')
  } finally {
    await ctx.close()
    await membro.limpar()
  }
})
