import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * "Novo plano" só grava ao salvar (2026-10-21, decisão do Heitor). O botão
 * criava um plano VAZIO na hora: quem abria por engano, ou desistia, deixava
 * um "Rascunho · 0 sessões" na ficha da cliente.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let cliente = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const planosDaCliente = async () => (await db().from('treatment_plans').select('id').eq('client_id', cliente)).data?.length ?? 0

test.beforeAll(async () => {
  rede = await criarOutraRede(`pn${marca}`)
  profissional = await criarMembro(`pnp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  cliente = await rede.criarCliente('Plano')
})
test.afterAll(async () => {
  if (cliente) {
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
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('abrir "Novo plano" e voltar não deixa plano nenhum; salvar grava', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=planejamento`)
    await p.getByRole('button', { name: 'Novo plano' }).click()
    await expect(p.getByRole('button', { name: 'Salvar plano' })).toBeVisible()
    // Aberto e ainda não salvo: nada no banco.
    expect(await planosDaCliente()).toBe(0)

    await p.getByRole('button', { name: 'Planos' }).click()
    await expect(p.getByText('Nenhum plano ainda')).toBeVisible()
    expect(await planosDaCliente()).toBe(0)

    await p.getByRole('button', { name: 'Novo plano' }).click()
    await p.getByRole('button', { name: 'Salvar plano' }).click()
    await expect.poll(planosDaCliente).toBe(1)
    // Salvo, ele vira o plano de verdade: aceitar já aparece.
    await expect(p.getByRole('button', { name: 'Aceitar plano' })).toBeVisible()
  })
})
