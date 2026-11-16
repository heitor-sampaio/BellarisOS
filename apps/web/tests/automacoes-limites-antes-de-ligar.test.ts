import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { limitesAntesDeLigar } from '@/lib/automacoes/antes-de-ligar'

/**
 * A16 da 19ª simulação (2026-11-16; princípios 1 e 7). Numa rede aberta 24
 * horas, o silêncio padrão (21:00–08:00) prendeu o lembrete até as 08:00, e a
 * pessoa que ligou o modelo não sabia do silêncio: ele mora na gaveta
 * "Limites", que ninguém abre para ligar. O padrão continua (é da rede
 * ajustar — D16), e a janela "Ligar a automação?" diz os limites do fluxo,
 * com o caminho para mudá-los.
 */
describe('limitesAntesDeLigar', () => {
  it('diz o silêncio e o teto da automação', () => {
    expect(limitesAntesDeLigar({ silencioDe: '21:00', silencioAte: '08:00', tetoPorClienteDia: 3 }))
      .toBe('Entre 21:00 e 08:00 a mensagem espera e sai às 08:00 (silêncio noturno). No máximo 3 por cliente por dia.')
  })
  it('sem silêncio e sem teto, diz isso', () => {
    expect(limitesAntesDeLigar({ silencioDe: null, silencioAte: null, tetoPorClienteDia: null }))
      .toBe('Sem silêncio: a mensagem sai a qualquer hora. Sem teto por cliente.')
  })
  it('o teto de 1 no singular', () => {
    expect(limitesAntesDeLigar({ silencioDe: null, silencioAte: '08:00', tetoPorClienteDia: 1 }))
      .toBe('Sem silêncio: a mensagem sai a qualquer hora. No máximo 1 por cliente por dia.')
  })
  it('a janela mostra os limites e leva à gaveta deles', () => {
    const editor = fs.readFileSync(path.join(__dirname, '../components/admin/automacoes/editor.tsx'), 'utf8')
    expect(editor).toMatch(/data-limites-antes-de-ligar/)
    expect(editor).toMatch(/limitesAntesDeLigar\(limites\)/)
    expect(editor).toMatch(/Ajustar os limites/)
  })
})
