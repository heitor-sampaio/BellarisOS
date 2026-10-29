import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D7 da simulação de 2026-10-29 (Clínica Lótus): na ficha da cliente, a
 * recepção (sem prontuário) abria Planejamento → Injetáveis e a tela ficava em
 * "Carregando…" para sempre, com 500 na rede e o React #441 no console.
 * - A sub-aba aparecia sem conferir a permissão (o mapa de injetáveis é
 *   prontuário, §9.4: `listarPlanejamentosDoCliente` pede
 *   `medical_records: VIEW` e lança `semAcesso()`).
 * - O efeito que carrega os planejamentos não tratava a promessa rejeitada.
 *
 * Sem o prontuário, a sub-aba não aparece (nem pela URL); e qualquer falha ao
 * carregar vira um aviso na tela, nunca "Carregando…" sem fim.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let comProntuario: MembroDeTeste | null = null
let slug = ''
let clienteId = ''
test.describe.configure({ timeout: 120_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const balcao: Permissao[] = [
  { modulo: 'agenda',  nivel: 'MANAGE', escopo: 'ALL' },
  { modulo: 'clients', nivel: 'MANAGE' },
  { modulo: 'cashier', nivel: 'MANAGE' },
]

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`isp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  clienteId = await rede.criarCliente('Ficha')
  recepcao = await criarMembro(`ispr${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: balcao })
  comProntuario = await criarMembro(`ispp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Com prontuário',
    permissoes: [...balcao, { modulo: 'medical_records', nivel: 'VIEW', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  await recepcao?.limpar(); await comProntuario?.limpar(); await rede?.limpar()
})

// Na `main`: o menu lateral tem a seção "Planejamento" com um "Injetáveis" também.
const subAba = (p: Page) => p.getByRole('main').getByRole('button', { name: 'Injetáveis', exact: true })
const planejamento = (p: Page) => p.getByRole('main')
/** O plano de tratamento da cliente (sem plano nenhum): é o que a aba mostra. */
const planoDeTratamento = (p: Page) => p.getByText('Nenhum plano ainda', { exact: true })

test('sem o prontuário, a ficha não oferece a sub-aba Injetáveis — nem pela URL', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/clients/${clienteId}?aba=planejamento`)
    await expect(planoDeTratamento(p)).toBeVisible()
    await expect.soft(subAba(p), 'a sub-aba é prontuário').toHaveCount(0)

    // Pela URL da sub-aba: cai no plano de tratamento, sem pedir os mapas.
    await p.goto(`/${slug}/clients/${clienteId}?aba=planejamento&planejamento=injetaveis`)
    await expect(planoDeTratamento(p), 'cai no plano de tratamento').toBeVisible()
    await expect.soft(subAba(p)).toHaveCount(0)
    await expect.soft(p.getByText('Nenhum planejamento de injetáveis ainda.')).toHaveCount(0)
    await expect.soft(planejamento(p).getByText('Carregando…'), 'nada fica carregando').toHaveCount(0, { timeout: 15_000 })
  })
})

test('com o prontuário, a sub-aba carrega; e se a carga falhar, a tela avisa em vez de ficar "Carregando…"', async ({ browser }) => {
  await como(browser, comProntuario!, async p => {
    await p.goto(`/${slug}/clients/${clienteId}?aba=planejamento&planejamento=injetaveis`)
    await expect(subAba(p), 'controle: quem tem o prontuário vê a sub-aba').toBeVisible()
    await expect(p.getByText('Nenhum planejamento de injetáveis ainda.')).toBeVisible()

    // A carga falha (a sessão perdeu o módulo, a rede caiu): a action responde 500.
    await p.route('**/*', async rota => {
      const r = rota.request()
      if (r.method() === 'POST' && r.headers()['next-action']) await rota.fulfill({ status: 500, body: 'falha' })
      else await rota.fallback()
    })
    await p.reload()
    await expect(subAba(p)).toBeVisible()
    await expect(p.getByText('Não foi possível carregar os planejamentos de injetáveis.')).toBeVisible({ timeout: 15_000 })
    await expect.soft(planejamento(p).getByText('Carregando…')).toHaveCount(0)
  })
})
