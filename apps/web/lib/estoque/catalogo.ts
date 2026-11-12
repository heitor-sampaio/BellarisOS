import type { SupabaseClient } from '@supabase/supabase-js'
import { ler } from '@/lib/db'

/**
 * Quem cadastra e edita os produtos (C63, H8 do levantamento das regras,
 * 2026-11-11: "catalogo de produtos pode ser da rede ou da unidade, decisão da
 * rede"). `tenants.catalogo_de_produtos`:
 * - `UNIDADE` (o padrão, o de sempre): quem tem o Estoque em Gerenciar, na
 *   rede ou numa unidade, cria, edita e desativa produto;
 * - `REDE`: só quem é da rede (sem unidade fixa). A unidade continua com o
 *   estoque dela — entrada, ajuste, perda, transferência e o mínimo.
 * A trava é da abrangência (`ctx.branchId`), como a configuração da clínica.
 */
export type CatalogoDeProdutos = 'UNIDADE' | 'REDE'

export const CATALOGO_DA_REDE = 'O catálogo de produtos é da rede: quem cadastra e edita os produtos é quem administra a clínica, sem unidade fixa. O estoque desta unidade continua com você.'

export function lerCatalogo(v: unknown): CatalogoDeProdutos {
  return v === 'REDE' ? 'REDE' : 'UNIDADE'
}

/** A recusa de criar/editar/desativar produto, ou nulo. Pura: a tela e a action leem a mesma regra. */
export function recusaDoCatalogo(ctx: { branchId: string | null }, regra: CatalogoDeProdutos): string | null {
  return regra === 'REDE' && ctx.branchId !== null ? CATALOGO_DA_REDE : null
}

export async function catalogoDaRede(admin: SupabaseClient, tenantId: string): Promise<CatalogoDeProdutos> {
  const t = await ler(admin.from('tenants').select('catalogo_de_produtos').eq('id', tenantId).maybeSingle(),
    'ler quem cadastra os produtos') as { catalogo_de_produtos?: string } | null
  return lerCatalogo(t?.catalogo_de_produtos)
}
