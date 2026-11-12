import { describe, it, expect } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import { resolverCliente } from '@/lib/copilot/ferramentas/comum'
import type { ContextoDaFerramenta } from '@/lib/copilot/ferramentas/tipos'

/**
 * C5 do levantamento das regras (F70): o Copilot achava a cliente pelo nome
 * com `ilike` no nome cru — "Zelia" não achava "Zélia", nem "Duarte Camila"
 * achava "Camila Duarte". A busca de cliente tem UMA regra (D6 da 8ª,
 * `buscar_clientes`: sem acento, as palavras em qualquer ordem, o telefone
 * pelos dígitos), e o Copilot passa por ela.
 */
function admin(daRegra: { id: string; name: string; phone: string | null }[], pedidos: string[]) {
  const q = {
    select: () => q, eq: () => q, ilike: () => q, limit: () => q, or: () => q, order: () => q,
    then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
  }
  return {
    from: () => { pedidos.push('from'); return q },
    rpc: (nome: string) => { pedidos.push(nome); return Promise.resolve({ data: daRegra, error: null }) },
  } as unknown as ContextoDaFerramenta['admin']
}
const ctx = { tenantId: 't' } as TenantContext

describe('o Copilot acha a cliente pela regra única', () => {
  it('"Zelia" acha a "Zélia" (sem acento, pela busca do banco)', async () => {
    const pedidos: string[] = []
    const r = await resolverCliente({ ctx, admin: admin([{ id: 'c1', name: 'Zélia Prado', phone: null }], pedidos), pagina: '/', slugDoPortal: null }, 'Zelia')
    expect(pedidos).toContain('buscar_clientes')
    expect(r).toEqual({ id: 'c1', name: 'Zélia Prado', phone: null })
  })
  it('duas fichas: pergunta qual', async () => {
    const r = await resolverCliente({ ctx, admin: admin([
      { id: 'c1', name: 'Camila Duarte', phone: '5548999990001' }, { id: 'c2', name: 'Camila Dias', phone: null },
    ], []), pagina: '/', slugDoPortal: null }, 'camila')
    expect('erro' in r && r.erro).toMatch(/Mais de um cliente com "camila"/)
  })
})
