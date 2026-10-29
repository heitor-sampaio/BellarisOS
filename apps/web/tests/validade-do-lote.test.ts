import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { validadeDoLote } from '@/components/admin/reports-linhas'

// A validade do lote é um DIA (o campo de data da entrada), gravado à
// meia-noite UTC. Em Brasília isso é 21h da véspera: Relatórios → Estoque
// mostrava o TXB-2810 de 17/11 como 16/11 (D10 da simulação de 2026-10-29).
// A tabela roda no NAVEGADOR, no fuso de quem olha: o teste roda em Brasília
// (o Vitest roda em UTC, onde o defeito não aparece).
describe('a validade do lote nos relatórios', () => {
  const tzAntes = process.env.TZ
  beforeAll(() => { process.env.TZ = 'America/Sao_Paulo' })
  afterAll(() => { process.env.TZ = tzAntes })

  it('mostra o dia gravado, não a véspera', () => {
    const hoje = new Date('2026-10-28T22:00:00-03:00')
    expect(validadeDoLote('2026-11-17 00:00:00+00', hoje).dia).toBe('17/11/2026')
    expect(validadeDoLote('2026-11-17T00:00:00.000Z', hoje).dia).toBe('17/11/2026')
  })
  it('conta os dias pelo calendário de Brasília', () => {
    // De 28/10 (à noite, já 29/10 em UTC) a 17/11: 20 dias de calendário.
    expect(validadeDoLote('2026-11-17 00:00:00+00', new Date('2026-10-28T22:00:00-03:00')).dias).toBe(20)
    expect(validadeDoLote('2026-11-17 00:00:00+00', new Date('2026-10-28T08:00:00-03:00')).dias).toBe(20)
    // Vence hoje: 0; já venceu: 0 (o selo vermelho).
    expect(validadeDoLote('2026-11-17 00:00:00+00', new Date('2026-11-17T23:00:00-03:00')).dias).toBe(0)
    expect(validadeDoLote('2026-11-17 00:00:00+00', new Date('2026-11-20T10:00:00-03:00')).dias).toBe(0)
  })
})
