import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ownerFilter } from '@/lib/auth'
import { ler } from '@/lib/db'
import { lerVisibilidade, type VisibilidadeDoInbox } from '@/lib/inbox/visibilidade'
import { caixasDoAlcance } from '@/lib/inbox/alcance'
import type { FiltrosInbox } from '@/components/admin/inbox-filtros'

type Admin = ReturnType<typeof createAdminClient>

/** Uma linha de `inbox_pagina`: o id e o cursor dela. */
export interface LinhaDaPagina { id: string; last_message_at: string }

/**
 * Os ids de uma página do inbox, com o alcance de quem pede — a mesma conta
 * para a tela do inbox (`getConversations`) e para a busca universal.
 *
 * Mora fora de `actions/` pelo motivo de sempre (export de `'use server'` é
 * endpoint), e existe para a regra do inbox continuar num lugar só: a busca
 * da topbar acha exatamente as conversas que o inbox mostraria para o mesmo
 * termo, com o mesmo dono, o mesmo modo (pessoa × conversa) e as mesmas caixas.
 *
 * Devolve `null` quando o alcance não pôde ser lido: sem saber o alcance, não
 * se mostra nada — mostrar tudo seria vazar. O erro da PÁGINA, esse lança.
 */
export async function idsDaPaginaDoInbox(admin: Admin, ctx: TenantContext, opcoes: {
  filtros?: Partial<FiltrosInbox>
  busca?:   string
  depois?:  { em: string; id: string } | null
  /** Quantas linhas pedir ao banco (quem pagina pede uma a mais). */
  limite:   number
}): Promise<LinhaDaPagina[] | null> {
  let dono: string | null
  let modo: VisibilidadeDoInbox
  let minhasCaixas: string[] | null
  try {
    dono = ownerFilter(ctx, 'crm')
    const [rede, caixas] = await Promise.all([
      dono
        ? ler(admin.from('tenants').select('inbox_visibilidade').eq('id', ctx.tenantId!).maybeSingle(), 'ler a visibilidade do inbox')
        : Promise.resolve(null),
      caixasDoAlcance(admin, ctx),
    ])
    modo = lerVisibilidade((rede as { inbox_visibilidade?: string } | null)?.inbox_visibilidade)
    minhasCaixas = caixas
  } catch (e) {
    console.error('[idsDaPaginaDoInbox] alcance:', e instanceof Error ? e.message : e)
    return null
  }

  // Filtros, busca e alcance aplicados no banco (migration 20260928000007; a
  // busca sem acento desde 20261003000001).
  const linhas = await ler(admin.rpc('inbox_pagina', {
    p_tenant:   ctx.tenantId!,
    p_dono:     dono,
    p_modo:     modo,
    p_caixas:   minhasCaixas,
    p_filtros:  opcoes.filtros ?? {},
    p_busca:    opcoes.busca ?? '',
    p_antes_em: opcoes.depois?.em ?? null,
    p_antes_id: opcoes.depois?.id ?? null,
    p_limite:   opcoes.limite,
  }), 'carregar a página do inbox') as LinhaDaPagina[] | null

  return linhas ?? []
}
