/**
 * O vocabulário do relatório de vendas, sem nada de servidor: a tela usa os
 * rótulos, e `lib/metrics/vendas.ts` (server-only) faz a leitura.
 */

export const TIPOS_DE_VENDA = ['PROCEDIMENTO', 'PACOTE', 'PRE_PAGO', 'PLANO'] as const
export type TipoDeVenda = typeof TIPOS_DE_VENDA[number]

export const ROTULO_DO_TIPO: Record<TipoDeVenda, string> = {
  PROCEDIMENTO: 'Procedimento',
  PACOTE:       'Pacote',
  PRE_PAGO:     'Pré-pago',
  PLANO:        'Plano',
}

export const POR_PAGINA = 50

export interface Venda {
  id:           string
  tipo:         TipoDeVenda
  data:         string
  descricao:    string
  /** Sessões do pacote ou do plano; unidades do pré-pago; 1 no avulso. */
  quantidade:   number
  clienteId:    string | null
  cliente:      string | null
  /** Quem atendeu (avulso), o profissional do plano, ou quem vendeu (pacote e pré-pago). */
  profissional: string | null
  branchId:     string
  valor:        number
}

export interface ResumoDeVendas {
  /** O total de todos os tipos. */
  geral:   { quantidade: number; total: number }
  porTipo: Record<TipoDeVenda, { quantidade: number; total: number }>
}

export const ehTipoDeVenda = (v: unknown): v is TipoDeVenda =>
  typeof v === 'string' && (TIPOS_DE_VENDA as readonly string[]).includes(v)

/** A descrição como a lista e a exportação a mostram ("3× Botox" no pré-pago). */
export function descricaoDaVenda(v: Pick<Venda, 'tipo' | 'descricao' | 'quantidade'>): string {
  if (v.tipo === 'PRE_PAGO') return `${v.quantidade}× ${v.descricao}`
  if (v.tipo === 'PACOTE' || v.tipo === 'PLANO') {
    return v.quantidade > 0 ? `${v.descricao} · ${v.quantidade} ${v.quantidade === 1 ? 'sessão' : 'sessões'}` : v.descricao
  }
  return v.descricao
}
