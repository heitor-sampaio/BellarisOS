import { test, expect } from '@playwright/test'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A32 da simulação de 2026-10-27: o formulário de Documentos da ficha tinha
 * DUAS saídas com "Cancelar" (o botão do cabeçalho virava "Cancelar" com o
 * formulário aberto, e o formulário tinha o dele) — e mais um X. Uma saída só.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let cliente = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`dc${marca}`)
  recepcao = await criarMembro(`dcr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Documentos')
})
test.afterAll(async () => { await recepcao?.limpar(); await rede?.limpar() })

test('o formulário de Documentos tem um só "Cancelar"', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${cliente}?aba=documentos`)
    await p.getByRole('button', { name: /Adicionar (primeiro )?documento/ }).first().click()
    await expect(p.getByText('Novo documento')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Cancelar' })).toHaveCount(1)
    await p.getByRole('button', { name: 'Cancelar' }).click()
    await expect(p.getByText('Novo documento')).toHaveCount(0)
  } finally { await ctx.close() }
})
