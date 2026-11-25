import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { unidadesDoContexto, assertAuditoria } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { resolvePeriod } from '@/lib/metrics'
import { OPERACOES, type FiltrosDaAuditoria, type NomesDaAuditoria, type RegistroDaAuditoria } from './tipos'
import { conferidoDoFechamento, gravacoesDaUnidade } from './frase'
import { unidadeDoInsumo, type UnidadesDoProduto } from '@/lib/estoque/unidade-de-consumo'
import { fusoDoRecorte } from '@/lib/unidades/fuso-da-unidade'
import { nomesDosAnexosEDevolucoes } from './nomes-dos-anexos-e-devolucoes'
import { fusoValido } from '@/lib/unidades/fuso'

/**
 * A leitura da auditoria (CF3a) — pelo servidor, só para a Admin da rede
 * (`assertAuditoria`; o Heitor, 2026-11-16: "Auditoria é só admin"): a sessão
 * não lê a tabela (`public.auditoria` não tem política nem privilégio para ela).
 *
 * - **A abrangência**: a Admin da rede tem "A rede inteira" (o cargo de sistema
 *   não se dá com unidades) e lê tudo. O recorte por unidade abaixo fica como
 *   segunda parede (`unidadesDoContexto`, a regra do `alcancaUnidade`): a
 *   unidade pedida na URL não vence a abrangência.
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
  /**
   * D2 da 23ª (F62b): o relógio da leitura — o da unidade filtrada, senão o
   * comum das unidades de quem lê. O período e a coluna "Quando" vão nele.
   */
  fuso:      string
  /** Na leitura por gravação: o cursor da próxima página (as linhas antes deste id). */
  proximo?:  string | null
  /** Na leitura por gravação: o cursor desta página (nulo na primeira). */
  antes?:    string | null
}

/**
 * O recorte de quem tem unidades (A32 da 18ª simulação): as linhas das
 * unidades dela, e as sem unidade que ELA gravou (a oportunidade e o contato
 * que ela criou, que são da rede) — a Gabriela não via a oportunidade que
 * ela mesma criou e marcou perdida. A linha sem unidade dos outros segue da rede.
 */
export function filtroDoAlcanceDaAuditoria(minhas: readonly string[], eu: string | null): string {
  const dasUnidades = `branch_id.in.(${minhas.join(',')})`
  return eu && UUID_OU_ID.test(eu) ? `${dasUnidades},and(branch_id.is.null,ator_user_id.eq.${eu})` : dasUnidades
}
const UUID_OU_ID = /^[0-9a-zA-Z-]+$/

export async function lerAuditoria(
  ctx: TenantContext, filtros: FiltrosDaAuditoria, opcoes: { porPagina?: number; porGravacao?: boolean } = {},
): Promise<PaginaDaAuditoria> {
  assertAuditoria(ctx)
  const admin = createAdminClient()
  const porPagina = opcoes.porPagina ?? POR_PAGINA
  const pagina = Math.max(1, Math.floor(Number(filtros.pagina) || 1))
  const minhas = unidadesDoContexto(ctx)
  const unidade = filtros.unidade && UUID.test(filtros.unidade) && (minhas === null || minhas.includes(filtros.unidade))
    ? filtros.unidade : null
  const fuso = await fusoDoRecorte(ctx.tenantId, unidade ? [unidade] : minhas)
  const periodo = resolvePeriod(filtros.period ?? 'month', filtros.from, filtros.to, new Date(), fuso)
  const vazia: PaginaDaAuditoria = {
    registros: [], nomes: { clientes: {}, membros: {}, unidades: {} }, temMais: false, pagina, unidade, fuso,
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
    if (minhas !== null) {
      // A32 da 18ª: as linhas das unidades dela E o que ela mesma gravou sem
      // unidade (a oportunidade e o contato são da rede).
      q = q.or(filtroDoAlcanceDaAuditoria(minhas, ctx.internalUserId ?? null))
    }
    // A ficha é da REDE (auditoria das regras, 18/11): a linha dela não tem
    // unidade, e o filtro de unidade não a esconde.
    if (unidade && !semUnidade) q = q.or(`branch_id.eq.${unidade},and(branch_id.is.null,tabela.eq.clients)`)
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
  // O produto do movimento e o cargo da permissão (A27/A28 da 15ª): a frase diz o nome, não "um produto".
  const doRegistro = (r: RegistroDaAuditoria, chave: string) => {
    const v = r.depois?.[chave] ?? r.antes?.[chave]
    return typeof v === 'string' && UUID.test(v) ? v : null
  }
  // A34 da 19ª: quem passou a atender o agendamento remarcado ou repassado ("Repassou … a Dr. Caio").
  const membros = [...new Set([
    ...registros.filter(r => r.tabela === 'users' && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!),
    ...registros.filter(r => r.tabela === 'appointments').map(r => doRegistro(r, 'professional_id')).filter((v): v is string => !!v),
    // A16: de quem é o bloqueio da agenda ("Bloqueou a agenda de Dra. Paula …").
    ...registros.filter(r => r.tabela === 'agenda_bloqueios').map(r => doRegistro(r, 'professional_id')).filter((v): v is string => !!v),
  ])]
  // A16: a sala do bloqueio; A17: o cargo do membro editado (o de → para e o "Promoveu").
  const salas = [...new Set(registros.filter(r => r.tabela === 'agenda_bloqueios').map(r => doRegistro(r, 'room_id')).filter((v): v is string => !!v))]
  const cargosDeMembro = [...new Set(registros.filter(r => r.tabela === 'users')
    .flatMap(r => [r.antes?.role_id, r.depois?.role_id]).filter((v): v is string => typeof v === 'string' && UUID.test(v)))]
  const produtos = [...new Set(registros.filter(r => r.tabela === 'stock_movements').map(r => doRegistro(r, 'product_id')).filter((v): v is string => !!v))]
  // A7 da 21ª: a aba de relatório também diz de qual cargo é (a auditoria não guarda o `role_id` dela).
  const cargosDaPermissao = new Map<string, string>()
  for (const tabela of ['role_permissions', 'role_report_tabs'] as const) {
    const linhas = registros.filter(r => r.tabela === tabela && r.registro_id && UUID.test(r.registro_id))
    for (const r of linhas) { const cargo = doRegistro(r, 'role_id'); if (cargo) cargosDaPermissao.set(r.registro_id!, cargo) }
    const semCargo = linhas.filter(r => !cargosDaPermissao.has(r.registro_id!)).map(r => r.registro_id!)
    if (!semCargo.length) continue
    const lidas = await ler(admin.from(tabela).select('id, role_id').eq('tenant_id', ctx.tenantId!).in('id', [...new Set(semCargo)]),
      'ler o cargo das permissões') ?? []
    for (const p of lidas) cargosDaPermissao.set(p.id as string, p.role_id as string)
  }
  const cargos = [...new Set(cargosDaPermissao.values())]
  // D7 da 16ª: o pacote vendido e o lançamento baixado ("Recebeu a parcela 1/4 (R$ 200,00)").
  const pacotes = [...new Set(registros.filter(r => r.tabela === 'client_packages').map(r => doRegistro(r, 'package_id')).filter((v): v is string => !!v))]
  // A38 da 22ª: o lançamento CRIADO também (as vezes do crédito e as parcelas do crediário).
  const lancamentos = [...new Set(registros.filter(r => r.tabela === 'financial_transactions' && (r.operacao === 'editou' || r.operacao === 'criou')
    && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  const lerLancamentos = async () => {
    // Em lotes: o CSV pode trazer muitos, e a lista de ids vai na URL.
    const lidos: Record<string, unknown>[] = []
    for (let i = 0; i < lancamentos.length; i += 150) {
      const lote = await ler(admin.from('financial_transactions')
        .select('id, type, amount, payment_method, parcela_numero, parcela_total, appointment_id, cartao_vezes, branches!inner(tenant_id)')
        .eq('branches.tenant_id', ctx.tenantId!).in('id', lancamentos.slice(i, i + 150)), 'ler os lançamentos da auditoria')
      lidos.push(...((lote ?? []) as Record<string, unknown>[]))
    }
    return lidos
  }
  const [pk, ft] = await Promise.all([
    pacotes.length
      ? ler(admin.from('service_packages').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', pacotes), 'ler os nomes dos pacotes')
      : Promise.resolve([]),
    lancamentos.length ? lerLancamentos() : Promise.resolve([]),
  ])
  const lancamentosLidos = Object.fromEntries(((ft ?? []) as {
    id: string; type: string | null; amount: number | string | null; payment_method: string | null
    parcela_numero: number | null; parcela_total: number | null; appointment_id: string | null; cartao_vezes: number | null
  }[]).map(l => [l.id, {
    tipo: l.type, valor: l.amount === null ? null : Number(l.amount), forma: l.payment_method,
    parcela: l.parcela_numero, de: l.parcela_total, agendamento: !!l.appointment_id, vezes: l.cartao_vezes,
  }]))
  const [extras, da20, anexosEDevolucoes, sl, cm] = await Promise.all([
    nomesDa17(ctx, registros), nomesDa20(ctx, registros), nomesDosAnexosEDevolucoes(ctx, registros),
    salas.length
      ? ler(admin.from('rooms').select('id, name, branches!inner(tenant_id)').eq('branches.tenant_id', ctx.tenantId!).in('id', salas), 'ler as salas da auditoria')
      : Promise.resolve([]),
    cargosDeMembro.length
      ? ler(admin.from('tenant_roles').select('id, label, key, is_system').eq('tenant_id', ctx.tenantId!).in('id', cargosDeMembro), 'ler os cargos dos membros da auditoria')
      : Promise.resolve([]),
  ])
  const cargosDosMembros = Object.fromEntries(((cm ?? []) as { id: string; label: string | null; key: string | null; is_system: boolean | null }[])
    .filter(x => x.label).map(x => [x.id, { nome: x.label!, adminDaRede: x.key === 'NETWORK_ADMIN' && x.is_system === true }]))
  const [c, m, u, p, cg] = await Promise.all([
    clientes.length
      ? ler(admin.from('clients').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', clientes), 'ler os nomes das clientes')
      : Promise.resolve([]),
    membros.length
      ? ler(admin.from('users').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', membros), 'ler os nomes da equipe')
      : Promise.resolve([]),
    // As unidades da rede são poucas (o caso comum é uma).
    ler(admin.from('branches').select('id, name, fuso').eq('tenant_id', ctx.tenantId!), 'ler as unidades'),
    produtos.length
      ? ler(admin.from('products').select('id, name, unit, consumption_unit, units_per_package').eq('tenant_id', ctx.tenantId!).in('id', produtos), 'ler os nomes dos produtos')
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
  // A33 da 21ª: a medida em que o movimento se grava (lib/estoque/unidade-de-consumo).
  const medidasDosProdutos = Object.fromEntries(((p ?? []) as Partial<UnidadesDoProduto & { id: string }>[])
    .map(x => [x.id as string, x.unit ? unidadeDoInsumo({ unit: x.unit, consumption_unit: x.consumption_unit ?? null, units_per_package: x.units_per_package ?? null }) : ''])
    .filter(([, medida]) => medida))
  // A10 da 24ª: a embalagem e o rendimento dela — o custo corrigido do lote se diz por embalagem.
  const embalagensDosProdutos = Object.fromEntries(((p ?? []) as Partial<UnidadesDoProduto & { id: string }>[])
    .filter(x => x.unit)
    .map(x => [x.id as string, {
      unidade: x.unit as string,
      fator: x.consumption_unit && Number(x.units_per_package) > 0 ? Number(x.units_per_package) : 1,
    }]))
  return {
    clientes: mapa(c), membros: mapa(m), unidades: mapa(u), embalagensDosProdutos,
    // D2 da 23ª: o fuso de cada unidade, para a hora do agendamento citado.
    fusos: Object.fromEntries(((u ?? []) as { id: string; fuso: string | null }[]).map(b => [b.id, fusoValido(b.fuso)])),
    // D6 da 26ª: a linha sem unidade sai no fuso da rede (`fusoDaRede` = o recorte sem unidade: o comum das ativas).
    fusoDaRede: await fusoDoRecorte(ctx.tenantId, null),
    produtos: mapa(p), medidasDosProdutos, cargos: cargosPorPermissao,
    pacotes: mapa(pk as { id: unknown; name: unknown }[] | null), lancamentos: lancamentosLidos,
    salas: mapa(sl as { id: unknown; name: unknown }[] | null), cargosDosMembros,
    ...extras,
    ...da20,
    ...anexosEDevolucoes,
  }
}

/**
 * A34–A36 da 20ª simulação: o que as frases novas dizem e a gravação não
 * guarda, lido agora pela rede da sessão — o motivo do documento fechado,
 * qual sessão de qual pacote, o pacote cancelado, o arquivo e o placar da
 * importação, o custo da entrada de estoque e o procedimento agendado.
 */
async function nomesDa20(ctx: TenantContext, registros: readonly RegistroDaAuditoria[]): Promise<Partial<NomesDaAuditoria>> {
  const admin = createAdminClient()
  const tenant = ctx.tenantId!
  const ids = (filtro: (r: RegistroDaAuditoria) => boolean) =>
    [...new Set(registros.filter(r => filtro(r) && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  const documentos = ids(r => r.tabela === 'issued_documents' && r.operacao === 'editou' && r.colunas.includes('status'))
  const sessoes = ids(r => r.tabela === 'package_sessions' && r.operacao === 'editou' && r.colunas.includes('status'))
  const pacotes = ids(r => r.tabela === 'client_packages' && r.operacao === 'editou' && r.colunas.includes('cancelado_em'))
  const importacoes = ids(r => r.tabela === 'importacoes')
  const entradas = ids(r => r.tabela === 'stock_movements' && r.operacao === 'criou' && r.depois?.type === 'PURCHASE')
  const procedimentos = [...new Set(registros.filter(r => r.tabela === 'appointments' && r.operacao === 'criou')
    .map(r => r.depois?.procedure_id).filter((v): v is string => typeof v === 'string' && UUID.test(v)))]
  const nada = Promise.resolve([] as Record<string, unknown>[])

  const [dc, ss, pk, im, en, pr] = await Promise.all([
    documentos.length ? ler(admin.from('issued_documents').select('id, closed_reason').eq('tenant_id', tenant).in('id', documentos), 'ler os motivos dos documentos') : nada,
    sessoes.length ? ler(admin.from('package_sessions').select('id, session_number, client_packages!inner(branches!inner(tenant_id), service_packages(name))')
      .eq('client_packages.branches.tenant_id', tenant).in('id', sessoes), 'ler as sessões dos pacotes') : nada,
    pacotes.length ? ler(admin.from('client_packages').select('id, service_packages(name), branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenant).in('id', pacotes), 'ler os pacotes cancelados') : nada,
    importacoes.length ? ler(admin.from('importacoes').select('id, nome_arquivo, destino, total, novas, completadas, com_erro')
      .eq('tenant_id', tenant).in('id', importacoes), 'ler as importações da auditoria') : nada,
    entradas.length ? ler(admin.from('stock_movements').select('id, quantity, unit_cost, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenant).in('id', entradas), 'ler o custo das entradas') : nada,
    procedimentos.length ? ler(admin.from('procedures').select('id, name').eq('tenant_id', tenant).in('id', procedimentos), 'ler os procedimentos agendados') : nada,
  ]) as Record<string, unknown>[][]
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const num = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  const nomeDe = (x: unknown) => str((x as { name?: unknown } | null)?.name)

  return {
    // O motivo pode ser texto livre (o "Dispensar"): curto na frase.
    motivosDoDocumento: Object.fromEntries((dc ?? []).map(d => [d.id as string, (str(d.closed_reason)?.trim() ?? '').slice(0, 120)]).filter(([, m]) => m)),
    sessoesDoPacote: Object.fromEntries((ss ?? []).map(x => {
      const pacote = nomeDe((x.client_packages as { service_packages?: unknown } | null)?.service_packages)
      const n = num(x.session_number)
      return [x.id as string, `a sessão${n !== null ? ` ${n}` : ''} do pacote${pacote ? ` ${pacote}` : ''}`]
    })),
    pacotesDaCliente: Object.fromEntries((pk ?? []).map(x => [x.id as string, nomeDe(x.service_packages) ?? '']).filter(([, n]) => n)),
    importacoes: Object.fromEntries((im ?? []).map(i => [i.id as string, {
      arquivo: str(i.nome_arquivo) ?? '', destino: str(i.destino) ?? '', total: num(i.total) ?? 0,
      novas: num(i.novas) ?? 0, completadas: num(i.completadas) ?? 0, comErro: num(i.com_erro) ?? 0,
    }])),
    // A entrada inteira: a quantidade (na unidade de consumo) vezes o custo de cada uma.
    custosDasEntradas: Object.fromEntries((en ?? []).flatMap(m => {
      const q = num(m.quantity); const c = num(m.unit_cost)
      return q !== null && c !== null && c > 0 ? [[m.id as string, Math.round(Math.abs(q) * c * 100) / 100]] : []
    })),
    procedimentos: Object.fromEntries((pr ?? []).map(x => [x.id as string, str(x.name) ?? '']).filter(([, n]) => n)),
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
  // A31 da 18ª: o motivo do cancelamento; A33: de qual é a comissão.
  const cancelados = [...new Set(registros.filter(r => r.tabela === 'appointments' && r.operacao === 'editou'
    && r.depois?.status === 'CANCELLED' && r.registro_id && UUID.test(r.registro_id)).map(r => r.registro_id!))]
  const comissoes = ids('commissions')
  const etapas = [...new Set(registros.filter(r => r.tabela === 'leads').flatMap(r => [r.antes, r.depois])
    .flatMap(x => [x?.crm_stage_id, x?.stage_id]).filter((v): v is string => typeof v === 'string' && UUID.test(v)))]
  const nada = Promise.resolve([] as Record<string, unknown>[])

  const [ld, ct, et, it, po, lt, fe, ca, co] = await Promise.all([
    leads.length ? ler(admin.from('leads').select('id, name, contato_id').eq('tenant_id', tenant).in('id', leads), 'ler as oportunidades da auditoria') : nada,
    contatos.length ? ler(admin.from('contacts').select('id, name').eq('tenant_id', tenant).in('id', contatos), 'ler os contatos da auditoria') : nada,
    etapas.length ? ler(admin.from('crm_stages').select('id, name').eq('tenant_id', tenant).in('id', etapas), 'ler as etapas da auditoria') : nada,
    itens.length ? ler(admin.from('comanda_itens').select('id, product_id').eq('tenant_id', tenant).in('id', itens), 'ler os itens da comanda da auditoria') : nada,
    pagamentos.length ? ler(admin.from('commission_payouts').select('id, professional_id').eq('tenant_id', tenant).in('id', pagamentos), 'ler os pagamentos de comissão da auditoria') : nada,
    pontos.length ? ler(admin.from('loyalty_transactions').select('id, loyalty_account_id').in('id', pontos), 'ler os lançamentos de pontos da auditoria') : nada,
    fechamentos.length ? ler(admin.from('fechamentos_do_dia').select('id, branch_id, dia, fechado_em, contado_dinheiro, conferido').eq('tenant_id', tenant).in('id', fechamentos), 'ler os fechamentos da auditoria') : nada,
    cancelados.length ? ler(admin.from('appointments').select('id, cancellation_reason, branches!inner(tenant_id)').eq('branches.tenant_id', tenant).in('id', cancelados), 'ler os motivos do cancelamento') : nada,
    comissoes.length ? ler(admin.from('commissions').select('id, appointment_id, transaction_id, branches!inner(tenant_id)').eq('branches.tenant_id', tenant).in('id', comissoes), 'ler as comissões da auditoria') : nada,
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

  // A33 da 18ª: a comissão pelo atendimento (a cliente e o procedimento) ou pela venda (a cliente do lançamento).
  const agDasComissoes = [...new Set((co ?? []).map(x => str(x.appointment_id)).filter((v): v is string => !!v))]
  const lcDasComissoes = [...new Set((co ?? []).filter(x => !x.appointment_id).map(x => str(x.transaction_id)).filter((v): v is string => !!v))]
  const [agc, lcc] = await Promise.all([
    agDasComissoes.length ? ler(admin.from('appointments').select('id, clients(name), procedures(name), branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenant).in('id', agDasComissoes), 'ler os atendimentos das comissões') : nada,
    lcDasComissoes.length ? ler(admin.from('financial_transactions').select('id, clients(name), branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenant).in('id', lcDasComissoes), 'ler as vendas das comissões') : nada,
  ]) as Record<string, unknown>[][]
  const nomeDe = (x: unknown) => str((x as { name?: unknown } | null)?.name)
  const atendimentoDa = new Map((agc ?? []).map(a => {
    const cli = nomeDe(a.clients); const proc = nomeDe(a.procedures)
    return [a.id as string, cli ? `do atendimento de ${cli}${proc ? ` (${proc})` : ''}` : proc ? `do atendimento (${proc})` : 'de um atendimento'] as const
  }))
  const vendaDa = new Map((lcc ?? []).map(l => [l.id as string, nomeDe(l.clients) ? `da venda a ${nomeDe(l.clients)}` : 'de uma venda'] as const))
  const comissoesLidas = Object.fromEntries((co ?? []).map(x => [x.id as string,
    (str(x.appointment_id) && atendimentoDa.get(str(x.appointment_id)!)) || (str(x.transaction_id) && vendaDa.get(str(x.transaction_id)!)) || '',
  ]).filter(([, n]) => n))

  const nome = (xs: Record<string, unknown>[] | null | undefined) => new Map((xs ?? []).map(x => [x.id as string, str(x.name) ?? '']))
  const nomeDoContato = new Map([...nome(ct), ...nome(ct2)])
  const nomeDoProduto = nome(pr)
  const nomeDoMembro = nome(us)
  const nomeDaCliente = nome(cl)
  const clienteDaConta = new Map((contasLidas ?? []).map(x => [x.id as string, str(x.client_id)]))

  // O "Fechar de novo": outro fechamento do mesmo dia e unidade, antes deste.
  const fechamentosLidos = (fe ?? []) as { id: string; branch_id: string; dia: string; fechado_em: string; contado_dinheiro?: unknown; conferido?: Record<string, unknown> | null }[]
  // A33 da 19ª: o conferido de cada fechamento ("Fechou de novo o dia … (conferido: …)").
  const conferidosDoFechamento = Object.fromEntries(fechamentosLidos
    .map(f => [f.id, conferidoDoFechamento(f.contado_dinheiro ?? null, f.conferido ?? null)] as const).filter(([, t]) => t))
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
    conferidosDoFechamento,
    // O motivo é texto livre de quem cancelou: curto na frase.
    motivosDoCancelamento: Object.fromEntries((ca ?? []).map(a => [a.id as string, (str(a.cancellation_reason)?.trim() ?? '').slice(0, 120)]).filter(([, m]) => m)),
    comissoes: comissoesLidas,
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
  assertAuditoria(ctx)
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
