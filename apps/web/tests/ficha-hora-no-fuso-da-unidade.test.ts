import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// Importado no topo, não em cada caso: o `formatarNoFuso` traz o date-fns com as
// localidades, e a importação dentro do caso contava no tempo dele (passava de 5 s
// com a suíte cheia).
import { quandoNaFicha, diaNaFicha } from '@/lib/clientes/hora-na-ficha'

/**
 * D3 [indicadores:FU-02, "todo dia e toda hora de uma unidade saem no fuso
 * dela: … as telas (ficha …)"]: os "Próximos agendamentos" da ficha diziam a
 * hora no fuso da PÁGINA — a Drenagem das 15:00 em Fernando de Noronha
 * aparecia às 14:00 na ficha aberta em Caruaru. A hora sai no relógio da
 * unidade do agendamento e, quando não é o da tela, diz qual é (a regra da
 * agenda, `relogioSeOutro`, 26ª simulação).
 */

const WEB = join(__dirname, '..')
const fonte = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

describe('D3: a ficha diz a hora no relógio da unidade do agendamento', () => {
  it('Noronha vista de Brasília: 15:00, com o relógio', () => {
    // 17:00 UTC = 15:00 em Noronha (UTC−2) = 14:00 em Brasília.
    expect(quandoNaFicha('2026-11-26T17:00:00Z', 'America/Noronha', 'America/Sao_Paulo', 'HH:mm'))
      .toBe('15:00 (horário de Fernando de Noronha)')
  })
  it('no relógio da tela, sem texto a mais; sem o fuso da unidade, o da tela', () => {
    expect(quandoNaFicha('2026-11-26T17:00:00Z', 'America/Noronha', 'America/Noronha', 'HH:mm')).toBe('15:00')
    expect(quandoNaFicha('2026-11-26T17:00:00Z', null, 'America/Sao_Paulo', 'HH:mm')).toBe('14:00')
  })
  it('só o dia (o histórico): no dia da unidade, sem o relógio', () => {
    // 03:30 UTC do dia 27 = 23:30 do dia 26 em Manaus (UTC−4) = 01:30 do dia 27 em Noronha (UTC−2).
    expect(diaNaFicha('2026-11-27T03:30:00Z', 'America/Manaus', 'dd/MM')).toBe('26/11')
    expect(diaNaFicha('2026-11-27T03:30:00Z', 'America/Noronha', 'dd/MM')).toBe('27/11')
  })
  it('as páginas mandam o fuso de cada agendamento, e a ficha o usa', () => {
    for (const p of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(fonte(p), p).toMatch(/fuso:\s+fusos\[a\.branch_id as string\] \?\? null/)
    }
    const ficha = fonte('components/branch/client-profile.tsx')
    expect(ficha).toContain('quandoNaFicha(a.scheduledAt, a.fuso, fuso, "EEE, dd MMM · HH:mm")')
    expect(ficha).toContain('diaNaFicha(a.scheduledAt, a.fuso ?? fuso, "dd MMM yyyy")')
    expect(ficha).not.toContain('formatarNoFuso(a.scheduledAt, "EEE, dd MMM · HH:mm", fuso)')
  })
})
