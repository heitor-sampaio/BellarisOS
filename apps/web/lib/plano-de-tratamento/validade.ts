import type { FalaDaRede } from '@/lib/clientes/fala-da-rede'

/**
 * A validade da proposta (`tenants.plano_validade_dias`, contada da criação do
 * plano): o cartão do app diz "Válido até" ou "Proposta vencida". É SÓ
 * INFORMAÇÃO, também no aceite pelo app (decisão do Claude pelo princípio 2,
 * auditoria das regras, 2026-11-18: o bloco do plano aprovado diz "a validade
 * da proposta (só informação)", e o checkout na unidade já não recusava; o app
 * recusava o vencido). O app avisa e aceita. Puro.
 */
export function validoAteDaProposta(criadoEm: string, validadeDias: number): Date {
  return new Date(new Date(criadoEm).getTime() + validadeDias * 86_400_000)
}

export function propostaVencida(criadoEm: string, validadeDias: number, agora = Date.now()): boolean {
  return validoAteDaProposta(criadoEm, validadeDias).getTime() < agora
}

/**
 * O aviso do plano vencido no app: avisa, não recusa (princípio 2). Com o
 * NOME da rede (CA1): "… Na dúvida, fale com Estética Bella antes de aceitar."
 */
export function avisoDaPropostaVencida(dia: string, fala: Pick<FalaDaRede, 'faleCom'>): string {
  return `Proposta vencida em ${dia}: os valores podem ter mudado. Na dúvida, ${fala.faleCom} antes de aceitar.`
}
