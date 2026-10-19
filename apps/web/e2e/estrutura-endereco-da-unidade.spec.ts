import { test, expect, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O endereço (slug) da unidade é ÚNICO no sistema inteiro (2026-10-19,
 * decisão do Heitor). Até aqui era único só dentro da rede, e a cliente de
 * duas clínicas com uma unidade "centro" cada tinha o mesmo endereço para as
 * duas: o link de um aviso da B abria a ficha dela na A.
 *
 * Duas redes `[e2e]` criam, pela tela, uma unidade com o MESMO nome: a
 * primeira fica com o nome, a segunda ganha o nome da clínica no fim — sem
 * erro nenhum na tela. E o banco recusa o repetido mesmo por fora do app.
 */

const marca = Date.now().toString(36)
const db = () => banco()

let A: OutraRede
let B: OutraRede
let gestorA: MembroDeTeste
let gestorB: MembroDeTeste
const criadas: string[] = []

async function criarUnidadePelaTela(browser: Browser, gestor: MembroDeTeste, nome: string): Promise<string> {
  const ctx = await browser.newContext({ storageState: gestor.estado })
  const page = await ctx.newPage()
  try {
    await page.goto('/admin/settings?tab=unidades')
    await page.getByRole('button', { name: 'Nova unidade' }).click()
    await page.locator('#br-name').fill(nome)
    await page.getByRole('button', { name: 'Criar unidade' }).click()
    let slug = ''
    await expect.poll(async () => {
      const { data } = await db().from('branches').select('id, slug').eq('tenant_id', gestor === gestorA ? A.tenantId : B.tenantId).eq('name', nome).maybeSingle<{ id: string; slug: string }>()
      if (data) { slug = data.slug; if (!criadas.includes(data.id)) criadas.push(data.id) }
      return data?.slug ?? null
    }, { message: `a unidade "${nome}" nasce` }).not.toBeNull()
    return slug
  } finally {
    await ctx.close()
  }
}

test.describe('o endereço da unidade é único entre as clínicas', () => {
  test.beforeAll(async () => {
    A = await criarOutraRede(`eua${marca}`)
    B = await criarOutraRede(`eub${marca}`)
    await db().from('tenants').update({ name: `[e2e] Clínica Bela ${marca}` }).eq('id', B.tenantId)
    const gestao = [{ modulo: 'settings' as const, nivel: 'MANAGE' as const }]
    gestorA = await criarMembro(`eua${marca}`, { tenant: A.tenantId, permissoes: gestao })
    gestorB = await criarMembro(`eub${marca}`, { tenant: B.tenantId, permissoes: gestao })
  })

  test.afterAll(async () => {
    if (criadas.length) await db().from('branches').delete().in('id', criadas)
    await gestorA?.limpar()
    await gestorB?.limpar()
    await A?.limpar()
    await B?.limpar()
  })

  test('o mesmo nome em duas clínicas: a segunda ganha o nome da clínica no endereço', async ({ browser }) => {
    const nome = `Centro ${marca}`
    expect(await criarUnidadePelaTela(browser, gestorA, nome)).toBe(`centro-${marca}`)
    expect(await criarUnidadePelaTela(browser, gestorB, nome)).toBe(`centro-${marca}-e2e-clinica-bela-${marca}`)
  })

  test('o banco recusa o endereço repetido mesmo por fora do app', async () => {
    const { data, error } = await db().from('branches')
      .insert({ tenant_id: B.tenantId, name: `[e2e] Repetida ${marca}`, slug: `e2e-un-eua${marca}` })
      .select('id').maybeSingle<{ id: string }>()
    if (data) criadas.push(data.id)
    expect(error?.code, 'o slug da unidade da rede A, na rede B').toBe('23505')
  })
})
