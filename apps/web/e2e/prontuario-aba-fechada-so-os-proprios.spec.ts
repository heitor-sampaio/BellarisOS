import { test, expect } from '@playwright/test'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Vocabulário da 15ª simulação (2026-11-15): o Henrique tem o Prontuário com
 * "só os próprios", abriu a ficha de uma cliente que não atendeu e leu "Seu
 * cargo não abre a aba Prontuário desta ficha" — o motivo era o escopo, não o
 * cargo. O aviso diz o motivo. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let soOsProprios: MembroDeTeste | null = null
let cliente = ''

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`abf${marca}`)
  cliente = await rede.criarCliente('Helena abf')
  soOsProprios = await criarMembro(`abfp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Prontuario so os proprios',
    permissoes: [{ modulo: 'medical_records', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await soOsProprios?.limpar()
  await rede?.limpar()
})

test('o Prontuário fechado pelo "só os próprios" diz o motivo, e não "seu cargo"', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: soOsProprios!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${cliente}?aba=fichas`)
    const aviso = p.locator('[data-aba-sem-acesso="fichas"]')
    await expect(aviso).toContainText('só os próprios', { timeout: 30_000 })
    await expect(aviso).not.toContainText(/cargo/i)
    await expect(p.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true')
  } finally { await ctx.close() }
})
