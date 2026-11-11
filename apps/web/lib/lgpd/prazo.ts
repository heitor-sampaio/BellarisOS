/**
 * O prazo da clínica para responder ao pedido do titular: 15 dias do pedido, o
 * da LGPD (art. 19, II) para a declaração completa. UMA conta para o portal (o
 * cartão do pedido, A60 da 5ª) e para a aba LGPD da clínica (A50 da 8ª
 * simulação, 2026-11-06: a cliente via "até 21/11" e a clínica não via nada).
 */
export const DIAS_DO_PRAZO_DA_LGPD = 15

/** O dia-limite, no fuso da clínica (F62b; sem ele, Brasília): "21/11" (`comAno`: "21/11/2026"). */
export function prazoDeResposta(pedidoEm: string, comAno = false, fuso = 'America/Sao_Paulo'): string {
  return new Date(new Date(pedidoEm).getTime() + DIAS_DO_PRAZO_DA_LGPD * 86_400_000)
    .toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit', ...(comAno ? { year: 'numeric' } : {}) })
}
