import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarAtendente, plataformaNoAr, type AtendenteDeTeste } from './apoio/plataforma'
import { autorizarPor, entrarComo, limparSuporteDaRede } from './apoio/suporte'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, type RedeDoCopilot } from './apoio/copilot'

/**
 * O Copilot fica DESLIGADO na sessão de suporte (2026-10-08): o atendente que
 * entra como um membro não vê o botão, e a rota recusa — o custo e a
 * responsabilidade de um pedido ao Copilot são de quem pede, e o atendente
 * não é a clínica. O controle é o próprio membro, que vê o botão.
 */
test.skip(!plataformaNoAr() || !contraAFalsa(), 'só contra o build (a plataforma e a OpenAI falsa)')

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let atendente: AtendenteDeTeste | null = null

test.beforeAll(async () => {
  test.setTimeout(600_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`sup${marca}`)
  atendente = await criarAtendente(`cops${marca}`, { papel: 'SUPORTE' })
})
test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) falhas.push(...await limparSuporteDaRede(rede.outra.tenantId))
  const { error } = await banco().from('user_notifications').delete().eq('user_id', rede.dono.userId)
  if (error) falhas.push(error.message)
  await atendente?.limpar()
  await rede?.limpar()
  await falsa?.fechar()
  expect(falhas).toEqual([])
})

test('na sessão de suporte, nem botão nem rota; o próprio membro tem os dois', async ({ browser }) => {
  // Controle: o dono, na sessão dele, vê o Copilot.
  const ctxDono = await browser.newContext({ storageState: rede.dono.estado })
  try {
    const p = await ctxDono.newPage()
    await p.goto('/admin/dashboard')
    await expect(p.getByRole('button', { name: 'Copilot', exact: true })).toBeVisible()
  } finally { await ctxDono.close() }

  await autorizarPor(browser, rede.dono.estado, rede.dono.userId)
  const sup = await entrarComo(browser, atendente!.estado, rede.outra.tenantId, `Dono copd${`sup${marca}`}`)
  try {
    await sup.page.waitForLoadState('networkidle')
    await expect(sup.page.getByText(/via suporte|modo suporte/i).first()).toBeVisible()
    await expect(sup.page.getByRole('button', { name: 'Copilot', exact: true })).toHaveCount(0)
    const r = await sup.page.request.post('/api/copilot', { headers: { origin: process.env.E2E_BASE_URL! }, multipart: { texto: 'oi', pagina: '/admin' } })
    expect(r.status()).toBe(403)
  } finally {
    await sup.ctx.close()
  }
  expect(falsa.respostas()).toHaveLength(0)
})
