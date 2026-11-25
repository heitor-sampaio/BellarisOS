import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { destinoDoResultado } from '@/lib/busca/destino'
import { resultadoDaLinha } from '@/lib/busca/formatar'

/**
 * O agendamento achado na busca por quem tem a Agenda e não o Atendimento
 * (busca:AL-01 e o princípio 7; D5 da 29ª, decisão do Claude, 25/11): levava à
 * tela do atendimento, que pede o Atendimento em Ver — a pessoa caía no "sem
 * acesso". Agora vai à agenda, no dia do agendamento, com ele aberto
 * (`?date=&agendamento=`; no portal da rede, com a unidade dele). Quem tem o
 * Atendimento em Ver segue indo à tela do atendimento.
 */
const RAIZ = join(__dirname, '..')
const MIGRATIONS = join(RAIZ, '..', '..', 'supabase', 'migrations')

const ag = (extra = {}) => ({ tipo: 'agendamento' as const, id: 'a-1', titulo: 'Natércia', subtitulo: null, ...extra })

describe('o destino do agendamento achado na busca', () => {
  it('com o Atendimento: a tela do atendimento (como antes)', () => {
    expect(destinoDoResultado('/centro/x', 'centro', ag({ dia: '2026-11-27', unidadeId: 'b-1' }))).toBe('/centro/agenda/a-1')
  })
  it('sem o Atendimento, no portal da unidade: a agenda no dia, com ele aberto', () => {
    expect(destinoDoResultado('/centro/x', 'centro', ag({ dia: '2026-11-27', unidadeId: 'b-1', abreNaAgenda: true })))
      .toBe('/centro/agenda?date=2026-11-27&agendamento=a-1')
  })
  it('sem o Atendimento, no portal da rede: a agenda da rede na unidade dele', () => {
    expect(destinoDoResultado('/admin/x', null, ag({ dia: '2026-11-27', unidadeId: 'b-1', abreNaAgenda: true })))
      .toBe('/admin/agenda?date=2026-11-27&unidade=b-1&agendamento=a-1')
  })
  it('o resultado traz o dia (no fuso da unidade, do banco) e a unidade', () => {
    const r = resultadoDaLinha({
      tipo: 'agendamento', id: 'a-1', titulo: 'Ana', subtitulo: 'Limpeza',
      extra: { quando: '2026-11-28T02:30:00Z', dia: '2026-11-27', unidade_id: 'b-1', profissional: 'Lu', unidade: 'Centro' },
    })
    expect(r).toMatchObject({ dia: '2026-11-27', unidadeId: 'b-1' })
  })
  it('quem decide é o servidor, pelo Atendimento em Ver', () => {
    const t = readFileSync(join(RAIZ, 'actions/busca.ts'), 'utf8')
    expect(t).toMatch(/can\(ctx, 'atendimento', 'VIEW'\)/)
    expect(t).toContain('abreNaAgenda')
  })
  it('busca_universal devolve o dia no fuso da unidade e a unidade do agendamento', () => {
    const nomes = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
    const ultima = [...nomes].reverse().map(n => ({ n, sql: readFileSync(join(MIGRATIONS, n), 'utf8') }))
      .find(m => m.sql.includes('public.busca_universal('))!
    expect(ultima.sql, ultima.n).toMatch(/'dia',\s+to_char\(a\.scheduled_at at time zone b\.fuso, 'YYYY-MM-DD'\)/)
    expect(ultima.sql, ultima.n).toMatch(/'unidade_id',\s+b\.id/)
  })
})
