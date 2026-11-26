import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * D14 da 33ª simulação e a Decisão A (decisão do Claude, 26/11, princípio 5):
 * a desistência no meio do atendimento ACONTECEU na hora da desistência. A
 * A08 (iniciada 10:11, desistida 10:12, marcada para 14:15) contava como
 * "Cancelado 1" nos Relatórios do dia e ficava fora dos "Cancelados/faltas"
 * do dashboard (até agora: CC-03), porque o `aconteceu_em` do cancelado é a
 * hora marcada. Como o concluído antes da hora vale pelo `completed_at`
 * (D13, o Heitor, 2026-10-22), o iniciado e cancelado antes da hora vale pelo
 * `cancelled_at`. O cancelado sem início (não houve atendimento) segue na hora
 * marcada.
 */
const DIR = path.resolve(__dirname, '../../../supabase/migrations')

function ultimaQueMexeEmAconteceuEm(): { nome: string; sql: string } {
  const mexem = fs.readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()
    .filter(n => /aconteceu_em\s+(timestamptz\s+generated|set\s+expression)/i.test(fs.readFileSync(path.join(DIR, n), 'utf8')))
  const nome = mexem[mexem.length - 1]!
  return { nome, sql: fs.readFileSync(path.join(DIR, nome), 'utf8') }
}

describe('o aconteceu_em da desistência', () => {
  it('a última definição da coluna conta o iniciado e cancelado antes da hora pela hora do cancelamento', () => {
    const { nome, sql } = ultimaQueMexeEmAconteceuEm()
    const corpo = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ')
    expect(corpo, nome).toMatch(/when status = 'CANCELLED' and started_at is not null and cancelled_at is not null and cancelled_at < scheduled_at then cancelled_at/i)
    // O concluído antes segue pela conclusão (D13 de 22/10), e o resto pela hora marcada.
    expect(corpo, nome).toMatch(/when status = 'COMPLETED' and completed_at is not null and completed_at < scheduled_at then completed_at/i)
    expect(corpo, nome).toMatch(/else scheduled_at end/i)
    expect(sql, nome).toMatch(/notify pgrst, 'reload schema';\s*$/)
  })
})
