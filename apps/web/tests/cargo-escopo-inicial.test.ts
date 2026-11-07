import { describe, it, expect } from 'vitest'
import { escopoInicial } from '@/lib/cargos/escopo-inicial'

/**
 * A5 da 9ª simulação (2026-11-07): o cargo novo com o CRM em Gerenciar nascia
 * em "Só os próprios leads", e o funil da Comercial ficava vazio. Decidido pelo
 * princípio 1 (padrão sensato): o CRM ligado nasce em "Todos" — o funil é o
 * trabalho do time comercial, e "só os meus" é a escolha da clínica para
 * distribuir leads (a SDR). Os módulos de dado sensível (agenda, prontuário,
 * financeiro) continuam nascendo em "só os meus".
 */
describe('o escopo com que o módulo nasce ao ser ligado no cargo', () => {
  it('o CRM ligado agora nasce em "Todos"', () => {
    expect(escopoInicial('crm', undefined)).toBe('ALL')
    expect(escopoInicial('crm', { level: 'NONE', scope: 'ALL' })).toBe('ALL')
  })
  it('o "só os meus" guardado do CRM desligado volta ao religar (D6)', () => {
    expect(escopoInicial('crm', { level: 'NONE', scope: 'OWN' })).toBe('OWN')
  })
  it('os outros escopáveis desligados seguem nascendo em "só os meus"', () => {
    for (const m of ['agenda', 'medical_records', 'financial'] as const) expect(escopoInicial(m, undefined)).toBe('OWN')
  })
  it('o módulo já ligado mantém o que foi escolhido', () => {
    expect(escopoInicial('crm', { level: 'MANAGE', scope: 'OWN' })).toBe('OWN')
    expect(escopoInicial('agenda', { level: 'VIEW', scope: 'ALL' })).toBe('ALL')
  })
})
