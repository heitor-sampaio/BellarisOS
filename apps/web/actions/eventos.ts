'use server'

import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { EVENTOS } from '@estetica-os/types'
import type { NomeDeEvento, OrigemDeEvento, TipoDeAtor } from '@estetica-os/types'
import { ler } from '@/lib/db'

/**
 * Leitura da corrente de eventos, para o painel de conferência.
 *
 * ⚠️ Só LEITURA mora aqui. Todo export de um arquivo `'use server'` vira
 * endpoint público, e é por isso que o emissor está em `lib/events/emitir.ts`
 * e continua lá: exposto assim, qualquer cliente forjaria a corrente que as
 * automações usam como gatilho.
 */

export interface EventoNaLista {
  id:          string
  nome:        string
  entidade:    string
  entidadeId:  string | null
  dados:       Record<string, unknown>
  atorNome:    string | null
  atorTipo:    TipoDeAtor
  origem:      OrigemDeEvento
  ocorridoEm:  string
}

export interface FiltrosDeEventos {
  nome?:     string
  entidade?: string
  origem?:   string
  /** `ocorrido_em` do último item já carregado — paginação por cursor. */
  antesDe?:  string
  limite?:   number
}

const LIMITE_PADRAO = 50

export async function listarEventosDeDominio(
  filtros: FiltrosDeEventos = {},
): Promise<{ eventos: EventoNaLista[]; fim: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const limite = Math.min(filtros.limite ?? LIMITE_PADRAO, 200)

  let q = createAdminClient()
    .from('domain_events')
    .select('id, nome, entidade, entidade_id, dados, ator_nome, ator_tipo, origem, ocorrido_em')
    .eq('tenant_id', ctx.tenantId!)
    .order('ocorrido_em', { ascending: false })
    // Uma linha a mais do que o pedido: é assim que se sabe se há próxima
    // página sem uma segunda consulta de contagem.
    .limit(limite + 1)

  if (filtros.nome)     q = q.eq('nome', filtros.nome)
  if (filtros.entidade) q = q.eq('entidade', filtros.entidade)
  if (filtros.origem)   q = q.eq('origem', filtros.origem)
  if (filtros.antesDe)  q = q.lt('ocorrido_em', filtros.antesDe)

  const { data, error } = await q

  // Erro descartado aqui faria o painel dizer "nenhum evento" com a corrente
  // cheia — exatamente a conclusão errada para quem veio conferir um gatilho.
  if (error) return { eventos: [], fim: true, error: error.message }

  const linhas = data ?? []
  const fim    = linhas.length <= limite

  return {
    fim,
    eventos: linhas.slice(0, limite).map(l => ({
      id:         l.id as string,
      nome:       l.nome as string,
      entidade:   l.entidade as string,
      entidadeId: (l.entidade_id as string | null) ?? null,
      dados:      (l.dados as Record<string, unknown>) ?? {},
      atorNome:   (l.ator_nome as string | null) ?? null,
      atorTipo:   (l.ator_tipo as TipoDeAtor) ?? 'sistema',
      origem:     (l.origem as OrigemDeEvento) ?? 'app',
      ocorridoEm: l.ocorrido_em as string,
    })),
  }
}

export interface LinhaDoCatalogo {
  nome:      NomeDeEvento
  entidade:  string
  /** Quantas vezes apareceu na janela de retenção. */
  vezes:     number
  ultimoEm:  string | null
}

/**
 * O catálogo INTEIRO cruzado com o que a corrente realmente tem.
 *
 * É a razão de existir desta tela. Montar uma automação em cima de um gatilho
 * que nunca disparou é um erro que não avisa: a automação fica salva, ativa e
 * silenciosa, e ninguém descobre porque nada acontece — que é justamente o
 * sintoma de "ainda não aconteceu". Aqui a diferença entre "nunca vi" e "vi
 * ontem" fica na tela, antes de alguém depender dela.
 *
 * **`vezes: 0` não é defeito.** Um evento pode simplesmente não ter ocorrido
 * ainda nesta rede — `pagamento.estornado` numa clínica que nunca estornou. O
 * que a tela mostra é o fato, não um diagnóstico.
 */
export async function resumoDoCatalogo(): Promise<{
  linhas: LinhaDoCatalogo[]
  desdeQuando: string | null
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  // Agregação no banco, nunca em JS: contar no cliente significaria trazer no
  // máximo 1000 linhas (teto do PostgREST) e subcontar em silêncio quando a
  // corrente crescer. Mesma regra dos indicadores (CLAUDE.md §13.1).
  const { data, error } = await createAdminClient()
    .rpc('eventos_resumo_do_catalogo', { p_tenant_id: ctx.tenantId! })

  if (error) {
    return { linhas: [], desdeQuando: null, error: error.message }
  }

  const vistos = new Map<string, { vezes: number; ultimoEm: string | null }>()
  for (const l of (data ?? []) as { nome: string; vezes: number; ultimo_em: string | null }[]) {
    vistos.set(l.nome, { vezes: Number(l.vezes), ultimoEm: l.ultimo_em })
  }

  // O catálogo é a fonte da lista, não o banco: um evento que nunca ocorreu
  // precisa aparecer — é o caso que a tela existe para mostrar.
  const linhas: LinhaDoCatalogo[] = Object.values(EVENTOS).map(nome => {
    const visto = vistos.get(nome)
    return {
      nome,
      entidade: nome.split('.')[0]!,
      vezes:    visto?.vezes ?? 0,
      ultimoEm: visto?.ultimoEm ?? null,
    }
  })

  const maisAntigo = await ler(createAdminClient()
    .from('domain_events')
    .select('ocorrido_em')
    .eq('tenant_id', ctx.tenantId!)
    .order('ocorrido_em', { ascending: true })
    .limit(1)
    .maybeSingle(), 'buscar o evento')

  return { linhas, desdeQuando: (maisAntigo?.ocorrido_em as string) ?? null }
}
