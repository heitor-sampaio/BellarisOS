/**
 * O texto do aviso "Horário marcado" à cliente (A28 da 6ª simulação,
 * 2026-11-04): com a clínica de mais de uma unidade, ele diz ONDE — a cliente
 * de duas unidades não sabia para qual ir. Com uma unidade só, como antes.
 *
 * Puro.
 */
export function textoDoHorarioMarcado(procedimento: string, quando: string, unidade: string | null): string {
  return unidade ? `${procedimento} em ${quando}, na unidade ${unidade}.` : `${procedimento} em ${quando}.`
}

/**
 * Os outros avisos à cliente (A48 da 9ª simulação, 2026-11-07): "Seu Avaliação
 * foi concluído" errava o gênero (o nome do procedimento é da clínica, e o
 * texto não decide por ele) — os textos ficam neutros, com o procedimento
 * depois de dois-pontos. E, como o "Horário marcado", o remarcado e o
 * cancelado dizem a unidade quando a clínica tem mais de uma.
 */
const naUnidade = (unidade: string | null) => (unidade ? `, na unidade ${unidade}` : '')

export function textoDoRemarcado(procedimento: string, quando: string, unidade: string | null): string {
  return `Novo horário: ${procedimento} em ${quando}${naUnidade(unidade)}.`
}

export function textoDoCancelado(procedimento: string, quando: string, unidade: string | null, motivo: string | null): string {
  return `Agendamento cancelado: ${procedimento} de ${quando}${naUnidade(unidade)}.${motivo?.trim() ? ` Motivo: ${motivo.trim()}.` : ''}`
}

export function textoDoConcluido(procedimento: string): string {
  return `Atendimento concluído: ${procedimento}. Confirme e avalie pelo app.`
}

export function textoDoPagamento(procedimento: string): string {
  return `Pagamento confirmado: ${procedimento}.`
}
