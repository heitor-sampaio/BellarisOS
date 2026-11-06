import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { nomesDosRegistros } from '@/lib/nomes-dos-registros'

/**
 * "Em quem foi aplicado o lote X" (A40 da 7ª simulação, 2026-11-05: não havia
 * lista de clientes por lote para recall). A ligação já existe: cada baixa
 * deixa em `stock_movement_batches` de qual lote saiu (o gatilho do lote, FEFO
 * — a regra fica). Daqui sai cada saída do lote que foi PARA UMA CLIENTE: o
 * insumo de um atendimento (`PROCEDURE_USAGE`, com a cliente, o dia e a
 * profissional) e a venda de produto (`SALE`, com quem vendeu).
 *
 * Só leitura, pelo servidor (o lote e os nomes por `nomesDosRegistros`, com a
 * rede). Quem pode ver é da action (`actions/stock.ts`).
 */
export interface AplicacaoDoLote {
  movimentoId:  string
  tipo:         'ATENDIMENTO' | 'VENDA'
  /** O dia do atendimento (a hora marcada) ou o da venda. */
  quando:       string
  cliente:      string
  /** A profissional do atendimento, ou quem vendeu. */
  quem:         string | null
  /** O que saiu do lote, na unidade do movimento (a de consumo: "20 UI"). */
  quantidade:   number
  unidade:      string
}

type Admin = ReturnType<typeof createAdminClient>

export async function aplicacoesDoLote(admin: Admin, tenantId: string, loteId: string, unidade: string): Promise<AplicacaoDoLote[]> {
  type Ligacao = { movement_id: string; stock_movements: { id: string; type: string; quantity: number | string; created_at: string; appointment_id: string | null } | null }
  const ligacoes = await lerTodas<Ligacao>((de, ate) => admin.from('stock_movement_batches')
    .select('movement_id, stock_movements!inner(id, type, quantity, created_at, appointment_id)')
    .eq('batch_id', loteId)
    .in('stock_movements.type', ['PROCEDURE_USAGE', 'SALE'])
    .order('movement_id').range(de, ate) as unknown as PromiseLike<{ data: Ligacao[] | null; error: { message: string } | null }>,
  'carregar as saídas do lote')
  const movimentos = ligacoes.map(l => l.stock_movements).filter((m): m is NonNullable<Ligacao['stock_movements']> => !!m)
  if (!movimentos.length) return []

  const doAtendimento = movimentos.filter(m => m.type === 'PROCEDURE_USAGE' && m.appointment_id)
  const daVenda = movimentos.filter(m => m.type === 'SALE')
  const LOTE = 150
  const emLotes = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE))

  const [atendimentos, itens, vendasAntigas] = await Promise.all([
    Promise.all(emLotes([...new Set(doAtendimento.map(m => m.appointment_id!))]).map(ids => ler(admin.from('appointments')
      .select('id, client_id, professional_id, scheduled_at, branches!inner(tenant_id)')
      .in('id', ids).eq('branches.tenant_id', tenantId), 'ler os atendimentos do lote'))),
    Promise.all(emLotes(daVenda.map(m => m.id)).map(ids => ler(admin.from('product_sale_items')
      .select('stock_movement_id, product_sales!inner(client_id, sold_at, sold_by, tenant_id)')
      .in('stock_movement_id', ids).eq('product_sales.tenant_id', tenantId), 'ler as vendas do lote'))),
    Promise.all(emLotes(daVenda.map(m => m.id)).map(ids => ler(admin.from('product_sales')
      .select('stock_movement_id, client_id, sold_at, sold_by')
      .in('stock_movement_id', ids).eq('tenant_id', tenantId), 'ler as vendas antigas do lote'))),
  ])
  type Atend = { id: string; client_id: string | null; professional_id: string | null; scheduled_at: string }
  type Venda = { client_id: string | null; sold_at: string; sold_by: string | null }
  const porAtendimento = new Map((atendimentos.flat().filter(Boolean) as Atend[]).map(a => [a.id, a]))
  const porVenda = new Map<string, Venda>()
  for (const v of (vendasAntigas.flat().filter(Boolean) as (Venda & { stock_movement_id: string })[])) porVenda.set(v.stock_movement_id, v)
  for (const i of (itens.flat().filter(Boolean) as unknown as { stock_movement_id: string; product_sales: Venda }[])) porVenda.set(i.stock_movement_id, i.product_sales)

  const nomes = await nomesDosRegistros(tenantId, {
    clientes: [...[...porAtendimento.values()].map(a => a.client_id), ...[...porVenda.values()].map(v => v.client_id)],
    membros:  [...[...porAtendimento.values()].map(a => a.professional_id), ...[...porVenda.values()].map(v => v.sold_by)],
  })

  const saida: AplicacaoDoLote[] = []
  for (const m of movimentos) {
    const quantidade = Math.abs(Number(m.quantity))
    if (m.type === 'PROCEDURE_USAGE') {
      const a = m.appointment_id ? porAtendimento.get(m.appointment_id) : null
      if (!a?.client_id) continue
      saida.push({ movimentoId: m.id, tipo: 'ATENDIMENTO', quando: a.scheduled_at, cliente: nomes.clientes[a.client_id] ?? 'Cliente',
        quem: a.professional_id ? nomes.membros[a.professional_id] ?? null : null, quantidade, unidade })
    } else {
      const v = porVenda.get(m.id)
      if (!v?.client_id) continue
      saida.push({ movimentoId: m.id, tipo: 'VENDA', quando: v.sold_at, cliente: nomes.clientes[v.client_id] ?? 'Cliente',
        quem: v.sold_by ? nomes.membros[v.sold_by] ?? null : null, quantidade, unidade })
    }
  }
  return saida.sort((x, y) => y.quando.localeCompare(x.quando))
}
