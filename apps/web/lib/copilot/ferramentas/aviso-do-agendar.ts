/**
 * O que o cartão da agenda diz sobre o aviso à cliente (A33 da 16ª e A23 da
 * 17ª, princípio 3). Agendar, remarcar e cancelar avisam a cliente pelo app
 * (`notifyClient`, em `lib/appointments/avisos.ts`), e só pelo app: sem
 * acesso, ou sem o app da cliente no plano da rede, nada sai — e o cartão diz
 * isso, em vez de prometer um aviso por um canal que não existe.
 */
export type FatoDaAgenda = 'agendar' | 'remarcar' | 'cancelar'

/** O título do aviso que chega ao app — o mesmo de `lib/appointments/avisos.ts`. */
const TITULO_DO_AVISO: Record<FatoDaAgenda, string> = {
  agendar:  'Horário marcado',
  remarcar: 'Agendamento remarcado',
  cancelar: 'Agendamento cancelado',
}

export function avisoDaAgendaParaACliente(fato: FatoDaAgenda, o: { temAcesso: boolean; portalNoPlano: boolean }): string {
  if (!o.portalNoPlano) return 'Nada é enviado a ela agora: a rede não tem o app da cliente no plano.'
  if (!o.temAcesso) return 'Nada é enviado a ela agora: ela não tem acesso ao app.'
  return `Ela recebe o aviso “${TITULO_DO_AVISO[fato]}” no app.`
}

export function avisoDoAgendarParaACliente(o: { temAcesso: boolean; portalNoPlano: boolean }): string {
  return avisoDaAgendaParaACliente('agendar', o)
}
