/**
 * O que o histórico do agendamento diz da troca de profissional (A22 da 8ª
 * simulação): de quem para quem — dizia só "Profissional reatribuído para X",
 * e o arraste para outra coluna, só "Remarcado".
 */
export function textoDaTroca(de: string | null, para: string): string {
  return de ? `Profissional trocado de ${de} para ${para}` : `Profissional trocado para ${para}`
}
