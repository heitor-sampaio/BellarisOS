import { describe, it, expect } from 'vitest'
import { rodapeDoPlanoFechado, textoDoPlanoDoConcluido, quemMarcaAsSessoes } from '@/lib/plano-de-tratamento/textos'

/**
 * Os textos do plano da 9ª simulação (F41):
 * - A27: a drenagem avulsa concluída dizia "A avaliação está concluída: o plano
 *   nasce ligado a ela…" — e não era avaliação. O texto não decide pelo
 *   procedimento: diz "o atendimento".
 * - A28: o rodapé do plano fechado mandava a recepcionista sem o Financeiro
 *   "receber no financeiro", que ela não abre. Diz com quem fica (como a A33 da 8ª).
 */
describe('A27: o atendimento concluído que gera um plano', () => {
  it('não chama de avaliação o que não é', () => {
    const t = textoDoPlanoDoConcluido()
    expect(t).not.toMatch(/avalia/i)
    expect(t).toContain('Este atendimento está concluído')
    expect(t).toContain('o plano gerado aqui nasce ligado a ele')
  })
})

describe('A28: o rodapé do plano fechado', () => {
  it('pago: só isso', () => {
    expect(rodapeDoPlanoFechado(0, null)).toBe('Plano fechado e pago.')
    expect(rodapeDoPlanoFechado(0, ['Lúcia'])).toBe('Plano fechado e pago.')
  })
  it('quem tem o Financeiro em Gerenciar: o de sempre', () => {
    expect(rodapeDoPlanoFechado(414, null))
      .toBe('Plano fechado. A parcela vencida é cobrada no check-in do atendimento; a que vence depois se recebe no Financeiro.')
  })
  it('quem não tem: diz com quem fica a parcela que vence depois', () => {
    expect(rodapeDoPlanoFechado(414, ['Lúcia', 'Fernanda']))
      .toBe('Plano fechado. A parcela vencida é cobrada no check-in do atendimento; a que vence depois se recebe no Financeiro, com quem tem o Financeiro em Gerenciar: Lúcia, Fernanda.')
    expect(rodapeDoPlanoFechado(414, []))
      .toBe('Plano fechado. A parcela vencida é cobrada no check-in do atendimento; a que vence depois se recebe no Financeiro, com quem tem o Financeiro em Gerenciar.')
  })
})

/**
 * A47 da 9ª: o cartão do plano no app dizia "quem marca é a clínica" (por haver
 * sessões de criolipólise, fora do app) e deixava a Luana marcar a drenagem do
 * plano. Cada sessão a agendar diz o que vale para ELA — a regra do agendar do
 * app (`pagoParaAgendar`): a sessão cujo primeiro procedimento está no app.
 */
describe('A47: quem marca cada sessão do plano', () => {
  it('separa as sessões que a cliente marca pelo app das que a clínica marca', () => {
    expect(quemMarcaAsSessoes([{ numero: 2, peloApp: true }, { numero: 3, peloApp: false }])).toEqual([
      'Sessão 2: agende pelo app em “Agendar” (já está paga no plano).',
      'Sessão 3: quem marca é a clínica — fale com ela para escolher o dia.',
    ])
  })
  it('junta as do mesmo jeito', () => {
    expect(quemMarcaAsSessoes([2, 4, 6].map(numero => ({ numero, peloApp: true })))).toEqual([
      'Sessões 2, 4 e 6: agende pelo app em “Agendar” (já estão pagas no plano).',
    ])
    expect(quemMarcaAsSessoes([3, 5].map(numero => ({ numero, peloApp: false })))).toEqual([
      'Sessões 3 e 5: quem marca é a clínica — fale com ela para escolher o dia.',
    ])
    expect(quemMarcaAsSessoes([])).toEqual([])
  })
})
