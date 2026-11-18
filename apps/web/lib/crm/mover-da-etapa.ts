/**
 * "Mover as N para [etapa]" na configuração do funil (A35 da 22ª simulação,
 * 2026-11-17): a etapa com oportunidades só dizia "mova no quadro", uma a uma.
 * Decisão do Heitor: se mover à mão dispararia automações, PERGUNTAR se
 * dispara (Sim/Não). Os textos, puros — o teste os chama sem banco.
 */

export function textoDoMoverDaEtapa(n: number): string {
  return n === 1 ? 'Mover a oportunidade para' : `Mover as ${n} para`
}

const lista = (nomes: string[]) => {
  const q = nomes.map(n => `“${n}”`)
  return q.length <= 1 ? q.join('') : `${q.slice(0, -1).join(', ')} e ${q[q.length - 1]}`
}

/** A pergunta antes de mover, quando alguma automação ligada assina o movimento. */
export function perguntaDasAutomacoes(nomes: string[]): string {
  return nomes.length === 1
    ? `Mover dispara a automação ${lista(nomes)}. Disparar?`
    : `Mover dispara as automações ${lista(nomes)}. Disparar?`
}

/** O que a tela diz depois de mover. */
export function resultadoDoMover(movidas: number, ficaram: number): string {
  const feitas = movidas === 1 ? '1 oportunidade movida.' : `${movidas} oportunidades movidas.`
  if (!ficaram) return feitas
  const quem = ficaram === 1 ? '1 ficou: é de outra pessoa' : `${ficaram} ficaram: são de outras pessoas`
  return `${feitas} ${quem}, e a sua permissão no CRM é “só os meus”.`
}
