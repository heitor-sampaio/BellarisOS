import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { textoDoConcluido } from '@/lib/agenda/hora-real'

// J-34 (2026-10-30): o concluído mostra a hora real, ao lado da agendada.

describe('a hora real do concluído', () => {
  it('no mesmo dia (Brasília): "concluído às HH:mm"', () => {
    expect(textoDoConcluido('2026-10-30T13:00:00.000Z', '2026-10-30T14:12:00.000Z')).toBe('concluído às 11:12')
  })
  it('passou da meia-noite: com a data', () => {
    // Agendado 23:30 de 30/10 (02:30Z de 31/10), concluído 00:22 de 31/10 (03:22Z).
    expect(textoDoConcluido('2026-10-31T02:30:00.000Z', '2026-10-31T03:22:00.000Z')).toBe('concluído em 31/10 às 00:22')
  })
  it('o dia é o de Brasília, não o UTC', () => {
    // 22:00 e 23:50 de 30/10 em Brasília já são 31/10 em UTC: o mesmo dia.
    expect(textoDoConcluido('2026-10-31T01:00:00.000Z', '2026-10-31T02:50:00.000Z')).toBe('concluído às 23:50')
  })
  it('sem a hora real: nulo', () => {
    expect(textoDoConcluido('2026-10-30T13:00:00.000Z', null)).toBeNull()
    expect(textoDoConcluido('2026-10-30T13:00:00.000Z', 'lixo')).toBeNull()
  })
})

// D11 da 42ª (AG-24): o Histórico do app dizia só "Dra. Lucélia · 28 de nov. de
// 2026" — a consulta nem lia `completed_at`. Ele diz a hora como a Agenda do app:
// "marcado para 07:30 · concluído às 07:17" (o mesmo `textoDoHorarioNoHistorico`).
describe('o Histórico do app mostra a hora real do concluído (AG-24)', () => {
  const ler = (arq: string) => readFileSync(resolve(__dirname, '..', arq), 'utf8')
  it('a página lê a hora real e monta o texto como a Agenda do app', () => {
    const pagina = ler('app/[slug]/cliente/historico/page.tsx')
    expect(pagina).toMatch(/select\('id, scheduled_at, completed_at,/)
    expect(pagina).toMatch(/textoDoHorarioNoHistorico\(/)
    expect(pagina).toMatch(/textoDoConcluido\(r\.scheduled_at, r\.completed_at,/)
  })
  it('o cartão do Histórico mostra esse texto', () => {
    expect(ler('components/client-portal/historico-tabs.tsx')).toMatch(/data-hora-real[^>]*>\s*\{p\.horario\}/)
  })
})
