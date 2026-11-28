import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * D3 da 41ª simulação (NE-04: "Quem causou o fato não recebe o aviso dele"): a
 * Jussara (Estoque em Gerenciar, "A rede inteira") recebeu os dois avisos de
 * "Estoque no mínimo/abaixo" da transferência que ELA fez. O aviso saía sem
 * ator, e a fila do cruzamento não sabia quem fez o movimento.
 *
 * Agora o cruzamento leva o AUTOR: quem gravou o movimento que cruzou o mínimo
 * (o `created_by` do movimento de estoque da mesma transação — a
 * transferência, a entrada, a saída avulsa, a venda, e o atendimento
 * concluído: quem concluiu). O aviso o exclui. Sem autor (o mínimo salvo à
 * mão, o 'sistema'), segue indo a todos.
 */

const raiz = path.resolve(__dirname, '..')
const lerArquivo = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')

const notificarInteressados = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
vi.mock('@/lib/notifications/interessados', () => ({ notificarInteressados: (...a: unknown[]) => notificarInteressados(...a) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('sem banco no teste') } }))

const cruzamento = (id: string, autor: string | null) => ({
  id, tenant_id: 'rede-1', branch_id: 'unidade-1', product_id: 'mascara', cruzou_em: '2026-11-28T12:00:00Z',
  current_stock: 2, current_rendimento: null, min_stock: 3, autor_id: autor,
  branch_product_stock: { minimo_avisado_em: null, products: { name: 'Máscara', unit: 'un', consumption_unit: null, units_per_package: null, is_active: true, min_stock: null } },
})

function adminFalso(fila: ReturnType<typeof cruzamento>[]) {
  const selects: string[] = []
  const from = (tabela: string) => {
    let atualiza = false
    let id: string | null = null
    const resolver = () => {
      if (tabela !== 'estoque_cruzamentos_do_minimo') return { data: [], error: null }
      if (!atualiza) return { data: fila, error: null }
      return { data: id ? [{ id }] : [], error: null }
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: (s?: string) => { if (s) selects.push(s); return b },
      update: () => { atualiza = true; return b },
      eq: (k: string, v: unknown) => { if (k === 'id') id = String(v); return b },
      is: () => b, gt: () => b, order: () => b,
      range: () => Promise.resolve(resolver()),
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, falha),
    })
    return b
  }
  return { admin: { from } as never, selects }
}

describe('o aviso do mínimo não vai a quem causou (NE-04)', () => {
  beforeEach(() => { notificarInteressados.mockReset() })

  it('a fila é lida com o autor, e o aviso o passa como ator', async () => {
    const { avisarEstoqueMinimo } = await import('@/lib/estoque/aviso-do-minimo')
    const { admin, selects } = adminFalso([cruzamento('c1', 'jussara')])
    await avisarEstoqueMinimo(admin, { tenantId: 'rede-1' })
    expect(selects[0]).toContain('autor_id')
    expect(notificarInteressados.mock.calls[0]![1]).toEqual({ modulo: 'stock', branchId: 'unidade-1', ator: 'jussara' })
  })

  it('sem autor (o mínimo salvo à mão, a rotina), segue a todos: sem ator', async () => {
    const { avisarEstoqueMinimo } = await import('@/lib/estoque/aviso-do-minimo')
    const { admin } = adminFalso([cruzamento('c1', null)])
    await avisarEstoqueMinimo(admin, { tenantId: 'rede-1' })
    expect(notificarInteressados.mock.calls[0]![1]).not.toHaveProperty('ator')
  })
})

describe('o cruzamento guarda quem fez o movimento (migration da faixa C)', () => {
  const nome = readdirSync(path.join(raiz, '../../supabase/migrations')).find(f => /^202612204\d{5}_.*minimo.*\.sql$/.test(f))
  const sql = () => {
    expect(nome, 'a migration da faixa C (20261220400001…) sobre o autor do mínimo').toBeTruthy()
    return lerArquivo(`../../supabase/migrations/${nome}`)
  }

  it('a fila ganha o autor (o membro, users.id)', () => {
    expect(sql()).toMatch(/alter table public\.estoque_cruzamentos_do_minimo add column if not exists autor_id uuid/)
  })

  it('o gatilho do saldo lê o autor no movimento da MESMA transação, e o do movimento completa o cruzamento que nasceu antes dele', () => {
    const s = sql()
    // O movimento gravado antes do saldo: o gatilho do cruzamento o acha.
    expect(s).toMatch(/from public\.stock_movements m[\s\S]*?m\.created_at = now\(\)/)
    // O movimento gravado depois do saldo: o gatilho do movimento completa.
    expect(s).toMatch(/create trigger \w+\s+after insert on public\.stock_movements/)
    expect(s).toMatch(/update public\.estoque_cruzamentos_do_minimo[\s\S]*?autor_id is null[\s\S]*?cruzou_em = now\(\)/)
    // Só o id de um membro ('sistema' não é autor).
    expect(s).toMatch(/~ '\^\[0-9a-f\]\{8\}-/)
  })

  it('as funções ficam fora da sessão, e o PostgREST recarrega', () => {
    const s = sql()
    expect(s).toMatch(/revoke execute on function private\.estoque_autor_do_cruzamento_do_minimo\(\) from public, anon, authenticated/)
    expect(s.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
