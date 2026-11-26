import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rotuloDaUltimaVisita } from '@/lib/clientes/ultima-visita'

/**
 * A "Última visita há N dias" da lista de Clientes (D9 da 33ª simulação):
 * contava as HORAS desde a visita (`Date.now() - visita`, e o
 * `formatDistanceToNow` arredondava), e o número mudava no correr do dia —
 * "há 20 dias" de manhã, "há 21 dias" à tarde. CLAUDE.md §14: dia se conta no
 * fuso, não pela meia-noite UTC nem pelo relógio do processo. Conta em dias de
 * CALENDÁRIO no fuso do portal (o da unidade; na rede, o da rede).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const SP = 'America/Sao_Paulo'
const CUIABA = 'America/Cuiaba'

describe('a "Última visita" da lista de Clientes conta dias de calendário', () => {
  // A visita: 05/11 às 02:00 de Brasília (05:00 UTC) — à tarde de 25/11 já são 20,8 dias.
  const visita = '2026-11-05T05:00:00.000Z'

  it('o número não muda no correr do dia (de manhã e à tarde, o mesmo)', () => {
    const manha = new Date('2026-11-25T11:00:00.000Z') // 08:00 de Brasília
    const tarde = new Date('2026-11-25T23:30:00.000Z') // 20:30 de Brasília
    expect(rotuloDaUltimaVisita(visita, manha, SP)).toBe(rotuloDaUltimaVisita(visita, tarde, SP))
    expect(rotuloDaUltimaVisita(visita, manha, SP)).toBe('Última visita: há 20 dias')
  })

  it('"Ontem" é o dia de calendário anterior, mesmo com menos de 24 horas', () => {
    // Ontem às 22:00, hoje às 08:00 de Brasília: 10 horas, mas foi ontem.
    expect(rotuloDaUltimaVisita('2026-11-25T01:00:00.000Z', new Date('2026-11-25T11:00:00.000Z'), SP)).toBe('Última visita: Ontem')
  })

  it('"Hoje" é o mesmo dia no fuso, e a hora marcada mais tarde que agora também é hoje', () => {
    expect(rotuloDaUltimaVisita('2026-11-25T11:30:00.000Z', new Date('2026-11-25T20:00:00.000Z'), SP)).toBe('Última visita: Hoje')
    expect(rotuloDaUltimaVisita('2026-11-25T21:00:00.000Z', new Date('2026-11-25T20:00:00.000Z'), SP)).toBe('Última visita: Hoje')
  })

  it('o dia é o do fuso: 23:30 de Cuiabá é o dia de Cuiabá, não o de Brasília', () => {
    // 24/11 23:30 em Cuiabá = 25/11 00:30 em Brasília (03:30 UTC). Agora: 25/11 10:00 em Cuiabá.
    const visitaTarde = '2026-11-25T03:30:00.000Z'
    const agora = new Date('2026-11-25T14:00:00.000Z')
    expect(rotuloDaUltimaVisita(visitaTarde, agora, CUIABA)).toBe('Última visita: Ontem')
    expect(rotuloDaUltimaVisita(visitaTarde, agora, SP)).toBe('Última visita: Hoje')
  })

  it('de 2 a 6 dias, o número de dias de calendário', () => {
    expect(rotuloDaUltimaVisita('2026-11-22T23:00:00.000Z', new Date('2026-11-25T11:00:00.000Z'), SP)).toBe('Última visita: 3 dias')
  })

  it('sem visita, "Sem visitas"', () => {
    expect(rotuloDaUltimaVisita(null, new Date(), SP)).toBe('Sem visitas')
  })

  it('a lista usa a função, com o fuso que o layout passa', () => {
    const lista = fonte('components/branch/clients-sidebar.tsx')
    expect(lista).toMatch(/rotuloDaUltimaVisita\(/)
    expect(lista).not.toMatch(/formatDistanceToNow/)
    expect(fonte('app/admin/clients/layout.tsx')).toMatch(/fusoDaRede\(/)
    expect(fonte('app/[slug]/clients/layout.tsx')).toMatch(/fusoDaUnidade\(/)
  })
})
