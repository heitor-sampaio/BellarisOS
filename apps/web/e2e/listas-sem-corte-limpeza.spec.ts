import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * A limpeza do E2E aguenta MIL clientes de uma vez (2026-10-27).
 *
 * `apagarClientes` manda a lista de ids no `.in()` — e o `.in()` vai na URL.
 * Com mil ids a URL passa do limite e o PostgREST responde "Bad Request" em
 * cada passo. A varredura de sobras pega os mil `[e2e]` mais velhos (o teto
 * de um select), e três redes do `listas-sem-corte` de 2026-10-23 (2.883
 * clientes) deixaram a varredura falhando em toda rodada desde então —
 * "NÃO apagou clientes: Bad Request", e com os clientes no caminho, as redes
 * e as unidades também não saíam (clients_branch_id_fkey). A frente 9 achou.
 */

const marca = Date.now().toString(36)
const MIL = 1000
let outra: OutraRede | null = null

test.beforeAll(async () => {
  outra = await criarOutraRede(`lmp${marca}`)
})

test.afterAll(async () => {
  if (!outra) return
  // Se o teste falhou, os mil ainda estão lá: saem em lotes, como o
  // listas-sem-corte faz, antes da rede.
  const { data } = await banco().from('clients').select('id').eq('tenant_id', outra.tenantId).limit(MIL)
  const ids = (data ?? []).map(c => c.id as string)
  for (let i = 0; i < ids.length; i += 150) await apagarClientes(ids.slice(i, i + 150))
  await outra.limpar()
})

test('apagarClientes com mil clientes não falha e apaga todos', async () => {
  test.setTimeout(180_000)
  const b = banco()
  const linhas = Array.from({ length: MIL }, (_, i) => ({
    tenant_id: outra!.tenantId, branch_id: outra!.branchId,
    name: `${PREFIXO} limpeza ${marca} ${i}`, phone: '55489' + String(i).padStart(8, '0'),
  }))
  const { data, error } = await b.from('clients').insert(linhas).select('id')
  expect(error, 'criar os mil clientes').toBeNull()
  const ids = (data ?? []).map(c => c.id as string)
  expect(ids).toHaveLength(MIL)

  const falhas = await apagarClientes(ids)
  expect(falhas, 'a limpeza não falha').toEqual([])

  const { count } = await b.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', outra!.tenantId)
  expect(count, 'nenhum dos mil sobra').toBe(0)
})
