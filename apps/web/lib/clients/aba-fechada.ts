/**
 * O aviso da ficha aberta numa aba que a pessoa não abre (A2 da 11ª; o texto,
 * vocabulário da 15ª simulação).
 *
 * "Seu cargo não abre a aba Prontuário" punha a culpa no cargo, e no caso do
 * Henrique da 15ª ele tinha o Prontuário: o que fechava a aba era o escopo
 * "só os próprios", e a cliente não era dele. Com o módulo e sem a aba, o
 * motivo é esse, e o aviso o diz.
 */
export function avisoDaAbaFechada(aba: { key: string; label: string }, temModuloProntuario: boolean): string {
  if (aba.key === 'fichas' && temModuloProntuario) {
    return 'O Prontuário desta ficha não abre para você: suas permissões nele são de "só os próprios", e esta cliente não foi atendida por você. Você está na Visão geral.'
  }
  return `Suas permissões não abrem a aba ${aba.label} desta ficha. Você está na Visão geral.`
}
