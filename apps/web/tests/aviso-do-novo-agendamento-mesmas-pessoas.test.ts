import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pendente 13 da 27ª (E06): o aviso "Novo agendamento" ia a pessoas
 * diferentes conforme o caminho de criar — a agenda e o Copilot avisavam as
 * partes interessadas (a profissional e quem tem a Agenda em Gerenciar na
 * unidade, sem quem marcou; whatsapp-push.md §9.8), e o agendar pelo CRM só a
 * profissional, inclusive quando era ela quem marcava. Princípio 3: o mesmo
 * fato, as mesmas pessoas avisadas — todo caminho passa por
 * `notifyNewAppointment(id, quem marcou)`.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o "Novo agendamento" vai às mesmas pessoas em todo caminho', () => {
  it('o agendar pelo CRM avisa as partes interessadas, sem quem marcou', () => {
    const f = fonte('actions/crm-scheduling.ts')
    expect(f).toContain('notifyNewAppointment(res.id, ctx.internalUserId)')
    expect(f).not.toContain('notifyAppointmentCreated(')
  })
  it('o agendar da sessão do pré-pago também', () => {
    const f = fonte('actions/pre-pago.ts')
    expect(f).toContain('notifyNewAppointment(res.id, ctx.internalUserId)')
    expect(f).not.toContain('notifyAppointmentCreated(')
  })
  it('a agenda e o Copilot também', () => {
    expect(fonte('actions/appointments.ts')).toContain('notifyNewAppointment(result.id, ctx.internalUserId)')
    expect(fonte('lib/copilot/ferramentas/agenda-escrita.ts')).toContain('notifyNewAppointment(r.id, c.ctx.internalUserId)')
  })
  it('o aviso da equipe é o das partes interessadas, pela Agenda', () => {
    const a = fonte('lib/appointments/avisos.ts')
    const ini = a.indexOf('export function notifyNewAppointment')
    expect(a.slice(ini, ini + 1600)).toMatch(/notificarInteressados\(admin,\s*\{ modulo: 'agenda', branchId: c\.branchId, envolvidos: \[c\.professionalId\], ator \}/)
  })
})
