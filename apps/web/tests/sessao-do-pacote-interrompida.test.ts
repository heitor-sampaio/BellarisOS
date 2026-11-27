import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sessaoInterrompida, textoDaSessaoInterrompida } from '@/lib/plano-de-tratamento/sessao-no-app'

/**
 * AT-21 (o Heitor, 2026-11-18): "O atendimento INICIADO e cancelado gasta a
 * sessão já paga: a sessão do pacote, a unidade do pré-pago e a sessão do
 * plano contam como usadas (no app: 'Usada em … (atendimento interrompido)')".
 * D4 da 37ª: a frase existia só para a sessão do PLANO; a do pacote gasta pela
 * desistência aparecia como "Cancelada" na ficha (com o "Agendar" de uma
 * sessão já gasta) e como "Cancelado" no app.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('a sessão gasta pela desistência no meio (AT-21)', () => {
  it('é a usada ligada a um agendamento cancelado — do pacote e do pré-pago', () => {
    expect(sessaoInterrompida('USED', 'CANCELLED')).toBe(true)
    expect(sessaoInterrompida('USADA', 'CANCELLED')).toBe(true)
    expect(sessaoInterrompida('USED', 'COMPLETED')).toBe(false)
    expect(sessaoInterrompida('AVAILABLE', 'CANCELLED')).toBe(false)
    expect(sessaoInterrompida('CANCELLED', 'CANCELLED')).toBe(false)
  })
  it('a frase é a do plano', () => {
    expect(textoDaSessaoInterrompida('2026-11-26T14:00:00Z', 'America/Sao_Paulo')).toBe('Usada em 26/11 (atendimento interrompido)')
  })
  it('a ficha do pacote (as duas janelas) diz a frase e não oferece "Agendar" na sessão gasta', () => {
    const sessoes = fonte('components/branch/treatment-sessions-modal.tsx')
    expect(sessoes).toMatch(/const interrompida = sessaoInterrompida\(sess\.status, sess\.apptStatus\)/)
    expect(sessoes).toMatch(/const rawStatus = interrompida \? 'USED' :/)
    expect(sessoes).toMatch(/interrompida \? textoDaSessaoInterrompida\(sess\.scheduledAt/)
    const ficha = fonte('components/branch/treatment-file-modal.tsx')
    expect(ficha).toMatch(/sessaoInterrompida\(s\.status, s\.apptStatus\) && s\.scheduledAt \? textoDaSessaoInterrompida\(s\.scheduledAt, fuso\)/)
  })
  it('a ficha do pré-pago diz a frase na sessão gasta', () => {
    expect(fonte('components/shared/procedimentos-pagos.tsx')).toMatch(/sessaoInterrompida\(u\.status, u\.agendamentoStatus\)/)
    expect(fonte('lib/pre-pago/leitura.ts')).toMatch(/agendamentoStatus: u\.appointments\?\.status \?\? null/)
  })
  it('a agenda do app diz a frase no atendimento iniciado e cancelado que gastou o que já estava pago', () => {
    const app = fonte('app/[slug]/cliente/agendamentos/page.tsx')
    expect(app).toMatch(/started_at/)
    expect(app).toMatch(/appt\.status === 'CANCELLED' && !!appt\.started_at && !!appt\.pagoAntes/)
    expect(app).toMatch(/textoDaSessaoInterrompida\(appt\.scheduled_at, fuso\)/)
  })
})
