import { formatBRL } from '@estetica-os/utils'
import { lerEntrada } from './entrada'

/**
 * O "+ Outra forma" (D1 da 18ª; o Heitor, 2026-11-16: "Ok"): a cliente paga
 * parte numa forma e parte em outra — R$ 1.000 no crédito em 3x e o resto no
 * Pix. A PRIMEIRA forma (o bloco escolhido) fica com o que falta; cada outra
 * diz o valor dela. Assim a soma fecha o total por construção, e a tela diz
 * quanto ficou na primeira ("o que falta").
 *
 * Puro, fora do componente: a tela e os testes usam a mesma conta.
 */
export interface EstadoDaParte {
  metodo:     string
  /** O valor como foi digitado ("596,00"). */
  valor:      string
  vezes:      number
  bandeira:   string
  maquininha: string
}

/*
 * Quantas formas: quantas quem recebe quiser. O Heitor, 25/11, sobre o limite
 * de 5 formas: "Não precisa de aviso, essa não é uma ação automatica, o usuario
 * vai precisar clicar em um botão, então ele fez de proposito." Sem teto e sem
 * aviso; o impossível (forma sem valor, soma que não fecha) é `recusaDasOutras`.
 */

export const parteVazia = (): EstadoDaParte => ({ metodo: '', valor: '', vezes: 1, bandeira: '', maquininha: '' })

const centavos = (v: number) => Math.round(v * 100)

/** O valor digitado de uma parte, ou nulo quando não se lê (ou é zero). */
export function valorDaParte(p: EstadoDaParte): number | null {
  const lido = lerEntrada(p.valor)
  return 'valor' in lido && lido.valor > 0 ? Math.round(lido.valor * 100) / 100 : null
}

/** O que fica na primeira forma: o total menos as outras. */
export function valorDaPrincipal(total: number, outras: EstadoDaParte[]): number {
  const somadas = outras.reduce((s, p) => s + centavos(valorDaParte(p) ?? 0), 0)
  return (centavos(total) - somadas) / 100
}

/**
 * A recusa das outras formas, ou nulo: cada uma com a forma e o valor, e a
 * primeira ainda com alguma coisa (senão ela sobra sem valor — tire a outra).
 */
export function recusaDasOutras(outras: EstadoDaParte[], total: number | undefined): string | null {
  if (!outras.length) return null
  if (outras.some(p => !p.metodo)) return 'Escolha a forma de cada parte.'
  if (outras.some(p => valorDaParte(p) === null)) return 'Digite o valor de cada forma.'
  if (total === undefined) return null
  const principal = valorDaPrincipal(total, outras)
  if (principal <= 0) {
    const somadas = (centavos(total) - centavos(principal)) / 100
    return `As outras formas somam ${formatBRL(somadas)} e já fecham o total de ${formatBRL(total)}: tire uma ou diminua o valor.`
  }
  return null
}
