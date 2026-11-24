import { describe, it, expect } from 'vitest'
import { fichaDeSaudeVencida } from '@/lib/pre-atendimento/validade'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

const agora = new Date('2026-11-03T15:00:00.000Z')

describe('fichaDeSaudeVencida (atend-05)', () => {
  it('respondida há 8 meses, com validade de 6, está vencida', () =>
    expect(fichaDeSaudeVencida('2026-03-03T12:00:00.000Z', 6, agora)).toBe(true))
  it('respondida há 1 mês não está', () =>
    expect(fichaDeSaudeVencida('2026-10-03T12:00:00.000Z', 6, agora)).toBe(false))
  it('no limite exato vence (como o gatilho: > now() - N meses é dentro)', () =>
    expect(fichaDeSaudeVencida('2026-05-03T15:00:00.000Z', 6, agora)).toBe(true))
  it('um minuto depois do limite ainda vale', () =>
    expect(fichaDeSaudeVencida('2026-05-03T15:01:00.000Z', 6, agora)).toBe(false))
  it('fim de mês curto: 31/08 menos 6 meses é 28/02', () =>
    expect(fichaDeSaudeVencida('2026-02-28T12:00:00.000Z', 6, new Date('2026-08-31T12:00:00.000Z'))).toBe(true))
  it('sem data ou sem validade, não diz nada', () => {
    expect(fichaDeSaudeVencida(null, 6, agora)).toBe(false)
    expect(fichaDeSaudeVencida('2020-01-01T00:00:00.000Z', 0, agora)).toBe(false)
    expect(fichaDeSaudeVencida('lixo', 6, agora)).toBe(false)
  })
})

describe('com a ficha de saúde válida, a janela do agendamento diz até quando (e não "não foi enviada") — princípios 3 e 7', () => {
  const ler = (rel: string) => nodeFs.readFileSync(nodePath.join(__dirname, '..', rel), 'utf8')

  describe('a ficha válida na janela', () => {
    it('até quando a ficha vale: a resposta + a validade da rede (a mesma conta do vencimento)', async () => {
      const { fichaDeSaudeValidaAte, fichaDeSaudeVencida } = await import('@/lib/pre-atendimento/validade')
      expect(fichaDeSaudeValidaAte('2026-11-10T15:00:00.000Z', 6)).toBe('2027-05-10T15:00:00.000Z')
      expect(fichaDeSaudeValidaAte('2026-08-31T12:00:00.000Z', 6)).toBe('2027-02-28T12:00:00.000Z')
      // No instante do "até", ela já venceu (a conta do vencimento).
      expect(fichaDeSaudeVencida('2026-11-10T15:00:00.000Z', 6, new Date('2027-05-10T15:00:00.000Z'))).toBe(true)
      expect(fichaDeSaudeVencida('2026-11-10T15:00:00.000Z', 6, new Date('2027-05-10T14:59:00.000Z'))).toBe(false)
      expect(fichaDeSaudeValidaAte('2026-11-10T15:00:00.000Z', 0)).toBeNull()
      expect(fichaDeSaudeValidaAte(null, 6)).toBeNull()
    })
    it('o texto', async () => {
      const { textoDaFichaValida } = await import('@/lib/pre-atendimento/validade')
      const dia = (iso: string) => iso.slice(0, 10)
      expect(textoDaFichaValida({ respondidaEm: '2026-11-10T15:00:00.000Z', validaAte: '2027-05-10T15:00:00.000Z' }, dia))
        .toBe('A cliente tem a ficha de saúde válida até 2027-05-10 (respondida em 2026-11-10). Enviar a ficha pede que ela responda de novo.')
      expect(textoDaFichaValida({ respondidaEm: '2026-11-10T15:00:00.000Z', validaAte: null }, dia))
        .toBe('A cliente tem a ficha de saúde válida (respondida em 2026-11-10). Enviar a ficha pede que ela responda de novo.')
    })
    it('a situação leva a ficha válida, e a janela a diz no lugar do "não foi enviada"', () => {
      expect(ler('actions/pre-atendimento.ts')).toMatch(/fichaValida/)
      const b = ler('components/branch/pre-atendimento-do-agendamento.tsx')
      expect(b).toMatch(/situacao\.fichaValida\s*\?\s*textoDaFichaValida\(situacao\.fichaValida/)
    })
  })

})
