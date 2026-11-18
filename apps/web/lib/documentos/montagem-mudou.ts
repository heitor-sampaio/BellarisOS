/**
 * A35 da 16ª: abrir o documento o MONTA de novo (`garantirRenderizado`), e
 * cada montagem gravava — o mesmo texto, o mesmo hash, um código de
 * verificação novo — e a Auditoria lia 14 "gerações" de quem só abriu a tela.
 * Montado igual ao que está guardado (a situação, o hash do conteúdo e os
 * campos que faltam), e sem um pagamento DIFERENTE a guardar junto, não há o
 * que gravar. A20c da 25ª: qualquer pagamento passado contava como mudança —
 * reabrir o contrato da venda com o mesmo combinado gravava de novo (um
 * código novo, mais uma "geração" na Auditoria). Agora se compara o retrato.
 */
export function montagemMudou(
  doc: { status: string; content_sha256: string | null; missing_fields: readonly string[] | null; payment_snapshot?: unknown },
  /** `pagamento`: o retrato a gravar junto (`pagamentoNormalizado`); nulo, nenhum. */
  nova: { status: string; hash: string; faltando: readonly string[]; pagamento?: Record<string, unknown> | null },
): boolean {
  if (nova.pagamento != null && chaveDoRetrato(nova.pagamento) !== chaveDoRetrato(doc.payment_snapshot)) return true
  if (doc.status !== nova.status) return true
  if (doc.content_sha256 !== nova.hash) return true
  const antes = [...(doc.missing_fields ?? [])].sort().join('\n')
  const agora = [...nova.faltando].sort().join('\n')
  return antes !== agora
}

/** O retrato como texto comparável: as chaves em ordem (o jsonb do banco não guarda a ordem). */
function chaveDoRetrato(r: unknown): string {
  if (r == null || typeof r !== 'object' || Array.isArray(r)) return JSON.stringify(r ?? null)
  const o = r as Record<string, unknown>
  return JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]))
}
