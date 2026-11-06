import { describe, it, expect } from 'vitest'
import { textoDasSessoesSemData, avisoDoPlanoFechado } from '@/lib/checkout/sessoes-sem-data'

// A37 da 8ª simulação: concluir o checkout do plano não confirmava nada, e as
// sessões 2 e 3 ficavam sem data e sem aviso.
describe('A37: as sessões sem data e o aviso do plano fechado', () => {
  it('diz quais sessões ficam sem data', () => {
    expect(textoDasSessoesSemData([2, 3])).toBe('As sessões 2 e 3 ficam sem data: agende pela ficha da cliente (Tratamentos) quando ela marcar.')
    expect(textoDasSessoesSemData([2])).toMatch(/^A sessão 2 fica sem data/)
    expect(textoDasSessoesSemData([])).toBeNull()
  })
  it('o aviso do fim', () => {
    expect(avisoDoPlanoFechado(3, [2, 3])).toBe('Plano fechado: 3 sessões. 2 sem data — agende pela ficha quando a cliente marcar.')
    expect(avisoDoPlanoFechado(2, [])).toBe('Plano fechado: 2 sessões. Todas com data.')
  })
})
