import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Os atritos de configurações, menu e equipe da 14ª simulação (2026-11-12/13,
 * F74), numa rede [e2e] própria de UMA unidade — o tamanho real do cliente
 * (CLAUDE.md §1):
 *
 * - A1 (princípio 7, §1): a dona (da rede), no portal da unidade, lia "A aba
 *   Comissões fica nas Configurações da clínica" sem link, e não achava as
 *   Automações. A frase vira link, as abas da clínica ficam à mão nas
 *   Configurações da unidade, e o menu da unidade traz as entradas da clínica,
 *   levando a /admin — para quem é da rede; quem tem unidade fixa, não.
 * - A2 (7): a aba das maquininhas se chama "Comissões e taxas".
 * - A3 (7): o liga/desliga da fidelidade diz "Falta salvar" até o Salvar.
 * - A4 (7): o menu que continua abaixo da dobra diz que continua.
 * - A5 (3, 7): a aba da clínica toda diz QUEM muda, pelo nome.
 * - A6 (7): o "É de propósito" ganha o Desfazer à vista; o lápis diz "Cargo e unidade".
 * - A7 (7): o Desativar fala neutro, e o "Repassar todos" diz que preenche as linhas.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let gerente: MembroDeTeste
let caio: MembroDeTeste
let nomeDaDona = ''
let clienteId = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const nome = async (m: MembroDeTeste) => (await db().from('users').select('name').eq('id', m.userId).single<{ name: string }>()).data!.name

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`cfg14${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`cfg14d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  gerente = await criarMembro(`cfg14g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'automations', nivel: 'MANAGE' }, { modulo: 'marketing', nivel: 'MANAGE' }],
  })
  caio = await criarMembro(`cfg14c${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Caio', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', caio.userId)).error).toBeNull()
  nomeDaDona = await nome(dona)
  clienteId = await rede.criarCliente('Ana')
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('client_id', clienteId)
    const ids = (ags ?? []).map(x => x.id as string)
    if (ids.length) { await db().from('appointment_history').delete().in('appointment_id', ids); await db().from('appointments').delete().in('id', ids) }
  }
  await caio?.limpar(); await gerente?.limpar(); await dona?.limpar()
  await rede?.limpar()
})

test('A1: na unidade, a aba da clínica vira link, as abas da clínica ficam à mão, e o menu leva às Automações — só para quem é da rede', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/settings?tab=comissoes`)
    const aviso = p.locator('[data-aba-fora-do-acesso]')
    await expect(aviso).toContainText('Comissões e taxas')
    const link = aviso.getByRole('link', { name: /Abrir Comissões e taxas nas Configurações da (rede|clínica)/ })
    await expect(link).toHaveAttribute('href', '/admin/settings?tab=comissoes')

    // As abas que só a clínica tem, à mão nas Configurações da unidade.
    const daClinica = p.locator('[data-abas-da-clinica]')
    await expect(daClinica.getByRole('link', { name: 'Fidelidade' })).toHaveAttribute('href', '/admin/settings?tab=fidelidade')
    await expect(daClinica.getByRole('link', { name: 'Comissões e taxas' })).toHaveAttribute('href', '/admin/settings?tab=comissoes')

    // O menu da unidade traz as entradas da clínica, levando a /admin.
    const menu = p.locator('aside nav')
    await expect(menu.getByRole('link', { name: 'Automações' })).toHaveAttribute('href', '/admin/automacoes')
    await expect(menu.getByRole('link', { name: 'Notificações' })).toHaveAttribute('href', '/admin/notificacoes')
    await expect(menu.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', `/${slug}/agenda`)
  })

  // A gerente de unidade fixa não entra em /admin: nem o link, nem as entradas.
  await como(browser, gerente, async p => {
    await p.goto(`/${slug}/settings?tab=tags`)
    await expect(p.locator('[data-config-da-clinica]')).toBeVisible()
    await expect(p.locator('[data-abas-da-clinica]')).toHaveCount(0)
    await expect(p.locator('aside nav').getByRole('link', { name: 'Automações' })).toHaveCount(0)
  })
})

test('A2: a aba das maquininhas se chama "Comissões e taxas"', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    await expect(p.locator('.seg-desktop').first().getByRole('link', { name: 'Comissões e taxas', exact: true })).toBeVisible()
    await expect(p.locator('[aria-label="Taxas da maquininha"]')).toBeVisible()
  })
})

test('A3: o liga/desliga da fidelidade diz "Falta salvar" até o Salvar', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=fidelidade')
    await expect(p.locator('[data-fidelidade-nao-salvo]')).toHaveCount(0)
    await p.getByRole('button', { name: 'Programa desligado' }).click()
    await expect(p.getByRole('button', { name: 'Programa ligado' })).toHaveAttribute('aria-pressed', 'true')
    await expect(p.locator('[data-fidelidade-nao-salvo]')).toContainText('Falta salvar')
    // Voltar ao que estava não é mudança.
    await p.getByRole('button', { name: 'Programa ligado' }).click()
    await expect(p.locator('[data-fidelidade-nao-salvo]')).toHaveCount(0)
  })
})

test('A4: com o menu cortado pela altura da tela, um sinal diz que ele continua', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/dashboard')
    const sinal = p.locator('[data-menu-continua]')
    await expect(sinal).toBeVisible()
    await sinal.click()
    await expect(p.locator('aside nav').getByRole('link', { name: /^Configurações$/ })).toBeInViewport()
    await expect(sinal).toHaveCount(0)
  }, { width: 1440, height: 560 })
  await como(browser, dona, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.locator('aside nav').getByRole('link', { name: /^Configurações$/ })).toBeInViewport()
    await expect(p.locator('[data-menu-continua]'), 'cabendo tudo, não há sinal').toHaveCount(0)
  }, { width: 1440, height: 1400 })
})

test('A5: a aba da clínica toda diz quem muda, pelo nome', async ({ browser }) => {
  await como(browser, gerente, async p => {
    await p.goto(`/${slug}/settings?tab=tags`)
    const aviso = p.locator('[data-config-da-clinica]')
    await expect(aviso).toContainText('Esta configuração é da clínica toda')
    await expect(aviso.locator('[data-quem-muda]')).toContainText(nomeDaDona)
    await expect(aviso.locator('[data-quem-muda]'), 'a própria gerente não entra').not.toContainText(await nome(gerente))
  })
})

test('A6: o "É de propósito" tem o Desfazer à vista, e o lápis diz "Cargo e unidade"', async ({ browser }) => {
  expect((await db().from('users').update({ provides_services: true, atende_em: [rede.branchId], sem_comissao_de_proposito: false }).eq('id', dona.userId)).error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/team')
    const chip = p.locator(`[data-comissao="${dona.userId}"]`)
    await p.locator(`[data-de-proposito-atalho="${dona.userId}"]`).click()
    await expect(chip).toHaveText('Sem comissão (de propósito)', { timeout: 15_000 })
    const desfazer = p.locator(`[data-desfazer-de-proposito="${dona.userId}"]`)
    await expect(desfazer).toBeVisible()
    await desfazer.click()
    await expect(chip).toHaveText('Sem comissão', { timeout: 15_000 })
    await expect(chip).toHaveClass(/chip-warning/)

    const linhaDoCaio = p.locator('tr').filter({ hasText: await nome(caio) })
    await expect(linhaDoCaio.getByTitle(`Editar ${await nome(caio)}`)).toContainText('Cargo e unidade')
  })
  await expect.poll(async () => (await db().from('users').select('sem_comissao_de_proposito').eq('id', dona.userId).single<{ sem_comissao_de_proposito: boolean }>()).data?.sem_comissao_de_proposito).toBe(false)
})

test('A7: o Desativar fala neutro, e o "Repassar todos" diz que preenche as linhas', async ({ browser }) => {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: clienteId, procedure_id: rede.procedureId, professional_id: caio.userId,
    scheduled_at: new Date(`${diaEmQueAUnidadeAbre(3)}T10:00:00-03:00`).toISOString(), duration_min: 60, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/team')
    await p.locator('tr').filter({ hasText: await nome(caio) }).getByRole('button', { name: 'Desativar membro' }).click()
    const janela = p.getByRole('dialog', { name: 'Desativar membro?' })
    await expect(janela.locator(`[data-agendamento="${ag!.id}"]`)).toBeVisible()
    const fica = janela.locator('[data-o-que-fica]')
    await expect(fica).toContainText(`continua no nome de ${await nome(caio)}`)
    await expect(fica).toContainText('a pessoa desativada sai da lista')
    await expect(fica).not.toContainText('desativada: ela')
    await expect(janela.locator('[data-repassar-todos-explica]')).toContainText('Preenche todas as linhas')
    await janela.getByRole('button', { name: 'Voltar' }).click()
  })
})
