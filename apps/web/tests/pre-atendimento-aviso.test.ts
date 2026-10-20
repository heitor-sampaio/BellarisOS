import { describe, it, expect } from 'vitest'
import { avisoDoPreAtendimento } from '@/lib/pre-atendimento/aviso'

/**
 * O aviso que sai para a cliente quando o agendamento deixa um pré-atendimento
 * pendente (2026-10-20). Vai para a tela de bloqueio do celular: nada sobre a
 * saúde dela no texto — só o convite e o link para a ficha.
 */
describe('avisoDoPreAtendimento', () => {
  it('leva à ficha no portal da clínica do agendamento', () => {
    const a = avisoDoPreAtendimento('clinica-bela', 'COMPLETO')
    expect(a.type).toBe('pre_atendimento')
    expect(a.data).toEqual({ link: '/clinica-bela/cliente/pre-atendimento' })
  })

  it('pede a ficha inteira, ou só a confirmação dentro da validade', () => {
    expect(avisoDoPreAtendimento('x', 'COMPLETO').body).toMatch(/perguntas/i)
    expect(avisoDoPreAtendimento('x', 'CONFIRMAR').body).toMatch(/mudou/i)
  })

  it('não fala de saúde na tela de bloqueio', () => {
    for (const modo of ['COMPLETO', 'CONFIRMAR'] as const) {
      const { title, body } = avisoDoPreAtendimento('x', modo)
      expect(`${title} ${body}`).not.toMatch(/alergi|medicament|gesta|doen|saúde/i)
    }
  })
})
