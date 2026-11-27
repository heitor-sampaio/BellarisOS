/**
 * O movimento de SAÍDA de uma venda de produto guarda a venda na referência
 * (`venda:<id>` — `produto_vender_itens`). É por ela que o Histórico do produto
 * acha a venda estornada cujo produto não voltou (A11 da 35ª, ES-28). Puro.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function idDaVendaDoMovimento(m: { type: string; reference: string | null }): string | null {
  if (m.type !== 'SALE' || !m.reference?.startsWith('venda:')) return null
  const id = m.reference.slice('venda:'.length)
  return UUID.test(id) ? id : null
}
