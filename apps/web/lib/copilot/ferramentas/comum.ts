import 'server-only'
import { z } from 'zod/v4'
import { alcancaUnidade } from '@/lib/auth'
import { getCachedNetworkBranches } from '@/lib/cached-queries'
import { ler } from '@/lib/db'
import { zonedToUtc, BUSINESS_TZ } from '@/lib/datetime'
export { BUSINESS_TZ }
import { rotaNoPortal } from '@/lib/rotas'
import type { ContextoDaFerramenta } from '@/lib/copilot/ferramentas/tipos'

/**
 * O que as ferramentas do Copilot dividem: a unidade (sempre dentro da
 * abrangência da pessoa), as datas no fuso de Brasília e os links no portal
 * em que a pessoa está.
 */

export const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'id inválido')
export const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD')
export const HORA = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora no formato HH:MM')

export interface Unidade { id: string; name: string }

/** As unidades ativas da rede. */
export async function unidadesDaRede(c: ContextoDaFerramenta): Promise<Unidade[]> {
  return (await getCachedNetworkBranches(c.ctx.tenantId!) as Unidade[]) ?? []
}

/**
 * A unidade de que a ferramenta fala. Quem tem unidade fixa fica SEMPRE na
 * dela (o pedido não vence a abrangência). Quem é da rede escolhe por id ou
 * nome; sem escolha, null (= todas), ou a única, quando a rede tem uma só.
 */
export async function resolverUnidade(
  c: ContextoDaFerramenta, pedido?: string | null, opcoes: { exigir?: boolean } = {},
): Promise<{ unidade: Unidade | null } | { erro: string }> {
  const todas = await unidadesDaRede(c)
  if (c.ctx.branchId) {
    const propria = todas.find(u => u.id === c.ctx.branchId)
    return propria ? { unidade: propria } : { erro: 'A sua unidade não está ativa.' }
  }
  if (pedido) {
    const p = pedido.trim().toLowerCase()
    const achada = todas.find(u => u.id === pedido) ?? todas.find(u => u.name.toLowerCase() === p)
      ?? todas.filter(u => u.name.toLowerCase().includes(p)).at(0)
    if (!achada) return { erro: `Unidade "${pedido}" não encontrada. Unidades: ${todas.map(u => u.name).join(', ')}.` }
    if (!alcancaUnidade(c.ctx, achada.id)) return { erro: 'Essa unidade está fora do seu alcance.' }
    return { unidade: achada }
  }
  if (todas.length === 1) return { unidade: todas[0]! }
  if (opcoes.exigir) return { erro: `Qual unidade? ${todas.map(u => u.name).join(', ')}.` }
  return { unidade: null }
}

/** Os ids das unidades que a consulta alcança (a escolhida, ou todas as da pessoa). */
export async function idsDasUnidades(c: ContextoDaFerramenta, unidade: Unidade | null): Promise<string[]> {
  if (unidade) return [unidade.id]
  if (c.ctx.branchId) return [c.ctx.branchId]
  return (await unidadesDaRede(c)).map(u => u.id)
}

export function partesDaData(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number)
  return [a!, m!, d!]
}

/** O dia inteiro (00:00 a 23:59:59.999) em Brasília, em UTC. */
export function janelaDoDia(iso: string): { inicio: Date; fim: Date } {
  const [a, m, d] = partesDaData(iso)
  return { inicio: zonedToUtc(a, m, d), fim: zonedToUtc(a, m, d, 23, 59, 59, 999) }
}

/** Um instante de parede ("2026-10-09" + "14:30") em Brasília, em UTC. */
export function instanteDe(data: string, hora: string): Date {
  const [a, m, d] = partesDaData(data)
  const [h, min] = hora.split(':').map(Number)
  return zonedToUtc(a, m, d, h!, min!)
}

export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** "qui., 09/10 às 14:30" — o horário legível para o modelo e para o cartão. */
export function quandoLegivel(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: BUSINESS_TZ, weekday: 'short', day: '2-digit', month: '2-digit' }).format(d)
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit' }).format(d)
  return `${dia} às ${hora}`
}

export function dinheiro(v: number | null | undefined): string {
  return (Number(v ?? 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Um endereço no portal em que a pessoa está (`lib/rotas`). */
export function rota(c: ContextoDaFerramenta, sufixo: string): string {
  return rotaNoPortal(c.pagina, c.slugDoPortal, sufixo)
}

/** Nome por id, num lote (profissionais, procedimentos, unidades, clientes). */
export async function nomesPorId(c: ContextoDaFerramenta, tabela: 'users' | 'procedures' | 'clients' | 'branches' | 'rooms', ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unicos.length) return new Map()
  const linhas = await ler(c.admin.from(tabela).select('id, name').in('id', unicos), `ler os nomes (${tabela})`) as { id: string; name: string }[] | null
  return new Map((linhas ?? []).map(l => [l.id, l.name]))
}

/**
 * Os horários do profissional ocupados em OUTRAS unidades no dia (o
 * profissional da rede atende em várias): `computeAvailableSlots` só olha a
 * unidade pedida.
 */
export async function ocupadosEmOutrasUnidades(c: ContextoDaFerramenta, professionalId: string, unidadeId: string, data: string): Promise<{ inicio: number; fim: number }[]> {
  const { inicio, fim } = janelaDoDia(data)
  const linhas = (await ler(c.admin.from('appointments').select('scheduled_at, duration_min, branches!inner(tenant_id)')
    .eq('professional_id', professionalId).neq('branch_id', unidadeId).eq('branches.tenant_id', c.ctx.tenantId!)
    .not('status', 'in', '("CANCELLED","NO_SHOW")')
    .gte('scheduled_at', inicio.toISOString()).lte('scheduled_at', fim.toISOString()), 'ler a agenda do profissional') as
    { scheduled_at: string; duration_min: number }[] | null) ?? []
  return linhas.map(l => ({ inicio: new Date(l.scheduled_at).getTime(), fim: new Date(l.scheduled_at).getTime() + (l.duration_min || 60) * 60000 }))
}

/** O texto curto do status do agendamento. */
export const STATUS_DO_AGENDAMENTO: Record<string, string> = {
  SCHEDULED: 'agendado', CONFIRMED: 'confirmado', IN_PROGRESS: 'em atendimento',
  COMPLETED: 'concluído', CANCELLED: 'cancelado', NO_SHOW: 'faltou',
}

/**
 * Acha o profissional pelo id ou pelo nome, entre quem atende (`provides_services`)
 * na rede — e, quando a unidade é dada, nela (ou da rede, que atende em todas).
 */
export async function resolverProfissional(
  c: ContextoDaFerramenta, pedido: string, unidadeId?: string | null,
): Promise<{ id: string; name: string; branch_id: string | null } | { erro: string }> {
  let q = c.admin.from('users').select('id, name, branch_id')
    .eq('tenant_id', c.ctx.tenantId!).eq('is_active', true).eq('provides_services', true)
  if (unidadeId) q = q.or(`branch_id.eq.${unidadeId},branch_id.is.null`)
  const todos = (await ler(q.limit(200), 'ler os profissionais') as { id: string; name: string; branch_id: string | null }[] | null) ?? []
  const p = pedido.trim().toLowerCase()
  const exatos = todos.filter(u => u.id === pedido || u.name.toLowerCase() === p)
  const parecidos = exatos.length ? exatos : todos.filter(u => u.name.toLowerCase().includes(p))
  if (parecidos.length === 1) return parecidos[0]!
  if (!parecidos.length) return { erro: `Profissional "${pedido}" não encontrado. Quem atende: ${todos.map(u => u.name).slice(0, 20).join(', ') || 'ninguém cadastrado'}.` }
  return { erro: `Mais de um profissional com "${pedido}": ${parecidos.map(u => u.name).join(', ')}. Qual?` }
}

/**
 * Os procedimentos ativos que a unidade OFERECE: os dela, os da rede sem
 * disponibilidade cadastrada, e os da rede com a unidade na disponibilidade
 * (`procedure_branch_availability` — a regra do quadro e da busca universal).
 */
export async function procedimentosDaUnidade(c: ContextoDaFerramenta, unidadeId?: string | null, busca?: string) {
  let q = c.admin.from('procedures').select('id, name, category, duration_min, price, branch_id, procedure_branch_availability(branch_id)')
    .eq('tenant_id', c.ctx.tenantId!).eq('is_active', true).order('name').limit(300)
  if (unidadeId) q = q.or(`branch_id.is.null,branch_id.eq.${unidadeId}`)
  if (busca) q = q.ilike('name', `%${busca.replace(/[%_\\]/g, '')}%`)
  const todos = (await ler(q, 'ler os procedimentos') as {
    id: string; name: string; category: string | null; duration_min: number; price: number; branch_id: string | null
    procedure_branch_availability: { branch_id: string }[] | null
  }[] | null) ?? []
  return todos.filter(p => {
    if (!unidadeId) return true
    const av = p.procedure_branch_availability ?? []
    return !av.length || av.some(a => a.branch_id === unidadeId)
  })
}

/** Acha o procedimento ativo pelo id ou pelo nome (entre os que a unidade oferece). */
export async function resolverProcedimento(
  c: ContextoDaFerramenta, pedido: string, unidadeId?: string | null,
): Promise<{ id: string; name: string; duration_min: number; price: number } | { erro: string }> {
  const todos = await procedimentosDaUnidade(c, unidadeId)
  const p = pedido.trim().toLowerCase()
  const exatos = todos.filter(x => x.id === pedido || x.name.toLowerCase() === p)
  const parecidos = exatos.length ? exatos : todos.filter(x => x.name.toLowerCase().includes(p))
  if (parecidos.length === 1) return parecidos[0]!
  if (!parecidos.length) return { erro: `Procedimento "${pedido}" não encontrado.` }
  return { erro: `Mais de um procedimento com "${pedido}": ${parecidos.slice(0, 10).map(x => x.name).join(', ')}. Qual?` }
}

/** Acha o cliente ativo pelo id, ou pelo nome/telefone (tem de ser um só). */
export async function resolverCliente(
  c: ContextoDaFerramenta, pedido: string,
): Promise<{ id: string; name: string; phone: string | null } | { erro: string }> {
  const id = UUID.safeParse(pedido)
  if (id.success) {
    const um = await ler(c.admin.from('clients').select('id, name, phone')
      .eq('id', pedido).eq('tenant_id', c.ctx.tenantId!).maybeSingle(), 'ler o cliente') as { id: string; name: string; phone: string | null } | null
    return um ?? { erro: 'Cliente não encontrado.' }
  }
  const termo = pedido.trim()
  const digitos = termo.replace(/\D/g, '')
  const letras = /\p{L}/u.test(termo)
  // Telefone: por DÍGITOS, no banco (cliente_por_telefone) — o telefone é
  // gravado como foi digitado, com ou sem máscara.
  if (!letras && digitos.length >= 10) {
    const { data: achado, error } = await c.admin.rpc('cliente_por_telefone', { p_tenant: c.ctx.tenantId!, p_digitos: digitos })
    if (error) return { erro: 'Não consegui procurar o cliente agora.' }
    if (!achado) return { erro: `Nenhum cliente com o telefone ${termo}.` }
    return await ler(c.admin.from('clients').select('id, name, phone').eq('id', achado as string).single(), 'ler o cliente') as { id: string; name: string; phone: string | null }
  }
  const q = c.admin.from('clients').select('id, name, phone').eq('tenant_id', c.ctx.tenantId!).eq('is_active', true)
    .ilike('name', `%${termo.replace(/[%_\\]/g, '')}%`)
  const achados = (await ler(q.limit(6), 'procurar o cliente') as { id: string; name: string; phone: string | null }[] | null) ?? []
  if (achados.length === 1) return achados[0]!
  if (!achados.length) return { erro: `Nenhum cliente com "${termo}".` }
  const exato = achados.filter(a => a.name.toLowerCase() === termo.toLowerCase())
  if (exato.length === 1) return exato[0]!
  return { erro: `Mais de um cliente com "${termo}": ${achados.map(a => `${a.name}${a.phone ? ` (${a.phone})` : ''} [id ${a.id}]`).join('; ')}. Qual?` }
}
