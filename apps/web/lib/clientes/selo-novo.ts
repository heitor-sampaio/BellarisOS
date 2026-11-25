import { dayKeyTZ } from '@/lib/datetime'
import { diaDeClienteDesde } from '@/lib/clientes/cliente-desde'

/**
 * O selo "Novo" da lista de clientes (crm-inbox:IM-20 e IM-21; D2 da 29ª
 * simulação, 2026-11-25). Nova é quem é cliente há menos de 30 dias, desde o
 * dia em que passou a ser cliente: o "Cliente desde" da importação, senão o
 * cadastro — e a "Última visita" de antes do sistema, quando é mais antiga
 * (IM-21: "a ficha que só a tem, sem Cliente desde, conta como cliente de
 * antes"). É a régua do banco ("Reativar clientes", o público das campanhas:
 * `least(coalesce(cliente_desde, created_at), ultima_visita_antes)`, migration
 * 20261125000001). Os dois portais usam esta função (os layouts de clientes).
 */
export interface FichaDoSelo {
  cliente_desde?:       string | null
  created_at?:          string | null
  ultima_visita_antes?: string | null
}

const DIAS_DE_NOVA = 30

export function ehNovaNaLista(c: FichaDoSelo, agora: Date = new Date(), fuso?: string): boolean {
  const desde = diaDeClienteDesde({ clienteDesde: c.cliente_desde, createdAt: c.created_at }, fuso)
  const antes = c.ultima_visita_antes?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  const dia = [desde, antes].filter((d): d is string => !!d).sort()[0]
  if (!dia) return false
  return dia >= dayKeyTZ(new Date(agora.getTime() - DIAS_DE_NOVA * 86_400_000), fuso)
}
