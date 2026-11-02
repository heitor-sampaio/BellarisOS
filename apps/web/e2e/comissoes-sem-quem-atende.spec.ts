import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A12 da 5ª simulação: Configurações → Comissões dizia "Todos os profissionais
 * que atendem têm comissão configurada" numa clínica em que ninguém atende —
 * verdade vazia, que parecia tudo em ordem. Sem ninguém marcado como "atende
 * clientes", a tela diz isso.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`csa${marca}`)
  expect((await db().from('users').update({ provides_services: false }).eq('id', rede.professionalId)).error).toBeNull()
  gestor = await criarMembro(`csag${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor comissões',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'team', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => { await gestor?.limpar(); await rede?.limpar() })

test('sem ninguém que atende, a tela não diz que "todos têm comissão"', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/settings?tab=comissoes')
    const quadro = p.locator('[aria-label="Comissão de cada profissional"]')
    await expect(quadro).toContainText('Ninguém da equipe está marcado como “atende clientes”')
    await expect(quadro).not.toContainText('Todos os profissionais que atendem têm comissão configurada')
  } finally { await ctx.close() }
})
