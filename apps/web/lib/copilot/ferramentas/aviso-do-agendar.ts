/**
 * O que o cartão "Agendar atendimento" diz sobre o aviso à cliente (A33 da
 * 16ª, princípio 3). O agendamento avisa a cliente pelo app ("Horário
 * marcado", `notifyClient`), e só pelo app: sem acesso, ou sem o app da
 * cliente no plano da rede, nada sai — e o cartão diz isso, em vez de
 * prometer "a confirmação" por um canal que não existe.
 */
export function avisoDoAgendarParaACliente(o: { temAcesso: boolean; portalNoPlano: boolean }): string {
  if (!o.portalNoPlano) return 'Nada é enviado a ela agora: a rede não tem o app da cliente no plano.'
  if (!o.temAcesso) return 'Nada é enviado a ela agora: ela não tem acesso ao app.'
  return 'Ela recebe o aviso “Horário marcado” no app.'
}
