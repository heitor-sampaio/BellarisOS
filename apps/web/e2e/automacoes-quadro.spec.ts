import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste } from './apoio/banco'

/**
 * Montar uma automação PELO QUADRO e ligá-la.
 *
 * A Fase 1 provou o motor com um grafo escrito à mão em SQL. O que falta
 * provar é que o editor produz um grafo que o motor entende — e o caso que
 * mais importa é o do meio: **ligar só é possível quando o fluxo está válido**.
 * Automação inválida e ligada é o erro mudo que esta frente inteira combate.
 */

const nome = nomeDeTeste('Quadro')
let automationId: string | null = null

test.afterAll(async () => {
  const db = banco()
  if (!automationId) return
  const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', automationId)
  for (const r of runs ?? []) await db.from('automation_run_steps').delete().eq('run_id', r.id as string)
  await db.from('automation_runs').delete().eq('automation_id', automationId)
  await db.from('automations').delete().eq('id', automationId)
})

test('monta o fluxo no quadro, só liga quando fica válido, e o grafo salvo é o do motor', async ({ page }) => {
  const db = banco()

  // -- Criar -----------------------------------------------------------------
  await page.goto('/admin/automacoes')
  await page.getByRole('button', { name: 'Nova automação' }).click()
  await page.getByPlaceholder('Nome da automação').fill(nome)
  await page.getByRole('button', { name: 'Criar', exact: true }).click()

  await page.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
  automationId = page.url().split('/').pop()!

  // Nasce RASCUNHO: uma automação que nascesse ligada mandaria mensagem antes
  // de alguém terminar de montá-la.
  await expect(page.getByText('Rascunho')).toBeVisible()

  // -- Vazio não liga --------------------------------------------------------
  const ligar = page.getByRole('button', { name: 'Ligar' })
  await expect(ligar, 'sem gatilho não há o que ligar').toBeDisabled()
  await expect(page.getByText('O fluxo precisa de um gatilho — sem ele nada o inicia.')).toBeVisible()

  // -- Gatilho ---------------------------------------------------------------
  await page.getByRole('button', { name: 'Quando acontecer' }).click()
  // Com o gatilho ainda sem evento escolhido, continua inválido.
  await expect(ligar).toBeDisabled()

  const painel = page.getByLabel('Configuração do node')
  await painel.locator('select').first().selectOption('cliente.dados_alterados')

  // -- Ação ------------------------------------------------------------------
  await page.getByRole('button', { name: 'Avisar a equipe' }).click()
  await painel.locator('input').first().fill(`${nome} · {{cliente.nome}}`)
  await painel.locator('textarea').first().fill('Conferir o cadastro.')

  // Ainda desligado: o node existe mas não está ligado ao gatilho.
  await expect(ligar, 'node solto não deveria deixar ligar').toBeDisabled()
  await expect(page.getByText(/não está ligado ao fluxo/)).toBeVisible()

  // -- Ligar os dois no quadro ------------------------------------------------
  const nos = page.locator('.react-flow__node')
  await expect(nos).toHaveCount(2)

  // Por texto, não por índice: a ordem no DOM não é a ordem do grafo.
  const gatilho = page.locator('.react-flow__node', { hasText: 'Quando acontecer' })
  const acao    = page.locator('.react-flow__node', { hasText: 'Avisar a equipe' })

  const saida   = gatilho.locator('.react-flow__handle-right')
  const entrada = acao.locator('.react-flow__handle-left')

  // Fechar o painel primeiro: ele cobre 320px do quadro, e a alça de entrada
  // do node de destino fica embaixo dele.
  await painel.getByLabel('Fechar').click()
  await expect(page.getByLabel('Configuração do node')).toBeHidden()
  // Fechar o painel devolve 320px ao quadro, e o reenquadramento é animado:
  // medir durante a animação dá coordenadas que já mudaram quando o arrasto
  // começa.
  await page.waitForTimeout(600)

  const a = (await saida.boundingBox())!
  const b = (await entrada.boundingBox())!

  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  // Em etapas e com uma parada no meio: o React Flow precisa de movimento
  // contínuo para entender que é uma conexão, não um clique.
  await page.mouse.move(a.x + 40, a.y, { steps: 5 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.up()

  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect(page.getByText('O fluxo está pronto para ligar.')).toBeVisible()
  await expect(ligar).toBeEnabled()

  // -- Ligar -----------------------------------------------------------------
  await ligar.click()
  await expect(page.getByRole('button', { name: 'Desligar' })).toBeVisible()

  // -- O que foi salvo é o que o motor lê ------------------------------------
  const { data: salva } = await db
    .from('automations').select('status, gatilhos, grafo').eq('id', automationId!).single()

  expect(salva!.status).toBe('ATIVA')
  // `gatilhos` é derivado do grafo, e é por ele que o motor acha quem assina o
  // evento — escrito à mão, dessincronizaria no primeiro ajuste.
  expect(salva!.gatilhos).toEqual(['cliente.dados_alterados'])

  const grafo = salva!.grafo as { nos: { tipo: string }[]; ligacoes: unknown[] }
  expect(grafo.nos.map(n => n.tipo)).toEqual(['gatilho.evento', 'acao.notificar_equipe'])
  expect(grafo.ligacoes).toHaveLength(1)
})
