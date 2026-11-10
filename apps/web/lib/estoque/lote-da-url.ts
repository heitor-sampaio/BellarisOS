import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O lote pedido pela URL do Estoque (`?lote=<id>`, A33 da 11ª simulação): é o
 * caminho da ficha da paciente ao "Aplicado em" do lote. Só o rótulo — o lote
 * da rede, senão nada; quem lê as aplicações confere o resto
 * (`aplicacoesDoLote`: o Estoque, as Clientes e a unidade ao alcance).
 */
export async function loteDaUrl(tenantId: string, valor: unknown): Promise<{ id: string; rotulo: string } | null> {
  const id = Array.isArray(valor) ? valor[0] : valor
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const lote = await ler(createAdminClient().from('product_batches')
    .select('id, batch_number, products!inner(name, tenant_id)')
    .eq('id', id).eq('products.tenant_id', tenantId).maybeSingle(), 'buscar o lote da URL') as
    { id: string; batch_number: string | null; products: { name: string } } | null
  if (!lote) return null
  return { id: lote.id, rotulo: `${lote.products.name} · ${lote.batch_number ? `lote ${lote.batch_number}` : 'lote sem número'}` }
}
