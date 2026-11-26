import { dayKeyTZ } from '@/lib/datetime'
import { fusoValido } from '@/lib/unidades/fuso'

/**
 * Os "Próximos agendamentos" da ficha são de hoje em diante (A16 da 31ª; a
 * regra dos próximos do app, AG-55: "o de hoje fica até a conclusão, e o de
 * ontem em aberto vai ao histórico"; princípio 3). Marca o em aberto de um dia
 * ANTERIOR ao de hoje — o dia no relógio da unidade do agendamento (F62, FU-02);
 * sem ele, o da tela. O que está em atendimento segue nos próximos: a equipe
 * está nele. A ficha mostra os marcados à parte, "Em aberto de dias
 * anteriores", até a equipe fechá-los (decisão do Claude, 26/11). Puro.
 */
export function marcarOsDeAntes<T extends { scheduledAt: string; status: string; fuso?: string | null }>(
  agendamentos: T[], agora: Date, fusoDaTela: string,
): (T & { emAbertoDeAntes: boolean })[] {
  return agendamentos.map(a => {
    const fuso = a.fuso ? fusoValido(a.fuso) : fusoDaTela
    const deAntes = a.status !== 'IN_PROGRESS' && dayKeyTZ(a.scheduledAt, fuso) < dayKeyTZ(agora, fuso)
    return { ...a, emAbertoDeAntes: deAntes }
  })
}
