import { dayKeyTZ } from '@/lib/datetime'

/**
 * Quantos dias faltam para o fim do teste grátis (A30 da 25ª — o Heitor:
 * "Mostra"). Puro: a aba Assinatura e o aviso do topo dividem.
 *
 * O teste vale até o FIM do último dia em Brasília: o banco grava
 * `trial_ends_at` às 23:59:59 de São Paulo, o cron (`assinaturas_aplicar_regras`)
 * vence por esse instante, e a tela diz a data nesse relógio ("até 18/12/2026").
 * A conta usa o MESMO relógio (princípio 3: a data na tela e a conta não podem
 * divergir — no fuso de outra unidade, o dia mudaria e a data, não):
 *  - dias de CALENDÁRIO entre hoje e o último dia, ambos em Brasília — a hora
 *    do dia não muda o número;
 *  - no último dia, 0 ("termina hoje"), até 23:59:59;
 *  - passado o instante do fim, `null` (o teste acabou); sem data, `null`.
 * Era `Math.ceil` do instante no aviso do topo: no último dia, "termina em 1 dia".
 */
export const FUSO_DO_TESTE = 'America/Sao_Paulo'

export function diasDoTeste(fim: string | null | undefined, agora: Date, fuso: string = FUSO_DO_TESTE): number | null {
  if (!fim) return null
  const instante = Date.parse(fim)
  if (Number.isNaN(instante) || agora.getTime() > instante) return null
  const dia = (d: Date | string) => Date.parse(`${dayKeyTZ(d, fuso)}T12:00:00Z`)
  return Math.round((dia(new Date(instante)) - dia(agora)) / 86_400_000)
}

/** "termina hoje", "termina amanhã", "termina em 30 dias". */
export function textoDoFimDoTeste(dias: number): string {
  if (dias <= 0) return 'termina hoje'
  if (dias === 1) return 'termina amanhã'
  return `termina em ${dias} dias`
}
