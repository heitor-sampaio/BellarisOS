/**
 * A falta ("Não compareceu" — AG-36): só a partir do horário marcado, só de
 * quem ainda não foi atendida (Agendado, Confirmado ou Chegou) e só por quem
 * tem a Agenda em Gerenciar (AG-32). A mesma regra na janela da agenda e na
 * tela do atendimento (A8 da 34ª: quem chegava à tela do atendimento pelo
 * "Em andamento" não achava a falta). O servidor confere de novo
 * (`updateAppointmentStatus`). Puro: roda no navegador.
 */
const ANTES_DO_ATENDIMENTO = ['SCHEDULED', 'CONFIRMED', 'ARRIVED']

export function mostraAFalta(a: { status: string; inicio: string; agoraMs: number | null; podeMarcar: boolean }): boolean {
  if (!a.podeMarcar || a.agoraMs == null || !ANTES_DO_ATENDIMENTO.includes(a.status)) return false
  const inicio = new Date(a.inicio).getTime()
  return !Number.isNaN(inicio) && inicio <= a.agoraMs
}

/** A pergunta antes de gravar a falta (A25 da 7ª: gravava no clique). */
export function perguntaDaFalta(nome: string, hora: string): string {
  return `Marcar que ${nome} não compareceu às ${hora}? Os documentos deste horário que ela ainda não assinou são cancelados, e o que estava pago (pacote, plano, pré-pago) volta para ela.`
}
