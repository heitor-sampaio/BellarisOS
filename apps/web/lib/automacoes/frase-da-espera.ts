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

/**
 * O fato de cada situação (D7 da 32ª; RX-05). Quando o gatilho da automação É
 * essa situação — o "Retorno depois do atendimento" espera a partir da
 * conclusão —, o agendamento não "caiu": é dele que a espera começou, e ela
 * segue.
 */
const GATILHO_DA_SITUACAO: Record<string, string> = {
  CANCELLED: 'agendamento.cancelado',
  NO_SHOW:   'agendamento.nao_compareceu',
  COMPLETED: 'agendamento.concluido',
}

/** "22/11 às 09:00" no fuso da tela. */
function diaEHora(iso: string, fuso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
  return `${dia} às ${hora}`
}

/**
 * `ligada`: a automação está no ar. Desligada, a espera não segue — quando a
 * hora chega, o motor encerra a execução ("Automação não está ativa.") —, e a
 * lista diz isso, não "Segue em …" (A14 da 38ª; RX-05, princípio 3). Religada
 * antes da hora, a execução segue, e a frase volta a ser a de sempre.
 */
export function fraseDaEspera(
  e: { retomaEm: string | null; situacaoDoAgendamento: string | null; gatilho?: string | null },
  fuso: string = FUSO_DE_BRASILIA,
  ligada = true,
): string | null {
  if (!e.retomaEm) return null
  if (!ligada) return 'A automação está desligada.'
  const quando = diaEHora(e.retomaEm, fuso)
  const situacao = e.situacaoDoAgendamento
  const ehOGatilho = !!situacao && !!e.gatilho && GATILHO_DA_SITUACAO[situacao] === e.gatilho
  const caiu = situacao && !ehOGatilho ? CAIU[situacao] : undefined
  return caiu ? `Vai reconferir em ${quando}: ${caiu}.` : `Segue em ${quando}.`
}

/** O passo "Esperar" no passo a passo: "Esperando até 22/11 às 09:00". Nulo se não é espera. */
export function esperaDoPasso(resumo: Record<string, unknown> | null | undefined, fuso: string = FUSO_DE_BRASILIA): string | null {
  if (!resumo || !resumo.esperando || typeof resumo.ate !== 'string') return null
  return `Esperando até ${diaEHora(resumo.ate, fuso)}`
}
