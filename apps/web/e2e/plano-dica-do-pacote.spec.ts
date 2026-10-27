import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O plano de tratamento na simulação de 2026-10-27:
 * - A28: a Lívia montou 4 × Limpeza (R$ 720) com o pacote "4 limpezas" a
 *   R$ 600 no catálogo, e o plano não disse nada. O plano continua por
 *   procedimento (decisão do Heitor de 21/10 — quem aplica é o checkout), mas
 *   agora DIZ que há o pacote: "Há o pacote X por R$ Y — no checkout a
 *   economia entra como desconto". A conta é a do checkout
 *   (`pacoteEquivalente`), para a dica não prometer o que ele não aplica.
 * - A29: "Nova sessão" aparecia duas vezes — o editor do plano da avaliação,
 *   na própria tela, e o "Novo plano" do Planejamento aberto por cima dela.
 *   Na avaliação, o plano se monta na tela; o Planejamento não oferece outro.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let cliente = ''
let planId = ''
let avaliacao = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dp${marca}`)
  await db().from('procedures').update({ price: 180 }).eq('id', rede.procedureId)
  // 4 × R$ 180 = R$ 720 no plano; o pacote faz por R$ 600.
  const { error: eP } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} 4 limpezas ${marca}`, p_preco: 600, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 4 }],
  })
  expect(eP).toBeNull()
  cliente = await rede.criarCliente('Mariana')
  const { data: pl, error: ePl } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente, status: 'DRAFT', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  planId = pl!.id
  const { data: s } = await db().from('treatment_plan_sessions').insert([0, 1, 2, 3].map(i => ({ plan_id: planId, sort_order: i }))).select('id')
  expect((await db().from('treatment_plan_session_procedures').insert(
    (s ?? []).map(x => ({ session_id: x.id, procedure_id: rede!.procedureId, price: 180, sort_order: 0 })),
  )).error).toBeNull()

  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  avaliacao = ag!.id

  profissional = await criarMembro(`dpp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('treatment_plans').select('id').eq('client_id', cliente)
    const ids = (data ?? []).map(p => p.id as string)
    if (ids.length) {
      const { data: s } = await db().from('treatment_plan_sessions').select('id').in('plan_id', ids)
      const sess = (s ?? []).map(x => x.id as string)
      if (sess.length) await db().from('treatment_plan_session_procedures').delete().in('session_id', sess)
      await db().from('treatment_plan_sessions').delete().in('plan_id', ids)
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('treatment_plans').delete().in('id', ids)
    }
    await db().from('service_packages').delete().eq('tenant_id', rede.tenantId)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('A28: o plano que bate com um pacote da rede diz que há o pacote e que a economia entra no checkout', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=planejamento&aberto=${planId}`)
    const dica = p.locator('[data-dica-do-pacote]')
    await expect(dica).toContainText(`4 limpezas ${marca}`)
    await expect(dica).toContainText('600,00')
    await expect(dica).toContainText('no checkout a economia')
    await expect(dica).toContainText('120,00')
  })
})

test('A29: na avaliação o plano se monta na tela — o Planejamento por cima não oferece outro "Nova sessão"', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/agenda/${avaliacao}`)
    await expect(p.getByRole('button', { name: 'Nova sessão' })).toHaveCount(1)
    await p.getByRole('main').getByRole('button', { name: 'Planejamento' }).click()
    const janela = p.getByRole('dialog', { name: 'Planejamento de tratamento' })
    await expect(janela.getByText('Monte o plano desta avaliação na própria tela')).toBeVisible()
    await expect(janela.getByRole('button', { name: 'Novo plano' })).toHaveCount(0)
  })
})
