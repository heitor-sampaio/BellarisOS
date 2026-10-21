import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A faixa etária é a mesma no dashboard (metrics_demografia) e nos relatórios
 * (metrics_faixa_etaria): a simulação de um dia de clínica (2026-10-20) viu
 * "26–35" num e "25–34" no outro para a mesma pessoa (D33).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => { rede = await criarOutraRede(`fe${marca}`) })
test.afterAll(async () => { await rede?.limpar() })

test('34 anos é "25–34" nas duas', async () => {
  const cliente = await rede!.criarCliente('Faixa etária')
  const nascimento = new Date()
  nascimento.setUTCFullYear(nascimento.getUTCFullYear() - 34, 0, 1)
  await db().from('clients').update({ birth_date: `${nascimento.toISOString().slice(0, 10)}T00:00:00Z` }).eq('id', cliente)

  const { data: faixa } = await db().rpc('metrics_faixa_etaria', { p_nascimento: `${nascimento.toISOString().slice(0, 10)}T00:00:00Z` })
  const { data: demo, error } = await db().rpc('metrics_demografia', { p_tenant: rede!.tenantId, p_branch_ids: null, p_to: new Date().toISOString() })
  expect(error).toBeNull()
  const idades = (demo as { idades: { faixa: string; n: number }[] }).idades
  expect(faixa).toBe('25–34')
  expect(idades).toEqual([{ faixa: '25–34', n: 1 }])
})
