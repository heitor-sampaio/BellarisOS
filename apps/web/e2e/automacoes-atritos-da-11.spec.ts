import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * Os atritos de automações e campanhas da 11ª simulação (2026-11-10, a Marta
 * da [sim] Clínica Azaleia), numa rede [e2e] própria:
 *
 * - A18: o modelo "Lembrete antes do agendamento" falava em código
 *   ("evento.dados.agendadoPara", "CANCELLED, NO_SHOW, COMPLETED") e avisava
 *   "Só um lado da condição está ligado" num modelo dito pronto.
 * - A19: não havia modelo de reativação; e a campanha mostrava "Sentimos sua
 *   falta, Ana" sem dizer que Ana é um exemplo.
 * - A21: a campanha em rascunho e a automação não diziam quem receberia hoje.
 * - A22: "Ativar" e "Arquivar" eram ícones lado a lado, sem rótulo.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let marta: MembroDeTeste

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: marta.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`aut11${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  marta = await criarMembro(`aut11m${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [{ modulo: 'automations', nivel: 'MANAGE' }, { modulo: 'marketing', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await marta?.limpar()
  await rede?.limpar()
})

test('A19 e A21: o modelo de reativação nasce em rascunho, e o passo da busca diz quantas acharia hoje', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/automacoes')
    await p.getByRole('button', { name: 'Usar um modelo' }).click()
    const janela = p.getByRole('dialog', { name: 'Modelos de automação' })
    await janela.locator('[data-modelo="reativacao"]').getByRole('button', { name: 'Usar este modelo' }).click()
    await p.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
    const id = p.url().split('/').pop()!
    await expect(p.getByText('Rascunho')).toBeVisible()
    const { data } = await db().from('automations').select('status, nome').eq('id', id).single<{ status: string; nome: string }>()
    expect(data).toEqual({ status: 'RASCUNHO', nome: 'Reativação de quem sumiu' })

    await expect(p.locator('.react-flow')).toContainText('Todo mês, dia 1, às 09:00')
    await p.locator('.react-flow__node', { hasText: 'sem retorno há 60 dias' }).click()
    await expect(p.locator('[data-quem-acharia-hoje]')).toContainText(/Hoje, a busca (não acharia nenhuma cliente|acharia \d+ cliente)/, { timeout: 20_000 })
  })
})

test('A18: o lembrete diz em português o que faz, e não avisa do lado que termina de propósito', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/automacoes')
    await p.getByRole('button', { name: 'Usar um modelo' }).click()
    const janela = p.getByRole('dialog', { name: 'Modelos de automação' })
    await janela.locator('[data-modelo="lembrete-antes-do-agendamento"]').getByRole('button', { name: 'Usar este modelo' }).click()
    await p.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
    const quadro = p.locator('.react-flow')
    await expect(quadro).toContainText('1 dia antes de “Data e hora do agendamento”')
    await expect(quadro).toContainText('Cancelado, Não compareceu, Concluído')
    await expect(quadro).not.toContainText('CANCELLED')
    await expect(quadro).not.toContainText('evento.dados.agendadoPara')
    await expect(p.getByText('Só um lado da condição está ligado')).toHaveCount(0)
  })
})

test('A19, A21 e A22: a campanha diz que o nome é exemplo, o rascunho diz quem receberia hoje, e a linha tem as ações escritas', async ({ browser }) => {
  const { data: c, error } = await db().from('notification_campaigns').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Reativação ${marca}`, status: 'DRAFT', type: 'IMMEDIATE',
    title: 'Sentimos sua falta, {{first_name}}', body: `${PREFIXO} volta ${marca}`, audience_rules: {},
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, async p => {
    await p.goto('/admin/notificacoes')
    const linha = p.locator('tr', { hasText: `Reativação ${marca}` })
    await expect(linha.getByRole('button', { name: 'Ativar' })).toContainText('Ativar')
    await expect(linha.getByRole('button', { name: 'Arquivar' })).toContainText('Arquivar')

    await p.goto(`/admin/notificacoes/${c!.id}`)
    await expect(p.locator('[data-quem-receberia-hoje]')).toContainText(/no público/, { timeout: 20_000 })

    await p.goto(`/admin/notificacoes/${c!.id}/editar`)
    const previa = p.locator('[data-previa-do-titulo]')
    for (let i = 0; i < 3 && !(await previa.isVisible()); i++) {
      await p.getByRole('button', { name: 'Próximo' }).click()
    }
    await expect(previa).toContainText('nome de exemplo, Ana')
  })
})
