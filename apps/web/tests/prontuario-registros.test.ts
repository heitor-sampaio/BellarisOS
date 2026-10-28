import { describe, it, expect } from 'vitest'
import { buildRecordForms } from '@/lib/record-forms'

/**
 * D4 da simulação de 2026-10-27: a aba Prontuário dizia "Nenhum atendimento
 * registrado ainda" com a evolução e a intercorrência da Mariana gravadas.
 * `buildRecordForms` descartava toda entrada sem ficha de procedimento (a
 * avaliação não tem ficha ligada), e a evolução nunca ia para a tela.
 *
 * A regra: todo atendimento com REGISTRO clínico aparece — evolução,
 * intercorrência ou ficha —, com ou sem ficha.
 */

const nomes = new Map([['a1', 'Avaliação estética'], ['a2', 'Limpeza de pele'], ['a3', 'Peeling']])
const ficha = { name: 'Ficha da limpeza', rows: [{ fields: [{ id: 'c1', type: 'text', label: 'Pele' }] }], answers: { c1: 'mista' } }

describe('buildRecordForms', () => {
  it('lista o atendimento SEM ficha que tem evolução, com o texto da evolução e da intercorrência', () => {
    const r = buildRecordForms([
      { appointment_id: 'a1', notes: 'Poros dilatados em zona T', intercurrences: 'Sem intercorrências.', form_data: null, created_at: '2026-10-27T17:19:28Z' },
    ], nomes)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      appointmentId: 'a1', procedureName: 'Avaliação estética',
      evolucao: 'Poros dilatados em zona T', intercorrencias: 'Sem intercorrências.', ficha: null,
    })
  })

  // D3 da simulação de 2026-10-28: as dores do cliente passaram a ser do
  // prontuário do atendimento (`medical_record_entries.queixas`).
  it('lista o atendimento só com as dores do cliente, com o texto delas', () => {
    const r = buildRecordForms([
      { appointment_id: 'a1', notes: null, intercurrences: null, queixas: 'Manchas na testa', form_data: null, created_at: '2026-10-28T17:19:28Z' },
    ], nomes)
    expect(r.map(e => e.queixas)).toEqual(['Manchas na testa'])
  })

  it('lista o atendimento só com intercorrência', () => {
    const r = buildRecordForms([
      { appointment_id: 'a1', notes: null, intercurrences: 'Eritema leve', form_data: null, created_at: '2026-10-27T17:19:28Z' },
    ], nomes)
    expect(r.map(e => e.intercorrencias)).toEqual(['Eritema leve'])
    expect(r[0]!.evolucao).toBeNull()
  })

  it('mantém o atendimento com ficha, e leva a evolução junto', () => {
    const r = buildRecordForms([
      { appointment_id: 'a2', notes: 'Aplicado ácido 5 ml', intercurrences: null, form_data: { ficha }, created_at: '2026-10-27T17:21:46Z' },
    ], nomes)
    expect(r).toHaveLength(1)
    expect(r[0]!.ficha?.name).toBe('Ficha da limpeza')
    expect(r[0]!.evolucao).toBe('Aplicado ácido 5 ml')
  })

  it('não lista a entrada sem registro nenhum (texto em branco conta como vazio)', () => {
    const r = buildRecordForms([
      { appointment_id: 'a3', notes: '   ', intercurrences: '', form_data: null, created_at: '2026-10-27T17:00:00Z' },
    ], nomes)
    expect(r).toEqual([])
  })

  it('mais recente primeiro', () => {
    const r = buildRecordForms([
      { appointment_id: 'a1', notes: 'antes', form_data: null, created_at: '2026-10-20T10:00:00Z' },
      { appointment_id: 'a2', notes: 'depois', form_data: null, created_at: '2026-10-27T10:00:00Z' },
    ], nomes)
    expect(r.map(e => e.appointmentId)).toEqual(['a2', 'a1'])
  })
})
