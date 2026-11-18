import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Desligar (ou remover) o número oficial NÃO apaga os rascunhos de template
 * (decisão do Claude pelo princípio do menos destrutivo, 2026-11-18, na
 * auditoria das regras). O rascunho nunca foi à Meta: ligar de novo não o
 * traria de volta, e apagá-lo era perder o que a rede escreveu. O que está na
 * Meta continua saindo daqui (ligar de novo o importa).
 */

type Op = { op: string; args: unknown[] }
const pedidos: Op[][] = []

function construtor() {
  const ops: Op[] = []
  pedidos.push(ops)
  const b: Record<string, unknown> = {}
  for (const op of ['delete', 'eq', 'neq', 'or', 'not', 'in', 'select']) {
    b[op] = (...args: unknown[]) => { ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: { data: null; error: null }) => unknown) => Promise.resolve({ data: null, error: null }).then(ok)
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/whatsapp/factory', () => ({ getNumerosDaRede: async () => [] }))
vi.mock('@/lib/templates/meta-api', () => ({ listarCatalogoDaMeta: async () => [] }))

beforeEach(() => { pedidos.length = 0 })

describe('desligar o número oficial e os rascunhos de template', () => {
  it('a limpeza das contas sem número deixa os rascunhos', async () => {
    const { limparCatalogosSemNumero } = await import('@/lib/templates/catalogo')
    const admin = { from: construtor } as never
    await limparCatalogosSemNumero(admin, 't1')
    const apagar = pedidos.find(ops => ops.some(o => o.op === 'delete'))
    expect(apagar, 'a limpeza apaga alguma coisa').toBeTruthy()
    expect(apagar!.some(o => o.op === 'neq' && o.args[0] === 'status' && o.args[1] === 'DRAFT'),
      'o delete tem de deixar de fora o status DRAFT').toBe(true)
  })
})
