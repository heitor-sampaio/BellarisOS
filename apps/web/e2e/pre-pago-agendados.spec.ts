import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * A27 da 6ª simulação (2026-11-04): "3 para agendar" no pré-pago não baixava
 * ao AGENDAR, só ao concluir — a recepção agendava a primeira unidade e a
 * ficha seguia dizendo 3. O pacote, "2 sessões restantes", sem dizer que uma
 * já estava marcada.
 *
 * Agora a conta separa: "2 para agendar · 1 agendada" (a ficha e o app), e o
 * cartão do pacote diz "2 sessões restantes · 1 agendada".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''

async function comSessao<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendado(): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
    scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`ppa${marca}`)
  expect((await db().from('procedures').update({ name: `${PREFIXO} Limpeza ${marca}`, price: 150 }).eq('id', rede.procedureId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`ppar${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'VIEW' }],
  })
  cliente = await clienteComSessao(`ppa${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string))).toEqual([])
  }
  await cliente?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('o pré-pago: a unidade agendada sai do "para agendar" — na ficha e no app', async ({ browser }) => {
  const { data: venda, error } = await db().rpc('procedimento_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente!.clientId, p_procedimento: rede!.procedureId, p_unidade: rede!.branchId,
    p_ator: null, p_quantidade: 3, p_desconto: 0, p_validade_dias: null,
    p_lancamentos: [{ amount: 450, payment_method: 'PIX', is_paid: true }],
    p_unidades: Array.from({ length: 3 }, () => ({ preco: 150 })),
  })
  expect(error, 'vender o pré-pago').toBeNull()
  const { data: us } = await db().from('procedure_sale_units').select('id').eq('sale_id', venda as string).order('numero')
  expect((await db().from('procedure_sale_units').update({ appointment_id: await agendado() }).eq('id', us![0]!.id)).error).toBeNull()

  await comSessao(browser, recepcao!.estado, async p => {
    await p.goto(`/admin/clients/${cliente!.clientId}`)
    await expect(p.locator('[data-procedimentos-pagos]')).toContainText('2 para agendar · 1 agendada')
  })
  await comSessao(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/home`)
    await expect(p.locator('[data-pre-pago]')).toContainText('2 para agendar · 1 agendada')
  })
})

test('o pacote: o cartão diz quantas das restantes já estão agendadas', async ({ browser }) => {
  const { data: pac, error: eP } = await db().rpc('pacote_salvar', {
    p_tenant: rede!.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote ${marca}`, p_preco: 300, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede!.procedureId, quantity: 2 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 0 }, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(eP).toBeNull()
  const { data: cp, error: eV } = await db().rpc('pacote_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente!.clientId, p_pacote: pac, p_unidade: rede!.branchId, p_ator: recepcao!.userId,
    p_lancamentos: [{ amount: 300, payment_method: 'PIX', is_paid: true }],
    p_sessoes: [{ procedure_id: rede!.procedureId, preco: 150 }, { procedure_id: rede!.procedureId, preco: 150 }],
  })
  expect(eV).toBeNull()
  expect((await db().from('package_sessions').update({ appointment_id: await agendado() })
    .eq('client_package_id', cp as string).eq('session_number', 1)).error).toBeNull()

  await comSessao(browser, recepcao!.estado, async p => {
    await p.goto(`/admin/clients/${cliente!.clientId}`)
    await expect(p.getByText('2 sessões restantes · 1 agendada')).toBeVisible()
  })
})
