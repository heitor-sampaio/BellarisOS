import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId } from './apoio/banco'

/**
 * O editor de automações no celular.
 *
 * Ele nasceu em três colunas — paleta (190px), quadro e painel (320px). Em
 * 390px de tela isso deixava ~200px para o quadro: o fluxo virava um card
 * cortado ao lado de uma lista de botões, e a barra de ações quebrava em três
 * linhas. Aqui se confere que as duas laterais saíram do fluxo e viram tela
 * cheia, uma por vez.
 */

test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

let id: string | null = null

test.afterAll(async () => {
  if (id) await banco().from('automations').delete().eq('id', id)
})

test.beforeAll(async () => {
  const { data } = await banco().from('automations').insert({
    tenant_id: await tenantId(),
    nome:      nomeDeTeste('Mobile'),
    status:    'RASCUNHO',
    gatilhos:  ['conversa.mensagem_recebida'],
    grafo: {
      nos: [
        { id: 'g', tipo: 'gatilho.evento', pos: { x: 0, y: 0 }, nome: 'Quando acontecer',
          config: { evento: 'conversa.mensagem_recebida' } },
        { id: 'se', tipo: 'condicao.se', pos: { x: 280, y: 0 }, nome: 'Se',
          config: { grupo: { juncao: 'e', regras: [
            { campo: 'evento.dados.texto', operador: 'contem', valor: 'preço' },
          ] } } },
        { id: 'a', tipo: 'acao.notificar_equipe', pos: { x: 560, y: 0 }, nome: 'Avisar a equipe',
          config: { alvo: 'unidade', corpo: 'Perguntou preço' } },
      ],
      ligacoes: [
        { id: 'l1', de: 'g',  para: 'se' },
        { id: 'l2', de: 'se', para: 'a', saida: 'sim' },
      ],
    },
  }).select('id').single()
  id = data!.id as string
})

test('a paleta e os painéis saem do fluxo e viram tela cheia', async ({ page }) => {
  await page.goto(`/admin/automacoes/${id}`)

  const paleta = page.getByLabel('Passos disponíveis')
  const quadro = page.locator('.react-flow')

  // -- A paleta não ocupa coluna ---------------------------------------------
  await expect(paleta, 'a paleta comia metade da tela').toBeHidden()
  await expect(quadro).toBeVisible()

  // O quadro fica com a largura inteira: sem a paleta, nada divide a tela.
  const larguraDoQuadro = (await quadro.boundingBox())!.width
  expect(larguraDoQuadro).toBeGreaterThan(330)

  // -- E o fluxo abre no COMEÇO ----------------------------------------------
  // Enquadrar os três passos em 390px daria um zoom ilegível; com o piso de
  // zoom, o que aparecia era o meio do fluxo, cortado dos dois lados.
  const gatilho = page.locator('.react-flow__node', { hasText: 'Quando acontecer' })
  const caixa = (await gatilho.boundingBox())!
  expect(caixa.x, 'o gatilho tem de estar inteiro na tela').toBeGreaterThanOrEqual(0)
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(390)

  // -- Adicionar um passo é uma gaveta ---------------------------------------
  await page.getByRole('button', { name: 'Passo' }).click()
  await expect(paleta).toBeVisible()
  expect((await paleta.boundingBox())!.width, 'a paleta cobre a tela').toBeGreaterThan(330)

  await paleta.getByRole('button', { name: 'Anotar na oportunidade' }).click()

  // Fecha ao escolher: deixá-la aberta esconderia o node que acabou de nascer,
  // e o toque pareceria não ter feito nada.
  await expect(paleta).toBeHidden()

  // -- O painel do node também é tela cheia ----------------------------------
  const painel = page.getByLabel('Configuração do node')
  await expect(painel).toBeVisible()
  expect((await painel.boundingBox())!.width).toBeGreaterThan(330)
  await expect(painel.getByLabel('Nome do passo')).toHaveValue('Anotar na oportunidade')

  await painel.getByLabel('Fechar').click()
  await expect(painel).toBeHidden()

  // -- As gavetas da barra, idem ---------------------------------------------
  // Os rótulos somem no celular; sobram os ícones, com o nome acessível.
  await page.getByRole('button', { name: 'Versões' }).click()
  const versoes = page.getByLabel('Versões da automação')
  await expect(versoes).toBeVisible()
  expect((await versoes.boundingBox())!.width).toBeGreaterThan(330)
})
