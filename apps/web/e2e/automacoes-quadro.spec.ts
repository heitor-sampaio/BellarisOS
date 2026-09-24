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
/** Tudo que a suíte criar pela tela — limpo de uma vez no fim. */
const criadas: string[] = []

test.afterAll(async () => {
  const db = banco()
  for (const id of [automationId, ...criadas].filter(Boolean) as string[]) {
    const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', id)
    for (const r of runs ?? []) await db.from('automation_run_steps').delete().eq('run_id', r.id as string)
    await db.from('automation_runs').delete().eq('automation_id', id)
    await db.from('automations').delete().eq('id', id)
  }
})

/** Cria uma automação pela tela e devolve o id, já anotado para a limpeza. */
async function novaAutomacao(page: import('@playwright/test').Page, comNome: string): Promise<string> {
  await page.goto('/admin/automacoes')
  await page.getByRole('button', { name: 'Nova automação' }).click()
  await page.getByPlaceholder('Nome da automação').fill(comNome)
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await page.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
  const id = page.url().split('/').pop()!
  criadas.push(id)
  return id
}

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
  await painel.getByLabel('Quando acontecer').selectOption('cliente.dados_alterados')

  // -- Ação ------------------------------------------------------------------
  // Pelo rótulo, não por índice: o painel tem vários campos de texto (o nome do
  // passo vem antes), e "o primeiro input" preenchia o campo errado sem que o
  // teste percebesse.
  await page.getByRole('button', { name: 'Avisar a equipe' }).click()
  await painel.getByLabel('Título').fill(`${nome} · {{cliente.nome}}`)
  await painel.getByLabel('Mensagem').fill('Conferir o cadastro.')

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

/**
 * O painel oferece o que existe NAQUELE ponto do fluxo.
 *
 * Era a falta que o Heitor relatou: com gatilho de mensagem recebida, o IF não
 * tinha como perguntar pelo texto da mensagem — a lista de campos era fixa e
 * não continha nada do evento. Aqui se confere pela tela que o payload do
 * gatilho e o resultado do passo anterior aparecem para escolher.
 */
test('o seletor de campos mostra o payload do gatilho', async ({ page }) => {
  await novaAutomacao(page, nomeDeTeste('Variaveis'))
  const painel = page.getByLabel('Configuração do node')

  await page.getByRole('button', { name: 'Quando acontecer' }).click()
  await painel.getByLabel('Quando acontecer').selectOption('conversa.mensagem_recebida')

  // Todo passo nasce com nome — é a chave por onde os seguintes o leem.
  await expect(painel.getByLabel('Nome do passo')).toHaveValue('Quando acontecer')

  await page.getByRole('button', { name: 'Se', exact: true }).click()
  await expect(painel.getByLabel('Nome do passo')).toHaveValue('Se')

  // A regra é onde se escolhe o campo; sem ela o IF não mostra lista nenhuma.
  await painel.getByRole('button', { name: '+ Adicionar regra' }).click()

  const campo = painel.locator('select').filter({ hasText: 'Escolha o campo…' }).first()

  // O caso que motivou a frente: perguntar pelo texto da mensagem recebida.
  await expect(
    campo.locator('option[value="evento.dados.texto"]'),
    'o payload do gatilho tem de estar na lista',
  ).toBeAttached()

  // O grupo existe e é o primeiro — o que chegou no gatilho vem antes das
  // entidades, porque é o que a pessoa foi ali procurar.
  await expect(campo.locator('optgroup').first()).toHaveAttribute('label', 'O que chegou no gatilho')

  // A saída para o que nenhuma lista previu.
  await expect(campo.locator('option[value="__outro__"]')).toBeAttached()

  // O "Avisar a equipe" nem existe ainda; quando existir, só aparece se estiver
  // LIGADO antes deste IF. Passo que talvez não rode não entra na lista.
  await expect(campo.locator('option', { hasText: 'Quantas pessoas avisou' })).toHaveCount(0)
})
