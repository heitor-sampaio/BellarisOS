import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'
import { clienteComSessao } from './apoio/sessao'

/**
 * O COPILOT, o esqueleto (2026-10-08, docs/regras/copilot.md): o botão sobre
 * as telas da equipe, o painel, o laço "modelo → ferramenta → modelo" com a
 * busca, o streaming, a conversa guardada, o uso contado — e as portas:
 * cliente final, rede sem o Copilot no plano, rota sem sessão ou de outra origem.
 *
 * O modelo é a OpenAI FALSA, roteirizada: o teste diz o que o "modelo" pede e
 * confere o que a ferramenta devolveu a ele.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa (OPENAI_BASE_URL_TESTE)')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot

test.beforeAll(async () => {
  test.setTimeout(180_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`esq${marca}`)
})
test.afterAll(async () => {
  await falsa?.fechar()
  await rede?.limpar()
})
test.beforeEach(() => falsa.zerar())

test('o painel conversa: a ferramenta lê o dado real, a resposta chega aos poucos e a conversa fica guardada', async ({ browser }) => {
  const clienteId = await rede.outra.criarCliente('Maria Copilot')
  falsa.roteiro.push(
    { chamar: [{ nome: 'buscar', args: { termo: 'Maria Copilot' } }] },
    { texto: 'Achei a **Maria Copilot**. Quer que eu abra a ficha?' },
  )

  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const painel = await falarComOCopilot(p, 'procure a Maria')
    await esperarResposta(p)
    await expect(painel.getByText('Quer que eu abra a ficha?')).toBeVisible()
    await expect(painel.locator('strong', { hasText: 'Maria Copilot' })).toBeVisible()

    // A ferramenta rodou de verdade, no banco: o que voltou ao modelo tem a cliente.
    const [saida] = falsa.saidasDeFerramenta()
    expect(saida?.nome).toBe('buscar')
    expect(JSON.stringify(saida?.saida)).toContain(clienteId)
    // O cartão leva à ficha, no portal em que a pessoa está.
    await expect(painel.getByRole('link', { name: /Maria Copilot/ }).first()).toHaveAttribute('href', `/admin/clients/${clienteId}`)

    // O pedido ao modelo: sem guardar a conversa na OpenAI, com a regra do clínico.
    const [primeiro] = falsa.respostas()
    expect(primeiro!.corpo.store).toBe(false)
    expect(primeiro!.corpo.instructions).toContain('NADA CLÍNICO')
    expect(falsa.ferramentasOferecidas(0)).toContain('buscar')

    // Recarregar não perde o painel nem a conversa.
    await p.reload()
    const depois = p.getByRole('dialog', { name: 'Copilot' })
    await expect(depois.getByText('Quer que eu abra a ficha?')).toBeVisible()
    await depois.getByRole('button', { name: 'Conversas' }).click()
    await expect(depois.getByRole('list', { name: 'Conversas do Copilot' }).getByText('procure a Maria')).toBeVisible()
  })

  // No banco: a conversa do dono, as mensagens e o uso do mês (2 voltas × 120 tokens).
  const db = banco()
  const { data: conversas } = await db.from('copilot_conversas').select('id').eq('tenant_id', rede.outra.tenantId)
  expect(conversas).toHaveLength(1)
  const { data: msgs } = await db.from('copilot_mensagens').select('papel').eq('conversa_id', conversas![0]!.id).order('criada_em')
  expect(msgs!.map(m => m.papel)).toEqual(['user', 'ferramenta', 'assistant'])
  const { data: uso } = await db.from('copilot_uso_mensal').select('tokens, pedidos').eq('tenant_id', rede.outra.tenantId).single()
  expect(uso).toEqual({ tokens: 240, pedidos: 1 })
})

test('o portal do cliente não tem o Copilot', async ({ browser }) => {
  const { data: unidade } = await banco().from('branches').select('id, slug').eq('id', rede.outra.branchId).single<{ id: string; slug: string }>()
  const cliente = await clienteComSessao(`copcli${marca}`, unidade!, { tenant: rede.outra.tenantId })
  try {
    await comSessao(browser, cliente.estado, async p => {
      await p.goto(`/${unidade!.slug}/cliente`)
      await p.waitForLoadState('networkidle')
      await expect(p.getByRole('button', { name: 'Copilot', exact: true })).toHaveCount(0)
      const r = await p.request.post('/api/copilot', { headers: { origin: process.env.E2E_BASE_URL! }, multipart: { texto: 'oi', pagina: '/admin' } })
      expect(r.status()).toBe(403)
    })
  } finally {
    await cliente.limpar()
  }
})

test('rede sem o Copilot no plano: nem botão, nem rota — para o dono também', async ({ browser }) => {
  await rede.plano(['agenda', 'clientes'])
  try {
    await comSessao(browser, rede.dono.estado, async p => {
      await p.goto('/admin/dashboard')
      await p.waitForLoadState('networkidle')
      await expect(p.getByRole('button', { name: 'Copilot', exact: true })).toHaveCount(0)
      const r = await p.request.post('/api/copilot', { headers: { origin: process.env.E2E_BASE_URL! }, multipart: { texto: 'oi', pagina: '/admin' } })
      expect(r.status()).toBe(403)
    })
    expect(falsa.respostas()).toHaveLength(0)
  } finally {
    await rede.plano(null)
  }
})

test('a rota recusa pedido de outra origem, mesmo com a sessão', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const r = await p.request.post('/api/copilot', { headers: { origin: 'https://evil.example' }, multipart: { texto: 'oi', pagina: '/admin' } })
    expect(r.status()).toBe(403)
  })
  expect(falsa.respostas()).toHaveLength(0)
})
