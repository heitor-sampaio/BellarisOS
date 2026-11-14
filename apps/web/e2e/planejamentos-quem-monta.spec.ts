import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A18 da 6ª simulação (2026-11-04): para a recepção, a aba Planejamento da
 * ficha dizia "O plano de tratamento é do cliente: pode ser montado agora…",
 * sem botão nenhum — montar o plano pede o Prontuário em Gerenciar, e a tela
 * não dizia. E `/planejamentos/novo` dava 404 (o "novo" caía na rota do plano
 * pelo id). Agora a aba diz quem monta, e `/planejamentos/novo` leva à lista
 * com o "Novo plano" aberto (para quem monta). Numa rede [e2e] própria.
 *
 * PT2 (Bloco Plano de tratamento, 2026-11-14): quem monta deixou de ser quem
 * tem o Prontuário em Gerenciar — é quem ATENDE na unidade (o "Atende" da
 * Equipe). A "profissional" daqui atende; o texto diz o "Atende".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let cliente = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`qm${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Planejamento')
  recepcao = await criarMembro(`qmr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  profissional = await criarMembro(`qmp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    atendeEm: [rede.branchId],
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await recepcao?.limpar(); await profissional?.limpar(); await rede?.limpar()
})

test('A18: a recepção vê na aba Planejamento quem monta o plano', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/clients/${cliente}?aba=planejamento`)
    await expect(p.getByText('Nenhum plano ainda')).toBeVisible()
    await expect(p.getByText(/Quem monta o plano é quem atende nesta unidade/)).toBeVisible()
    await expect(p.getByRole('button', { name: 'Novo plano' })).toHaveCount(0)
  })
  // Controle: quem atende na unidade vê o botão.
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/clients/${cliente}?aba=planejamento`)
    await expect(p.getByRole('button', { name: 'Novo plano' })).toBeVisible()
  })
})

test('A18: /planejamentos/novo leva à lista, com o "Novo plano" aberto para quem monta', async ({ browser }) => {
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/planejamentos/novo`)
    await expect(p).toHaveURL(new RegExp(`/${slug}/planejamentos(\\?|$)`))
    await expect(p.getByRole('dialog').filter({ hasText: 'Nome do plano' })).toBeVisible()
  })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/planejamentos/novo`)
    await expect(p.getByRole('heading', { name: 'Tratamentos' })).toBeVisible()
    await expect(p.getByText(/Quem monta o plano é quem atende nesta unidade/)).toBeVisible()
  })
})
