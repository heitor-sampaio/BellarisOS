import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * C5 do levantamento das regras, a parte do ESTOQUE (F66, 2026-11-12): o
 * Copilot diz e grava o estoque como a tela.
 * - A leitura: o saldo do produto com unidade de consumo na régua da prateleira
 *   ("1 frasco fechado + 1 aberto com 50 UI"), não o "2 frasco" arredondado; a
 *   medida no plural.
 * - A entrada: o fornecedor (vira a lista da rede, C76) e a nota fiscal; o
 *   cartão diz "Não gera despesa" e avisa a validade que já passou; o
 *   resultado diz o "Saldo agora" da prateleira.
 * - O ajuste: o cartão diz que a diferença vira perda (Inventário) e avisa a
 *   variação de mais da metade do saldo, como a janela.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let toxina = ''
const nomeDaToxina = `${PREFIXO} Toxina cop66 ${marca}`
const db = () => banco()

async function pedir(p: Page, nome: string, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome, args }] }, { texto: 'Confira o cartão.' })
  const painel = await falarComOCopilot(p, `teste ${nome}`)
  await esperarResposta(p)
  return painel.locator('.copilot-cartao[data-cartao="acao"]').last()
}
const ultimaSaida = () => falsa.saidasDeFerramenta().at(-1)?.saida as Record<string, unknown> | undefined

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`ce66${marca}`)
  const { data, error } = await db().from('products').insert({
    tenant_id: rede.outra.tenantId, name: nomeDaToxina, unit: 'frasco', consumption_unit: 'UI', units_per_package: 100, cost_price: 500, uso: 'INSUMO',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  toxina = data!.id
  // 1,5 frasco: 2 entram, 50 UI se perdem.
  expect((await db().rpc('estoque_entrada', {
    p_produto: toxina, p_unidade: rede.outra.branchId, p_quantidade: 2, p_custo: 500, p_observacao: null,
    p_lote: `T${marca}`, p_validade: '2031-01-31', p_autor: 'e2e',
  })).error).toBeNull()
  expect((await db().rpc('estoque_perda_em', {
    p_produto: toxina, p_unidade: rede.outra.branchId, p_lote: null, p_quantidade: 50, p_em_consumo: true,
    p_motivo: 'QUEBROU', p_observacao: null, p_autor: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await db().from('fornecedores').delete().eq('tenant_id', rede.outra.tenantId)
  await rede?.limpar()
  await falsa?.fechar()
})

test('C5: o saldo do produto que o Copilot lê é o da prateleira — "1 frasco fechado + 1 aberto com 50 UI"', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/estoque')
    falsa.zerar()
    falsa.roteiro.push({ chamar: [{ nome: 'estoque', args: { filtro: 'produto', produto: 'Toxina cop66' } }] }, { texto: 'Pronto.' })
    await falarComOCopilot(p, 'quanto tem de toxina?')
    await esperarResposta(p)
    const itens = (ultimaSaida()?.itens ?? []) as { produto: string; saldo: string }[]
    expect(itens.find(i => i.produto === nomeDaToxina)?.saldo).toBe('1 frasco fechado + 1 aberto com 50 UI')
  })
})

test('C5: a entrada pelo Copilot leva o fornecedor e a nota, diz "Não gera despesa", avisa a validade vencida e o "Saldo agora"', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/estoque')
    const cartao = await pedir(p, 'entrada_de_estoque', {
      produto: nomeDaToxina, quantidade: 2, custoUnitario: 480, lote: `V${marca}`, validade: '2020-01-31',
      fornecedor: 'Distribuidora Norte', notaFiscal: '123',
    })
    await expect(cartao.getByText('+2 frascos')).toBeVisible()
    await expect(cartao.getByText('Distribuidora Norte')).toBeVisible()
    await expect(cartao.getByText('123', { exact: true })).toBeVisible()
    await expect(cartao).toContainText('Não gera despesa')
    await expect(cartao).toContainText('já passou')
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Saldo agora: 3 frascos fechados + 1 aberto com 50 UI')
    const mov = (await db().from('stock_movements').select('fornecedor, fornecedor_id, nota_fiscal')
      .eq('product_id', toxina).eq('type', 'PURCHASE').order('created_at', { ascending: false }).limit(1).single()).data as
      { fornecedor: string; fornecedor_id: string | null; nota_fiscal: string | null }
    expect(mov.fornecedor).toBe('Distribuidora Norte')
    expect(mov.fornecedor_id, 'o fornecedor entra na lista da rede').not.toBeNull()
    expect(mov.nota_fiscal).toBe('123')
  })
})

test('C5: o cartão do ajuste diz que a diferença vira perda (Inventário) e avisa a variação grande', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/estoque')
    const cartao = await pedir(p, 'ajuste_de_estoque', { produto: nomeDaToxina, novoSaldo: 0.5, motivo: 'Contagem' })
    await expect(cartao).toContainText('Inventário')
    await expect(cartao).toContainText('Não gera despesa')
    await expect(cartao).toContainText(/A contagem muda o saldo em \d+%/)
  })
})
