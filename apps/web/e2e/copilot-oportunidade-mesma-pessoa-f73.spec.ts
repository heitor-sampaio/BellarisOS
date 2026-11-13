import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * F73 — a sobra da F70 (C5; D11 da 9ª): o `criar_oportunidade` do Copilot
 * pergunta "É a mesma pessoa?" quando o telefone é de uma ficha, como o "Novo
 * lead" da tela — e não tinha e2e. O "Sim, é <nome>" liga a oportunidade à
 * ficha; o "Não, é outra pessoa" cria sem ligar. Nada se grava antes do clique.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let ficha = ''
const TELEFONE = '48999917' + String(Date.now()).slice(-3)
const db = () => banco()

async function pedir(p: Page, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome: 'criar_oportunidade', args }] }, { texto: 'Confira o cartão.' })
  const painel = await falarComOCopilot(p, 'teste criar_oportunidade')
  await esperarResposta(p)
  return painel.locator('.copilot-cartao[data-cartao="acao"]').last()
}
const leadsDe = async (nome: string) =>
  (await db().from('leads').select('id, client_id').eq('tenant_id', rede.outra.tenantId).eq('name', nome)).data ?? []

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`cmp${marca}`)
  ficha = await rede.outra.criarCliente('Marina')
  expect((await db().from('clients').update({ phone: `55${TELEFONE}` }).eq('id', ficha)).error).toBeNull()
})

test.afterAll(async () => {
  await db().from('lead_events').delete().eq('tenant_id', rede.outra.tenantId)
  await db().from('leads').delete().eq('tenant_id', rede.outra.tenantId)
  await rede?.limpar()
  await falsa?.fechar()
})

test('o telefone de uma ficha: o cartão pergunta; o "Sim" liga a oportunidade a ela', async ({ browser }) => {
  const nome = `${PREFIXO} Lead sim cmp${marca}`
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/oportunidades')
    const cartao = await pedir(p, { nome, telefone: TELEFONE })
    await expect(cartao).toContainText('É a mesma pessoa?')
    await expect(cartao.getByRole('button', { name: 'Confirmar' })).toHaveCount(0)
    expect(await leadsDe(nome), 'nada antes do clique').toEqual([])
    await cartao.getByRole('button', { name: /^Sim, é / }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  expect((await leadsDe(nome)).map(l => l.client_id)).toEqual([ficha])
})

test('o "Não, é outra pessoa" cria a oportunidade sem ligar à ficha', async ({ browser }) => {
  const nome = `${PREFIXO} Lead nao cmp${marca}`
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/oportunidades')
    const cartao = await pedir(p, { nome, telefone: TELEFONE })
    await cartao.getByRole('button', { name: 'Não, é outra pessoa' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  expect((await leadsDe(nome)).map(l => l.client_id)).toEqual([null])
})
