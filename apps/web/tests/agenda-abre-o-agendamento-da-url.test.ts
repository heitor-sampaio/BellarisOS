import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agendamentoDaUrl, semOAgendamento } from '@/components/shared/agendamento-da-url'

/**
 * D5 da 29ª: a busca leva quem tem a Agenda (sem o Atendimento) a
 * `…/agenda?date=AAAA-MM-DD&agendamento=<id>` (na rede, com `&unidade=`). A
 * agenda ABRE esse agendamento e tira o parâmetro da URL — recarregar não o
 * reabre —, como o `?novo=1` (`useNovoAgendamentoDaUrl`).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o agendamento pedido pela URL', () => {
  const lista = [{ id: 'a1' }, { id: 'a2' }]
  it('acha o agendamento da lista pelo id', () => {
    expect(agendamentoDaUrl('a2', lista)).toEqual({ id: 'a2' })
  })
  it('sem o parâmetro, ou com um id que a agenda não tem, nada abre', () => {
    expect(agendamentoDaUrl(null, lista)).toBeNull()
    expect(agendamentoDaUrl('outro', lista)).toBeNull()
  })
  it('sai da URL e o resto fica (o dia, a unidade, os filtros)', () => {
    expect(semOAgendamento('date=2026-11-25&agendamento=a1&unidade=u1')).toBe('date=2026-11-25&unidade=u1')
    expect(semOAgendamento('agendamento=a1')).toBe('')
  })
  it('as duas agendas abrem por ele', () => {
    expect(fonte('components/branch/agenda-calendar.tsx')).toMatch(/useAgendamentoDaUrl\(events,\s*abrirEvento\)/)
    expect(fonte('components/admin/admin-agenda-view.tsx')).toMatch(/useAgendamentoDaUrl\(appointments,\s*abrir\)/)
  })
})
