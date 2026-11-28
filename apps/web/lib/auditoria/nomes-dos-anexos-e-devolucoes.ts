import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { TenantContext } from '@estetica-os/types'
import type { ItemDevolvidoDaAuditoria, NomesDaAuditoria, RegistroDaAuditoria } from './tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O que as frases do anexo e da devolução dizem (A24 da 26ª simulação) e a gravação não guarda,
 * lido agora pela rede da sessão — a categoria do anexo da cliente (a
 * auditoria grava o anexo como clínico, sem valores) e o que a devolução de
 * produto devolveu (o retrato dela: o produto, quantas e de quantas).
 *
 * Entra em `nomesDaAuditoria` (lib/auditoria/leitura.ts) junto de `nomesDa20`.
 */
export async function nomesDosAnexosEDevolucoes(ctx: TenantContext, registros: readonly RegistroDaAuditoria[]): Promise<Partial<NomesDaAuditoria>> {
  const tenant = ctx.tenantId
  if (!tenant) return {}
  const ids = (filtro: (r: RegistroDaAuditoria) => boolean) =>
    [...new Set(registros.filter(r => filtro(r) && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  // A20 da 35ª: também o anexo apagado (o clínico fica, com `apagado_em`): "Apagou um anexo clínico (laudo)".
  // D9: e o anexo enviado ao app ou tirado dele ("Enviou ao app uma foto clínica").
  const anexos = ids(r => r.tabela === 'client_documents' && (r.operacao === 'criou'
    || (r.operacao === 'editou' && (r.colunas.includes('apagado_em') || r.colunas.includes('enviado_em')))))
  const devolucoes = ids(r => r.tabela === 'product_sale_returns' && r.operacao === 'criou')
  if (!anexos.length && !devolucoes.length) return {}

  const admin = createAdminClient()
  const nada = Promise.resolve([] as Record<string, unknown>[])
  const [ax, dv] = await Promise.all([
    anexos.length ? ler(admin.from('client_documents').select('id, category, clients!inner(tenant_id)')
      .eq('clients.tenant_id', tenant).in('id', anexos), 'ler a categoria dos anexos') : nada,
    devolucoes.length ? ler(admin.from('product_sale_returns').select('id, retrato')
      .eq('tenant_id', tenant).in('id', devolucoes), 'ler as devoluções de produto') : nada,
  ]) as Record<string, unknown>[][]

  return {
    categoriasDosAnexos: Object.fromEntries((ax ?? [])
      .map(a => [a.id as string, typeof a.category === 'string' ? a.category : ''] as const).filter(([, c]) => c)),
    devolucoes: Object.fromEntries((dv ?? []).map(d => [d.id as string, itensDoRetrato(d.retrato)] as const).filter(([, i]) => i.length)),
  }
}

/** Os itens do retrato da devolução (`retrato.itens`: o produto, a quantidade e o `de`). */
export function itensDoRetrato(retrato: unknown): ItemDevolvidoDaAuditoria[] {
  const itens = (retrato as { itens?: unknown } | null)?.itens
  if (!Array.isArray(itens)) return []
  return itens.flatMap(i => {
    const x = i as { produto?: unknown; quantidade?: unknown; de?: unknown }
    const quantidade = Number(x.quantidade)
    const de = x.de == null ? null : Number(x.de)
    if (typeof x.produto !== 'string' || !x.produto.trim() || !(quantidade > 0)) return []
    return [{ produto: x.produto.trim(), quantidade, de: de !== null && Number.isFinite(de) ? de : null }]
  })
}
