import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BUSINESS_TZ, addDaysTZ, dayKeyTZ, naParede } from '@/lib/datetime'

/**
 * O instante formatado (o padrão do date-fns: "dd/MM 'às' HH:mm") no relógio
 * do FUSO (F64, 13ª simulação: a ficha, o atendimento e o inbox formatavam no
 * relógio do aparelho, e o servidor no dele). Puro: roda no navegador e no
 * servidor, em qualquer fuso do processo. Sem fuso, o de Brasília.
 *
 * A grade da agenda, que já trabalha "na parede", formata o Date dela com o
 * `format` de sempre; este é para o instante VERDADEIRO (o do banco).
 */
export function formatarNoFuso(instante: Date | string | null | undefined, padrao: string, fuso: string = BUSINESS_TZ): string {
  if (instante == null || instante === '') return ''
  const parede = naParede(instante, fuso)
  if (Number.isNaN(parede.getTime())) return ''
  return format(parede, padrao, { locale: ptBR })
}

/** "hoje", "ontem" ou nulo — pelo dia DO FUSO, não pelo do aparelho. */
export function diaRelativo(instante: Date | string, fuso: string = BUSINESS_TZ, agora: Date = new Date()): 'hoje' | 'ontem' | null {
  const dia = dayKeyTZ(instante, fuso)
  if (dia === dayKeyTZ(agora, fuso)) return 'hoje'
  if (dia === dayKeyTZ(addDaysTZ(agora, -1, fuso), fuso)) return 'ontem'
  return null
}
