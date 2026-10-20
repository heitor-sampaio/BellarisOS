/**
 * O aviso do pré-atendimento (2026-10-20): sai para a cliente quando o
 * agendamento deixa a ficha pendente. Vai para a tela de bloqueio do celular —
 * nada sobre a saúde dela no texto, só o convite e o link.
 */
export function avisoDoPreAtendimento(slug: string, modo: 'COMPLETO' | 'CONFIRMAR') {
  return {
    type: 'pre_atendimento',
    title: 'Antes do seu atendimento',
    body: modo === 'CONFIRMAR'
      ? 'Confirme se algo mudou desde a sua última ficha. Leva um minuto.'
      : 'A clínica mandou algumas perguntas para você responder pelo app.',
    data: { link: `/${slug}/cliente/pre-atendimento` },
  }
}
