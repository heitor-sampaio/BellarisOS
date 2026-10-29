/**
 * As LISTAS que `reports-bi-section` busca e `reports-bi-view` desenha, com
 * os campos que o `select` de lá pede.
 *
 * Eram doze tipos, um por consulta de linhas cruas. Desde que os números da
 * tela vêm agregados do Postgres (`metrics_relatorio`), só sobram as duas
 * listas curtas e com limite: lotes vencendo e parcelas pendentes.
 */

import { formatDia } from '@estetica-os/utils'
import { dayKeyTZ } from '@/lib/datetime'

/** Um item de relação embutida (`tabela(colunas)`): objeto, ou nulo sem vínculo. */
type Embutido<T> = T | null

export interface LinhaLote {
  id:           string
  product_id:   string
  batch_number: string | null
  expires_at:   string
  quantity:     number
  products:     Embutido<{ name: string; tenant_id: string }>
}

/**
 * A validade do lote na tabela "Validades": o dia e quantos dias faltam.
 * A validade é um DIA SEM hora (o campo de data da entrada, gravado à
 * meia-noite UTC): `formatDia` lê o dia como foi gravado, e os dias contam do
 * HOJE de Brasília até ele, pelo calendário. Com `new Date(...)` o 17/11 virava
 * 16/11 no navegador (D10 da simulação de 2026-10-29, CLAUDE.md §14).
 */
export function validadeDoLote(expiresAt: string, hoje: Date = new Date()): { dia: string; dias: number } {
  const dia = formatDia(expiresAt) ?? '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiresAt)
  const [a, mes, d] = dayKeyTZ(hoje).split('-').map(Number)
  const dias = m
    ? Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(a!, mes! - 1, d!)) / 86_400_000)
    : 0
  return { dia, dias: Math.max(0, dias) }
}

/**
 * Uma parcela a receber: desde 2026-09-30 cada parcela é um LANÇAMENTO
 * (`financial_transactions` com `parcela_*`) — `installments` é histórico.
 */
export interface LinhaParcela {
  id:             string
  amount:         number
  due_date:       string
  description:    string
  branch_id:      string
  parcela_numero: number
  parcela_total:  number
  clients:        Embutido<{ name: string }>
}
