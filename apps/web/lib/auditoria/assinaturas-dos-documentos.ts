import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { TenantContext } from '@estetica-os/types'
import type { NomesDaAuditoria, RegistroDaAuditoria } from './tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * D10 (plataforma: AD-13, AD-20; documentos: DA-11): quem assinou cada
 * documento assinado da página — o nome da evidência, que na menor é "Marta
 * Lima, responsável legal de Beatriz Lima". O gatilho de `document_signatures`
 * não guarda valor nenhum (é credencial); o nome se lê agora, como os outros,
 * pela rede da sessão (CLAUDE.md §14). Só o nome: a imagem, o IP e o documento
 * de quem assinou ficam onde estão.
 *
 * Entra em `nomesDaAuditoria` (lib/auditoria/leitura.ts).
 */
export async function assinaturasDosDocumentos(
  ctx: TenantContext, registros: readonly RegistroDaAuditoria[],
): Promise<Partial<NomesDaAuditoria>> {
  const tenant = ctx.tenantId
  if (!tenant) return {}
  const ids = [...new Set(registros
    .filter(r => r.tabela === 'issued_documents' && r.operacao === 'editou' && r.colunas.includes('signed_at')
      && r.registro_id && UUID.test(r.registro_id))
    .map(r => r.registro_id!))]
  if (!ids.length) return {}
  const lidas: { issued_document_id: string; signer_name: string | null }[] = []
  // Em lotes: o CSV pode trazer muitas, e a lista de ids vai na URL.
  for (let i = 0; i < ids.length; i += 150) {
    const lote = await ler(createAdminClient().from('document_signatures')
      .select('issued_document_id, signer_name')
      .eq('tenant_id', tenant).in('issued_document_id', ids.slice(i, i + 150)).order('signed_at', { ascending: true }),
    'ler quem assinou os documentos da auditoria')
    lidas.push(...((lote ?? []) as typeof lidas))
  }
  // A mais recente de cada documento vence (a ordem é da mais antiga à mais nova).
  return {
    assinaturasDosDocumentos: Object.fromEntries(lidas
      .map(a => [a.issued_document_id, a.signer_name?.trim() ?? ''] as const).filter(([, nome]) => nome)),
  }
}
