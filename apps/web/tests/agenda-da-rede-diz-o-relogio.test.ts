import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { relogioDaGradeDaRede, relogioDaColuna } from '@/lib/agenda/relogio-da-grade'

/**
 * D4 da 33ª simulação (FU-04, princípio 3: "a tela diz qual é o relógio"): a
 * agenda da rede com Barra do Garças (Cuiabá) e Aragarças (Brasília) desenha
 * cada coluna no relógio da unidade dela (F62) e não dizia qual — a C14 das
 * 21:00 de Barra aparecia às 21:00, ao lado das 21:00 de Brasília, sem rótulo.
 * Com fusos diferentes, cada coluna diz o seu relógio e a tela diz de qual é
 * cada unidade; com um fuso só, fora de Brasília, a nota de sempre
 * ("Horário de Manaus"); em Brasília, nada.
 */
const SP = 'America/Sao_Paulo'
const CB = 'America/Cuiaba'
const MN = 'America/Manaus'

describe('o relógio da grade da rede', () => {
  it('todas em Brasília: nada', () =>
    expect(relogioDaGradeDaRede([{ name: 'A', fuso: SP }, { name: 'B', fuso: SP }])).toEqual({ nota: null, porColuna: false }))
  it('sem fuso gravado vale o de Brasília: nada', () =>
    expect(relogioDaGradeDaRede([{ name: 'A' }])).toEqual({ nota: null, porColuna: false }))
  it('um fuso só, fora de Brasília: a nota de sempre', () =>
    expect(relogioDaGradeDaRede([{ name: 'A', fuso: MN }, { name: 'B', fuso: MN }])).toEqual({ nota: 'Horário de Manaus', porColuna: false }))
  // R16, o Heitor, 26/11, na página: "Cada coluna no relógio da sua unidade, dizendo qual é (como ficou)" e
  // "Mas não precisa da explicação. […] Ser intuitivo é justamente o contrario, ser facil de usar mesmo sem
  // muitas explicações." Fica o rótulo de cada coluna; a nota acima da grade sai.
  it('fusos diferentes: cada coluna diz o seu, sem nota acima da grade', () =>
    expect(relogioDaGradeDaRede([{ name: 'Barra do Garças', fuso: CB }, { name: 'Aragarças', fuso: SP }])).toEqual({
      nota: null,
      porColuna: true,
    }))
  it('o rótulo da coluna diz o relógio, também o de Brasília', () => {
    expect(relogioDaColuna(CB)).toBe('Horário de Cuiabá')
    expect(relogioDaColuna(SP)).toBe('Horário de Brasília')
  })
})

describe('a agenda da rede mostra o relógio', () => {
  const fonte = readFileSync(join(__dirname, '..', 'components/admin/admin-agenda-view.tsx'), 'utf8')
  it('a nota fica acima da grade, no dia e na semana', () => {
    expect(fonte).toMatch(/relogioDaGradeDaRede\(branches\)/)
    expect(fonte).toMatch(/data-relogio-da-grade/)
  })
  it('com fusos diferentes, o cabeçalho de cada coluna do dia diz o relógio dela', () => {
    const i = fonte.indexOf('function DayGrid')
    const dia = fonte.slice(i, fonte.indexOf('\nfunction ', i + 10))
    expect(dia).toMatch(/data-relogio-da-coluna/)
    expect(dia).toMatch(/relogioDaColuna\(b\.fuso\)/)
  })
})
