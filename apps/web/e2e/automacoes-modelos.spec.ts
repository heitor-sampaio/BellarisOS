import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * D-4: modelos prontos de automação, como OPÇÃO ao lado do "Nova automação"
 * (que continua começando vazia). O modelo cria a automação DESLIGADA, com o
 * fluxo inteiro ligado, para a clínica revisar — e o procedimento do retorno
 * fica no "Se", sem valor, segurando o "Ligar" até ela escolher.
 *
 * Rede `[e2e]` própria, membro só com Automações.
 */

const marca = Date.now().toString(36)
let f: { outra: OutraRede; membro: MembroDeTeste } | null = null

test.beforeAll(async () => {
  const outra = await criarOutraRede(`mod${marca}`)
  f = {
    outra,
    membro: await criarMembro(`mod${marca}`, {
      tenant: outra.tenantId, rotulo: 'Automações',
      permissoes: [{ modulo: 'automations', nivel: 'MANAGE' }],
    }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const db = banco()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const { data } = await db.from('automations').select('id').eq('tenant_id', f.outra.tenantId)
  for (const a of data ?? []) {
    olhar('versões', await db.from('automation_versions').delete().eq('automation_id', a.id as string))
    olhar('automação', await db.from('automations').delete().eq('id', a.id as string))
  }
  await f.membro.limpar()
  await f.outra.limpar()
  expect(falhas).toEqual([])
})

async function comoMembro(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: f!.membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('"Usar um modelo" cria o retorno desligado, ligado de ponta a ponta, com o procedimento no "Se"', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await page.goto('/admin/automacoes')
    await page.getByRole('button', { name: 'Usar um modelo' }).click()

    const janela = page.getByRole('dialog', { name: 'Modelos de automação' })
    await expect(janela.getByText('Parabéns no aniversário')).toBeVisible()
    await expect(janela.getByText('Lembrete antes do agendamento')).toBeVisible()
    await janela.locator('[data-modelo="retorno-depois-do-atendimento"]').getByRole('button', { name: 'Usar este modelo' }).click()

    await page.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
    const id = page.url().split('/').pop()!

    await expect(page.getByText('Rascunho')).toBeVisible()
    await expect(page.locator('.react-flow__node')).toHaveCount(4)
    await expect(page.locator('.react-flow__edge')).toHaveCount(3)
    // O procedimento é da clínica escolher: até lá, não liga.
    await expect(page.getByText(/sem o valor com que comparar/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ligar' })).toBeDisabled()

    const { data, error } = await banco().from('automations')
      .select('status, gatilhos, grafo, nome, tenant_id').eq('id', id).single()
    expect(error).toBeNull()
    expect(data!.tenant_id).toBe(f!.outra.tenantId)
    expect(data!.status).toBe('RASCUNHO')
    expect(data!.nome).toBe('Retorno depois do atendimento')
    expect(data!.gatilhos).toEqual(['agendamento.concluido'])
    const grafo = data!.grafo as { nos: { tipo: string; config: Record<string, unknown> }[] }
    expect(grafo.nos.map(n => n.tipo)).toEqual(['gatilho.evento', 'condicao.se', 'espera.duracao', 'acao.mensagem'])
  })
})

test('"Nova automação" continua começando vazia', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await page.goto('/admin/automacoes')
    await page.getByRole('button', { name: 'Nova automação' }).click()
    await page.getByPlaceholder('Nome da automação').fill(`[e2e] vazia ${marca}`)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
    await expect(page.getByText('O fluxo precisa de um gatilho — sem ele nada o inicia.')).toBeVisible()
    await expect(page.locator('.react-flow__node')).toHaveCount(0)
  })
})
