import { z } from 'zod'
import { LIMITE_DE_DIAS, LIMITE_DE_HORAS, LIMITE_DE_MESES, acimaDeCemAnos, avisoAcimaDoComum } from '@/lib/acima-do-comum'

/**
 * Os três prazos que a rede configura e que viram DATA: o prazo para a cliente
 * alterar o agendamento pelo app (`tenants.portal_prazo_alteracao_horas`), a
 * validade do plano proposto (`tenants.plano_validade_dias`) e a validade da
 * ficha de saúde (`tenants.pre_atendimento_validade_meses`).
 *
 * O Heitor, 25/11, perguntado se o "no máximo, avisar" do princípio 2 vale
 * para eles: "Se não for impossível, ainda que improvável, pode ser feito."
 * Acima do comum (o teto de antes: 720 horas, 365 dias, 36 meses), a tela
 * AVISA e o servidor grava.
 *
 * O impossível (decisão do Claude, 25/11): negativo, zero onde não cabe (a
 * validade do plano e da ficha começam em 1; o prazo do portal aceita 0),
 * fracionário, e acima de 100 anos — a conta da data estoura no banco
 * (`LIMITE_DE_HORAS`, `LIMITE_DE_DIAS`, `LIMITE_DE_MESES`). O banco tem a
 * mesma faixa (migration `20261207000001`).
 *
 * Puro: a tela (o aviso) e a action (a recusa) leem a mesma regra.
 */
const COMUM_DOS_PRAZOS = {
  portal_prazo_alteracao_horas:   { comum: 720, unidade: 'horas' },
  plano_validade_dias:            { comum: 365, unidade: 'dias' },
  pre_atendimento_validade_meses: { comum: 36,  unidade: 'meses' },
} as const

export type PrazoDaRede = keyof typeof COMUM_DOS_PRAZOS

/** O aviso do campo acima do comum, ou `null` (o valor vale como está). */
export function avisoDoPrazoDaRede(campo: PrazoDaRede, valor: number): string | null {
  const { comum, unidade } = COMUM_DOS_PRAZOS[campo]
  return avisoAcimaDoComum(valor, comum, unidade)
}

const PORTAL_INVALIDO = 'O prazo do portal é um número inteiro de horas, de 0 para cima.'
const PLANO_INVALIDO = 'A validade do plano proposto é um número inteiro de dias, de 1 para cima.'
const FICHA_INVALIDA = 'A validade da ficha de saúde é um número inteiro de meses, de 1 para cima.'

/** A recusa do prazo do portal (só o impossível), ou `null`. */
export function recusaDoPrazoDoPortal(horas: number): string | null {
  if (!Number.isInteger(horas) || horas < 0) return PORTAL_INVALIDO
  if (horas > LIMITE_DE_HORAS) return acimaDeCemAnos(LIMITE_DE_HORAS, 'horas')
  return null
}

/** A recusa da validade do plano proposto (só o impossível), ou `null`. */
export function recusaDaValidadeDoPlano(dias: number): string | null {
  if (!Number.isInteger(dias) || dias < 1) return PLANO_INVALIDO
  if (dias > LIMITE_DE_DIAS) return acimaDeCemAnos(LIMITE_DE_DIAS, 'dias')
  return null
}

/** O envio da ficha de saúde: ligado ou não, e a validade das respostas (só o impossível se recusa). */
export const EntradaDoEnvioDaFicha = z.object({
  envio: z.boolean(),
  validadeMeses: z.number({ message: FICHA_INVALIDA }).int(FICHA_INVALIDA).min(1, FICHA_INVALIDA)
    .max(LIMITE_DE_MESES, acimaDeCemAnos(LIMITE_DE_MESES, 'meses')),
})
