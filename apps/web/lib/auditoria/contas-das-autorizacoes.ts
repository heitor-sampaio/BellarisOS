import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { TenantContext } from '@estetica-os/types'
import type { NomesDaAuditoria, RegistroDaAuditoria } from './tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A9 da 33ª simulação (plataforma:AD-08, AD-21): de quem é a conta de cada
 * autorização do suporte da página — "Autorizou o suporte na conta de Luana".
 * O gatilho de `support_grants` guarda só a via, o prazo e o clínico; a conta
 * se lê agora, como os outros nomes, pela rede da sessão (CLAUDE.md §14).
 *
 * Entra em `nomesDaAuditoria` (lib/auditoria/leitura.ts).
 */
export async function contasDasAutorizacoes(
  ctx: TenantContext, registros: readonly RegistroDaAuditoria[],
): Promise<Partial<NomesDaAuditoria>> {
  const tenant = ctx.tenantId
  if (!tenant) return {}
  const ids = [...new Set(registros
    .filter(r => r.tabela === 'support_grants' && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  if (!ids.length) return {}
  const lidas: { id: string; conta: { name: string | null } | null }[] = []
  // Em lotes: o CSV pode trazer muitas, e a lista de ids vai na URL.
  for (let i = 0; i < ids.length; i += 150) {
    const lote = await ler(createAdminClient().from('support_grants')
      .select('id, conta:users!support_grants_target_user_id_fkey(name)')
      .eq('tenant_id', tenant).in('id', ids.slice(i, i + 150)), 'ler as contas das autorizações do suporte')
    lidas.push(...((lote ?? []) as unknown as typeof lidas))
  }
  return {
    contasDasAutorizacoes: Object.fromEntries(lidas
      .map(g => [g.id, g.conta?.name?.trim() ?? ''] as const).filter(([, nome]) => nome)),
  }
}
