/**
 * PT3 (a revisão do Heitor de 2026-11-13: "se for uma sessão de plano ou
 * pacote, pode agendar"): o que a cliente agenda pelo app. O procedimento
 * marcado "Permitir auto agendamento" (`visible_on_client_app`), como sempre;
 * e, fora dele, a SESSÃO JÁ COMPRADA — a livre de um plano aceito ou de um
 * pacote — porque ela já foi avaliada e contratada. O pré-pago avulso segue a
 * marca do procedimento.
 *
 * Puro: a tela do agendar (o que ela oferece), a action (o que ela aceita) e
 * os cartões do plano no app (quem marca) usam a mesma regra.
 */
export function agendavelPeloApp(p: { visivelNoApp: boolean; sessaoComprada: boolean }): boolean {
  return p.visivelNoApp || p.sessaoComprada
}
