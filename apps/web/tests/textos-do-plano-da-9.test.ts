import { describe, it, expect } from 'vitest'
import { rodapeDoPlanoFechado, textoDoPlanoDoConcluido, quemMarcaAsSessoes } from '@/lib/plano-de-tratamento/textos'

/**
 * Os textos do plano da 9ª simulação (F41):
 * - A27: a drenagem avulsa concluída dizia "A avaliação está concluída: o plano
 *   nasce ligado a ela…" — e não era avaliação. O texto não decide pelo
 *   procedimento: diz "o atendimento".
 * - A28: o rodapé do plano fechado mandava quem não tem o Financeiro
 *   "receber no financeiro", que ela não abre. Diz com quem fica (como a A33 da 8ª).
 *   Desde o PDV, o lugar é o PDV, e quem fica é quem tem a permissão dele.
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
  // PDV1/CX1 (a revisão do Heitor de 2026-11-13): o dinheiro entra pelo PDV —
  // a parcela do crediário também. O PDV é de quem tem o PDV em Gerenciar
  // (`podeReceber`; PV-04, o Heitor, 2026-11-23 — era também o Financeiro).
  it('quem recebe (o PDV em Gerenciar): o que falta se recebe no PDV', () => {
    expect(rodapeDoPlanoFechado(414, null))
      .toBe('Plano fechado. O que falta (as parcelas em aberto) se recebe no PDV. Se caiu na conta, a baixa é no Financeiro.')
  })
  it('quem não recebe: diz com quem fica, pela permissão do PDV', () => {
    expect(rodapeDoPlanoFechado(414, ['Lúcia', 'Fernanda']))
      .toBe('Plano fechado. O que falta (as parcelas em aberto) se recebe no PDV, com quem tem o PDV em Gerenciar: Lúcia, Fernanda. Se caiu na conta, a baixa é no Financeiro.')
    expect(rodapeDoPlanoFechado(414, []))
      .toBe('Plano fechado. O que falta (as parcelas em aberto) se recebe no PDV, com quem tem o PDV em Gerenciar. Se caiu na conta, a baixa é no Financeiro.')
  })
  // A14 da 25ª: o lugar de receber é o PDV; o Financeiro só entra na baixa da
  // transferência que caiu na conta (CX2) — nunca "receber no Financeiro".
  it('o lugar de receber é o PDV; o Financeiro, só a baixa do que caiu na conta', () => {
    expect(rodapeDoPlanoFechado(414, null)).not.toMatch(/recebe no Financeiro|check-in/)
    expect(rodapeDoPlanoFechado(414, null)).toMatch(/se recebe no PDV\. Se caiu na conta, a baixa é no Financeiro\.$/)
  })
})

/**
 * A47 da 9ª: o cartão do plano no app dizia "quem marca é a clínica" (por haver
 * sessões de criolipólise, fora do app) e deixava a Luana marcar a drenagem do
 * plano. Cada sessão a agendar diz o que vale para ELA — a regra do agendar do
 * app (`pagoParaAgendar`): a sessão cujo primeiro procedimento está no app.
 */
describe('A47: quem marca cada sessão do plano', () => {
  it('separa as sessões que a cliente marca pelo app das que a rede marca', () => {
    expect(quemMarcaAsSessoes([{ numero: 2, peloApp: true }, { numero: 3, peloApp: false }])).toEqual([
      'Sessão 2: agende pelo app em “Agendar” (faz parte do seu plano).',
      'Sessão 3: quem marca é a equipe — fale com ela para escolher o dia.',
    ])
  })
  it('junta as do mesmo jeito', () => {
    expect(quemMarcaAsSessoes([2, 4, 6].map(numero => ({ numero, peloApp: true })))).toEqual([
      'Sessões 2, 4 e 6: agende pelo app em “Agendar” (fazem parte do seu plano).',
    ])
    expect(quemMarcaAsSessoes([3, 5].map(numero => ({ numero, peloApp: false })))).toEqual([
      'Sessões 3 e 5: quem marca é a equipe — fale com ela para escolher o dia.',
    ])
    expect(quemMarcaAsSessoes([])).toEqual([])
  })
})
