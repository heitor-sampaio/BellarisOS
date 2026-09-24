import { createAdminClient } from '@/lib/supabase/admin'
import { dayKeyTZ } from '@/lib/datetime'
import { ler } from '@/lib/db'

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
 * Garante que `contexto[alvo]` existe, buscando no banco se preciso.
 *
 * Devolve o próprio contexto, mutado. Quando não há id para a entidade, grava
 * `null` — e isso importa: sem marcar, toda leitura seguinte tentaria buscar
 * de novo, e uma condição sobre `cliente.email` num evento sem cliente faria
 * uma consulta por passo.
 */
export async function hidratar(
  contexto: ContextoDaExecucao,
  evento: EventoDoGatilho,
  tenantId: string,
  alvo: Entidade,
): Promise<ContextoDaExecucao> {
  if (alvo in contexto) return contexto

  const id = idDaEntidade(evento, alvo)
  if (!id) { contexto[alvo] = null; return contexto }

  const admin = createAdminClient()

  try {
    if (alvo === 'cliente') {
      const data = await ler(admin
        .from('clients')
        .select('id, name, phone, email, birth_date, gender, tags, is_active, branch_id')
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar o cliente')
      contexto.cliente = data && {
        id:        data.id,
        nome:      data.name,
        telefone:  data.phone,
        email:     data.email,
        nascimento: data.birth_date,
        genero:    data.gender,
        tags:      data.tags ?? [],
        ativo:     data.is_active,
        unidadeId: data.branch_id,
        // Pré-calculado porque "é aniversário hoje?" é a condição mais pedida
        // e ninguém deveria precisar escrever data em regra de automação.
        aniversarioHoje: ehAniversarioHoje(data.birth_date as string | null),
      }
      return contexto
    }

    if (alvo === 'agendamento') {
      const data = await ler(admin
        .from('appointments')
        .select('id, scheduled_at, status, price, client_id, branch_id, professional_id, procedures(name), users(name)')
        .eq('id', id).maybeSingle(), 'buscar o agendamento')
      contexto.agendamento = data && {
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
      const data = await ler(admin
        .from('leads')
        .select('id, name, phone, email, source, owner_id, crm_stage_id, client_id, tags, value, crm_stages(name)')
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar a oportunidade')
      contexto.lead = data && {
        id:            data.id,
        nome:          data.name,
        telefone:      data.phone,
        email:         data.email,
        origem:        data.source,
        responsavelId: data.owner_id,
        etapaId:       data.crm_stage_id,
        etapa:         (data.crm_stages as unknown as { name?: string } | null)?.name ?? null,
        clienteId:     data.client_id,
        tags:          data.tags ?? [],
        valor:         data.value != null ? Number(data.value) : null,
      }
      return contexto
    }

    if (alvo === 'conversa') {
      const data = await ler(admin
        .from('conversations')
        .select('id, channel, status, last_inbound_at, client_id, lead_id, provider')
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar a conversa')
      contexto.conversa = data && {
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
      const data = await ler(admin
        .from('treatment_plans')
        .select('id, name, status, client_id, branch_id')
        .eq('id', id).maybeSingle(), 'buscar o plano')
      contexto.plano = data && {
        id: data.id, nome: data.name, status: data.status,
        clienteId: data.client_id, unidadeId: data.branch_id,
      }
      return contexto
    }

    if (alvo === 'produto') {
      const data = await ler(admin
        .from('products')
        .select('id, name, unit, tenant_id')
        .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar o produto')
      contexto.produto = data && { id: data.id, nome: data.name, unidade: data.unit }
      return contexto
    }

    // membro
    const data = await ler(admin
      .from('users')
      .select('id, name, email, branch_id, tenant_roles(label)')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle(), 'buscar o usuário')
    contexto.membro = data && {
      id: data.id, nome: data.name, email: data.email,
      unidadeId: data.branch_id,
      cargo: (data.tenant_roles as unknown as { label?: string } | null)?.label ?? null,
    }
    return contexto
  } catch (e) {
    console.error('[contexto] hidratar', alvo, (e as Error).message)
    contexto[alvo] = null
    return contexto
  }
}

/** Compara dia e mês no fuso do negócio — `new Date()` cru erraria por um dia. */
function ehAniversarioHoje(nascimento: string | null): boolean {
  if (!nascimento) return false
  const hoje = dayKeyTZ(new Date())            // 'YYYY-MM-DD'
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
