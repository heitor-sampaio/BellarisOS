import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Atritos da configuração vistos na simulação de um dia de clínica
 * (2026-10-20):
 * - desativar membro (um ícone sem texto) e desativar unidade eram um clique
 *   só — e desativar o membro também bloqueia o login dele;
 * - todo procedimento novo nascia com o agendamento self-service ligado: a
 *   Toxina ficaria agendável pelo app (a decisão de 2026-09-09 é o contrário —
 *   só o que a clínica MARCA vai para o app).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let alvo: MembroDeTeste | null = null
let outraUnidade = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dc${marca}`)
  gestor = await criarMembro(`dcg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: [{ modulo: 'team', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' }],
  })
  alvo = await criarMembro(`dca${marca}`, { tenant: rede.tenantId, rotulo: 'Alvo', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  const { data, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Segunda ${marca}`, slug: `e2e-dc2-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  outraUnidade = data!.id
})
test.afterAll(async () => {
  if (outraUnidade) await db().from('branches').delete().eq('id', outraUnidade)
  await alvo?.limpar(); await gestor?.limpar(); await rede?.limpar()
})

test('o procedimento novo nasce FORA do app (self-service desligado)', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/procedures')
    await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
    await expect(p.getByRole('checkbox', { name: 'Visível no app do cliente', exact: true })).not.toBeChecked()
  })
})

// J-10 (2026-10-30): o título "Visível no app do cliente" e a caixa "Permitir
// agendamento self-service" pareciam duas coisas. É um rótulo só, LIGADO à
// caixa: clicar nele marca.
test('o self-service tem um rótulo só, ligado à caixa', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/procedures')
    await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
    await expect(p.getByText('Permitir agendamento self-service')).toHaveCount(0)
    const caixa = p.getByRole('checkbox', { name: 'Visível no app do cliente', exact: true })
    await p.locator('label').filter({ has: caixa }).getByText('Visível no app do cliente', { exact: true }).click()
    await expect(caixa).toBeChecked()
  })
})

test('desativar membro pede confirmação', async ({ browser }) => {
  const { data: u } = await db().from('users').select('name').eq('id', alvo!.userId).single<{ name: string }>()
  await como(browser, async p => {
    await p.goto('/admin/team')
    const linha = p.locator('tr').filter({ hasText: u!.name })
    await linha.getByRole('button', { name: 'Desativar membro' }).click()
    const janela = p.getByRole('dialog', { name: 'Desativar membro?' })
    await expect(janela).toContainText(u!.name)
    await expect(janela).toContainText('não entra mais')
    expect((await db().from('users').select('is_active').eq('id', alvo!.userId).single()).data?.is_active, 'só abrir a janela não desativa').toBe(true)
    await janela.getByRole('button', { name: 'Desativar' }).click()
    await expect.poll(async () => (await db().from('users').select('is_active').eq('id', alvo!.userId).single()).data?.is_active).toBe(false)
  })
})

test('desativar unidade pede confirmação', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/settings?tab=unidades')
    const cartao = p.locator('.card').filter({ hasText: `Segunda ${marca}` }).last()
    await cartao.getByRole('button', { name: 'Desativar' }).click()
    const janela = p.getByRole('dialog', { name: 'Desativar unidade?' })
    await expect(janela).toContainText(`Segunda ${marca}`)
    await janela.getByRole('button', { name: 'Desativar' }).click()
    await expect.poll(async () => (await db().from('branches').select('is_active').eq('id', outraUnidade).single()).data?.is_active).toBe(false)
  })
})
