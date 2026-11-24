import { describe, it, expect } from 'vitest'
import { ordenarTransacoesDaFicha } from '../lib/clientes/ordem-das-transacoes'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// D7 da 10ª simulação: as Transações da ficha em ordem pela data que a linha
// mostra. E o em aberto vem antes, pelo vencimento, do mais antigo ao mais
// novo (a vencida, ou a mais próxima, primeiro — vendas-financeiro.md, a aba
// Financeiro da ficha).
describe('a ordem das Transações da ficha', () => {
  const criado = '2026-11-10T05:00:00.000Z'
  const linha = (id: string, extra: Partial<Parameters<typeof ordenarTransacoesDaFicha>[0][number]>) =>
    ({ id, isPaid: false, dueDate: null, scheduledAt: null, createdAt: criado, ...extra })

  it('as parcelas gravadas juntas saem pelo vencimento (a mais próxima primeiro), e a entrada paga depois', () => {
    const r = ordenarTransacoesDaFicha([
      linha('p3', { dueDate: '2027-02-08T15:00:00Z', parcela: 3 }),
      linha('p1', { dueDate: '2026-12-10T15:00:00Z', parcela: 1 }),
      linha('entrada', { isPaid: true }),
      linha('p2', { dueDate: '2027-01-09T15:00:00Z', parcela: 2 }),
    ])
    expect(r.map(l => l.id)).toEqual(['p1', 'p2', 'p3', 'entrada'])
  })
  it('a paga com vencimento vale pelo atendimento ou pelo lançamento (é o que a linha mostra)', () => {
    const r = ordenarTransacoesDaFicha([
      linha('paga', { isPaid: true, dueDate: '2027-01-01T00:00:00Z', createdAt: '2026-10-01T00:00:00Z' }),
      linha('atendimento', { isPaid: true, scheduledAt: '2026-11-01T13:00:00Z' }),
    ])
    expect(r.map(l => l.id)).toEqual(['atendimento', 'paga'])
  })
  it('no empate de vencimento do em aberto, a parcela menor primeiro; no do pago, a maior', () => {
    const abertas = ordenarTransacoesDaFicha([
      linha('a', { dueDate: '2026-12-10T15:00:00Z', parcela: 1 }),
      linha('b', { dueDate: '2026-12-10T15:00:00Z', parcela: 2 }),
    ])
    expect(abertas.map(l => l.id)).toEqual(['a', 'b'])
    const pagas = ordenarTransacoesDaFicha([
      linha('a', { isPaid: true, parcela: 1 }),
      linha('b', { isPaid: true, parcela: 2 }),
    ])
    expect(pagas.map(l => l.id)).toEqual(['b', 'a'])
  })
})

// As parcelas da ficha em ordem de vencimento: a vencida (ou a mais próxima)
// primeiro, e a vencida não paga em destaque, com "Vencida há N dias"
// (vendas-financeiro.md, a aba Financeiro da ficha).
describe('as parcelas da ficha em ordem de vencimento', () => {
  const linha = (id: string, extra: Record<string, unknown>) =>
    ({ id, isPaid: false, dueDate: null, scheduledAt: null, createdAt: '2026-11-01T12:00:00Z', ...extra })

  it('o em aberto vem primeiro, do vencimento mais antigo (a vencida) ao mais novo; depois o resto, do mais novo', () => {
    const r = ordenarTransacoesDaFicha([
      linha('paga-antiga', { isPaid: true, createdAt: '2026-09-01T12:00:00Z' }),
      linha('p3', { dueDate: '2027-01-15T15:00:00Z', parcela: 3 }),
      linha('vencida', { dueDate: '2026-11-05T15:00:00Z', parcela: 1 }),
      linha('paga-nova', { isPaid: true, createdAt: '2026-11-10T12:00:00Z' }),
      linha('p2', { dueDate: '2026-12-15T15:00:00Z', parcela: 2 }),
    ])
    expect(r.map(l => l.id)).toEqual(['vencida', 'p2', 'p3', 'paga-nova', 'paga-antiga'])
  })
  it('o estornado e o estorno não são parcela em aberto', () => {
    const r = ordenarTransacoesDaFicha([
      linha('estornada', { dueDate: '2026-10-01T15:00:00Z', estornada: true, createdAt: '2026-10-01T12:00:00Z' }),
      linha('aberta', { dueDate: '2026-12-01T15:00:00Z' }),
    ])
    expect(r.map(l => l.id)).toEqual(['aberta', 'estornada'])
  })
  it('o a receber sem vencimento fica depois dos que têm', () => {
    const r = ordenarTransacoesDaFicha([
      linha('sem-data', {}),
      linha('com-data', { dueDate: '2027-03-01T15:00:00Z' }),
    ])
    expect(r.map(l => l.id)).toEqual(['com-data', 'sem-data'])
  })
})

describe('a ficha mostra a vencida em destaque', () => {
  const fonte = (arq: string) => readFileSync(path.resolve(__dirname, '..', arq), 'utf8')
  it('o servidor manda os dias da vencida, pelo fuso da unidade do lançamento', () => {
    const f = fonte('lib/clientes/financeiro-da-ficha.ts')
    expect(f).toMatch(/diasVencida:/)
    expect(f).toMatch(/diasAteOVencimento\(l\.due_date!?, agora, fusos\.get\(l\.branch_id \?\? ''\)\)/)
  })
  it('a linha da vencida tem o fundo de alerta (token) e o chip diz "Vencida há N dias"', () => {
    const f = fonte('components/branch/client-profile.tsx')
    expect(f).toMatch(/data-vencida-da-ficha/)
    expect(f).toMatch(/var\(--danger-soft\)/)
    expect(f).toMatch(/<SituacaoDoEmAberto vencida vencimento=\{t\.dueDate\} diasVencida=\{t\.diasVencida/)
    const chip = fonte('components/shared/situacao-do-em-aberto.tsx')
    expect(chip).toMatch(/vencidaHaEmTexto\(diasVencida\)/)
  })
})
