import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { EVENTOS, ROTULOS_DE_EVENTO, CAMPOS_DO_EVENTO } from '@estetica-os/types'

/**
 * aut-04 (decisão do Heitor, 2026-11-02): "não tem necessidade real de um
 * 'retorno em x dias', isso é basicamente só um novo agendamento com motivo
 * específico, não tem necessidade de ter uma regra de negócio para isso".
 * Saem o campo da conclusão, a lista "Retornos a marcar", o cron `retornos`
 * e o evento `agendamento.retorno_vencendo` (D-12, 98e63677). As colunas
 * ficam até a migration de limpeza (drop, com confirmação humana).
 */
const web = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(web, p), 'utf8')

describe('o "Retorno em N dias" saiu (aut-04)', () => {
  it('a janela de finalizar não pede o retorno, e a action não o manda ao banco', () => {
    expect(ler('components/branch/appointment-session.tsx')).not.toMatch(/retorno_dias|Retorno em \(dias\)/)
    expect(ler('actions/appointments.ts')).not.toMatch(/retorno_dias|lerRetornoEmDias/)
  })

  it('o dashboard da unidade não tem mais "Retornos a marcar"', () => {
    expect(ler('app/[slug]/dashboard/page.tsx')).not.toMatch(/retornos/i)
    expect(existsSync(join(web, 'components/branch/retornos-a-marcar.tsx'))).toBe(false)
    expect(existsSync(join(web, 'lib/agenda/retornos.ts'))).toBe(false)
  })

  it('não há cron `retornos` nem o evento "Retorno vencendo"', () => {
    expect(existsSync(join(web, 'app/api/cron/retornos'))).toBe(false)
    expect(readFileSync(join(web, '../../scripts/cron.mjs'), 'utf8')).not.toMatch(/'retornos'/)
    expect(Object.values(EVENTOS)).not.toContain('agendamento.retorno_vencendo')
    expect(Object.keys(ROTULOS_DE_EVENTO)).not.toContain('agendamento.retorno_vencendo')
    expect(Object.keys(CAMPOS_DO_EVENTO)).not.toContain('agendamento.retorno_vencendo')
  })
})
