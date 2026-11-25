import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aberturaDoCopilot, CAPACIDADES_DO_COPILOT } from '@/lib/copilot/abertura'
import { FERRAMENTAS } from '@/lib/copilot/ferramentas'
import { ORIGEM_DO_AGENDAMENTO } from '@/lib/copilot/ferramentas/comum'

const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')
const RAIZ = join(__dirname, '..', '..', '..')

/**
 * A20: o Copilot respondeu a forma de pagamento como o banco a guarda ("Cash").
 * A ferramenta `indicadores` passava ao modelo o código cru da forma, da
 * situação e da origem do agendamento; o modelo os repetia. Vai o nome que a
 * tela usa (`rotuloDaForma`, a situação e a origem em português) — princípio 7.
 */
describe('A20: o Copilot recebe a forma, a situação e a origem pelo nome', () => {
  it('a ferramenta indicadores manda o rótulo, não o código', () => {
    const t = fonte('lib/copilot/ferramentas/indicadores.ts')
    expect(t).toMatch(/forma: rotuloDaForma\(x\.forma\)/)
    expect(t).toMatch(/porStatus: r\.agendamentosPorStatus\.map\(/)
    expect(t).toMatch(/porOrigem: r\.porOrigem\.map\(/)
  })
  it('a origem do agendamento tem nome', () => {
    expect(ORIGEM_DO_AGENDAMENTO.CLIENT_APP).toBe('app da cliente')
    expect(ORIGEM_DO_AGENDAMENTO.INTERNAL).toBe('pela equipe')
  })
})

/**
 * A21: o "Olá" dizia "Toda gravação passa pela sua confirmação." a quem só
 * podia, entre o que ele listava, achar um cliente: a gravação que a
 * permissão dela libera (cancelar um agendamento, com o Atendimento em
 * Gerenciar) não estava na frase. Toda ferramenta de gravação tem nome na
 * abertura (copilot CH-07: o texto só oferece o que a pessoa pode fazer).
 */
describe('A21: o Olá diz QUAIS gravações a permissão faz', () => {
  it('quem só cancela (o Atendimento em Gerenciar) ouve "cancelar um agendamento"', () => {
    const a = aberturaDoCopilot({ ferramentas: ['cliente', 'clientes', 'cancelar_agendamento'], veFaturamento: false, grava: true })
    expect(a.texto).toBe('Olá! Peça o que precisar: achar um cliente ou cancelar um agendamento. Toda gravação passa pela sua confirmação.')
  })
  it('quem dá baixa pelo PDV ouve "dar baixa num lançamento"', () => {
    const a = aberturaDoCopilot({ ferramentas: ['cliente', 'marcar_pago'], veFaturamento: false, grava: true })
    expect(a.texto).toMatch(/dar baixa num lançamento\. Toda gravação/)
  })
  it('toda ferramenta de gravação do catálogo tem nome na abertura', () => {
    const nomeadas = new Set(CAPACIDADES_DO_COPILOT.flatMap(c => [...c.ferramentas]))
    const semNome = FERRAMENTAS.filter(f => f.tipo === 'escrita' && !nomeadas.has(f.nome)).map(f => f.nome)
    expect(semNome).toEqual([])
  })
})

/**
 * A22: o botão "Fora do plano" era mais largo que o do Copilot no plano (o
 * selo "Fora do plano" ao lado do rótulo), e cobria o botão da tela que o do
 * plano deixa livre. A régua é o botão do plano: o selo pousa em cima, em
 * qualquer largura, e o botão fica do mesmo tamanho.
 */
describe('A22: o botão de fora do plano ocupa o lugar do botão do plano', () => {
  it('o selo pousa em cima do botão fora de qualquer media query', () => {
    const css = readFileSync(join(RAIZ, 'packages', 'nucleo', 'src', 'estilos', 'globals.css'), 'utf8')
    const semMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    expect(semMedia).toMatch(/\.copilot-botao \.copilot-botao-selo\s*\{[^}]*position:\s*absolute/)
  })
})
