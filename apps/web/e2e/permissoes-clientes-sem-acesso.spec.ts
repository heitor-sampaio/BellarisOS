import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D11 da 7ª simulação: `/clients` sem o módulo Clientes respondia HTTP 500,
 * e `/agenda` e `/financeiro`, 200 — com a mesma tela "sem acesso". A trava
 * de Clientes ficava no LAYOUT, fora do Suspense do `loading.tsx` (o erro
 * antes do streaming é 500); as outras ficam na página, dentro dele. Nada
 * vazava: é a resposta que tem de ser a mesma.
 *
 * Numa rede [e2e] própria, com a SDR que só tem o CRM.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let sdr: MembroDeTeste | null = null
let sdrDaRede: MembroDeTeste | null = null
let slug = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`pcs${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  sdr = await criarMembro(`pcss${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }],
  })
  sdrDaRede = await criarMembro(`pcsr${marca}`, {
    tenant: rede.tenantId, rotulo: 'SDR da rede', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await sdr?.limpar()
  await sdrDaRede?.limpar()
  await rede?.limpar()
})

test('sem Clientes, /clients responde como as outras telas sem acesso: a tela "sem acesso", sem 500 (D11)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: sdr!.estado })
  try {
    const p = await ctx.newPage()
    for (const rota of [`/${slug}/clients`, `/${slug}/agenda`, `/${slug}/clients/${rede!.branchId}`]) {
      const resposta = await p.goto(rota)
      expect(resposta?.status(), `${rota}: o mesmo status das outras telas`).toBe(200)
      await expect(p.getByRole('heading', { name: 'Você não tem acesso a esta área' }), rota).toBeVisible()
    }
  } finally { await ctx.close() }
  // E no portal da rede (o mesmo layout, a mesma regra).
  const daRede = await browser.newContext({ storageState: sdrDaRede!.estado })
  try {
    const p = await daRede.newPage()
    const resposta = await p.goto('/admin/clients')
    expect(resposta?.status(), '/admin/clients').toBe(200)
    await expect(p.getByRole('heading', { name: 'Você não tem acesso a esta área' })).toBeVisible()
  } finally { await daRede.close() }
})
