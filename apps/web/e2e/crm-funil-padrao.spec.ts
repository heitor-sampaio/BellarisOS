import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { DEFAULT_FUNNEL_NAME, DEFAULT_STAGES } from '../lib/crm'

/**
 * O primeiro acesso de vários ao mesmo tempo cria UM funil padrão, com as
 * etapas todas (2026-10-27, frente 9).
 *
 * `seedDefaultFunnel` fazia o funil e as etapas em duas idas ao banco: a
 * corrida do primeiro acesso dava "duplicate key uq_crm_funnels_default" (visto
 * no crm-atritos), e quem caísse entre as duas idas deixava o funil sem etapa.
 * Agora é `crm_funil_padrao` (uma transação, com a rede travada): oito
 * chamadas juntas devolvem o MESMO funil, e cada uma já o encontra completo.
 */

const marca = Date.now().toString(36)
let outra: OutraRede | null = null

test.beforeAll(async () => { outra = await criarOutraRede(`fp${marca}`) })
test.afterAll(async () => { await outra?.limpar() })

const ETAPAS = DEFAULT_STAGES.map((s, i) => ({ name: s.name, color: s.color, position: i, outcome: s.outcome, marca: s.marca ?? null }))

test('oito primeiros acessos juntos: um funil, com as sete etapas, para todos', async () => {
  const b = banco()
  const chamar = async () => {
    const { data, error } = await b.rpc('crm_funil_padrao', { p_tenant: outra!.tenantId, p_nome: DEFAULT_FUNNEL_NAME, p_etapas: ETAPAS })
    expect(error, 'a função não falha na corrida').toBeNull()
    const funis = (data ?? []) as { id: string; is_default: boolean }[]
    // Quem volta já acha o funil COMPLETO — nunca um funil sem etapa.
    const { count } = await b.from('crm_stages').select('id', { count: 'exact', head: true }).eq('funnel_id', funis[0]?.id ?? '')
    return { ids: funis.map(f => f.id), etapas: count }
  }
  const respostas = await Promise.all(Array.from({ length: 8 }, chamar))

  const ids = new Set(respostas.flatMap(r => r.ids))
  expect(ids.size, 'todos devolvem o mesmo funil').toBe(1)
  expect(respostas.map(r => r.etapas), 'cada um já o encontra com as etapas').toEqual(Array(8).fill(DEFAULT_STAGES.length))

  const { data: funis } = await b.from('crm_funnels').select('id, name, is_default').eq('tenant_id', outra!.tenantId)
  expect(funis, 'um funil só na rede').toHaveLength(1)
  expect(funis![0]).toMatchObject({ name: DEFAULT_FUNNEL_NAME, is_default: true })
  const { data: etapas } = await b.from('crm_stages').select('name, marca').eq('tenant_id', outra!.tenantId).order('position')
  expect(etapas!.map(e => e.name)).toEqual(DEFAULT_STAGES.map(s => s.name))
  expect(etapas!.find(e => e.name === 'Agendado')?.marca).toBe('AGENDADO')

  // A rede que JÁ tem funil não ganha outro, nem etapa a mais.
  await chamar()
  const { count } = await b.from('crm_stages').select('id', { count: 'exact', head: true }).eq('tenant_id', outra!.tenantId)
  expect(count).toBe(DEFAULT_STAGES.length)
})
