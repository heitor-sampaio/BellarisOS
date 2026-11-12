import { dayKeyTZ, horaNoFuso, instanteNoFuso } from '@/lib/datetime'

/**
 * A hora da campanha AGENDADA (D4 da 13ª simulação, 2026-11-12): o
 * `datetime-local` ("2026-11-12T09:00", sem fuso) ia cru para o banco, que o
 * lia como UTC — o 09:00 saía às 06:00 de Brasília e às 04:00 do Acre. A
 * campanha é da REDE: a hora digitada é a do relógio comum das unidades
 * (`fusoDaRede`, a regra da campanha automática), e a tela diz qual.
 */
const SEM_FUSO = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/

/** O instante (ISO) da hora digitada no relógio da rede; o que já tem fuso passa como veio. Inválido: nulo. */
export function instanteDaCampanha(valor: string | null | undefined, fuso: string): string | null {
  if (!valor) return null
  const m = SEM_FUSO.exec(valor.trim())
  const d = m ? instanteNoFuso(m[1]!, `${m[2]}${m[3] ?? ''}`, fuso) : new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** O instante do banco → o valor do `datetime-local`, no relógio da rede. */
export function campoDaCampanha(iso: string | null | undefined, fuso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${dayKeyTZ(d, fuso)}T${horaNoFuso(d, fuso)}`
}
