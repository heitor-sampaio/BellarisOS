import { createAdminClient } from '@/lib/supabase/admin'
import { dayKeyTZ } from '@/lib/datetime'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { ler } from '@/lib/db'
import { EMBED_TAGS_DA_PESSOA, tagsDaPessoaDaOportunidade } from '@/lib/tags/pessoa'

/**
 * O contexto de uma execução: o que as condições leem e o que as variáveis
 * interpolam.
 *
 * **Hidratação sob demanda.** O evento carrega um retrato magro de propósito —
 * `DadosClinicos` nem leva telefone — e buscar tudo em toda execução seria
 * meia dúzia de consultas para um fluxo que talvez só precise do nome. Cada
 * resolvedor roda no máximo uma vez por execução; o resultado fica no próprio
 * contexto, que é persistido no run.
 *
 * ⚠️ **PRONTUÁRIO NÃO ENTRA.** Anamnese, evolução, foto e termo ficam fora,
 * pela mesma razão que ficaram fora do evento: a automação existe para avisar
 * que a ficha chegou, não para contar o que tem nela. Há eventos clínicos e
 * eles disparam automação normalmente — o que não atravessa é o CONTEÚDO.
 */

export interface EventoDoGatilho {
  id:         string
  nome:       string
  entidade:   string
  entidadeId: string | null
  dados:      Record<string, unknown>
  atorNome:   string | null
  atorTipo:   string
  origem:     string
  ocorridoEm: string
  branchId:   string | null
}

export type ContextoDaExecucao = Record<string, unknown>

/** As entidades que o contexto sabe hidratar. */
type Entidade = 'cliente' | 'agendamento' | 'lead' | 'conversa' | 'plano' | 'produto' | 'membro'

/**
 * Onde procurar o id de cada entidade, em ordem de preferência.
 *
 * O retrato do evento às vezes traz o id pronto (`dados.clienteId`), às vezes
 * a própria entidade É o alvo (`entidade_id` de um `cliente.criado`). As duas
 * formas convivem porque as duas acontecem.
 */
const ONDE_ACHAR: Record<Entidade, { entidade: string; chaves: string[] }> = {
  cliente:     { entidade: 'cliente',     chaves: ['clienteId'] },
  agendamento: { entidade: 'agendamento', chaves: ['agendamentoId'] },
  lead:        { entidade: 'lead',        chaves: ['leadId'] },
  conversa:    { entidade: 'conversa',    chaves: ['conversaId'] },
  plano:       { entidade: 'plano',       chaves: ['planoId'] },
  produto:     { entidade: 'estoque',     chaves: ['produtoId'] },
  membro:      { entidade: 'membro',      chaves: ['membroId', 'profissionalId'] },
}

const ROTULO_DA_ENTIDADE: Record<Entidade, string> = {
  cliente: 'a cliente', agendamento: 'o agendamento', lead: 'a oportunidade', conversa: 'a conversa',
  plano: 'o plano', produto: 'o produto', membro: 'o membro da equipe',
}

function idDaEntidade(evento: EventoDoGatilho, alvo: Entidade): string | null {
  const regra = ONDE_ACHAR[alvo]
  if (evento.entidade === regra.entidade && evento.entidadeId) return evento.entidadeId
  for (const chave of regra.chaves) {
    const v = evento.dados[chave]
    if (typeof v === 'string' && v) return v
  }
  return null
}

/**
 * A oportunidade de um fato que só conhece a CONVERSA.
 *
 * Os eventos de conversa (`conversa.mensagem_recebida`, o gatilho mais comum
 * de CRM: "respondeu → mover para Em contato") não carregam `leadId`. Sem este
 * caminho, mover etapa, marcar desfecho, definir responsável e anotar
 * terminavam SEMPRE em "este fluxo não tem oportunidade" — e o editor
 * oferecia as quatro para esse gatilho.
 *
 * A oportunidade ligada à conversa, senão a aberta mais recente da PESSOA: a
 * oportunidade é da pessoa (§9.2.1), e a conversa em que ela escreveu pode não
 * ser a de origem do card.
 */
async function oportunidadeDaConversa(
  admin: ReturnType<typeof createAdminClient>,
  evento: EventoDoGatilho,
  tenantId: string,
): Promise<string | null> {
  const conversaId = idDaEntidade(evento, 'conversa')
  if (!conversaId) return null

  const conv = await ler(admin
    .from('conversations').select('lead_id, contato_id')
    .eq('id', conversaId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a conversa do fato')
  if (!conv) return null
  if (conv.lead_id) return conv.lead_id as string
  if (!conv.contato_id) return null

  const abertas = await ler(admin
    .from('leads').select('id, crm_stages!inner(outcome)')
    .eq('tenant_id', tenantId)
    .eq('contato_id', conv.contato_id as string)
    .eq('crm_stages.outcome', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1), 'buscar a oportunidade aberta da pessoa')
  return (abertas?.[0]?.id as string | undefined) ?? null
}

/**
 * A oportunidade de um fato que só conhece a CLIENTE (crm-05, 2026-11-03).
 *
 * O card não anda sozinho ("não existe movimento automático padrão nos funis";
 * quem quer, faz pela automação): "Atendimento concluído → Mover para Fechado"
 * precisa achar o card de um fato de agenda, que carrega só `clienteId`. É a
 * oportunidade ABERTA mais recente da cliente — a mesma regra do agendar
 * (`oportunidadeDoAgendamento`). Ganho e perdido não entram: um fato da agenda
 * não reabre negócio fechado.
 */
async function oportunidadeDaCliente(
  admin: ReturnType<typeof createAdminClient>,
  evento: EventoDoGatilho,
  tenantId: string,
): Promise<string | null> {
  const clienteId = idDaEntidade(evento, 'cliente')
  if (!clienteId) return null
  const abertas = await ler(admin
    .from('leads').select('id, crm_stages!inner(outcome)')
    .eq('tenant_id', tenantId)
    .eq('client_id', clienteId)
    .eq('crm_stages.outcome', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1), 'buscar a oportunidade aberta da cliente')
  return (abertas?.[0]?.id as string | undefined) ?? null
}

/**
 * Garante que `contexto[alvo]` existe, buscando no banco se preciso.
 *
 * Devolve o próprio contexto, mutado. Quando não há id para a entidade, grava
 * `null` — e isso importa: sem marcar, toda leitura seguinte tentaria buscar
 * de novo, e uma condição sobre `cliente.email` num evento sem cliente faria
 * uma consulta por passo.
 *
 * ⚠️ **A entidade que o fato cita e que NÃO CARREGA faz o passo falhar**
 * (D3 da 16ª simulação, 2026-11-15). Até ali o erro da consulta (e o registro
 * que sumiu) virava `null` em silêncio: o `users(name)` ambíguo zerava todo
 * agendamento, o lembrete saía "horário de  em ." e o "Se ainda está de pé"
 * passava com o status nulo — também para o agendamento CANCELADO. Agora
 * `hidratar` lança, nada fica no contexto (a próxima tentativa busca de novo),
 * e o motor grava o erro no passo e encerra a execução como `falhou`.
 */
export async function hidratar(
  contexto: ContextoDaExecucao,
  evento: EventoDoGatilho,
  tenantId: string,
  alvo: Entidade,
): Promise<ContextoDaExecucao> {
  if (alvo in contexto) return contexto

  const admin = createAdminClient()

  const id = idDaEntidade(evento, alvo)
    ?? (alvo === 'lead'
      ? (await oportunidadeDaConversa(admin, evento, tenantId)) ?? (await oportunidadeDaCliente(admin, evento, tenantId))
      : null)
  if (!id) { contexto[alvo] = null; return contexto }

  /** O registro que o fato cita tem de existir: sem ele, o passo falha (não segue nulo). */
  const exigir = <T,>(data: T): NonNullable<T> => {
    if (!data) throw new Error(`Não encontrei ${ROTULO_DA_ENTIDADE[alvo]} do fato (${id}).`)
    return data
  }

  try {
    if (alvo === 'cliente') {
      const data = exigir(await ler(admin
        .from('clients')
        .select('id, name, phone, email, birth_date, gender, tags, is_active')
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar o cliente'))
      contexto.cliente = {
        id:        data.id,
        nome:      data.name,
        telefone:  data.phone,
        email:     data.email,
        nascimento: data.birth_date,
        genero:    data.gender,
        tags:      data.tags ?? [],
        ativo:     data.is_active,
        // Pré-calculado porque "é aniversário hoje?" é a condição mais pedida
        // e ninguém deveria precisar escrever data em regra de automação. A
        // cliente é da REDE: o dia é o do relógio da rede, nunca o da unidade
        // em que a ficha nasceu (auditoria das regras, 18/11; H16).
        aniversarioHoje: ehAniversarioHoje(data.birth_date as string | null, new Date(), await fusoDaRede(tenantId)),
      }
      return contexto
    }

    if (alvo === 'agendamento') {
      // `appointments` tem DUAS chaves para `users` (professional_id e
      // created_by_id): `users(name)` é ambíguo (PGRST201) — D3 da 16ª.
      const data = exigir(await ler(admin
        .from('appointments')
        .select('id, scheduled_at, status, price, client_id, branch_id, professional_id, procedures(name), users!appointments_professional_id_fkey(name)')
        .eq('id', id).maybeSingle(), 'buscar o agendamento'))
      contexto.agendamento = {
        id:           data.id,
        data:         data.scheduled_at,
        status:       data.status,
        valor:        data.price != null ? Number(data.price) : null,
        clienteId:    data.client_id,
        unidadeId:    data.branch_id,
        profissional: (data.users as unknown as { name?: string } | null)?.name ?? null,
        procedimento: (data.procedures as unknown as { name?: string } | null)?.name ?? null,
      }
      return contexto
    }

    if (alvo === 'lead') {
      const data = exigir(await ler(admin
        .from('leads')
        .select(`id, name, phone, email, source, owner_id, crm_stage_id, client_id, contato_id, value, crm_stages(name), ${EMBED_TAGS_DA_PESSOA}`)
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar a oportunidade'))
      contexto.lead = {
        id:            data.id,
        nome:          data.name,
        telefone:      data.phone,
        email:         data.email,
        origem:        data.source,
        responsavelId: data.owner_id,
        etapaId:       data.crm_stage_id,
        etapa:         (data.crm_stages as unknown as { name?: string } | null)?.name ?? null,
        clienteId:     data.client_id,
        // A pessoa sem ficha: é nela que o "Adicionar tag" grava.
        contatoId:     data.contato_id,
        // As tags da PESSOA (crm-inbox.md §9.2.1): a oportunidade não tem tag própria.
        tags:          tagsDaPessoaDaOportunidade(data as unknown as Parameters<typeof tagsDaPessoaDaOportunidade>[0]),
        valor:         data.value != null ? Number(data.value) : null,
      }
      return contexto
    }

    if (alvo === 'conversa') {
      const data = exigir(await ler(admin
        .from('conversations')
        .select('id, channel, status, last_inbound_at, client_id, lead_id, provider')
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar a conversa'))
      contexto.conversa = {
        id:            data.id,
        canal:         data.channel,
        status:        data.status,
        ultimaEntrada: data.last_inbound_at,
        provedor:      data.provider,
        clienteId:     data.client_id,
        leadId:        data.lead_id,
      }
      return contexto
    }

    if (alvo === 'plano') {
      const data = exigir(await ler(admin
        .from('treatment_plans')
        .select('id, name, status, client_id, branch_id')
        .eq('id', id).maybeSingle(), 'buscar o plano'))
      contexto.plano = {
        id: data.id, nome: data.name, status: data.status,
        clienteId: data.client_id, unidadeId: data.branch_id,
      }
      return contexto
    }

    if (alvo === 'produto') {
      const data = exigir(await ler(admin
        .from('products')
        .select('id, name, unit, tenant_id')
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar o produto'))
      contexto.produto = { id: data.id, nome: data.name, unidade: data.unit }
      return contexto
    }

    // membro
    const data = exigir(await ler(admin
      .from('users')
      .select('id, name, email, branch_id, tenant_roles(label)')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar o usuário'))
    contexto.membro = {
      id: data.id, nome: data.name, email: data.email,
      unidadeId: data.branch_id,
      cargo: (data.tenant_roles as unknown as { label?: string } | null)?.label ?? null,
    }
    return contexto
  } catch (e) {
    console.error('[contexto] hidratar', alvo, (e as Error).message)
    delete contexto[alvo]
    const motivo = (e as Error).message
    throw new Error(motivo.startsWith('Não encontrei') ? motivo : `Não consegui carregar ${ROTULO_DA_ENTIDADE[alvo]} do fato: ${motivo}`)
  }
}

/**
 * Compara dia e mês no fuso da unidade da cliente (F62b; sem ela, o comum da
 * rede) — `new Date()` cru erraria por um dia. O nascimento é data sem hora.
 */
export function ehAniversarioHoje(nascimento: string | null, agora: Date = new Date(), fuso?: string): boolean {
  if (!nascimento) return false
  const hoje = dayKeyTZ(agora, fuso)            // 'YYYY-MM-DD'
  return hoje.slice(5) === String(nascimento).slice(5, 10)
}

/**
 * Hidrata tudo que um caminho precisa antes de avaliar.
 *
 * As condições e os textos referem entidades por nome (`cliente.nome`), então
 * o motor olha o prefixo do caminho e busca só aquilo. Caminho desconhecido é
 * ignorado em silêncio: `evento.*` e o que os passos anteriores somaram já
 * estão no contexto.
 */
export async function hidratarParaCaminhos(
  contexto: ContextoDaExecucao,
  evento: EventoDoGatilho,
  tenantId: string,
  caminhos: string[],
): Promise<ContextoDaExecucao> {
  const alvos = new Set<Entidade>()
  for (const caminho of caminhos) {
    const raiz = caminho.split('.')[0] as Entidade
    if (raiz in ONDE_ACHAR) alvos.add(raiz)
  }
  for (const alvo of alvos) {
    await hidratar(contexto, evento, tenantId, alvo)
  }
  return contexto
}

/** O contexto inicial: o evento cru, antes de qualquer hidratação. */
export function contextoDoEvento(evento: EventoDoGatilho): ContextoDaExecucao {
  return {
    evento: {
      id:        evento.id,
      nome:      evento.nome,
      entidade:  evento.entidade,
      entidadeId: evento.entidadeId,
      dados:     evento.dados,
      ator:      evento.atorNome,
      atorTipo:  evento.atorTipo,
      origem:    evento.origem,
      quando:    evento.ocorridoEm,
    },
  }
}
