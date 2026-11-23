import { test, expect } from '@playwright/test'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Vocabulário da 15ª simulação (2026-11-15): o Henrique tinha o Prontuário com
 * "só os próprios", abriu a ficha de uma cliente que não atendeu e achou a aba
 * Prontuário fechada. Sem o "só os meus" (SM1, o Heitor, 2026-11-23), quem tem
 * o Prontuário em Ver abre a aba de qualquer cliente. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let comProntuario: MembroDeTeste | null = null
let cliente = ''

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`abf${marca}`)
  cliente = await rede.criarCliente('Helena abf')
  comProntuario = await criarMembro(`abfp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Prontuario em Ver',
    permissoes: [{ modulo: 'medical_records', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await comProntuario?.limpar()
  await rede?.limpar()
})

test('com o Prontuário em Ver, a aba Prontuário da cliente que ela não atendeu abre', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: comProntuario!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${cliente}?aba=fichas`)
    await expect(p.getByRole('tab', { name: 'Prontuário', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 })
    await expect(p.locator('[data-aba-sem-acesso="fichas"]'), 'sem o aviso de aba fechada').toHaveCount(0)
  } finally { await ctx.close() }
})
