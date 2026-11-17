/**
 * A execução que ESPERA, dita em português (A14 da 20ª simulação, 2026-11-17;
 * princípio 3). O lembrete do agendamento cancelado aparecia "Esperando" até
 * 18/11, como se ainda fosse sair: ele vai só reconferir (o "Se ainda está de
 * pé") e terminar. A lista diz quando a execução segue e, se o agendamento
 * dela já caiu, que ela vai reconferir e por quê. Puro: roda no navegador.
 */

const FUSO_DE_BRASILIA = 'America/Sao_Paulo'

/** As situações em que o agendamento não acontece mais. */
const CAIU: Record<string, string> = {
  CANCELLED: 'o agendamento foi cancelado',
  NO_SHOW:   'o agendamento ficou como falta',
  COMPLETED: 'o atendimento já foi concluído',
}

/** "22/11 às 09:00" no fuso da tela. */
function diaEHora(iso: string, fuso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
  return `${dia} às ${hora}`
}

export function fraseDaEspera(
  e: { retomaEm: string | null; situacaoDoAgendamento: string | null },
  fuso: string = FUSO_DE_BRASILIA,
): string | null {
  if (!e.retomaEm) return null
  const quando = diaEHora(e.retomaEm, fuso)
  const caiu = e.situacaoDoAgendamento ? CAIU[e.situacaoDoAgendamento] : undefined
  return caiu ? `Vai reconferir em ${quando}: ${caiu}.` : `Segue em ${quando}.`
}

/** O passo "Esperar" no passo a passo: "Esperando até 22/11 às 09:00". Nulo se não é espera. */
export function esperaDoPasso(resumo: Record<string, unknown> | null | undefined, fuso: string = FUSO_DE_BRASILIA): string | null {
  if (!resumo || !resumo.esperando || typeof resumo.ate !== 'string') return null
  return `Esperando até ${diaEHora(resumo.ate, fuso)}`
}
