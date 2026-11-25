import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * atendimento:FU-02 (princípio 3). No app, o passo dos horários diz o relógio
 * da unidade ("Horário de Manaus"), e o passo "Confirmar" mostrava só "14:00",
 * sem o relógio — a cliente confirmava sem saber de qual horário. A linha
 * "Horário" do Confirmar leva a mesma nota (`NotaDoFuso`, que cala em Brasília).
 */

const fonte = readFileSync(path.join(__dirname, '..', 'components', 'client-portal', 'new-appointment-wizard.tsx'), 'utf8')

describe('o Confirmar do agendamento no app diz o relógio da unidade', () => {
  it('a linha Horário leva a nota do fuso', () => {
    const linha = fonte.split(/\r?\n/).find(l => l.includes('<Row label="Horário"'))
    expect(linha).toBeTruthy()
    expect(linha).toMatch(/nota=\{<NotaDoFuso fuso=\{fuso\}/)
  })
  it('a linha mostra a nota ao lado do valor', () => {
    expect(fonte).toMatch(/function Row\(\{ label, value, accent, nota \}/)
  })
})
