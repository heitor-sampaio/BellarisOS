/**
 * A validade da proposta (`tenants.plano_validade_dias`, contada da criação do
 * plano): o cartão do app diz "Válido até" ou "Proposta vencida", e o aceite
 * pelo app (PT1b) só vale dentro dela — o que a tela mostra é o que vale
 * (princípio 3). Puro.
 */
export function validoAteDaProposta(criadoEm: string, validadeDias: number): Date {
  return new Date(new Date(criadoEm).getTime() + validadeDias * 86_400_000)
}

export function propostaVencida(criadoEm: string, validadeDias: number, agora = Date.now()): boolean {
  return validoAteDaProposta(criadoEm, validadeDias).getTime() < agora
}
