import { test, expect } from '@playwright/test'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * O acesso ao Copilot é do CARGO (pedido do Heitor, 2026-10-08): o módulo
 * `copilot` na matriz de Cargos, com Sem acesso, Ver (só consultas) e
 * Gerenciar (consultas e gravações, cada gravação ainda exigindo o módulo
 * dela). O plano decide se a REDE tem o Copilot; o cargo, quem o usa.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot

test.beforeAll(async () => {
  test.setTimeout(180_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`crg${marca}`)
})
test.afterAll(async () => {
  await rede?.limpar()
  await falsa?.fechar()
})
test.beforeEach(() => falsa.zerar())

test('cargo SEM o Copilot: nem o botão, nem a rota', async ({ browser }) => {
  const m = await rede.membro('sem', [{ modulo: 'agenda', nivel: 'MANAGE' }], { semCopilot: true })
  await comSessao(browser, m.estado, async p => {
    await p.goto('/admin/agenda')
    await expect(p.getByRole('heading').first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Copilot', exact: true })).toHaveCount(0)
    const r = await p.request.post('/api/copilot', {
      headers: { origin: process.env.E2E_BASE_URL! }, multipart: { pagina: '/admin/agenda', texto: 'oi' },
    })
    expect(r.status()).toBe(403)
  })
  expect(falsa.respostas(), 'nada chegou ao modelo').toHaveLength(0)
})

test('Ver: o modelo só recebe as consultas — a agenda em Gerenciar não abre o "agendar"', async ({ browser }) => {
  const m = await rede.membro('ver', [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'copilot', nivel: 'VIEW' }])
  falsa.roteiro.push({ texto: 'Só consulto.' })
  await comSessao(browser, m.estado, async p => {
    await p.goto('/admin/agenda')
    await falarComOCopilot(p, 'agende a Maria amanhã')
    await esperarResposta(p)
  })
  const oferecidas = falsa.ferramentasOferecidas()
  expect(oferecidas).toContain('agendamentos')
  expect(oferecidas).not.toContain('agendar')
})

test('Gerenciar: as gravações do módulo liberado chegam ao modelo', async ({ browser }) => {
  const m = await rede.membro('ger', [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'copilot', nivel: 'MANAGE' }])
  falsa.roteiro.push({ texto: 'Posso agendar.' })
  await comSessao(browser, m.estado, async p => {
    await p.goto('/admin/agenda')
    await falarComOCopilot(p, 'agende a Maria amanhã')
    await esperarResposta(p)
  })
  expect(falsa.ferramentasOferecidas()).toContain('agendar')
})

// O "Olá" do Copilot ("cadastrar ou agendar") e os atalhos fixos ("Cadastrar uma cliente
// nova", "Quanto faturamos este mês?") saem das mesmas ferramentas que o modelo recebe:
// quem não pode, não vê o convite. Na rede do Copilot deste arquivo.
test.describe('o Olá e os atalhos do Copilot saem do que a permissão libera (princípio 3, copilot.md)', () => {
  test('só os Clientes em Ver: nada de agendar, cadastrar nem faturamento', async ({ browser }) => {
    const m = await rede.membro('abcli', [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'copilot', nivel: 'VIEW' }])
    await comSessao(browser, m.estado, async p => {
      await p.goto('/admin/clients')
      await p.getByRole('button', { name: 'Copilot', exact: true }).click()
      const painel = p.getByRole('dialog', { name: 'Copilot' })
      const ola = painel.locator('[data-abertura-do-copilot]')
      await expect(ola).toContainText('achar um cliente')
      await expect(ola).not.toContainText('agendar')
      await expect(ola).not.toContainText('cadastrar')
      await expect(ola).not.toContainText('confirmação')
      await expect(painel.getByRole('button', { name: 'Quanto faturamos este mês?' })).toHaveCount(0)
      await expect(painel.getByRole('button', { name: 'Cadastrar uma cliente nova' })).toHaveCount(0)
      await expect(painel.getByRole('button', { name: 'Quem são os agendamentos de hoje?' })).toHaveCount(0)
    })
  })

  test('a Agenda e os Clientes em Gerenciar: agendar, cadastrar e os atalhos deles', async ({ browser }) => {
    const m = await rede.membro('abger', [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }])
    await comSessao(browser, m.estado, async p => {
      await p.goto('/admin/agenda')
      await p.getByRole('button', { name: 'Copilot', exact: true }).click()
      const painel = p.getByRole('dialog', { name: 'Copilot' })
      await expect(painel.locator('[data-abertura-do-copilot]')).toContainText('Toda gravação passa pela sua confirmação.')
      await expect(painel.getByRole('button', { name: 'Cadastrar uma cliente nova' })).toBeVisible()
      await expect(painel.getByRole('button', { name: 'Quem são os agendamentos de hoje?' })).toBeVisible()
      // Sem os Relatórios, sem o atalho do faturamento.
      await expect(painel.getByRole('button', { name: 'Quanto faturamos este mês?' })).toHaveCount(0)
    })
  })
})
