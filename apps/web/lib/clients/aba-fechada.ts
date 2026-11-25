/**
 * O aviso da ficha aberta numa aba que a pessoa não abre (A2 da 11ª; o texto,
 * vocabulário da 15ª simulação): diz que é a permissão, não "o cargo".
 *
 * A8 da 29ª (o `comAviso` do CLAUDE.md §6: o redirecionamento leva o motivo):
 * o aviso diz onde a pessoa FICOU — a Visão geral, ou o Prontuário de quem só
 * tem o Prontuário (a ficha só abre nele) — e a aba que não existe também diz.
 */
function ondeFicou(aberta?: string): string {
  return aberta === 'fichas' ? 'na aba Prontuário' : 'na Visão geral'
}

export function avisoDaAbaFechada(aba: { key: string; label: string }, aberta?: string): string {
  return `Suas permissões não abrem a aba ${aba.label} desta ficha. Você está ${ondeFicou(aberta)}.`
}

/** `?aba=` com uma aba que a ficha não tem (link velho, digitado). */
export function avisoDaAbaQueNaoExiste(pedida: string, aberta?: string): string {
  return `A aba “${pedida.slice(0, 40)}” não existe nesta ficha. Você está ${ondeFicou(aberta)}.`
}
