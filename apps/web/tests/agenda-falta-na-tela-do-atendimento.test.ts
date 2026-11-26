import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A8 da 34ª (princípio 7; AG-32 e AG-36): quem tem a Agenda em Gerenciar abre,
 * pela agenda (o "Em andamento", a "Agenda de hoje", a busca), a tela do
 * atendimento de quem passou do horário sem chegar — e ali não havia o "Não
 * compareceu": só na janela da agenda. O caminho da falta existe onde a pessoa
 * está, com a mesma pergunta e a mesma action.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('a falta: quando aparece e o que pergunta', () => {
  it('a partir do horário, de Agendado, Confirmado ou Chegou, com a Agenda em Gerenciar', async () => {
    const { mostraAFalta } = await import('@/lib/agenda/falta')
    const inicio = '2026-12-10T14:00:00.000Z'
    const depois = Date.parse('2026-12-10T14:20:00.000Z')
    for (const status of ['SCHEDULED', 'CONFIRMED', 'ARRIVED']) {
      expect(mostraAFalta({ status, inicio, agoraMs: depois, podeMarcar: true }), status).toBe(true)
    }
    expect(mostraAFalta({ status: 'SCHEDULED', inicio, agoraMs: Date.parse('2026-12-10T13:59:00.000Z'), podeMarcar: true }), 'antes do horário').toBe(false)
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) {
      expect(mostraAFalta({ status, inicio, agoraMs: depois, podeMarcar: true }), status).toBe(false)
    }
    expect(mostraAFalta({ status: 'SCHEDULED', inicio, agoraMs: depois, podeMarcar: false }), 'sem a Agenda em Gerenciar').toBe(false)
    expect(mostraAFalta({ status: 'SCHEDULED', inicio, agoraMs: null, podeMarcar: true }), 'sem o relógio ainda').toBe(false)
  })
  it('a pergunta é a da janela da agenda', async () => {
    const { perguntaDaFalta } = await import('@/lib/agenda/falta')
    expect(perguntaDaFalta('Ana', '14:00')).toBe('Marcar que Ana não compareceu às 14:00? Os documentos deste horário que ela ainda não assinou são cancelados, e o que estava pago (pacote, plano, pré-pago) volta para ela.')
    expect(fonte('components/branch/appointment-sheet.tsx')).toContain(perguntaDaFalta('{appointment.clientName}', '{timeStr}'))
  })
})

describe('a tela do atendimento oferece o "Não compareceu"', () => {
  const s = fonte('components/branch/appointment-session.tsx')
  it('pela regra da falta, com a Agenda em Gerenciar (canCheckin)', () => {
    expect(s).toMatch(/mostraAFalta\(\{ status, inicio: appointment\.scheduledAt, agoraMs, podeMarcar: canCheckin \}\)/)
    expect(s).toContain('<AlertCircle size={14} /> Não compareceu')
  })
  it('pergunta antes e grava pela action da agenda', () => {
    expect(s).toContain('perguntaDaFalta(')
    expect(s).toContain('Confirmar a falta')
    expect(s).toMatch(/updateAppointmentStatus\(appointment\.id, 'NO_SHOW', slug\)/)
  })
})
