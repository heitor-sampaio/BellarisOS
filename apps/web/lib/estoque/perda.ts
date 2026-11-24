/**
 * Os motivos da saída por PERDA — puro.
 *
 * Até 18/11 eram uma lista fixa (D-7, decisão do Heitor, 2026-10-29: Vencido,
 * Quebrou, Amostra, Uso interno). Desde o item 7 do escopo de 18/11 (o Heitor:
 * "motivos de perda configuraveis, poder adicionar/editar/excluir") são um
 * cadastro da REDE (`estoque_motivos_de_perda`), ao lado das categorias, das
 * marcas e dos fornecedores; a rede nasce com os quatro de antes, editáveis.
 * O movimento guarda o NOME do motivo (`stock_movements.motivo_da_perda`):
 * excluir o motivo não apaga a história.
 */

/** Os motivos com que a rede nasce (`private.estoque_motivos_de_perda_semear`). */
export const MOTIVOS_INICIAIS_DA_PERDA = ['Vencido', 'Quebrou', 'Amostra', 'Uso interno'] as const

/** As chaves da lista fixa de antes — o banco as trocou pelo nome; um movimento lido antes da migration ainda as diz. */
const CHAVES_DE_ANTES: Record<string, string> = {
  VENCIDO: 'Vencido', QUEBROU: 'Quebrou', AMOSTRA: 'Amostra', USO_INTERNO: 'Uso interno',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O motivo que o formulário manda é o id de um motivo da rede (o banco confere a rede). */
export function lerMotivoDaPerda(v: unknown): string | null {
  return typeof v === 'string' && UUID.test(v) ? v : null
}

/**
 * A venda de produto estornada cujo produto NÃO voltou (H2, decisão do Heitor,
 * 2026-11-01) também é perda no relatório (`metrics_perdas`), mas não é um
 * motivo que se escolhe no formulário: nasce do estorno.
 */
export const MOTIVO_VENDA_ESTORNADA = 'VENDA_ESTORNADA'

/**
 * O ajuste de inventário que contou MENOS que o saldo (D5 da 10ª simulação,
 * 2026-11-10) também é perda no relatório (`metrics_perdas`), ao custo do
 * lote de onde saiu. Nasce do Ajuste, não se escolhe na Perda.
 */
export const MOTIVO_INVENTARIO = 'INVENTARIO'

/**
 * O brinde da fidelidade entregue (A40 da 12ª simulação, 2026-11-11): sai do
 * estoque pelo voucher e é perda no relatório, pelo custo do lote. Nasce da
 * entrega do voucher, não se escolhe na Perda.
 */
export const MOTIVO_BRINDE = 'BRINDE'

/** O que a tela diz do motivo: os do sistema pelo rótulo deles; o da rede, pelo nome gravado. */
export function rotuloDoMotivo(v: string | null | undefined): string {
  if (v === MOTIVO_VENDA_ESTORNADA) return 'Venda estornada (não voltou)'
  if (v === MOTIVO_INVENTARIO) return 'Inventário'
  if (v === MOTIVO_BRINDE) return 'Brinde da fidelidade'
  if (!v || !v.trim()) return '—'
  return CHAVES_DE_ANTES[v] ?? v
}
