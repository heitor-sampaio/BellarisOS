import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A51 da 6ª simulação (2026-11-04): com o Copilot fora do plano (o teste grátis
 * é "tudo, menos o Copilot", J-7), ele simplesmente não aparecia, e a dona não
 * sabia por quê. Agora quem administra a clínica vê o botão "Copilot" com a
 * explicação — "O Copilot não está no seu plano de teste" (ou "não faz parte
 * do plano da clínica") — e o caminho da Assinatura. A rota segue recusando
 * (403), e quem não administra não vê nada. Não precisa da OpenAI: roda no
 * `next dev`. Numa rede [e2e] própria (sem plano: o Copilot não vem).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cf${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString(), plan_status: 'trial' })
    .eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`cfd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [], rotulo: 'Dona' })
  recepcao = await criarMembro(`cfr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await recepcao?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('A51: no teste grátis, a dona vê que o Copilot não está no plano — e a rota segue recusando', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/dashboard')
    const botao = p.getByRole('button', { name: 'Copilot: fora do plano' })
    await expect(botao).toBeVisible()
    await botao.click()
    const aviso = p.getByRole('dialog', { name: 'Copilot' })
    await expect(aviso).toContainText('O Copilot não está no seu plano de teste')
    await expect(aviso.getByRole('link', { name: /Assinatura/ })).toHaveAttribute('href', '/admin/settings?tab=assinatura')
    const r = await p.request.post('/api/copilot', { headers: { origin: new URL(p.url()).origin }, multipart: { texto: 'oi', pagina: '/admin' } })
    expect(r.status()).toBe(403)
  })
})

test('A51: fora do teste, diz que o Copilot não faz parte do plano da clínica', async ({ browser }) => {
  expect((await db().from('tenants').update({ plan_status: 'active' }).eq('id', rede!.tenantId)).error).toBeNull()
  try {
    await como(browser, dona!, async p => {
      await p.goto('/admin/dashboard')
      await p.getByRole('button', { name: 'Copilot: fora do plano' }).click()
      await expect(p.getByRole('dialog', { name: 'Copilot' })).toContainText('O Copilot não faz parte do plano da clínica')
    })
  } finally {
    await db().from('tenants').update({ plan_status: 'trial' }).eq('id', rede!.tenantId)
  }
})

test('A51: quem não administra a clínica não vê o aviso', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda`)
    await expect(p.getByRole('heading').first()).toBeVisible()
    await expect(p.getByRole('button', { name: /Copilot/ })).toHaveCount(0)
  })
})
