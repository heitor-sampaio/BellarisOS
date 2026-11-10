import { describe, it, expect } from 'vitest'
import { filtroDosClientesNovos, ehClienteNova } from '@/lib/copilot/clientes-novos'

// Sobra da F49 (10ª simulação, 2026-11-10): o Copilot listava os "clientes
// novos" pelo cadastro (created_at), e a importada de 2021 — cadastrada hoje —
// saía como nova. A regra é a do dashboard (indicadores.md, decisão 1 (c) da
// 8ª): coalesce(cliente_desde, created_at).
describe('os clientes novos do Copilot pela regra do dashboard', () => {
  const desde = new Date('2026-10-11T03:00:00.000Z') // 11/10/2026 00:00 em Brasília

  it('o filtro do PostgREST: sem "cliente desde", pelo cadastro; com ela, por ela', () => {
    expect(filtroDosClientesNovos(desde))
      .toBe('and(cliente_desde.is.null,created_at.gte.2026-10-11T03:00:00.000Z),cliente_desde.gte.2026-10-11')
  })

  it('a mesma regra, linha a linha (a importada de 2021 não é nova)', () => {
    expect(ehClienteNova({ clienteDesde: '2021-03-12', createdAt: '2026-11-10T05:00:00Z' }, desde)).toBe(false)
    expect(ehClienteNova({ clienteDesde: null, createdAt: '2026-11-10T05:00:00Z' }, desde)).toBe(true)
    expect(ehClienteNova({ clienteDesde: '2026-10-20', createdAt: '2026-11-10T05:00:00Z' }, desde)).toBe(true)
    expect(ehClienteNova({ clienteDesde: null, createdAt: '2026-10-10T12:00:00Z' }, desde)).toBe(false)
  })
})
