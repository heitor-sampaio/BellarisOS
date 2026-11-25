import { formatarNoFuso } from '@/lib/formatar-no-fuso'
import { fusoValido } from '@/lib/unidades/fuso'
import { relogioSeOutro } from '@/lib/unidades/hora-da-unidade'

/**
 * A hora de um agendamento na ficha da cliente (D3 da 30ª simulação;
 * indicadores:FU-02, "todo dia e toda hora de uma unidade saem no fuso dela").
 * A ficha é da REDE e mostra agendamentos de várias unidades: cada um sai no
 * relógio da unidade DELE e, quando não é o da tela, diz qual é — a regra da
 * agenda e do dashboard (`relogioSeOutro`, 26ª simulação). Sem o fuso da
 * unidade (dado antigo), o da tela. Puro: roda no servidor e no navegador.
 */
export function quandoNaFicha(
  instante: string, fusoDoAgendamento: string | null | undefined, fusoDaTela: string, padrao: string,
): string {
  const fuso = fusoDoAgendamento ? fusoValido(fusoDoAgendamento) : fusoDaTela
  const relogio = relogioSeOutro(fuso, fusoDaTela)
  return `${formatarNoFuso(instante, padrao, fuso)}${relogio ? ` (${relogio})` : ''}`
}

/** Só o dia (o histórico), no dia da unidade do agendamento — sem o relógio. */
export function diaNaFicha(instante: string, fuso: string, padrao: string): string {
  return formatarNoFuso(instante, padrao, fusoValido(fuso))
}
