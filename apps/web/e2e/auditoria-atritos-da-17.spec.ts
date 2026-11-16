import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A27 e A28 da 17ª simulação (2026-11-15), numa rede própria — o que só o
 * banco prova (a frase de cada gravação, uma a uma, está em
 * tests/auditoria-atritos-da-17.test.ts):
 *
 * - A27: a auditoria grava `{}` em `contacts` e `leads` (minimização, e a
 *   gravação não muda); a leitura busca o nome agora, como o da cliente.
 * - A28: o filtro por unidade é pela unidade da GRAVAÇÃO. Uma gravação com
 *   linhas de duas unidades (duas salas num comando só) aparece no filtro de
 *   UMA delas, inteira — era uma linha em cada.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let outraUnidade: string

test.beforeAll(async () => {
  rede = await criarOutraRede(`aud17${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Segunda ${marca}`, slug: `e2e-aud17-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  outraUnidade = b!.id
  dona = await criarMembro(`aud17d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A27: o contato e a oportunidade saem pelo nome, lido agora', async ({ browser }) => {
  const nome = `Camila ${marca}`
  const { data: contato, error: eC } = await db().from('contacts').insert({ tenant_id: rede.tenantId, name: nome }).select('id').single<{ id: string }>()
  expect(eC).toBeNull()
  expect((await db().from('leads').insert({ tenant_id: rede.tenantId, name: nome, contato_id: contato!.id })).error).toBeNull()
  const { data: gravada } = await db().from('auditoria').select('depois').eq('tenant_id', rede.tenantId)
    .eq('registro_id', contato!.id).eq('operacao', 'criou').single<{ depois: Record<string, unknown> }>()
  expect(gravada!.depois, 'a gravação não guarda o nome (minimização)').toEqual({})

  const ctx = await browser.newContext({ storageState: dona.estado, viewport: { width: 1440, height: 900 } })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/auditoria')
    await expect(p.locator('[data-linha-da-auditoria]', { hasText: `Criou o contato ${nome}` }).first()).toBeVisible()
    await expect(p.locator('[data-linha-da-auditoria]', { hasText: `Criou a oportunidade ${nome}` }).first()).toBeVisible()
  } finally { await ctx.close() }
})

test('A28: a gravação de duas unidades aparece no filtro de UMA delas, inteira', async ({ browser }) => {
  const sala = `Sala ${marca}`
  // Um comando só: as duas linhas da auditoria têm o mesmo instante (a mesma gravação).
  expect((await db().from('rooms').insert([
    { branch_id: rede.branchId, name: `${sala} A` },
    { branch_id: outraUnidade, name: `${sala} B` },
  ])).error).toBeNull()

  const ctx = await browser.newContext({ storageState: dona.estado, viewport: { width: 1440, height: 900 } })
  try {
    const p = await ctx.newPage()
    const linhasNa = async (unidade: string) => {
      await p.goto(`/admin/auditoria?unidade=${unidade}`)
      await expect(p.getByLabel('Unidade')).toHaveValue(unidade)
      return p.locator('[data-linha-da-auditoria]', { hasText: /Criou (2 salas|a sala)/ }).allTextContents()
    }
    const naPrimeira = await linhasNa(rede.branchId)
    const naSegunda = await linhasNa(outraUnidade)
    const daGravacao = [...naPrimeira, ...naSegunda]
    expect(daGravacao, 'a gravação aparece uma vez só, num dos filtros').toHaveLength(1)
    expect(daGravacao[0]).toMatch(/Criou 2 salas/)
  } finally { await ctx.close() }
})
