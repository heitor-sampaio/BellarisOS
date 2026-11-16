import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { unidadesDoContexto } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { resolvePeriod } from '@/lib/metrics'
import { OPERACOES, type FiltrosDaAuditoria, type NomesDaAuditoria, type RegistroDaAuditoria } from './tipos'
import { gravacoesDaUnidade } from './frase'

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
  // `semUnidade`: para completar a gravação filtrada pela unidade (A28 da 17ª).
  const consulta = (semUnidade = false) => {
    let q = baseDaAuditoria(admin)
      .eq('tenant_id', ctx.tenantId!)
      .gte('criado_em', periodo.from.toISOString())
      .lte('criado_em', periodo.fullTo.toISOString())
    if (minhas !== null) q = q.in('branch_id', minhas)
    if (unidade && !semUnidade) q = q.eq('branch_id', unidade)
    if (filtros.pessoa && UUID.test(filtros.pessoa)) q = q.eq('ator_user_id', filtros.pessoa)
    // A37 da 16ª: "Só o que foi pelo Copilot" — a marca que a gravação do Copilot deixa (`via`).
    else if (filtros.pessoa === 'copilot') q = q.eq('via', 'copilot')
    if (filtros.tipo && OPERACOES.some(o => o.key === filtros.tipo)) q = q.eq('operacao', filtros.tipo)
    if (clientesDoFiltro) q = q.in('client_id', clientesDoFiltro)
    return q
  }

  if (opcoes.porGravacao) {
    const lida = await lerPorGravacao(ctx, vazia, consulta, filtros.antes, porPagina)
    return unidade ? { ...lida, ...await soAsGravacoesDaUnidade(ctx, consulta, lida.registros, unidade) } : lida
  }

  const inicio = (pagina - 1) * porPagina
  // Uma a mais diz se há a próxima página, sem contar a tabela inteira.
  const linhas = (await ler(consulta().order('id', { ascending: false }).range(inicio, inicio + porPagina), 'ler a auditoria') ?? []) as RegistroDaAuditoria[]
  const registros = linhas.slice(0, porPagina)

  return {
    ...vazia,
    ...(unidade
      ? await soAsGravacoesDaUnidade(ctx, consulta, registros, unidade)
      : { registros, nomes: await nomesDaAuditoria(ctx, registros) }),
    temMais: linhas.length > porPagina,
  }
}

/**
 * O filtro por unidade é pela unidade da GRAVAÇÃO (A28 da 17ª simulação): a
 * linha da tela leva a unidade do fato, e o filtro por registro trazia, na
 * Savassi, a sessão do pacote da Savassi usada na conclusão da Pampulha. As
 * gravações lidas pela unidade se completam (as linhas da mesma transação, na
 * abrangência de quem lê) e ficam só as que são da unidade pedida. A página
 * pode mostrar menos gravações; o cursor segue o da leitura pela unidade.
 */
async function soAsGravacoesDaUnidade(
  ctx: TenantContext, consulta: (semUnidade?: boolean) => Consulta,
  registros: readonly RegistroDaAuditoria[], unidade: string,
): Promise<{ registros: RegistroDaAuditoria[]; nomes: NomesDaAuditoria }> {
  const instantes = [...new Set(registros.map(r => r.criado_em))]
  const outras = instantes.length
    ? (await ler(consulta(true).in('criado_em', instantes).order('id', { ascending: false }).limit(5000), 'completar as gravações da unidade') ?? []) as RegistroDaAuditoria[]
    : []
  const porId = new Map<number, RegistroDaAuditoria>()
  for (const r of [...registros, ...outras]) porId.set(r.id, r)
  const inteiras = [...porId.values()].sort((a, b) => b.id - a.id)
  const nomes = await nomesDaAuditoria(ctx, inteiras)
  return { registros: gravacoesDaUnidade(inteiras, nomes, unidade), nomes }
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
  // D7 da 16ª: o pacote vendido e o lançamento baixado ("Recebeu a parcela 1/4 (R$ 200,00)").
  const pacotes = [...new Set(registros.filter(r => r.tabela === 'client_packages').map(r => doRegistro(r, 'package_id')).filter((v): v is string => !!v))]
  const lancamentos = [...new Set(registros.filter(r => r.tabela === 'financial_transactions' && r.operacao === 'editou'
    && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  const [pk, ft] = await Promise.all([
    pacotes.length
      ? ler(admin.from('service_packages').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', pacotes), 'ler os nomes dos pacotes')
      : Promise.resolve([]),
    lancamentos.length
      ? ler(admin.from('financial_transactions').select('id, type, amount, payment_method, parcela_numero, parcela_total, appointment_id, branches!inner(tenant_id)')
        .eq('branches.tenant_id', ctx.tenantId!).in('id', lancamentos), 'ler os lançamentos da auditoria')
      : Promise.resolve([]),
  ])
  const lancamentosLidos = Object.fromEntries(((ft ?? []) as {
    id: string; type: string | null; amount: number | string | null; payment_method: string | null
    parcela_numero: number | null; parcela_total: number | null; appointment_id: string | null
  }[]).map(l => [l.id, {
    tipo: l.type, valor: l.amount === null ? null : Number(l.amount), forma: l.payment_method,
    parcela: l.parcela_numero, de: l.parcela_total, agendamento: !!l.appointment_id,
  }]))
  const extras = await nomesDa17(ctx, registros)
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
  return {
    clientes: mapa(c), membros: mapa(m), unidades: mapa(u), produtos: mapa(p), cargos: cargosPorPermissao,
    pacotes: mapa(pk as { id: unknown; name: unknown }[] | null), lancamentos: lancamentosLidos,
    ...extras,
  }
}

/**
 * A26/A27 da 17ª simulação: o que a gravação não guarda e a frase diz, lido
 * agora — o nome da oportunidade e do contato (a auditoria grava `{}` neles,
 * por minimização: o nome se lê como o da cliente), a etapa quando está no
 * registro, o produto do item da comanda, de quem é a comissão paga, a cliente
 * dos pontos e o "Fechar de novo". Tudo pela rede da sessão.
 */
async function nomesDa17(ctx: TenantContext, registros: readonly RegistroDaAuditoria[]): Promise<Partial<NomesDaAuditoria>> {
  const admin = createAdminClient()
  const tenant = ctx.tenantId!
  const ids = (tabela: string) => [...new Set(registros.filter(r => r.tabela === tabela && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  const leads = ids('leads')
  const contatos = ids('contacts')
  const itens = ids('comanda_itens')
  const pagamentos = ids('commission_payouts')
  const pontos = ids('loyalty_transactions')
  const fechamentos = ids('fechamentos_do_dia')
  const etapas = [...new Set(registros.filter(r => r.tabela === 'leads').flatMap(r => [r.antes, r.depois])
    .flatMap(x => [x?.crm_stage_id, x?.stage_id]).filter((v): v is string => typeof v === 'string' && UUID.test(v)))]
  const nada = Promise.resolve([] as Record<string, unknown>[])

  const [ld, ct, et, it, po, lt, fe] = await Promise.all([
    leads.length ? ler(admin.from('leads').select('id, name, contato_id').eq('tenant_id', tenant).in('id', leads), 'ler as oportunidades da auditoria') : nada,
    contatos.length ? ler(admin.from('contacts').select('id, name').eq('tenant_id', tenant).in('id', contatos), 'ler os contatos da auditoria') : nada,
    etapas.length ? ler(admin.from('crm_stages').select('id, name').eq('tenant_id', tenant).in('id', etapas), 'ler as etapas da auditoria') : nada,
    itens.length ? ler(admin.from('comanda_itens').select('id, product_id').eq('tenant_id', tenant).in('id', itens), 'ler os itens da comanda da auditoria') : nada,
    pagamentos.length ? ler(admin.from('commission_payouts').select('id, professional_id').eq('tenant_id', tenant).in('id', pagamentos), 'ler os pagamentos de comissão da auditoria') : nada,
    pontos.length ? ler(admin.from('loyalty_transactions').select('id, loyalty_account_id').in('id', pontos), 'ler os lançamentos de pontos da auditoria') : nada,
    fechamentos.length ? ler(admin.from('fechamentos_do_dia').select('id, branch_id, dia, fechado_em').eq('tenant_id', tenant).in('id', fechamentos), 'ler os fechamentos da auditoria') : nada,
  ]) as Record<string, unknown>[][]
  const str = (v: unknown) => (typeof v === 'string' ? v : null)

  // O nome da oportunidade é o dela; sem ele, o do contato dela.
  const contatosDosLeads = (ld ?? []).map(l => str(l.contato_id)).filter((v): v is string => !!v && !contatos.includes(v))
  const contas = [...new Set((lt ?? []).map(l => str(l.loyalty_account_id)).filter((v): v is string => !!v))]
  const produtos = [...new Set((it ?? []).map(i => str(i.product_id)).filter((v): v is string => !!v))]
  const profissionais = [...new Set((po ?? []).map(x => str(x.professional_id)).filter((v): v is string => !!v))]
  const [ct2, contasLidas, pr, us] = await Promise.all([
    contatosDosLeads.length ? ler(admin.from('contacts').select('id, name').eq('tenant_id', tenant).in('id', contatosDosLeads), 'ler os contatos das oportunidades') : nada,
    contas.length ? ler(admin.from('loyalty_accounts').select('id, client_id').in('id', contas), 'ler as contas de pontos da auditoria') : nada,
    produtos.length ? ler(admin.from('products').select('id, name').eq('tenant_id', tenant).in('id', produtos), 'ler os produtos da comanda') : nada,
    profissionais.length ? ler(admin.from('users').select('id, name').eq('tenant_id', tenant).in('id', profissionais), 'ler quem recebeu a comissão') : nada,
  ]) as Record<string, unknown>[][]
  const clientesDasContas = [...new Set((contasLidas ?? []).map(x => str(x.client_id)).filter((v): v is string => !!v))]
  // A cliente só sai se for desta rede (a conta de pontos não tem rede própria).
  const cl = clientesDasContas.length
    ? (await ler(admin.from('clients').select('id, name').eq('tenant_id', tenant).in('id', clientesDasContas), 'ler as clientes dos pontos') ?? []) as Record<string, unknown>[]
    : []

  const nome = (xs: Record<string, unknown>[] | null | undefined) => new Map((xs ?? []).map(x => [x.id as string, str(x.name) ?? '']))
  const nomeDoContato = new Map([...nome(ct), ...nome(ct2)])
  const nomeDoProduto = nome(pr)
  const nomeDoMembro = nome(us)
  const nomeDaCliente = nome(cl)
  const clienteDaConta = new Map((contasLidas ?? []).map(x => [x.id as string, str(x.client_id)]))

  // O "Fechar de novo": outro fechamento do mesmo dia e unidade, antes deste.
  const fechamentosLidos = (fe ?? []) as { id: string; branch_id: string; dia: string; fechado_em: string }[]
  const fechamentosDeNovo: Record<string, boolean> = {}
  if (fechamentosLidos.length) {
    const doMesmoDia = (await ler(admin.from('fechamentos_do_dia').select('id, branch_id, dia, fechado_em').eq('tenant_id', tenant)
      .in('branch_id', [...new Set(fechamentosLidos.map(f => f.branch_id))]).in('dia', [...new Set(fechamentosLidos.map(f => f.dia))]),
    'ler os fechamentos do mesmo dia') ?? []) as { id: string; branch_id: string; dia: string; fechado_em: string }[]
    for (const f of fechamentosLidos) {
      fechamentosDeNovo[f.id] = doMesmoDia.some(o => o.id !== f.id && o.branch_id === f.branch_id && o.dia === f.dia && o.fechado_em < f.fechado_em)
    }
  }

  return {
    oportunidades: Object.fromEntries((ld ?? []).map(l => [l.id as string, str(l.name)?.trim() || nomeDoContato.get(str(l.contato_id) ?? '') || ''])
      .filter(([, n]) => n)),
    contatos: Object.fromEntries([...nome(ct)].filter(([, n]) => n)),
    etapas: Object.fromEntries([...nome(et)]),
    itensDaComanda: Object.fromEntries((it ?? []).map(i => [i.id as string, nomeDoProduto.get(str(i.product_id) ?? '') ?? '']).filter(([, n]) => n)),
    pagamentosDeComissao: Object.fromEntries((po ?? []).map(x => [x.id as string, nomeDoMembro.get(str(x.professional_id) ?? '') ?? '']).filter(([, n]) => n)),
    clientesDosPontos: Object.fromEntries((lt ?? []).map(l => [l.id as string, nomeDaCliente.get(clienteDaConta.get(str(l.loyalty_account_id) ?? '') ?? '') ?? '']).filter(([, n]) => n)),
    fechamentosDeNovo,
  }
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
