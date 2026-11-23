/**
 * O aviso da ficha aberta numa aba que a pessoa não abre (A2 da 11ª; o texto,
 * vocabulário da 15ª simulação): diz que é a permissão, não "o cargo".
 */
export function avisoDaAbaFechada(aba: { key: string; label: string }): string {
  return `Suas permissões não abrem a aba ${aba.label} desta ficha. Você está na Visão geral.`
}
