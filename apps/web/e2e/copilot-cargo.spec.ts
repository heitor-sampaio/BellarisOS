import { test, expect } from '@playwright/test'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'
import { banco } from './apoio/banco'

/**
 * O acesso ao Copilot é do CARGO (pedido do Heitor, 2026-10-08): o módulo
 * `copilot` na matriz de Cargos: Sem acesso, ou Ver, que liga a ferramenta
 * (consultar e agir — cada ação pede só a permissão dela, desde a revisão de
 * 24/11). O plano decide se a REDE tem o Copilot; o cargo, quem o usa.
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

// A regra mudou: "cada passo pertence a UM módulo, e nenhuma ação pede dois" (o
// Heitor, 2026-11-23, docs/revisao.md:1309, aprovada em :1329-1330), lida para o
// Copilot na revisão de 24/11 (docs/catalogo/copilot.md, Q02): o Copilot em Ver
// liga a ferramenta, e a gravação pede só a permissão da ação. Era: "Ver: o
// modelo só recebe as consultas — a agenda em Gerenciar não abre o agendar".
test('Ver: com a Agenda em Gerenciar, o "agendar" chega ao modelo — a ação pede só a permissão dela', async ({ browser }) => {
  const m = await rede.membro('ver', [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'copilot', nivel: 'VIEW' }])
  falsa.roteiro.push({ texto: 'Posso agendar.' })
  await comSessao(browser, m.estado, async p => {
    await p.goto('/admin/agenda')
    await falarComOCopilot(p, 'agende a Maria amanhã')
    await esperarResposta(p)
  })
  const oferecidas = falsa.ferramentasOferecidas()
  expect(oferecidas).toContain('agendamentos')
  expect(oferecidas).toContain('agendar')
  expect(oferecidas, 'sem o Financeiro, nada de lançar').not.toContain('lancar')
})

// A vista pessoal (SM2) no Copilot — Q03 da revisão de 24/11: quem atende sem a
// Agenda e sem o Financeiro pergunta pela Minha agenda e pelas Minhas comissões;
// só leitura, só as dela.
test('quem atende sem a Agenda: o modelo recebe minha_agenda e minhas_comissoes, e não a agenda de todos', async ({ browser }) => {
  const m = await rede.membro('vista', [{ modulo: 'copilot', nivel: 'VIEW' }])
  // O "Atende" na unidade da rede (o gatilho mantém o provides_services).
  expect((await banco().from('users').update({ atende_em: [rede.outra.branchId] }).eq('id', m.userId)).error).toBeNull()
  falsa.roteiro.push({ texto: 'Vejo a sua agenda.' })
  await comSessao(browser, m.estado, async p => {
    await p.goto('/admin/dashboard')
    await falarComOCopilot(p, 'quais são os meus horários de amanhã?')
    await esperarResposta(p)
  })
  const oferecidas = falsa.ferramentasOferecidas()
  expect(oferecidas).toContain('minha_agenda')
  expect(oferecidas).toContain('minhas_comissoes')
  expect(oferecidas).not.toContain('agendamentos')
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
