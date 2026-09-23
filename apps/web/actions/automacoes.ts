'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIMITES_PADRAO } from '@estetica-os/types'
import type { GrafoDeAutomacao, StatusDaAutomacao, LimitesDaAutomacao } from '@estetica-os/types'
import { validarGrafo, podeAtivar, gatilhosDoGrafo } from '@/lib/automacoes/validar'
import { CLIENT_TAGS, isUnitTag } from '@estetica-os/utils'

/**
 * As automações, pela tela.
 *
 * ⚠️ Escrita aqui é só do GRAFO e do estado — nunca da corrente de eventos nem
 * de uma execução. Todo export de um arquivo `'use server'` vira endpoint
 * público; um gravador de execução exposto assim deixaria qualquer cliente
 * forjar o que a automação fez. O motor mora em `lib/automacoes/`, como o
 * emissor de eventos mora em `lib/events/`.
 */

const GRAFO_VAZIO: GrafoDeAutomacao = { nos: [], ligacoes: [] }

export interface AutomacaoNaLista {
  id:          string
  nome:        string
  descricao:   string | null
  status:      StatusDaAutomacao
  gatilhos:    string[]
  atualizadoEm: string
  /** Execuções nos últimos 7 dias, e quantas delas falharam. */
  execucoes:   number
  falhas:      number
}

export interface AutomacaoCompleta {
  id:         string
  nome:       string
  descricao:  string | null
  status:     StatusDaAutomacao
  grafo:      GrafoDeAutomacao
  limites:    LimitesDaAutomacao
}

export async function listarAutomacoes(): Promise<{
  automacoes: AutomacaoNaLista[]
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('automations')
    .select('id, nome, descricao, status, gatilhos, updated_at')
    .eq('tenant_id', ctx.tenantId!)
    .order('updated_at', { ascending: false })

  // Erro descartado aqui faria a tela dizer "nenhuma automação" com o motor
  // rodando — a conclusão errada para quem veio conferir se algo está ligado.
  if (error) return { automacoes: [], error: error.message }

  const ids = (data ?? []).map(a => a.id as string)
  const resumo = await resumoDeExecucoes(ids)

  return {
    automacoes: (data ?? []).map(a => ({
      id:           a.id as string,
      nome:         a.nome as string,
      descricao:    (a.descricao as string | null) ?? null,
      status:       a.status as StatusDaAutomacao,
      gatilhos:     (a.gatilhos as string[]) ?? [],
      atualizadoEm: a.updated_at as string,
      execucoes:    resumo.get(a.id as string)?.total ?? 0,
      falhas:       resumo.get(a.id as string)?.falhas ?? 0,
    })),
  }
}

/** Execuções dos últimos 7 dias por automação. */
async function resumoDeExecucoes(
  ids: string[],
): Promise<Map<string, { total: number; falhas: number }>> {
  const mapa = new Map<string, { total: number; falhas: number }>()
  if (!ids.length) return mapa

  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await createAdminClient()
    .from('automation_runs')
    .select('automation_id, status')
    .in('automation_id', ids)
    .gte('created_at', desde)

  if (error) { console.error('[resumoDeExecucoes]', error.message); return mapa }

  for (const r of data ?? []) {
    const id = r.automation_id as string
    const atual = mapa.get(id) ?? { total: 0, falhas: 0 }
    atual.total += 1
    if (r.status === 'falhou') atual.falhas += 1
    mapa.set(id, atual)
  }
  return mapa
}

export async function getAutomacao(id: string): Promise<{
  automacao?: AutomacaoCompleta
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')

  const { data, error } = await createAdminClient()
    .from('automations')
    .select('id, tenant_id, nome, descricao, status, grafo, limites')
    .eq('id', id)
    .maybeSingle()

  if (error) return { error: `Não foi possível abrir a automação: ${error.message}` }
  if (!data || data.tenant_id !== ctx.tenantId) return { error: 'Automação não encontrada.' }

  return {
    automacao: {
      id:        data.id as string,
      nome:      data.nome as string,
      descricao: (data.descricao as string | null) ?? null,
      status:    data.status as StatusDaAutomacao,
      grafo:     (data.grafo as GrafoDeAutomacao) ?? GRAFO_VAZIO,
      limites:   { ...LIMITES_PADRAO, ...(data.limites as LimitesDaAutomacao ?? {}) },
    },
  }
}

export async function criarAutomacao(nome: string): Promise<{ id?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'MANAGE')

  const titulo = nome.trim()
  if (!titulo) return { error: 'Dê um nome à automação.' }

  const { data, error } = await createAdminClient()
    .from('automations')
    .insert({
      tenant_id:  ctx.tenantId!,
      nome:       titulo,
      // Nasce RASCUNHO, sempre. Automação que nascesse ligada mandaria
      // mensagem antes de alguém terminar de montá-la.
      status:     'RASCUNHO',
      grafo:      GRAFO_VAZIO,
      limites:    LIMITES_PADRAO,
      criado_por: ctx.internalUserId,
    })
    .select('id')
    .single()

  if (error || !data) return { error: `Erro ao criar a automação: ${error?.message}` }

  revalidatePath('/admin/automacoes')
  return { id: data.id as string }
}

export async function salvarAutomacao(input: {
  id:        string
  nome:      string
  descricao?: string | null
  grafo:     GrafoDeAutomacao
  limites?:  LimitesDaAutomacao
}): Promise<{ error?: string; problemas?: string[] }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'MANAGE')
  const admin = createAdminClient()

  const { data: atual } = await admin
    .from('automations').select('id, tenant_id, status, versao')
    .eq('id', input.id).maybeSingle()

  if (!atual || atual.tenant_id !== ctx.tenantId) return { error: 'Automação não encontrada.' }

  const problemas = validarGrafo(input.grafo)
  const erros = problemas.filter(p => p.grau === 'erro')

  // Rascunho salva torto — montar um fluxo é ir e voltar, e recusar o
  // salvamento no meio faria perder o trabalho. O que a validação impede é
  // ATIVAR. Já uma automação LIGADA não pode virar inválida por um salvamento:
  // ela dispararia no estado quebrado.
  if (atual.status === 'ATIVA' && erros.length) {
    return {
      error: 'Esta automação está ligada: corrija os problemas antes de salvar.',
      problemas: erros.map(e => e.mensagem),
    }
  }

  const { error } = await admin
    .from('automations')
    .update({
      nome:      input.nome.trim(),
      descricao: input.descricao ?? null,
      grafo:     input.grafo,
      // Derivado do grafo, nunca escrito à mão: é o índice por onde o motor
      // acha quem assina um evento.
      gatilhos:  gatilhosDoGrafo(input.grafo),
      limites:   input.limites ?? LIMITES_PADRAO,
      versao:    ((atual.versao as number) ?? 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)

  if (error) return { error: `Erro ao salvar: ${error.message}` }

  revalidatePath('/admin/automacoes')
  revalidatePath(`/admin/automacoes/${input.id}`)
  return {}
}

export async function mudarStatusDaAutomacao(
  id: string,
  status: StatusDaAutomacao,
): Promise<{ error?: string; problemas?: string[] }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'MANAGE')
  const admin = createAdminClient()

  const { data, error: erroLeitura } = await admin
    .from('automations').select('id, tenant_id, grafo')
    .eq('id', id).maybeSingle()

  if (erroLeitura) return { error: erroLeitura.message }
  if (!data || data.tenant_id !== ctx.tenantId) return { error: 'Automação não encontrada.' }

  if (status === 'ATIVA') {
    const grafo = (data.grafo as GrafoDeAutomacao) ?? GRAFO_VAZIO
    if (!podeAtivar(grafo)) {
      return {
        error: 'Não dá para ligar: o fluxo tem problemas.',
        problemas: validarGrafo(grafo).filter(p => p.grau === 'erro').map(p => p.mensagem),
      }
    }
  }

  const { error } = await admin
    .from('automations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/automacoes')
  revalidatePath(`/admin/automacoes/${id}`)
  return {}
}

export async function excluirAutomacao(id: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'MANAGE')
  const admin = createAdminClient()

  const { data } = await admin
    .from('automations').select('id, tenant_id, status')
    .eq('id', id).maybeSingle()

  if (!data || data.tenant_id !== ctx.tenantId) return { error: 'Automação não encontrada.' }

  // Excluir uma automação LIGADA é apagar algo que está agindo no sistema
  // agora. Desligar primeiro é um passo a mais e uma decisão consciente.
  if (data.status === 'ATIVA') {
    return { error: 'Desligue a automação antes de excluir.' }
  }

  // As execuções vão junto por `on delete cascade` — são o histórico DELA, não
  // um registro do negócio. O que aconteceu de verdade (a mensagem enviada, a
  // etapa movida) está gravado no lugar próprio e na corrente de eventos.
  const { error } = await admin.from('automations').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/automacoes')
  return {}
}

/**
 * As listas que o painel precisa para oferecer escolhas de verdade.
 *
 * Uma só chamada, feita quando o editor abre: são poucos registros e pedi-los
 * um a um faria cada clique num node esperar uma ida ao banco.
 */
export interface OpcoesDoEditor {
  etapas:   { id: string; nome: string; funil: string }[]
  cargos:   { id: string; nome: string }[]
  pessoas:  { id: string; nome: string }[]
  tags:     string[]
  unidades: { id: string; nome: string }[]
}

export async function opcoesDoEditor(): Promise<OpcoesDoEditor> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  const admin = createAdminClient()
  const tenant = ctx.tenantId!

  const [etapas, cargos, pessoas, clientes, unidades] = await Promise.all([
    admin.from('crm_stages').select('id, name, crm_funnels(name)').eq('tenant_id', tenant).order('position'),
    admin.from('tenant_roles').select('id, label').eq('tenant_id', tenant).order('label'),
    admin.from('users').select('id, name').eq('tenant_id', tenant).eq('is_active', true).order('name'),
    // As tags que a rede realmente usa, não só o vocabulário padrão: quem
    // criou "Pós-operatório" à mão deveria poder automatizar em cima dela.
    admin.from('clients').select('tags').eq('tenant_id', tenant).not('tags', 'eq', '{}').limit(500),
    admin.from('branches').select('id, name').eq('tenant_id', tenant).eq('is_active', true).order('name'),
  ])

  const tags = new Set<string>(CLIENT_TAGS)
  for (const c of clientes.data ?? []) {
    for (const t of (c.tags as string[] | null) ?? []) {
      // A tag de unidade é derivada dos agendamentos, não escolhida: oferecer
      // "Unidade: Centro" como ação faria a automação brigar com o gatilho que
      // a mantém.
      if (!isUnitTag(t)) tags.add(t)
    }
  }

  return {
    etapas: (etapas.data ?? []).map(e => ({
      id:    e.id as string,
      nome:  e.name as string,
      funil: (e.crm_funnels as unknown as { name?: string } | null)?.name ?? 'Funil',
    })),
    cargos:   (cargos.data ?? []).map(r => ({ id: r.id as string, nome: r.label as string })),
    pessoas:  (pessoas.data ?? []).map(u => ({ id: u.id as string, nome: u.name as string })),
    tags:     [...tags].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    unidades: (unidades.data ?? []).map(b => ({ id: b.id as string, nome: b.name as string })),
  }
}

/** Problemas do grafo, para a tela acender o aviso enquanto se monta. */
export async function conferirGrafo(grafo: GrafoDeAutomacao): Promise<{
  problemas: { noId?: string; mensagem: string; grau: 'erro' | 'aviso' }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  return { problemas: validarGrafo(grafo) }
}
