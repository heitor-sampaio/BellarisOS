import { describe, it, expect } from 'vitest'
import { PERGUNTAS_DE_INJETAVEIS, comAsPerguntasDoModelo } from '@/lib/pre-atendimento/modelo-de-injetaveis'
import { TIPOS_FORA_DO_PRE_ATENDIMENTO } from '@/lib/anamnese-geral'

// A30 da 11ª simulação (2026-11-10): a ficha padrão não tinha as perguntas de
// injetáveis, e não havia modelo. O modelo é opção da clínica (princípio 6).
describe('A30 da 11ª: o modelo de perguntas de injetáveis', () => {
  it('pergunta doença neuromuscular, toxina anterior, anticoagulante e herpes', () => {
    const rotulos = PERGUNTAS_DE_INJETAVEIS.flatMap(r => r.fields.map(f => f.label)).join(' | ')
    expect(rotulos).toMatch(/neuromuscular/)
    expect(rotulos).toMatch(/toxina botulínica/)
    expect(rotulos).toMatch(/anticoagulante/)
    expect(rotulos).toMatch(/herpes/)
  })
  it('só usa tipos que a ficha de pré-atendimento aceita', () => {
    for (const f of PERGUNTAS_DE_INJETAVEIS.flatMap(r => r.fields)) expect(TIPOS_FORA_DO_PRE_ATENDIMENTO).not.toContain(f.type)
  })
  it('acrescenta no fim e não duplica', () => {
    const ficha = [{ id: 'r1', fields: [{ id: 'allergies', type: 'radio' as const, label: 'Tem alguma alergia?', options: ['Sim', 'Não'] }] }]
    const uma = comAsPerguntasDoModelo(ficha)
    expect(uma[0]).toEqual(ficha[0])
    expect(uma.length).toBe(1 + PERGUNTAS_DE_INJETAVEIS.length)
    expect(comAsPerguntasDoModelo(uma).length).toBe(uma.length)
  })
})
