'use server'

import { getTenantContext, ownerFilter, assertUnidade } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedBranchBySlug } from '@/lib/cached-queries'
import { ler, mensagemDoErro } from '@/lib/db'
import { idsDaPaginaDoInbox } from '@/lib/inbox/pagina'
import {
  GRUPOS, POR_TIPO, TERMO_MAXIMO, TERMO_MINIMO, tiposPermitidos,
  type GrupoDaBusca, type ResultadoDaBusca,
} from '@/lib/busca/tipos'
import {
  resultadoDaLinha, subtituloDaConversa, type LinhaDaBusca,
} from '@/lib/busca/formatar'
import { telefoneLegivel } from '@/lib/busca/texto'

/**
 * A busca universal da topbar.
 *
 * O navegador manda só o termo e o slug do portal em que a pessoa está. O que
 * procurar (os tipos), com qual dono e em qual unidade é decidido AQUI, pelo
 * contexto: a busca não abre exceção de alcance — quem não vê um registro na
 * tela própria dele não o acha por aqui.
 *
 * - conversas: `idsDaPaginaDoInbox`, a mesma conta do inbox (dono, modo e
 *   caixas do cargo);
 * - o resto: `busca_universal` (migration 20261003000001), com o "só os meus"
 *   do CRM e da agenda e a abrangência da unidade.
 *
 * Páginas não passam por aqui: o catálogo é montado no navegador
 * (`lib/busca/paginas.ts`), a partir do menu.
 */
export async function buscarTudo(termo: string, slug: string | null): Promise<
  { grupos: GrupoDaBusca[]; error?: undefined } | { grupos?: undefined; error: string }
> {
  const ctx = await getTenantContext()
  // O cliente final tem o portal dele; a busca é da equipe.
  if (ctx.isClient || !ctx.tenantId) throw semAcesso()

  const busca = (typeof termo === 'string' ? termo : '').trim().slice(0, TERMO_MAXIMO)
  if (busca.length < TERMO_MINIMO) return { grupos: [] }

  try {
    const admin = createAdminClient()

    // A unidade do portal: o pedido não vence a abrangência. Quem é de unidade
    // fica na dela; quem é da rede, num portal de unidade, fica nela também.
    let unidadeDoPortal: string | null = null
    if (typeof slug === 'string' && slug) {
      const filial = await getCachedBranchBySlug(slug, ctx.tenantId) as { id: string } | null
      if (filial) {
        assertUnidade(ctx, filial.id)
        unidadeDoPortal = filial.id
      }
    }
    const unidade = ctx.branchId ?? unidadeDoPortal

    const tipos = tiposPermitidos(ctx.permissions)
    const doBanco = tipos.filter(t => t !== 'conversa')

    const [linhas, conversas] = await Promise.all([
      doBanco.length > 0
        ? ler(admin.rpc('busca_universal', {
            p_tenant:      ctx.tenantId,
            p_termo:       busca,
            p_tipos:       doBanco,
            p_unidade:     unidade,
            p_crm_dono:    ownerFilter(ctx, 'crm'),
            p_agenda_dono: ownerFilter(ctx, 'agenda'),
            p_limite:      POR_TIPO,
          }), 'buscar') as Promise<LinhaDaBusca[] | null>
        : Promise.resolve([] as LinhaDaBusca[]),
      tipos.includes('conversa')
        ? conversasQueCasam(admin, ctx, busca)
        : Promise.resolve([] as ResultadoDaBusca[]),
    ])

    const resultados = [
      ...(linhas ?? []).map(resultadoDaLinha).filter((r): r is ResultadoDaBusca => r !== null),
      ...conversas,
    ]

    const grupos = GRUPOS
      .map(g => ({ tipo: g.tipo, itens: resultados.filter(r => r.tipo === g.tipo) }))
      .filter(g => g.itens.length > 0)
    return { grupos }
  } catch (e) {
    // semAcesso segue adiante: é a tela que diz "sem acesso".
    if (e instanceof Error && (e as Error & { digest?: string }).digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

type Admin = ReturnType<typeof createAdminClient>
type Ctx = Awaited<ReturnType<typeof getTenantContext>>

/** As conversas que o inbox mostraria para este termo, prontas para a lista. */
async function conversasQueCasam(admin: Admin, ctx: Ctx, busca: string): Promise<ResultadoDaBusca[]> {
  const pagina = await idsDaPaginaDoInbox(admin, ctx, { busca, limite: POR_TIPO })
  // Alcance ilegível: nada (mostrar tudo seria vazar).
  if (!pagina || pagina.length === 0) return []
  const ids = pagina.map(p => p.id)

  const lidas = await ler(admin
    .from('conversations')
    .select('id, channel, contact_name, contact_phone, last_message, whatsapp_number_id, pessoa:contacts!conversations_contato_id_fkey(name)')
    .eq('tenant_id', ctx.tenantId!)
    .in('id', ids), 'carregar as conversas encontradas') as unknown as {
      id: string; channel: string | null; contact_name: string | null; contact_phone: string | null
      last_message: string | null; whatsapp_number_id: string | null
      pessoa: { name: string | null } | null
    }[] | null

  const caixaIds = [...new Set((lidas ?? []).map(c => c.whatsapp_number_id).filter((x): x is string => !!x))]
  const rotulos = new Map<string, string>()
  if (caixaIds.length > 0) {
    const caixas = await ler(admin
      .from('whatsapp_numbers').select('id, label')
      .eq('tenant_id', ctx.tenantId!).in('id', caixaIds), 'carregar o nome das caixas')
    for (const n of (caixas ?? []) as { id: string; label: string | null }[]) {
      if (n.label) rotulos.set(n.id, n.label)
    }
  }

  // A ordem é a do inbox (mais recente primeiro); o `in` não a preserva.
  const porId = new Map((lidas ?? []).map(c => [c.id, c]))
  return ids.flatMap(id => {
    const c = porId.get(id)
    if (!c) return []
    // O nome é o da PESSOA (§9.2.1); a cópia da conversa só na falta.
    const nome = c.pessoa?.name?.trim() || c.contact_name?.trim() || telefoneLegivel(c.contact_phone) || 'Sem nome'
    return [{
      tipo: 'conversa' as const,
      id: c.id,
      titulo: nome,
      subtitulo: subtituloDaConversa({
        channel: c.channel,
        caixa: c.whatsapp_number_id ? rotulos.get(c.whatsapp_number_id) ?? null : null,
        last_message: c.last_message,
      }),
    }]
  })
}
