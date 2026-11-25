import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recusaDoHorarioPassado } from '@/lib/appointments/horario-passado'

// A24 da 11ª simulação (2026-11-10): remarcar para um horário que já passou era aceito sem aviso; passou a avisar.
// O Heitor, 25/11, sobre o Agendar: "recusa, não dá pra agendar no passado"; e sobre o remarcar: "remarcar para o
// passado é possível desde que não tenha passado do horario já, o que tornaria impossível desse atendimento
// acontecer" — confirmado na mesma data: para mais cedo que o marcado pode; para um horário que já passou, recusa.
// O minuto de agora vale (a cliente que chegou sem horário se agenda para agora) — decisão do Claude, 25/11.
describe('o horário que já passou se recusa, no remarcar e no Agendar', () => {
  const agora = new Date('2026-11-10T13:40:30Z') // 10:40:30 em Brasília
  it('o horário de antes de agora recusa, dizendo a partir de quando se pode', () => {
    expect(recusaDoHorarioPassado('2026-11-10T12:00:00Z', agora)).toBe(
      'Esse horário (10/11/2026 às 09:00) já passou. Escolha a partir de 10/11/2026 às 10:40.')
    expect(recusaDoHorarioPassado('2026-11-10T13:39:00Z', agora)).not.toBeNull()
  })
  it('o minuto de agora e o de daqui para a frente passam', () => {
    expect(recusaDoHorarioPassado('2026-11-10T13:40:00Z', agora)).toBeNull()
    expect(recusaDoHorarioPassado('2026-11-10T14:00:00Z', agora)).toBeNull()
  })
  it('mais cedo que o marcado, mas ainda à frente, passa (o remarcar para 15h de um das 16h, às 14:30)', () => {
    expect(recusaDoHorarioPassado('2026-11-10T18:00:00Z', new Date('2026-11-10T17:30:00Z'))).toBeNull()
  })
})

describe('o servidor recusa (não só o navegador)', () => {
  const fonte = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
  it('o núcleo do remarcar e o do agendamento conferem', () => {
    expect(fonte('lib', 'appointments', 'alteracoes.ts')).toMatch(/recusaDoHorarioPassado\(/)
    expect(fonte('lib', 'appointments', 'core.ts')).toMatch(/recusaDoHorarioPassado\(/)
  })
  it('o remarcar não avisa mais e deixa: a conferência antes de confirmar diz que não vai ser remarcado', () => {
    const acao = fonte('actions', 'appointments.ts')
    expect(acao).not.toMatch(/avisoDoHorarioPassado/)
    expect(acao).toMatch(/recusaDoHorarioPassado\(/)
  })
})
