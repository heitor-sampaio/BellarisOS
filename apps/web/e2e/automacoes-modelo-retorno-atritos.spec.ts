import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * A14 da 5ª simulação e "Reforça", item 13 (D-4): no modelo "Retorno depois
 * do atendimento",
 * - o "Se procedimento" era texto livre;
 * - o card do quadro mostrava o campo cru ("evento.dados.procedimentoNome é");
 * - o seletor de campo repetia rótulos (Situação ×3, Procedimento ×2);
 * - o modelo mandava por WhatsApp numa rede sem WhatsApp.
 *
 * Rede `[e2e]` própria (sem número de WhatsApp), membro só com Automações.
 */

const marca = Date.now().toString(36)
let f: { outra: OutraRede; membro: MembroDeTeste; procNome: string } | null = null
let automacao = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const outra = await criarOutraRede(`amr${marca}`)
  const { data } = await banco().from('procedures').select('name').eq('id', outra.procedureId).single<{ name: string }>()
  f = {
    outra, procNome: data!.name,
    membro: await criarMembro(`amr${marca}`, { tenant: outra.tenantId, rotulo: 'Automações', permissoes: [{ modulo: 'automations', nivel: 'MANAGE' }] }),
  }
})
test.afterAll(async () => {
  if (!f) return
  const db = banco()
  const { data } = await db.from('automations').select('id').eq('tenant_id', f.outra.tenantId)
  for (const a of data ?? []) {
    await db.from('automation_versions').delete().eq('automation_id', a.id as string)
    await db.from('automations').delete().eq('id', a.id as string)
  }
  await f.membro.limpar(); await f.outra.limpar()
})

async function comoMembro(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: f!.membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('sem WhatsApp conectado, o modelo avisa e nasce com o aviso no celular (push)', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await page.goto('/admin/automacoes')
    await page.getByRole('button', { name: 'Usar um modelo' }).click()
    const janela = page.getByRole('dialog', { name: 'Modelos de automação' })
    await expect(janela.locator('[data-sem-whatsapp]')).toContainText('não tem WhatsApp conectado')
    await janela.locator('[data-modelo="retorno-depois-do-atendimento"]').getByRole('button', { name: 'Usar este modelo' }).click()
    await page.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
    automacao = page.url().split('/').pop()!
  })
  const { data } = await banco().from('automations').select('grafo').eq('id', automacao).single()
  const msg = (data!.grafo as { nos: { tipo: string; config: Record<string, unknown> }[] }).nos.find(n => n.tipo === 'acao.mensagem')!
  expect(msg.config.canal).toBe('push')
})

test('o "Se procedimento" escolhe o procedimento numa lista, o card mostra o nome, e o seletor de campo não repete rótulos', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await page.goto(`/admin/automacoes/${automacao}`)
    await page.locator('.react-flow__node', { hasText: 'Procedimento é' }).click()
    const painel = page.getByLabel('Configuração do node')
    const campo = painel.getByRole('combobox', { name: 'Campo da regra 1' })
    const rotulos = (await campo.locator('option').allTextContents()).map(t => t.trim()).filter(Boolean)
    expect(rotulos.length, 'nenhum rótulo repetido').toBe(new Set(rotulos).size)
    await expect(campo.locator('option:checked')).toHaveText(/^Procedimento/)

    const valor = painel.getByRole('combobox', { name: 'Valor da regra 1' })
    await valor.selectOption({ label: f!.procNome })
    const card = page.locator('.react-flow__node', { hasText: 'Procedimento é' })
    await expect(card).toContainText(`Procedimento é ${f!.procNome}`)
    await expect(card).not.toContainText('evento.dados')
  })
})

test('o passo de mensagem em WhatsApp, sem WhatsApp conectado, avisa e oferece o aviso no celular', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await page.goto(`/admin/automacoes/${automacao}`)
    await page.locator('.react-flow__node', { hasText: 'Mandar mensagem' }).click()
    const painel = page.getByLabel('Configuração do node')
    await painel.getByLabel(/^Canal/).selectOption('whatsapp')
    const aviso = painel.locator('[data-sem-whatsapp]')
    await expect(aviso).toContainText('não tem WhatsApp conectado')
    await aviso.getByRole('button', { name: 'Mandar como aviso no celular' }).click()
    await expect(painel.getByLabel(/^Canal/)).toHaveValue('push')
    await expect(painel.locator('[data-sem-whatsapp]')).toHaveCount(0)
  })
})

test('o passo em aviso no celular chega à cliente (o sino do portal), sem conversa', async ({ request }) => {
  const db = banco()
  const clienteId = await f!.outra.criarCliente(`amrc${marca}`)
  const texto = `[e2e] Retorno ${marca}`
  const grafo = {
    nos: [
      { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 }, config: { evento: 'agendamento.concluido' } },
      { id: 'm1', tipo: 'acao.mensagem', pos: { x: 260, y: 0 }, config: { canal: 'push', texto: `${texto}, {{cliente.nome}}` } },
    ],
    ligacoes: [{ id: 'l1', de: 'g1', para: 'm1' }],
  }
  const { data: auto, error } = await db.from('automations').insert({
    tenant_id: f!.outra.tenantId, nome: `[e2e] push ${marca}`, status: 'ATIVA', gatilhos: ['agendamento.concluido'], grafo,
    // Sem silêncio noturno: o teste roda a qualquer hora.
    limites: { silencioDe: '', silencioAte: '', tetoPorClienteDia: 3 },
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  const { data: cli } = await db.from('clients').select('name').eq('id', clienteId).single<{ name: string }>()
  expect((await db.from('automation_runs').insert({
    tenant_id: f!.outra.tenantId, automation_id: auto!.id, status: 'esperando', no_atual: 'm1',
    rodar_apos: new Date(Date.now() - 60_000).toISOString(), tentativas: 0, profundidade: 0,
    contexto: { cliente: { id: clienteId, nome: cli!.name } },
  })).error).toBeNull()

  const r = await request.get('/api/cron/automacoes', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  expect(r.ok()).toBe(true)
  try {
    await expect.poll(async () => {
      const { data } = await db.from('client_notifications').select('title, body').eq('client_id', clienteId)
      return data ?? []
    }, { timeout: 20_000 }).toEqual([expect.objectContaining({ body: `${texto}, ${cli!.name}`, title: expect.stringContaining('Outra rede') })])
    const { data: run } = await db.from('automation_runs').select('status').eq('automation_id', auto!.id).single<{ status: string }>()
    expect(run!.status).toBe('ok')
  } finally {
    const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', auto!.id)
    const ids = (runs ?? []).map(x => x.id as string)
    if (ids.length) await db.from('automation_run_steps').delete().in('run_id', ids)
    await db.from('automation_runs').delete().eq('automation_id', auto!.id)
    await db.from('client_notifications').delete().eq('client_id', clienteId)
  }
})
