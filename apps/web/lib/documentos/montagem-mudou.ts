/**
 * A35 da 16ª: abrir o documento o MONTA de novo (`garantirRenderizado`), e
 * cada montagem gravava — o mesmo texto, o mesmo hash, um código de
 * verificação novo — e a Auditoria lia 14 "gerações" de quem só abriu a tela.
 * Montado igual ao que está guardado (a situação, o hash do conteúdo e os
 * campos que faltam), e sem um pagamento novo a guardar junto, não há o que
 * gravar.
 */
export function montagemMudou(
  doc: { status: string; content_sha256: string | null; missing_fields: readonly string[] | null },
  nova: { status: string; hash: string; faltando: readonly string[]; comPagamento: boolean },
): boolean {
  if (nova.comPagamento) return true
  if (doc.status !== nova.status) return true
  if (doc.content_sha256 !== nova.hash) return true
  const antes = [...(doc.missing_fields ?? [])].sort().join('\n')
  const agora = [...nova.faltando].sort().join('\n')
  return antes !== agora
}
