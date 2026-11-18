import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NODES, ROTULOS_DE_NO, DADOS_DO_NO } from '@estetica-os/types'

/**
 * "Remover tag" de volta nas automações (auditoria das regras, 2026-11-18).
 * A fala do T4 (revisao.md:427) só deu o NOME, "adicionar tag"; o modo de
 * remover saiu por leitura do Claude, e "simplificar não é reduzir
 * funcionalidade" (o Heitor, 2026-11-11). A ação volta, própria, ao lado da
 * "Adicionar tag" — e o passo antigo gravado com o modo de remover, que não
 * fazia nada, volta a tirar a tag.
 */

let tagsDoCliente: string[] = []
const gravadas: unknown[] = []

function construtor() {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq']) b[op] = () => b
  b.update = (patch: unknown) => { gravadas.push(patch); return b }
  b.maybeSingle = () => b
  b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: { tags: tagsDoCliente }, error: null }).then(ok)
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/events/cliente', () => ({ emitirEventoDeCliente: vi.fn(async () => {}) }))
vi.mock('@/lib/events/lead', () => ({ emitirEventoDeLead: vi.fn(), eventoDoDesfecho: vi.fn(), etapaDeCrm: vi.fn() }))
vi.mock('@/lib/lead-events', () => ({ registrarEventoLead: vi.fn() }))
vi.mock('@/lib/crm/responsavel', () => ({ trocarResponsavelCore: vi.fn() }))

const ATOR = { tenantId: 't1', automacaoId: 'a1', nome: 'Pós-venda', profundidade: 0 }

beforeEach(() => { tagsDoCliente = []; gravadas.length = 0 })

describe('Remover tag', () => {
  it('é uma ação própria da paleta, com nome e o que deixa', () => {
    expect(ROTULOS_DE_NO[NODES.ACAO_REMOVER_TAG]).toBe('Remover tag')
    expect(DADOS_DO_NO[NODES.ACAO_REMOVER_TAG].map(d => d.campo)).toContain('alterado')
    const editor = readFileSync(path.join(__dirname, '..', 'components/admin/automacoes/editor.tsx'), 'utf8')
    expect(editor).toMatch(/NODES\.ACAO_REMOVER_TAG/)
  })

  it('tira a tag do cliente', async () => {
    tagsDoCliente = ['VIP', 'Indicação']
    const { removerTagDoCliente } = await import('@/lib/automacoes/acoes-crm')
    const r = await removerTagDoCliente(ATOR, { cliente: { id: 'c1' } } as never, 'VIP')
    expect(r).toEqual({ alterado: true, tag: 'VIP' })
    expect(gravadas).toEqual([{ tags: ['Indicação'] }])
  })

  it('sem a tag, nada a fazer (não é erro)', async () => {
    tagsDoCliente = ['Indicação']
    const { removerTagDoCliente } = await import('@/lib/automacoes/acoes-crm')
    const r = await removerTagDoCliente(ATOR, { cliente: { id: 'c1' } } as never, 'VIP')
    expect(r.alterado).toBe(false)
    expect(gravadas).toEqual([])
  })

  it('o passo antigo, gravado com o modo de remover, volta a tirar a tag', () => {
    const exec = readFileSync(path.join(__dirname, '..', 'lib/automacoes/executar.ts'), 'utf8')
    expect(exec).not.toMatch(/Refaça este passo/)
    expect(exec).toMatch(/modo === 'remover'[\s\S]{0,200}removerTagDoCliente/)
  })
})
