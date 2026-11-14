import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { unidadesDoContexto } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { resolvePeriod } from '@/lib/metrics'
import { OPERACOES, type FiltrosDaAuditoria, type NomesDaAuditoria, type RegistroDaAuditoria } from './tipos'

/**
 * A leitura da auditoria (CF3a) — pelo servidor, depois da permissão: a sessão
 * não lê a tabela (`public.auditoria` não tem política nem privilégio para ela).
 *
 * - **A abrangência**: quem é da rede lê tudo; quem tem unidades, só as linhas
 *   DELAS (`unidadesDoContexto`). A linha sem unidade é da rede (a tag, o
 *   cargo, a ficha da cliente): não chega a quem tem unidade fixa — a mesma
 *   regra do `alcancaUnidade`. A unidade pedida na URL não vence a abrangência.
 * - **Paginada no banco** (`.range`): a lista cresce sem fim, e o PostgREST
 *   corta em 1000 em silêncio. A tela lê uma página; o CSV, um teto de páginas.
 * - **O período** é o de `resolvePeriod`, até o FIM dele (`fullTo`).
 */

export const POR_PAGINA = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const escaparLike = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`)

const COLUNAS = 'id, criado_em, branch_id, client_id, tabela, operacao, registro_id, colunas, antes, depois, ator_user_id, ator_nome, ator_tipo, incompleto'

export interface PaginaDaAuditoria {
  registros: RegistroDaAuditoria[]
  nomes:     NomesDaAuditoria
  temMais:   boolean
  pagina:    number
  /** A unidade pedida, só se estiver ao alcance (senão, nula: a URL não vence a abrangência). */
  unidade:   string | null
  periodo:   { key: string; label: string; from?: string; to?: string }
}

export async function lerAuditoria(
  ctx: TenantContext, filtros: FiltrosDaAuditoria, opcoes: { porPagina?: number } = {},
): Promise<PaginaDaAuditoria> {
  const admin = createAdminClient()
  const porPagina = opcoes.porPagina ?? POR_PAGINA
  const pagina = Math.max(1, Math.floor(Number(filtros.pagina) || 1))
  const periodo = resolvePeriod(filtros.period ?? 'month', filtros.from, filtros.to)
  const minhas = unidadesDoContexto(ctx)
  const unidade = filtros.unidade && UUID.test(filtros.unidade) && (minhas === null || minhas.includes(filtros.unidade))
    ? filtros.unidade : null
  const vazia: PaginaDaAuditoria = {
    registros: [], nomes: { clientes: {}, membros: {}, unidades: {} }, temMais: false, pagina, unidade,
    periodo: { key: periodo.key, label: periodo.label, from: filtros.from, to: filtros.to },
  }
  if (minhas !== null && minhas.length === 0) return vazia

  // A cliente pelo nome: as fichas da rede que casam, e as linhas delas.
  let clientesDoFiltro: string[] | null = null
  const nomeDaCliente = filtros.cliente?.trim()
  if (nomeDaCliente) {
    const achadas = await ler(admin.from('clients').select('id').eq('tenant_id', ctx.tenantId!)
      .ilike('name', `%${escaparLike(nomeDaCliente)}%`).limit(200), 'procurar a cliente da auditoria')
    clientesDoFiltro = (achadas ?? []).map(c => c.id as string)
    if (!clientesDoFiltro.length) return vazia
  }

  let q = admin.from('auditoria').select(COLUNAS)
    .eq('tenant_id', ctx.tenantId!)
    .gte('criado_em', periodo.from.toISOString())
    .lte('criado_em', periodo.fullTo.toISOString())
  if (minhas !== null) q = q.in('branch_id', minhas)
  if (unidade) q = q.eq('branch_id', unidade)
  if (filtros.pessoa && UUID.test(filtros.pessoa)) q = q.eq('ator_user_id', filtros.pessoa)
  if (filtros.tipo && OPERACOES.some(o => o.key === filtros.tipo)) q = q.eq('operacao', filtros.tipo)
  if (clientesDoFiltro) q = q.in('client_id', clientesDoFiltro)

  const inicio = (pagina - 1) * porPagina
  // Uma a mais diz se há a próxima página, sem contar a tabela inteira.
  const linhas = (await ler(q.order('id', { ascending: false }).range(inicio, inicio + porPagina), 'ler a auditoria') ?? []) as RegistroDaAuditoria[]
  const registros = linhas.slice(0, porPagina)

  return {
    ...vazia,
    registros,
    nomes:   await nomesDaAuditoria(ctx, registros),
    temMais: linhas.length > porPagina,
  }
}

/** Os nomes que as frases usam, lidos agora (só os da página). */
async function nomesDaAuditoria(ctx: TenantContext, registros: readonly RegistroDaAuditoria[]): Promise<NomesDaAuditoria> {
  const admin = createAdminClient()
  const clientes = [...new Set(registros.map(r => r.client_id).filter((v): v is string => !!v))]
  const membros = [...new Set(registros.filter(r => r.tabela === 'users' && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  const [c, m, u] = await Promise.all([
    clientes.length
      ? ler(admin.from('clients').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', clientes), 'ler os nomes das clientes')
      : Promise.resolve([]),
    membros.length
      ? ler(admin.from('users').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', membros), 'ler os nomes da equipe')
      : Promise.resolve([]),
    // As unidades da rede são poucas (o caso comum é uma).
    ler(admin.from('branches').select('id, name').eq('tenant_id', ctx.tenantId!), 'ler as unidades'),
  ])
  const mapa = (xs: { id: unknown; name: unknown }[] | null) =>
    Object.fromEntries((xs ?? []).map(x => [x.id as string, (x.name as string | null) ?? '']))
  return { clientes: mapa(c), membros: mapa(m), unidades: mapa(u) }
}

/** As pessoas do filtro "Quem" — os membros da rede (ao alcance), em ordem de nome. */
export async function pessoasDaAuditoria(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  const minhas = unidadesDoContexto(ctx)
  const admin = createAdminClient()
  const todas = await lerTodas<{ id: string; name: string | null }>((de, ate) => {
    let q = admin.from('users').select('id, name').eq('tenant_id', ctx.tenantId!)
    if (minhas !== null) q = q.in('branch_id', minhas)
    return q.order('name').order('id').range(de, ate)
  }, 'ler a equipe da auditoria')
  return todas.map(u => ({ id: u.id, name: u.name ?? '' }))
}
