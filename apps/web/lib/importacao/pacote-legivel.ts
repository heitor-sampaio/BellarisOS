import { formatBRL } from '@estetica-os/utils'
import { dayKeyTZ } from '@/lib/datetime'
import type { PacoteDaPlanilha } from '@/lib/importacao/normalizar'

/**
 * O "Pacote de antes" como a tela das Importações o mostra (crm-inbox:IM-22,
 * o princípio 7; A22 da 29ª simulação, 2026-11-25): o formato com as cinco
 * partes — o valor de referência e a validade são opcionais — e, na amostra
 * da prévia, o que foi LIDO de cada pacote (era só "1 pacote de antes").
 */
export const FORMATO_DO_PACOTE_DE_ANTES = 'procedimento; total; usadas; valor de referência; validade'

const dia = (aaaaMmDd: string) => aaaaMmDd.slice(0, 10).split('-').reverse().join('/')

export function pacoteDeAntesLegivel(p: PacoteDaPlanilha, procedimento: string, hoje: Date = new Date()): string {
  const validade = p.validade
    ? (p.validade.slice(0, 10) < dayKeyTZ(hoje) ? `vencido em ${dia(p.validade)}` : `validade ${dia(p.validade)}`)
    : 'sem validade'
  return [
    `${procedimento}: ${p.usadas} de ${p.total} ${p.total === 1 ? 'sessão usada' : 'sessões usadas'}`,
    p.valor !== null ? formatBRL(p.valor).replace(/ /g, ' ') : 'sem valor de referência',
    validade,
  ].join(' · ')
}
