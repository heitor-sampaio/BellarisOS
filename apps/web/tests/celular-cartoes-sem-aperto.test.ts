import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O celular a 375 × 812 (docs/regras/design.md; A6 da 39ª): os cartões não
 * se espremem. O nome da cliente na tela do atendimento quebrava uma palavra
 * por linha ao lado dos selos, a faixa do "Registro bloqueado" apertava o texto
 * contra o botão, o "· Check-in 14:45" do cartão da vista Dia virava três
 * linhas, a segunda coluna da vista Dia saía cortada e a legenda terminava em
 * "Confir…". O conserto é de leiaute: quebra de linha onde cabe, largura
 * mínima com rolagem sem a barra à mostra, reticências com o texto no `title`.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

/** O `style={{ … }}` do elemento marcado (do marcador até o fim do objeto). */
function estiloDe(texto: string, marcador: string): string {
  const i = texto.indexOf(marcador)
  expect(i, `o marcador ${marcador}`).toBeGreaterThanOrEqual(0)
  const fim = texto.indexOf('}}>', i)
  return texto.slice(i, fim)
}

const dia = fonte('components/branch/agenda-day-view.tsx')
const calendario = fonte('components/branch/agenda-calendar.tsx')
const sessao = fonte('components/branch/appointment-session.tsx')

// 375 − 2 × 16 (--content-pad-x abaixo de 480 px) − 2 × 12 (--card-pad-sm) − 2 (a borda do cartão).
const LARGURA_UTIL_A_375 = 375 - 2 * 16 - 2 * 12 - 2

describe('a vista Dia no celular', () => {
  it('as duas colunas de quem atende cabem inteiras a 375 px', () => {
    const hora = Number(dia.match(/const TIME_COL_W = (\d+)/)?.[1])
    const coluna = Number(dia.match(/const COL_MIN_W = (\d+)/)?.[1])
    expect(hora, 'a coluna das horas').toBeGreaterThan(0)
    expect(coluna, 'a coluna de quem atende').toBeGreaterThanOrEqual(120)
    expect(hora + 2 * coluna).toBeLessThanOrEqual(LARGURA_UTIL_A_375)
  })
  it('a grade rola de lado e de cima a baixo sem a barra à mostra', () => {
    const grade = estiloDe(dia, 'data-grade-do-dia')
    expect(grade).toMatch(/overflow: 'auto'/)
    expect(grade).toMatch(/scrollbarWidth: 'none'/)
  })
  it('a coluna das horas fica parada na rolagem lateral', () => {
    expect(dia).toMatch(/const COLUNA_PARADA[^\n]*position: 'sticky', left: 0/)
    expect((dia.match(/\.\.\.COLUNA_PARADA/g) ?? []).length, 'o canto do cabeçalho e as horas').toBeGreaterThanOrEqual(2)
  })
  it('o nome de quem atende, no cabeçalho, corta com reticências e diz tudo no title', () => {
    const nome = estiloDe(dia, 'data-nome-do-profissional')
    expect(nome).toMatch(/title=\{pro\.name\}/)
    expect(nome).toMatch(/textOverflow: 'ellipsis'/)
    expect(nome).toMatch(/whiteSpace: 'nowrap'/)
  })
  it('o "· Check-in 14:45" do cartão não quebra em linhas', () => {
    expect(dia).toMatch(/\{isArrived && <span style=\{\{[^}]*whiteSpace: 'nowrap'/)
    expect(dia).toMatch(/\{isProgress && <span style=\{\{[^}]*whiteSpace: 'nowrap'/)
    expect(dia).toMatch(/\{isCompleted && <span style=\{\{[^}]*whiteSpace: 'nowrap'/)
  })
  it('o title do cartão diz o check-in, que pode sair cortado', () => {
    expect(dia).toMatch(/title=\{\[timeStr, [^\n]*isArrived \?/)
  })
  it('a legenda quebra a linha em vez de cortar o rótulo', () => {
    expect(estiloDe(calendario, 'data-navegacao-da-agenda')).toMatch(/flexWrap: 'wrap'/)
    expect(estiloDe(calendario, 'data-legenda-da-agenda')).toMatch(/flexWrap: 'wrap'/)
  })
})

describe('a tela do atendimento no celular', () => {
  it('a faixa da cliente quebra a linha: os selos descem, o nome fica inteiro', () => {
    const faixa = estiloDe(sessao, 'data-faixa-da-cliente')
    expect(faixa).toMatch(/flexWrap: 'wrap'/)
    const nome = estiloDe(sessao, 'data-nome-da-faixa')
    expect(nome).toMatch(/flex: '1 1 \d+px'/)
    expect(nome).toMatch(/minWidth: 0/)
  })
  it('a faixa do registro bloqueado quebra a linha: o botão desce, o texto fica inteiro', () => {
    const faixa = estiloDe(sessao, 'data-faixa-do-registro')
    expect(faixa).toMatch(/flexWrap: 'wrap'/)
    const texto = estiloDe(sessao, 'data-texto-da-faixa-do-registro')
    expect(texto).toMatch(/flex: '1 1 \d+px'/)
    expect(texto).toMatch(/minWidth: 0/)
  })
})

describe('a barra da agenda no celular', () => {
  it('o rótulo do dia não empurra o "Hoje" para fora a 375 px', () => {
    // O grupo da esquerda (‹ rótulo › Hoje) somava ~340 px contra 317 úteis com o rótulo em 200 px fixos.
    expect(calendario).not.toMatch(/letterSpacing: '-0\.01em', minWidth: 200,/)
    expect(calendario).toMatch(/minWidth: 'min\(200px, 40vw\)'/)
  })
})
