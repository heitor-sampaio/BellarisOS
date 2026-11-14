/**
 * As situações e a forma de uma comanda do PDV, sem nada do servidor: a tela
 * (client) importa daqui; a leitura (`comandasDoPdv`) mora em `./comandas`.
 */

export type SituacaoDoPdv = 'ABERTAS' | 'PAGAS' | 'TODAS'
export const SITUACOES_DO_PDV: readonly { key: SituacaoDoPdv; label: string }[] = [
  { key: 'ABERTAS', label: 'Abertas' },
  { key: 'PAGAS',   label: 'Pagas hoje' },
  { key: 'TODAS',   label: 'Todas' },
]
export const situacaoDoPdv = (pedida: string | null | undefined): SituacaoDoPdv =>
  SITUACOES_DO_PDV.some(s => s.key === pedida) ? pedida as SituacaoDoPdv : 'ABERTAS'

export interface ComandaDoPdv {
  id:            string
  numero:        number
  origem:        'ATENDIMENTO' | 'PLANO' | 'VENDA'
  abertaEm:      string
  canceladaEm:   string | null
  /** Por que saiu sem cobrança: o cancelamento, a falta, a sessão do pacote, o pré-pago. */
  canceladaMotivo: string | null
  clienteId:     string
  cliente:       string
  agendamentoId: string | null
  procedimento:  string | null
  profissional:  string | null
  agendadoPara:  string | null
  /** A situação do atendimento (IN_PROGRESS, COMPLETED…) — a comanda do atendimento. */
  atendimento:   string | null
  valor:         number
  paga:          boolean
  pagaEm:        string | null
  recebido:      number | null
  forma:         string | null
  /** A venda estornada inteira (nenhum lançamento vivo). */
  estornada:     boolean
}
