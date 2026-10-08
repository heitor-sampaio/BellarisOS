import { test, expect } from '@playwright/test'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * A VOZ pela tela (2026-10-08): o microfone do Copilot grava, o "parar" envia,
 * o servidor transcreve e a mensagem da pessoa aparece com o que foi
 * entendido. O microfone é o FALSO do Chromium (um tom), com a permissão dada
 * — o que se prova é o caminho da tela até a transcrição, não o reconhecimento.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot

test.beforeAll(async () => {
  test.setTimeout(180_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`voz${marca}`)
})
test.afterAll(async () => {
  await rede?.limpar()
  await falsa?.fechar()
})

test('gravar, parar e enviar: a transcrição aparece como a fala da pessoa', async ({ browser }) => {
  falsa.transcricao = 'Agende a Maria amanhã às dez'
  falsa.roteiro.push({ texto: 'Entendi: agendar a Maria amanhã às 10h.' })
  const ctx = await browser.newContext({ storageState: rede.dono.estado, permissions: ['microphone'] })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/dashboard')
    await p.getByRole('button', { name: 'Copilot', exact: true }).click()
    const painel = p.getByRole('dialog', { name: 'Copilot' })
    await painel.getByRole('button', { name: 'Gravar áudio' }).click()
    await expect(painel.getByRole('button', { name: 'Parar e enviar o áudio' })).toBeVisible()
    await p.waitForTimeout(1500)
    await painel.getByRole('button', { name: 'Parar e enviar o áudio' }).click()
    await esperarResposta(p)
    const corpo = painel.locator('.copilot-corpo')
    await expect(corpo.getByText('Agende a Maria amanhã às dez')).toBeVisible()
    await expect(corpo.getByText('Entendi: agendar a Maria amanhã às 10h.')).toBeVisible()
  } finally {
    await ctx.close()
  }
  const transcricoes = falsa.pedidos.filter(x => x.caminho.endsWith('/audio/transcriptions'))
  expect(transcricoes).toHaveLength(1)
  expect(transcricoes[0]!.bytes!).toBeGreaterThan(500)
})
