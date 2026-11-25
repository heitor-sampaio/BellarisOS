import { instanteNoFuso } from '@/lib/datetime'

/**
 * O que a grade de horários de UM dia precisa ler, no relógio da unidade (F62):
 * da véspera (o atendimento da noite anterior pode atravessar a meia-noite) ao
 * fim do dia SEGUINTE — a sessão das 23:30 de 60 min vai até 00:30 de amanhã, e
 * o agendamento das 00:00 de amanhã a ocupa (D6 da 28ª: a grade oferecia o
 * 23:30, e o servidor recusava). `dia`/`fimDoDia` são os limites do próprio dia.
 */
export function janelaDaGrade(data: string, fuso: string): { dia: string; fimDoDia: string; desde: string; ate: string } {
  const dia = instanteNoFuso(data, '00:00', fuso)
  const fimDoDia = instanteNoFuso(data, '23:59:59', fuso)
  const UM_DIA = 86_400_000
  return {
    dia:      dia.toISOString(),
    fimDoDia: fimDoDia.toISOString(),
    desde:    new Date(dia.getTime() - UM_DIA).toISOString(),
    ate:      new Date(fimDoDia.getTime() + UM_DIA).toISOString(),
  }
}
