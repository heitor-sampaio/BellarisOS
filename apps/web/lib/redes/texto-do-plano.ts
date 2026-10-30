/**
 * Como a tela da CLÍNICA fala do plano dela (J-7, 2026-10-30): a rede em
 * teste aparecia como "PLANO —" na aba Geral, e a Assinatura dizia "Todas as
 * funcionalidades, sem limite" — mas o Copilot NÃO libera sem plano
 * (`copilotNoPlano`, lib/copilot/disponivel.ts: ele custa por uso). Sem plano,
 * todo o resto está liberado (`ctx.plano` nulo = tudo, lib/auth.ts).
 */

/** O nome do plano na aba Geral: o do plano, "Teste grátis" ou "Sem plano definido". */
export function nomeDoPlanoNaTela(planName: string | null, planStatus: string | null): string {
  if (planName) return planName
  return planStatus === 'trial' ? 'Teste grátis' : 'Sem plano definido'
}

/** O que a rede SEM plano tem (Configurações → Assinatura). */
export function oQueSemPlanoLibera(planStatus: string | null): string {
  return planStatus === 'trial'
    ? 'Teste grátis: tudo, menos o Copilot. Ele entra com um plano que o inclua.'
    : 'Todas as funcionalidades, sem limite, menos o Copilot: ele entra com um plano que o inclua.'
}
