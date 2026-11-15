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
const baseDaAuditoria = (admin: ReturnType<typeof createAdminClient>) => admin.from('auditoria').select(COLUNAS)
type Consulta = ReturnType<typeof baseDaAuditoria>

export interface PaginaDaAuditoria {
  registros: RegistroDaAuditoria[]
  nomes:     NomesDaAuditoria
  temMais:   boolean
  pagina:    number
  /** A unidade pedida, só se estiver ao alcance (senão, nula: a URL não vence a abrangência). */
  unidade:   string | null
  periodo:   { key: string; label: string; from?: string; to?: string }
  /** Na leitura por gravação: o cursor da próxima página (as linhas antes deste id). */
  proximo?:  string | null
  /** Na leitura por gravação: o cursor desta página (nulo na primeira). */
  antes?:    string | null
}

export async function lerAuditoria(
  ctx: TenantContext, filtros: FiltrosDaAuditoria, opcoes: { porPagina?: number; porGravacao?: boolean } = {},
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

  // Um construtor a cada consulta: os filtros do supabase-js mudam o próprio objeto.
  const consulta = () => {
    let q = baseDaAuditoria(admin)
      .eq('tenant_id', ctx.tenantId!)
      .gte('criado_em', periodo.from.toISOString())
      .lte('criado_em', periodo.fullTo.toISOString())
    if (minhas !== null) q = q.in('branch_id', minhas)
    if (unidade) q = q.eq('branch_id', unidade)
    if (filtros.pessoa && UUID.test(filtros.pessoa)) q = q.eq('ator_user_id', filtros.pessoa)
    if (filtros.tipo && OPERACOES.some(o => o.key === filtros.tipo)) q = q.eq('operacao', filtros.tipo)
    if (clientesDoFiltro) q = q.in('client_id', clientesDoFiltro)
    return q
  }

  if (opcoes.porGravacao) return lerPorGravacao(ctx, vazia, consulta, filtros.antes, porPagina)

  const inicio = (pagina - 1) * porPagina
  // Uma a mais diz se há a próxima página, sem contar a tabela inteira.
  const linhas = (await ler(consulta().order('id', { ascending: false }).range(inicio, inicio + porPagina), 'ler a auditoria') ?? []) as RegistroDaAuditoria[]
  const registros = linhas.slice(0, porPagina)

  return {
    ...vazia,
    registros,
    nomes:   await nomesDaAuditoria(ctx, registros),
    temMais: linhas.length > porPagina,
  }
}

/**
 * A tela lê por GRAVAÇÃO (A27 da 15ª simulação): a página não corta uma
 * gravação ao meio — a do fim da página vem inteira (as linhas da mesma
 * transação, o mesmo `criado_em`), e a próxima página começa antes da menor
 * linha lida (`?antes=<id>`, um cursor, e não um número de página, que se
 * deslocaria com a gravação estendida). O CSV segue por página, uma linha
 * por registro.
 */
async function lerPorGravacao(
  ctx: TenantContext, vazia: PaginaDaAuditoria,
  consulta: () => Consulta,
  antes: string | undefined, porPagina: number,
): Promise<PaginaDaAuditoria> {
  const cursor = antes && /^\d+$/.test(antes) ? antes : null
  const primeira = cursor ? consulta().lt('id', cursor) : consulta()
  const linhas = (await ler(primeira.order('id', { ascending: false }).limit(porPagina + 1), 'ler a auditoria') ?? []) as RegistroDaAuditoria[]
  let registros = linhas.slice(0, porPagina)
  let temMais = linhas.length > porPagina
  if (temMais && registros.length) {
    const ultima = registros[registros.length - 1]!
    const resto = (await ler(consulta().eq('criado_em', ultima.criado_em).lt('id', ultima.id)
      .order('id', { ascending: false }).limit(1000), 'ler o resto da gravação') ?? []) as RegistroDaAuditoria[]
    if (resto.length) {
      registros = [...registros, ...resto]
      const menor = registros[registros.length - 1]!.id
      const depois = await ler(consulta().lt('id', menor).limit(1), 'ver se há mais auditoria') ?? []
      temMais = depois.length > 0
    }
  }
  return {
    ...vazia,
    registros,
    nomes:   await nomesDaAuditoria(ctx, registros),
    temMais,
    proximo: temMais && registros.length ? String(registros[registros.length - 1]!.id) : null,
    antes:   cursor,
  }
}

/** Os nomes que as frases usam, lidos agora (só os da página). */
async function nomesDaAuditoria(ctx: TenantContext, registros: readonly RegistroDaAuditoria[]): Promise<NomesDaAuditoria> {
  const admin = createAdminClient()
  const clientes = [...new Set(registros.map(r => r.client_id).filter((v): v is string => !!v))]
  const membros = [...new Set(registros.filter(r => r.tabela === 'users' && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  // O produto do movimento e o cargo da permissão (A27/A28 da 15ª): a frase diz o nome, não "um produto".
  const doRegistro = (r: RegistroDaAuditoria, chave: string) => {
    const v = r.depois?.[chave] ?? r.antes?.[chave]
    return typeof v === 'string' && UUID.test(v) ? v : null
  }
  const produtos = [...new Set(registros.filter(r => r.tabela === 'stock_movements').map(r => doRegistro(r, 'product_id')).filter((v): v is string => !!v))]
  const permissoes = registros.filter(r => r.tabela === 'role_permissions' && r.registro_id && UUID.test(r.registro_id))
  const cargosDaPermissao = new Map<string, string>()
  for (const r of permissoes) { const cargo = doRegistro(r, 'role_id'); if (cargo) cargosDaPermissao.set(r.registro_id!, cargo) }
  const semCargo = permissoes.filter(r => !cargosDaPermissao.has(r.registro_id!)).map(r => r.registro_id!)
  if (semCargo.length) {
    const lidas = await ler(admin.from('role_permissions').select('id, role_id').eq('tenant_id', ctx.tenantId!).in('id', [...new Set(semCargo)]),
      'ler o cargo das permissões') ?? []
    for (const p of lidas) cargosDaPermissao.set(p.id as string, p.role_id as string)
  }
  const cargos = [...new Set(cargosDaPermissao.values())]
  const [c, m, u, p, cg] = await Promise.all([
    clientes.length
      ? ler(admin.from('clients').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', clientes), 'ler os nomes das clientes')
      : Promise.resolve([]),
    membros.length
      ? ler(admin.from('users').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', membros), 'ler os nomes da equipe')
      : Promise.resolve([]),
    // As unidades da rede são poucas (o caso comum é uma).
    ler(admin.from('branches').select('id, name').eq('tenant_id', ctx.tenantId!), 'ler as unidades'),
    produtos.length
      ? ler(admin.from('products').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', produtos), 'ler os nomes dos produtos')
      : Promise.resolve([]),
    cargos.length
      ? ler(admin.from('tenant_roles').select('id, name:label').eq('tenant_id', ctx.tenantId!).in('id', cargos), 'ler os nomes dos cargos')
      : Promise.resolve([]),
  ])
  const mapa = (xs: { id: unknown; name: unknown }[] | null) =>
    Object.fromEntries((xs ?? []).map(x => [x.id as string, (x.name as string | null) ?? '']))
  const nomeDoCargo = mapa(cg as { id: unknown; name: unknown }[] | null)
  const cargosPorPermissao = Object.fromEntries([...cargosDaPermissao.entries()]
    .filter(([, cargo]) => nomeDoCargo[cargo]).map(([permissao, cargo]) => [permissao, nomeDoCargo[cargo]!]))
  return { clientes: mapa(c), membros: mapa(m), unidades: mapa(u), produtos: mapa(p), cargos: cargosPorPermissao }
}

/**
 * As pessoas do filtro "Quem", em ordem de nome. Quem é da rede inteira lê
 * todos os membros. Quem tem unidades lê quem AGIU nelas — as linhas que ela
 * alcança (D7 da 15ª simulação: a lista eram os membros com `branch_id` nas
 * unidades dela, e quem tem "A rede inteira" não aparecia, com as ações dele
 * na tela).
 */
export async function pessoasDaAuditoria(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  const minhas = unidadesDoContexto(ctx)
  const admin = createAdminClient()
  if (minhas !== null) {
    if (minhas.length === 0) return []
    const lidas = await ler(admin.rpc('auditoria_pessoas_das_unidades', { p_tenant: ctx.tenantId!, p_unidades: minhas }),
      'ler quem agiu nas unidades') as { id: string; name: string | null }[] | null
    return (lidas ?? []).map(u => ({ id: u.id, name: u.name ?? '' }))
  }
  const todas = await lerTodas<{ id: string; name: string | null }>((de, ate) =>
    admin.from('users').select('id, name').eq('tenant_id', ctx.tenantId!).order('name').order('id').range(de, ate),
  'ler a equipe da auditoria')
  return todas.map(u => ({ id: u.id, name: u.name ?? '' }))
}
