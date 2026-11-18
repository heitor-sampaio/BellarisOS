import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { addDaysTZ, dayKeyTZ, instanteNoFuso, startOfDayTZ, endOfDayTZ } from '../lib/datetime'

/**
 * AU1 (a revisão do Heitor, 2026-11-13: "concordo"): os gatilhos da campanha
 * automática que saiu (MK1) viram MODELOS em "Usar um modelo" — vencimento de
 * pacote, confirmação do agendamento, cancelamento e pontos de fidelidade.
 * Nascem em rascunho (princípio 6), com o canal que a rede tem (esta não tem
 * WhatsApp: aviso no celular), e usam só fatos e passos do catálogo. O
 * vencimento de pacote é o relógio + a busca "pacote vencendo daqui a N dias"
 * (o pacote cancelado não vence — a regra da campanha de antes).
 *
 * Rede `[e2e]` própria, com a Admin da rede (desde 18/11, só ela mexe nas Automações).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let marta: MembroDeTeste
let pacoteId = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: marta.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`au1${marca}`)
  // Automações são configuração da rede toda: só a Admin da rede (o Heitor,
  // 18/11: "Configuração da rede toda só pela conta admin").
  marta = await criarMembro(`au1m${marca}`, { tenant: rede.tenantId, rotulo: 'Automações', donoDaRede: true, permissoes: [] })
  const sp = await db().from('service_packages').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, procedure_id: rede.procedureId,
    name: `${PREFIXO} Pacote ${marca}`, total_sessions: 4, price: 400,
  }).select('id').single<{ id: string }>()
  expect(sp.error, sp.error?.message).toBeNull()
  pacoteId = sp.data!.id
})

test.afterAll(async () => {
  const { data } = await db().from('automations').select('id').eq('tenant_id', rede.tenantId)
  for (const a of data ?? []) {
    await db().from('automation_versions').delete().eq('automation_id', a.id as string)
    await db().from('automations').delete().eq('id', a.id as string)
  }
  if (pacoteId) {
    await db().from('client_packages').delete().eq('package_id', pacoteId)
    await db().from('service_packages').delete().eq('id', pacoteId)
  }
  await marta?.limpar()
  await rede?.limpar()
})

async function usarModelo(p: Page, chave: string): Promise<string> {
  await p.goto('/admin/automacoes')
  await p.getByRole('button', { name: 'Usar um modelo' }).click()
  const janela = p.getByRole('dialog', { name: 'Modelos de automação' })
  await janela.locator(`[data-modelo="${chave}"]`).getByRole('button', { name: 'Usar este modelo' }).click()
  await p.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
  await expect(p.getByText('Rascunho')).toBeVisible()
  return p.url().split('/').pop()!
}

test('AU1: confirmação, cancelamento e pontos nascem em rascunho, do fato certo, com o aviso no celular', async ({ browser }) => {
  const casos = [
    { chave: 'confirmacao-do-agendamento', nome: 'Confirmação do agendamento', evento: 'agendamento.confirmado' },
    { chave: 'cancelamento-do-agendamento', nome: 'Cancelamento do agendamento', evento: 'agendamento.cancelado' },
    { chave: 'pontos-de-fidelidade', nome: 'Pontos de fidelidade', evento: 'fidelidade.pontos_ganhos' },
  ]
  await como(browser, async p => {
    for (const c of casos) {
      const id = await usarModelo(p, c.chave)
      const { data, error } = await db().from('automations').select('status, nome, gatilhos, grafo').eq('id', id).single()
      expect(error).toBeNull()
      expect(data!.status, c.chave).toBe('RASCUNHO')
      expect(data!.nome).toBe(c.nome)
      expect(data!.gatilhos).toEqual([c.evento])
      const msg = (data!.grafo as { nos: { tipo: string; config: { canal?: string } }[] }).nos.find(n => n.tipo === 'acao.mensagem')
      expect(msg?.config.canal, 'a rede sem WhatsApp: aviso no celular').toBe('push')
    }
  })
})

test('AU1: o vencimento de pacote busca quem tem pacote vencendo daqui a 7 dias — o cancelado e o de outro dia, não', async ({ browser }) => {
  const daqui7 = dayKeyTZ(addDaysTZ(new Date(), 7))
  const daqui8 = dayKeyTZ(addDaysTZ(new Date(), 8))
  const pacote = async (rotulo: string, dia: string, cancelado = false) => {
    const cliente = await rede.criarCliente(rotulo)
    const { error } = await db().from('client_packages').insert({
      client_id: cliente, package_id: pacoteId, branch_id: rede.branchId, purchased_at: new Date().toISOString(),
      expires_at: instanteNoFuso(dia, '15:00').toISOString(), total_sessions: 4, used_sessions: 1, price: 400,
      preco_tabela: 400, desconto: 0, ...(cancelado ? { cancelado_em: new Date().toISOString() } : {}),
    })
    expect(error, error?.message).toBeNull()
    return cliente
  }
  const vence = await pacote('Vence em 7', daqui7)
  await pacote('Vence em 8', daqui8)
  await pacote('Cancelado em 7', daqui7, true)

  // A busca no banco, com o filtro do passo (o dia inteiro, no relógio da rede).
  const alvo = addDaysTZ(new Date(), 7)
  const { data: achadas, error } = await db().rpc('clientes_do_publico', {
    p_tenant: rede.tenantId,
    p_filtros: { pacote_vence_de: startOfDayTZ(alvo).toISOString(), pacote_vence_ate: endOfDayTZ(alvo).toISOString() },
  })
  expect(error, error?.message).toBeNull()
  expect(((achadas ?? []) as { id: string }[]).map(c => c.id)).toEqual([vence])

  await como(browser, async p => {
    const id = await usarModelo(p, 'vencimento-de-pacote')
    const { data } = await db().from('automations').select('status, nome').eq('id', id).single()
    expect(data).toEqual({ status: 'RASCUNHO', nome: 'Vencimento de pacote' })
    await expect(p.locator('.react-flow')).toContainText('Todo dia às 09:00')
    await p.locator('.react-flow__node', { hasText: 'pacote vencendo daqui a 7 dias' }).click()
    await expect(p.getByLabel('Pacote vence daqui a (dias)')).toHaveValue('7')
    await expect(p.locator('[data-quem-acharia-hoje]')).toContainText('Hoje, a busca acharia 1 cliente', { timeout: 20_000 })
  })
})
