import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { recusaDoBloqueio, avisoDoBloqueioLongo } from '@/lib/agenda/bloqueio'

/**
 * O bloqueio da agenda acima de um ano AVISA, não recusa (AG-19). O Heitor,
 * 25/11, perguntado se um bloqueio mais longo (uma licença) recusa ou avisa:
 * escolheu "Acima de 1 ano avisa". Vale o fim que a pessoa escolher; acima de
 * um ano, a tela avisa ao lado do fim; só se recusa acima de 100 anos, o
 * limite das datas (decisão do Claude, 25/11: o "comum" é o teto de antes, um
 * ano; o impossível, os 36.500 dias de `LIMITE_DE_DIAS`).
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
const agora = new Date('2026-11-25T10:00:00-03:00')
const de = (inicio: string, fim: string) => ({ inicio: `${inicio}-03:00`, fim: `${fim}-03:00`, motivo: 'Licença' })

describe('recusaDoBloqueio: acima de um ano não se recusa', () => {
  it('a licença de dois anos grava', () => {
    expect(recusaDoBloqueio(de('2026-12-01T00:00:00', '2028-12-01T00:00:00'), agora)).toBeNull()
  })
  it('a de 99 anos também; acima de 100 anos é o impossível, e diz o limite', () => {
    expect(recusaDoBloqueio(de('2026-12-01T00:00:00', '2125-12-01T00:00:00'), agora)).toBeNull()
    expect(recusaDoBloqueio(de('2026-12-01T00:00:00', '2126-12-01T00:00:00'), agora))
      .toBe('No máximo 36.500 dias (100 anos, o limite das datas).')
  })
})

describe('avisoDoBloqueioLongo: acima de um ano, a tela avisa', () => {
  it('até um ano, nada (do dia 01/12 ao mesmo dia do ano seguinte)', () => {
    expect(avisoDoBloqueioLongo(de('2026-12-01T00:00:00', '2027-12-01T00:00:00'))).toBeNull()
    expect(avisoDoBloqueioLongo(de('2026-12-01T12:00:00', '2026-12-01T13:00:00'))).toBeNull()
  })
  it('passou de um ano: "Acima do comum (mais de 1 ano). Confira: o valor vale como está."', () => {
    expect(avisoDoBloqueioLongo(de('2026-12-01T00:00:00', '2027-12-02T00:00:00')))
      .toBe('Acima do comum (mais de 1 ano). Confira: o valor vale como está.')
  })
  it('o período inválido não avisa (a recusa é que fala)', () => {
    expect(avisoDoBloqueioLongo({ inicio: 'x', fim: 'y' })).toBeNull()
  })
})

describe('a tela e o banco', () => {
  it('a janela "Bloquear horário" mostra o aviso ao lado do fim', () => {
    const tela = fonte('components/shared/bloqueio-da-agenda.tsx')
    expect(tela).toMatch(/avisoDoBloqueioLongo\(/)
    expect(tela).toMatch(/data-acima-do-comum="bloqueio"/)
  })
  it('o banco aceita até 100 anos (o CHECK de um ano saiu)', () => {
    const pasta = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const arquivo = readdirSync(pasta).find(n => n.startsWith('20261207500001'))
    expect(arquivo, 'a migration 20261207500001').toBeTruthy()
    const sql = readFileSync(join(pasta, arquivo!), 'utf8')
    expect(sql).toMatch(/agenda_bloqueios_periodo/)
    expect(sql).toMatch(/interval '36500 days'/)
    expect(sql).toMatch(/notify pgrst, 'reload schema';/)
  })
})
