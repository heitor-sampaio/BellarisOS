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
