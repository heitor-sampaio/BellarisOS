'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { recusaDaConfigDaRede } from '@/lib/configuracao-da-rede'
import { LIMITE_DE_DIAS } from '@/lib/acima-do-comum'
import { conferirLimiteDaBusca, tagsDaBusca } from '@/lib/automacoes/busca-do-passo'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIMITES_PADRAO } from '@estetica-os/types'
import type {
  GrafoDeAutomacao, StatusDaAutomacao, LimitesDaAutomacao, StatusDaExecucao,
  ConfigBuscarClientes,
} from '@estetica-os/types'
import { validarGrafo, podeAtivar, gatilhosDoGrafo } from '@/lib/automacoes/validar'
import { achatarDados, type CampoVisto } from '@/lib/automacoes/disponiveis'
import { tagsAtivasDaRede } from '@/lib/tags/vocabulario'
import { modeloDeAutomacao, semWhatsapp } from '@/lib/automacoes/modelos'
import { deQuemEAExecucao } from '@/lib/automacoes/sobre-da-execucao'
import { caminhoDoFluxo } from '@/lib/automacoes/caminho-do-fluxo'
import { ensaioCabe } from '@/lib/automacoes/ensaio'
import { redeTemWhatsapp } from '@/lib/automacoes/canal-da-rede'
import { ler, tentar, contar } from '@/lib/db'
import { buscarClientes } from '@/lib/automacoes/tempo'
import { contarPublico, contarPublicoComConversa, contarPublicoComAparelho } from '@/lib/clientes/publico'
import type { CanalParaACliente, ContaAntesDeLigar } from '@/lib/automacoes/antes-de-ligar'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { unidadesParaCriar } from '@/lib/unidades/da-tela'

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

/**
 * Automações e o "O que já aconteceu" são da REDE, só no portal da rede (D-2,
 * o Heitor, 2026-10-29: "a automação é da clínica, mesmo que o alvo seja a
 * unidade"): quem não tem "A rede inteira" não as alcança, tenha o módulo que
 * tiver — nem pela action chamada direto (AUT-02 da varredura de 18/11).
 */
function assertDaRede(ctx: { branchId: string | null }): void {
  if (ctx.branchId !== null) throw semAcesso()
}

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
  /**
   * O fluxo em palavras: `['Mensagem recebida', 'Se', 'Mover de etapa']`.
   *
   * O card mostrava só o gatilho, e com o nome técnico do evento. Quem abre a
   * lista quer saber o que a automação FAZ — e "o que ela faz" é o caminho,
   * não o ponto de partida. Montado no servidor porque o grafo não precisa
   * atravessar a rede inteiro só para virar três palavras.
   */
  passos:      string[]
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
  assertDaRede(ctx)
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('automations')
    .select('id, nome, descricao, status, gatilhos, updated_at, grafo')
    .eq('tenant_id', ctx.tenantId!)
    .order('updated_at', { ascending: false })

  // Erro descartado aqui faria a tela dizer "nenhuma automação" com o motor
  // rodando — a conclusão errada para quem veio conferir se algo está ligado.
  if (error) return { automacoes: [], error: error.message }

  const ids = (data ?? []).map(a => a.id as string)
  const resumo = await resumoDeExecucoes(ctx.tenantId!, ids)

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
      passos:       caminhoDoFluxo(a.grafo as GrafoDeAutomacao | null),
    })),
  }
}

/**
 * Execuções dos últimos 7 dias por automação, contadas no banco
 * (`automacoes_execucoes`, 2026-10-22). Contava as linhas no app, e o
 * PostgREST corta em 1000: um lembrete diário passava disso numa semana.
 * Ensaio não é execução: a função deixa de fora (a lista diria que a
 * automação rodou sozinha quando alguém só conferiu o fluxo).
 */
async function resumoDeExecucoes(
  tenantId: string,
  ids: string[],
): Promise<Map<string, { total: number; falhas: number }>> {
  const mapa = new Map<string, { total: number; falhas: number }>()
  if (!ids.length) return mapa

  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await createAdminClient()
    .rpc('automacoes_execucoes', { p_tenant: tenantId, p_ids: ids, p_desde: desde })

  if (error) { console.error('[resumoDeExecucoes]', error.message); return mapa }

  for (const r of (data ?? []) as { automation_id: string; total: number; falhas: number }[]) {
    mapa.set(r.automation_id, { total: r.total, falhas: r.falhas })
  }
  return mapa
}

export async function getAutomacao(id: string): Promise<{
  automacao?: AutomacaoCompleta
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  assertDaRede(ctx)

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
  // Na sessão de suporte, a automação só se PAUSA (auditoria das regras,
  // 2026-11-18; D18; CLAUDE.md §14): o que ela manda chega à paciente.
  const doSuporte = bloqueioDoSuporte(ctx, 'criar uma automação (o suporte só pausa)')
  if (doSuporte) return { error: doSuporte }
  // A automação é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }

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

/**
 * Cria uma automação a partir de um modelo pronto (D-4). Nasce RASCUNHO, como
 * a vazia: o modelo é um ponto de partida que a clínica revisa antes de ligar.
 * O que chega do navegador é só a CHAVE do modelo — o grafo sai do servidor.
 */
export async function criarAutomacaoDeModelo(chave: string): Promise<{ id?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'MANAGE')
  // Na sessão de suporte, a automação só se PAUSA (auditoria das regras,
  // 2026-11-18; D18; CLAUDE.md §14): o que ela manda chega à paciente.
  const doSuporte = bloqueioDoSuporte(ctx, 'criar uma automação (o suporte só pausa)')
  if (doSuporte) return { error: doSuporte }
  // A automação é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }

  const modelo = modeloDeAutomacao(String(chave ?? ''))
  if (!modelo) return { error: 'Modelo não encontrado.' }
  // Sem WhatsApp conectado, as mensagens nascem como aviso no celular (A14).
  const grafo = (await redeTemWhatsapp(ctx.tenantId!)) ? modelo.grafo() : semWhatsapp(modelo.grafo())

  const { data, error } = await createAdminClient()
    .from('automations')
    .insert({
      tenant_id:  ctx.tenantId!,
      nome:       modelo.nome,
      descricao:  modelo.descricao,
      status:     'RASCUNHO',
      grafo,
      gatilhos:   gatilhosDoGrafo(grafo),
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
  // Na sessão de suporte, a automação só se PAUSA (auditoria das regras,
  // 2026-11-18; D18; CLAUDE.md §14): o que ela manda chega à paciente.
  const doSuporte = bloqueioDoSuporte(ctx, 'editar uma automação (o suporte só pausa)')
  if (doSuporte) return { error: doSuporte }
  // A automação é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  const admin = createAdminClient()

  const atual = await ler(admin
    .from('automations').select('id, tenant_id, status, versao, limites')
    .eq('id', input.id).maybeSingle(), 'buscar a automação')

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

  await guardarVersao({
    tenantId:  ctx.tenantId!,
    automacaoId: input.id,
    versao:    ((atual.versao as number) ?? 1) + 1,
    nome:      input.nome.trim(),
    grafo:     input.grafo,
    limites:   input.limites ?? LIMITES_PADRAO,
    porId:     ctx.internalUserId ?? null,
    porNome:   ctx.userName ?? null,
  })

  revalidatePath('/admin/automacoes')
  revalidatePath(`/admin/automacoes/${input.id}`)
  return {}
}

/** Quantos retratos guardar por automação. */
const MAX_VERSOES = 30

/**
 * Grava o retrato do grafo recém-salvo.
 *
 * **Nunca derruba o salvamento.** O grafo já está no banco quando isto roda; se
 * o histórico falhar, o que a clínica acabou de montar não pode se perder por
 * causa dele. O erro vai para o log, e é lá que se descobre.
 *
 * Poda em `MAX_VERSOES`: um fluxo editado a tarde inteira geraria dezenas de
 * retratos, e ninguém volta trinta salvamentos. Isto é configuração, não
 * registro financeiro nem de prontuário — o que não se apaga é outra coisa.
 */
async function guardarVersao(v: {
  tenantId: string; automacaoId: string; versao: number
  nome: string; grafo: GrafoDeAutomacao; limites: LimitesDaAutomacao
  porId: string | null; porNome: string | null
}): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('automation_versions').insert({
    tenant_id:       v.tenantId,
    automation_id:   v.automacaoId,
    versao:          v.versao,
    nome:            v.nome,
    grafo:           v.grafo,
    limites:         v.limites,
    criado_por:      v.porId,
    criado_por_nome: v.porNome,
  })

  // 23505 = já existe retrato desta versão. Entrega repetida, não falha.
  if (error && error.code !== '23505') {
    console.error('[guardarVersao]', error.message)
    return
  }

  const antigas = await ler(admin
    .from('automation_versions')
    .select('id')
    .eq('automation_id', v.automacaoId)
    .order('versao', { ascending: false })
    .range(MAX_VERSOES, MAX_VERSOES + 200), 'listar as versões antigas')

  if (antigas?.length) {
    await tentar(admin.from('automation_versions').delete().in('id', antigas.map(a => a.id as string)), 'podar as versões antigas')
  }
}

export interface VersaoNaLista {
  id:      string
  versao:  number
  nome:    string
  por:     string | null
  quando:  string
  /** Quantos nodes e ligações tinha — o resumo que cabe na lista. */
  nos:     number
  ligacoes: number
  /** É o que está no ar agora? */
  atual:   boolean
}

export async function versoesDaAutomacao(automacaoId: string): Promise<VersaoNaLista[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  assertDaRede(ctx)
  const admin = createAdminClient()

  const auto = await ler(admin
    .from('automations').select('tenant_id, versao').eq('id', automacaoId).maybeSingle(), 'buscar a automação')
  if (!auto || auto.tenant_id !== ctx.tenantId) return []

  const { data, error } = await admin
    .from('automation_versions')
    .select('id, versao, nome, criado_por_nome, created_at, grafo')
    .eq('automation_id', automacaoId)
    .order('versao', { ascending: false })
    .limit(MAX_VERSOES)

  if (error) { console.error('[versoesDaAutomacao]', error.message); return [] }

  return (data ?? []).map(v => {
    const grafo = (v.grafo as GrafoDeAutomacao) ?? GRAFO_VAZIO
    return {
      id:       v.id as string,
      versao:   v.versao as number,
      nome:     v.nome as string,
      por:      (v.criado_por_nome as string) ?? null,
      quando:   v.created_at as string,
      nos:      grafo.nos?.length ?? 0,
      ligacoes: grafo.ligacoes?.length ?? 0,
      atual:    (v.versao as number) === (auto.versao as number),
    }
  })
}

/**
 * O conteúdo de uma versão, para o editor carregar.
 *
 * **Não salva nada.** A versão antiga entra na tela como rascunho e só vira
 * realidade quando a pessoa salvar — a mesma regra do resto do editor, onde
 * salvar é explícito. Restaurar por engano não pode trocar em silêncio um
 * fluxo que está no ar.
 */
export async function lerVersao(versaoId: string): Promise<{
  nome: string; grafo: GrafoDeAutomacao; limites: LimitesDaAutomacao
} | null> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'MANAGE')

  const { data, error } = await createAdminClient()
    .from('automation_versions')
    .select('nome, grafo, limites, tenant_id')
    .eq('id', versaoId)
    .maybeSingle()

  if (error) { console.error('[lerVersao]', error.message); return null }
  if (!data || data.tenant_id !== ctx.tenantId) return null

  return {
    nome:    data.nome as string,
    grafo:   (data.grafo as GrafoDeAutomacao) ?? GRAFO_VAZIO,
    limites: (data.limites as LimitesDaAutomacao) ?? LIMITES_PADRAO,
  }
}

export async function mudarStatusDaAutomacao(
  id: string,
  status: StatusDaAutomacao,
): Promise<{ error?: string; problemas?: string[] }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'MANAGE')
  // A automação é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  const admin = createAdminClient()

  // Ligar faz a automação mandar mensagem à paciente: o suporte não liga
  // (D18, o Heitor na 2ª volta). Pausar, pode — é a única coisa que o suporte
  // faz numa automação (auditoria das regras, 2026-11-18).
  if (status === 'ATIVA') {
    const travado = bloqueioDoSuporte(ctx, 'ligar uma automação')
    if (travado) return { error: travado }
  }

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
  // Na sessão de suporte, a automação só se PAUSA (auditoria das regras,
  // 2026-11-18; D18; CLAUDE.md §14): o que ela manda chega à paciente.
  const doSuporte = bloqueioDoSuporte(ctx, 'excluir uma automação (o suporte só pausa)')
  if (doSuporte) return { error: doSuporte }
  // A automação é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  const admin = createAdminClient()

  const data = await ler(admin
    .from('automations').select('id, tenant_id, status')
    .eq('id', id).maybeSingle(), 'buscar a automação')

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
  /**
   * Os funis da rede, na ordem do quadro. Arquivado vem junto e marcado: a
   * automação que já aponta para uma etapa dele precisa continuar mostrando
   * para onde move — esconder o funil deixaria o seletor vazio sem explicar.
   */
  funis:    { id: string; nome: string; arquivado: boolean }[]
  etapas:   { id: string; nome: string; funil: string; funilId: string }[]
  cargos:   { id: string; nome: string }[]
  pessoas:  { id: string; nome: string }[]
  tags:     string[]
  unidades: { id: string; nome: string }[]
  /** Os procedimentos ativos da rede, pelo nome: o valor da regra de procedimento (A14). */
  procedimentos: string[]
  /** A rede tem WhatsApp conectado? Sem ele, o passo em WhatsApp avisa (A14). */
  whatsappConectado: boolean
}

export async function opcoesDoEditor(): Promise<OpcoesDoEditor> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  assertDaRede(ctx)
  const admin = createAdminClient()
  const tenant = ctx.tenantId!

  const [funis, etapas, cargos, pessoas, vocabulario, unidades, procedimentos, whatsappConectado] = await Promise.all([
    admin.from('crm_funnels').select('id, name, archived_at').eq('tenant_id', tenant).order('position'),
    admin.from('crm_stages').select('id, name, funnel_id, position').eq('tenant_id', tenant).order('position'),
    admin.from('tenant_roles').select('id, label').eq('tenant_id', tenant).order('label'),
    admin.from('users').select('id, name').eq('tenant_id', tenant).eq('is_active', true).order('name'),
    // O vocabulário da rede (Configurações → Tags), que já traz as que ela
    // criou à mão ("Pós-operatório"): o gatilho registra toda tag gravada. A
    // de unidade não entra — é derivada dos agendamentos, e oferecê-la como
    // ação faria a automação brigar com o gatilho que a mantém.
    tagsAtivasDaRede(tenant),
    admin.from('branches').select('id, name').eq('tenant_id', tenant).eq('is_active', true).order('name'),
    admin.from('procedures').select('name').eq('tenant_id', tenant).eq('is_active', true).order('name'),
    redeTemWhatsapp(tenant),
  ])

  const tags = new Set<string>(vocabulario)

  const listaDeFunis = (funis.data ?? []).map(f => ({
    id:        f.id as string,
    nome:      f.name as string,
    arquivado: f.archived_at !== null,
  }))
  const ordemDoFunil = new Map(listaDeFunis.map((f, i) => [f.id, i]))

  return {
    funis: listaDeFunis,
    // Ordenadas pelo funil e, dentro dele, pela posição no quadro — a mesma
    // ordem que a pessoa vê no CRM. O `order('position')` do banco sozinho
    // intercala os funis, porque a posição recomeça em cada um.
    etapas: (etapas.data ?? [])
      .slice()
      .sort((a, b) =>
        (ordemDoFunil.get(a.funnel_id as string) ?? 99) -
        (ordemDoFunil.get(b.funnel_id as string) ?? 99) ||
        ((a.position as number | null) ?? 0) - ((b.position as number | null) ?? 0))
      .map(e => ({
        id:      e.id as string,
        nome:    e.name as string,
        funilId: (e.funnel_id as string | null) ?? '',
        funil:   listaDeFunis.find(f => f.id === e.funnel_id)?.nome ?? 'Funil',
      })),
    cargos:   (cargos.data ?? []).map(r => ({ id: r.id as string, nome: r.label as string })),
    pessoas:  (pessoas.data ?? []).map(u => ({ id: u.id as string, nome: u.name as string })),
    tags:     [...tags].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    unidades: (unidades.data ?? []).map(b => ({ id: b.id as string, nome: b.name as string })),
    procedimentos: [...new Set((procedimentos.data ?? []).map(p => p.name as string))],
    whatsappConectado,
  }
}

/**
 * O que o ÚLTIMO fato real daquele evento carregava.
 *
 * O catálogo (`CAMPOS_DO_EVENTO`) declara o que cada evento deveria trazer, com
 * rótulo em português. Isto aqui é o complemento honesto: `DadosDeEvento` tem
 * índice livre, um emissor pode acrescentar campo sem passar pelo catálogo, e
 * quem monta o fluxo precisa enxergar o que **de fato** chega — com um exemplo
 * ao lado, que é o que responde "é este campo mesmo?" sem abrir o banco.
 *
 * Uma linha, uma consulta, e só quando o gatilho muda. O índice
 * `domain_events_nome_idx (tenant_id, nome, ocorrido_em desc)` já existe.
 *
 * ⚠️ O exemplo é dado real de cliente — vem truncado, exige `automations: VIEW`
 * e **não é gravado no grafo**: existe só enquanto o painel está aberto.
 */
export async function amostraDoEvento(nome: string): Promise<CampoVisto[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  assertDaRede(ctx)
  if (!nome) return []

  const { data, error } = await createAdminClient()
    .from('domain_events')
    .select('dados')
    .eq('tenant_id', ctx.tenantId!)
    .eq('nome', nome)
    .order('ocorrido_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Sem fato nenhum não é erro: evento que ainda não aconteceu é o caso comum
  // numa rede nova, e a lista declarada continua servindo.
  if (error) {
    console.error('[amostraDoEvento]', error.message)
    return []
  }

  return achatarDados(data?.dados ?? null, 'evento.dados', 0, await fusoDaRede(ctx.tenantId!))
}

// ─── Histórico e ensaio ─────────────────────────────────────────────────────

export interface ExecucaoNaLista {
  id:         string
  status:     StatusDaExecucao
  simulacao:  boolean
  erro:       string | null
  criadaEm:   string
  fimEm:      string | null
  /** Do que o fluxo estava falando: o cliente, quando há um. */
  sobre:      string | null
  /** A que espera: quando volta a andar (A14 da 20ª). */
  retomaEm:   string | null
  /** A que espera um agendamento: a situação dele AGORA (o cancelado vai só reconferir). */
  situacaoDoAgendamento: string | null
}

export interface PassoDaExecucao {
  ordem:  number
  noId:   string
  tipo:   string
  status: string
  resumo: Record<string, unknown>
  ms:     number | null
}

export async function listarExecucoes(
  automationId: string,
  opcoes?: { incluirEnsaios?: boolean },
): Promise<{ execucoes: ExecucaoNaLista[]; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  assertDaRede(ctx)
  const admin = createAdminClient()

  let q = admin
    .from('automation_runs')
    .select('id, status, simulacao, erro, created_at, fim_em, rodar_apos, contexto')
    .eq('automation_id', automationId)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })
    .limit(40)

  // Ensaio fica de fora por padrão: ele é do momento de montar o fluxo, e
  // misturado ao histórico faria a clínica achar que a automação rodou sozinha.
  if (!opcoes?.incluirEnsaios) q = q.eq('simulacao', false)

  const { data, error } = await q
  if (error) return { execucoes: [], error: error.message }

  type Contexto = { cliente?: { nome?: string }; lead?: { nome?: string }; evento?: { entidade?: string; entidadeId?: string } } | null
  // A14 da 20ª: a que espera um agendamento diz se ele ainda está de pé.
  const doAgendamento = (r: { status: unknown; contexto: unknown }) => {
    const e = (r.contexto as Contexto)?.evento
    return r.status === 'esperando' && e?.entidade === 'agendamento' && e.entidadeId ? e.entidadeId : null
  }
  const ids = [...new Set((data ?? []).map(doAgendamento).filter((id): id is string => !!id))]
  const situacoes = new Map<string, string>()
  if (ids.length) {
    const ags = await ler(admin.from('appointments').select('id, status, branches!inner(tenant_id)')
      .eq('branches.tenant_id', ctx.tenantId!).in('id', ids), 'ler a situação dos agendamentos das execuções') as { id: string; status: string }[] | null
    for (const a of ags ?? []) situacoes.set(a.id, a.status)
  }

  // A18 da 29ª: a linha diz de quem é — sem o nome no contexto (o lembrete
  // que espera), a cliente do fato ou a do agendamento dele, na rede da sessão.
  const alvos = new Map((data ?? []).map(r => [r.id as string, deQuemEAExecucao(r.contexto)]))
  const semNome = [...alvos.values()]
  const idsDosAgendamentos = [...new Set(semNome.map(a => a.agendamentoId).filter((id): id is string => !!id))]
  const clienteDoAgendamento = new Map<string, string>()
  if (idsDosAgendamentos.length) {
    const ags = await ler(admin.from('appointments').select('id, client_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', ctx.tenantId!).in('id', idsDosAgendamentos), 'ler a cliente dos agendamentos das execuções') as { id: string; client_id: string | null }[] | null
    for (const a of ags ?? []) if (a.client_id) clienteDoAgendamento.set(a.id, a.client_id)
  }
  const clienteDe = (a: { clienteId: string | null; agendamentoId: string | null }) =>
    a.clienteId ?? (a.agendamentoId ? clienteDoAgendamento.get(a.agendamentoId) ?? null : null)
  const idsDasClientes = [...new Set(semNome.map(clienteDe).filter((id): id is string => !!id))]
  const nomeDaCliente = new Map<string, string>()
  if (idsDasClientes.length) {
    const cs = await ler(admin.from('clients').select('id, name').eq('tenant_id', ctx.tenantId!).in('id', idsDasClientes),
      'ler o nome das clientes das execuções') as { id: string; name: string | null }[] | null
    for (const c of cs ?? []) if (c.name) nomeDaCliente.set(c.id, c.name)
  }
  const sobreDa = (id: string): string | null => {
    const a = alvos.get(id)
    if (!a) return null
    if (a.nome) return a.nome
    const cliente = clienteDe(a)
    return cliente ? nomeDaCliente.get(cliente) ?? null : null
  }

  return {
    execucoes: (data ?? []).map(r => {
      const agendamento = doAgendamento(r)
      return {
        id:        r.id as string,
        status:    r.status as StatusDaExecucao,
        simulacao: !!r.simulacao,
        erro:      (r.erro as string | null) ?? null,
        criadaEm:  r.created_at as string,
        fimEm:     (r.fim_em as string | null) ?? null,
        sobre:     sobreDa(r.id as string),
        retomaEm:  r.status === 'esperando' ? ((r.rodar_apos as string | null) ?? null) : null,
        situacaoDoAgendamento: agendamento ? (situacoes.get(agendamento) ?? null) : null,
      }
    }),
  }
}

export async function passosDaExecucao(runId: string): Promise<{
  passos: PassoDaExecucao[]
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  assertDaRede(ctx)
  const admin = createAdminClient()

  // A execução tem de ser da rede de quem pergunta. O passo a passo carrega
  // nome de cliente e texto de mensagem; um id de outra clínica não pode
  // devolver isso.
  const run = await ler(admin
    .from('automation_runs').select('id, tenant_id').eq('id', runId).maybeSingle(), 'buscar a execução')
  if (!run || run.tenant_id !== ctx.tenantId) return { passos: [], error: 'Execução não encontrada.' }

  const { data, error } = await admin
    .from('automation_run_steps')
    .select('ordem, no_id, tipo, status, resumo, ms')
    .eq('run_id', runId)
    .order('ordem')

  if (error) return { passos: [], error: error.message }

  return {
    passos: (data ?? []).map(p => ({
      ordem:  p.ordem as number,
      noId:   p.no_id as string,
      tipo:   p.tipo as string,
      status: p.status as string,
      resumo: (p.resumo as Record<string, unknown>) ?? {},
      ms:     (p.ms as number | null) ?? null,
    })),
  }
}

/**
 * Ensaia a automação com um fato REAL da corrente.
 *
 * As condições são avaliadas de verdade — é isso que responde "por que não
 * disparou". O que não acontece são os efeitos: a mensagem não sai, a etapa
 * não muda. Ensaiar com dados inventados provaria só que o desenho é bonito.
 *
 * Funciona com a automação DESLIGADA, e é aí que ele mais serve: conferir
 * antes de ligar é o ponto.
 */
export async function ensaiarAutomacao(automationId: string): Promise<{
  runId?: string
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'MANAGE')
  // A automação é da clínica toda (H7): quem tem unidade fixa não muda.
  const daRede = recusaDaConfigDaRede(ctx)
  if (daRede) return { error: daRede }
  const admin = createAdminClient()

  const auto = await ler(admin
    .from('automations').select('id, tenant_id, grafo, gatilhos')
    .eq('id', automationId).maybeSingle(), 'buscar a automação')

  if (!auto || auto.tenant_id !== ctx.tenantId) return { error: 'Automação não encontrada.' }

  const grafo = auto.grafo as GrafoDeAutomacao
  // A regra do painel (ensaioCabe): a tela nem mostra o botão sem gatilho de fato.
  if (!ensaioCabe(grafo)) {
    return { error: 'O ensaio precisa de um gatilho de evento — um gatilho de horário não tem fato para repetir.' }
  }
  const gatilho = grafo.nos.find(n => n.tipo === 'gatilho.evento')!

  const nome = (gatilho.config as { evento?: string })?.evento
  if (!nome) return { error: 'Escolha o evento do gatilho antes de ensaiar.' }

  // O fato mais recente daquele tipo. Sem nenhum, o ensaio não tem o que
  // repetir — e dizer isso é mais útil que inventar um evento de mentira:
  // significa que o gatilho ainda não aconteceu nesta rede.
  const evento = await ler(admin
    .from('domain_events')
    .select('id, nome, entidade, entidade_id, dados, ator_nome, ator_tipo, origem, ocorrido_em, branch_id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('nome', nome)
    .order('ocorrido_em', { ascending: false })
    .limit(1)
    .maybeSingle(), 'buscar o evento')

  if (!evento) {
    return { error: `"${nome}" ainda não aconteceu nesta rede — não há fato para ensaiar. Veja em Automações → O que já aconteceu.` }
  }

  const { data: run, error } = await admin
    .from('automation_runs')
    .insert({
      tenant_id:     ctx.tenantId!,
      automation_id: automationId,
      // Sem `evento_id`: o índice de idempotência é para execução real, e
      // travaria o segundo ensaio com o mesmo fato — que é exatamente o que
      // se faz ao ajustar uma condição e conferir de novo.
      evento_id:     null,
      simulacao:     true,
      no_atual:      gatilho.id,
      profundidade:  0,
      status:        'esperando',
      contexto: {
        evento: {
          id:         evento.id,
          nome:       evento.nome,
          entidade:   evento.entidade,
          entidadeId: evento.entidade_id,
          dados:      evento.dados,
          ator:       evento.ator_nome,
          atorTipo:   evento.ator_tipo,
          origem:     evento.origem,
          quando:     evento.ocorrido_em,
        },
      },
    })
    .select('id')
    .single()

  if (error || !run) return { error: `Não consegui abrir o ensaio: ${error?.message}` }

  // O ensaio roda ATIVO ou não: conferir antes de ligar é o ponto, e o
  // executor recusa run de automação desligada. Por isso ele é chamado por
  // aqui com a checagem própria, e não pelo caminho do despacho.
  const { executarRun } = await import('@/lib/automacoes/executar')
  await executarRun(run.id as string, { ignorarStatus: true })

  revalidatePath(`/admin/automacoes/${automationId}`)
  return { runId: run.id as string }
}

/**
 * Quantas clientes a busca do passo "Buscar clientes" acharia HOJE (A21 da 11ª
 * simulação, 2026-11-10: a automação não dizia quem receberia — só o
 * assistente da campanha contava). Só LÊ: a mesma `buscarClientes` do motor,
 * com o teto do passo.
 */
export async function contarBuscaDeClientes(cfg: unknown): Promise<{ quantas: number; truncado: boolean; semNascimento?: number } | { error: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  assertDaRede(ctx)
  const busca = await buscaDoPasso(ctx.tenantId!, cfg)
  if ('error' in busca) return busca
  const [{ clientes, truncado }, semNascimento] = await Promise.all([
    buscarClientes(ctx.tenantId!, busca.cfg, busca.fuso),
    // A26 da 30ª (princípio 3): o aniversário é a data de nascimento da ficha, e
    // a cliente ativa sem ela nunca entra na busca — a tela diz quantas são.
    busca.cfg.aniversarioHoje
      ? contar(createAdminClient().from('clients').select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId!).eq('is_active', true).is('birth_date', null), 'contar as fichas sem a data de nascimento')
      : Promise.resolve(undefined),
  ])
  return { quantas: clientes.length, truncado, ...(semNascimento === undefined ? {} : { semNascimento }) }
}

/** A config do passo "Buscar clientes" vinda da tela, conferida. A busca é da rede (sem unidade — T1 do Bloco Tags). */
async function buscaDoPasso(tenantId: string, cfg: unknown): Promise<{ cfg: ConfigBuscarClientes; fuso: string } | { error: string }> {
  const c = (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>
  const dias = Number(c.semRetornoHaDias)
  const vence = Number(c.pacoteVenceEmDias)
  // O "No máximo" vale o gravado, e as tags vão todas (princípios 2 e 3; o Heitor, 25/11: "Se não for impossível,
  // ainda que improvável, pode ser feito."): cortavam em 500 e em 50, calados. Só o impossível se recusa.
  const limite = conferirLimiteDaBusca(c.limite)
  if ('recusa' in limite) return { error: limite.recusa }
  const tags = tagsDaBusca(c.tags)
  return {
    cfg: {
      semRetornoHaDias: Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : undefined,
      aniversarioHoje: c.aniversarioHoje === true,
      // A validade do pacote vai até 100 anos (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode
      // ser feito."): o "vence em" não corta antes disso.
      pacoteVenceEmDias: Number.isFinite(vence) && vence > 0 ? Math.min(Math.floor(vence), LIMITE_DE_DIAS) : undefined,
      tags,
      limite: limite.limite,
    },
    fuso: await fusoDaRede(tenantId),
  }
}

/**
 * Antes de ligar uma automação que chega à cliente (C65 — H1 do levantamento,
 * F69; A10 da 14ª, F71: todo canal, não só o WhatsApp): quantas a busca
 * acharia hoje e, entre elas, quantas a mensagem alcança por canal do fluxo —
 * a conversa aberta do WhatsApp (a automação não abre conversa nova) e o
 * aparelho do aviso no celular (o app ou o navegador, a régua do disparo da
 * campanha). Sem isto a clínica ligava "Reativação" para 200 e descobria nas
 * execuções que saíram 12.
 *
 * Com o passo "Buscar clientes", a busca dele (com o teto); sem ele (o fluxo
 * que nasce de um fato), as clientes ativas da clínica. Os canais vêm do
 * editor (`canaisParaACliente`); sem eles, o WhatsApp, como antes.
 */
export async function contarAntesDeLigar(cfgDaBusca: unknown | null, canais: CanalParaACliente[] = ['whatsapp']): Promise<
  ContaAntesDeLigar | { error: string }
> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'automations', 'VIEW')
  assertDaRede(ctx)
  const tenant = ctx.tenantId!
  const porCanal = async (filtros: { client_ids?: string[] }) => {
    const vazio = filtros.client_ids !== undefined && filtros.client_ids.length === 0
    const [comConversa, comAparelho] = await Promise.all([
      canais.includes('whatsapp') ? (vazio ? 0 : contarPublicoComConversa(tenant, filtros)) : undefined,
      canais.includes('push') ? (vazio ? 0 : contarPublicoComAparelho(tenant, filtros)) : undefined,
    ])
    return { comConversa, comAparelho }
  }
  // A15 da 20ª: o horário das unidades, para a janela dizer quem atende no silêncio.
  const unidades = (await unidadesParaCriar<{ horario: unknown }>(tenant, 'horario')).map(u => ({ nome: u.name, horario: u.horario }))
  if (cfgDaBusca == null) {
    const [quantas, conta] = await Promise.all([contarPublico(tenant, {}), porCanal({})])
    return { porBusca: false, quantas, truncado: false, ...conta, unidades }
  }
  const busca = await buscaDoPasso(tenant, cfgDaBusca)
  if ('error' in busca) return busca
  const achadas = await buscarClientes(tenant, busca.cfg, busca.fuso)
  const ids = achadas.clientes.map(c => c.id)
  // Contadas entre AS QUE A BUSCA ACHOU (com o teto do passo), não no público
  // inteiro: é a essas que a mensagem iria.
  return { porBusca: true, quantas: ids.length, truncado: achadas.truncado, ...(await porCanal({ client_ids: ids })), unidades }
}
