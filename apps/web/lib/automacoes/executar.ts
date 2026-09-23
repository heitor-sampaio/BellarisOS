import { createAdminClient } from '@/lib/supabase/admin'
import { NODES, PROFUNDIDADE_MAXIMA } from '@estetica-os/types'
import type {
  GrafoDeAutomacao, NoDoGrafo, TipoDeNo,
  ConfigCondicaoSe, ConfigCondicaoEscolha,
  ConfigAcaoNotificarEquipe, ConfigAcaoAnotar, ConfigAcaoMensagem,
  ConfigAcaoMoverEtapa, ConfigAcaoDesfecho, ConfigAcaoTagCliente, ConfigAcaoAtribuir,
} from '@estetica-os/types'
import { avaliarGrupo, escolherSaida } from './condicoes'
import {
  contextoDoEvento, hidratarParaCaminhos,
  type ContextoDaExecucao, type EventoDoGatilho,
} from './contexto'
import { interpolarTexto, caminhosDoTexto } from './variaveis'
import { notificarEquipe, anotarNaLinhaDoTempo } from './acoes'
import {
  moverDeEtapa, marcarDesfecho, mudarTagDoCliente, definirResponsavel,
  type AtorDaAutomacao,
} from './acoes-crm'
import { mandarMensagem } from './acoes-mensagem'
import { podeFalarCom, limitesDe } from './limites'

/**
 * O executor: um passo por vez, dirigido por `automation_runs`.
 *
 * O desenho todo gira em torno de uma regra: **o processo não segura nada**.
 * Cada passo lê o run, executa um node, grava onde parou e devolve. Uma espera
 * só grava `rodar_apos` — é isso que permite "esperar 3 dias" num container que
 * reinicia sozinho, e é por isso que a fila é uma tabela e não memória.
 *
 * ⚠️ Nunca lança para quem chamou. Uma automação que falha não pode derrubar o
 * agendamento que a disparou — a mesma regra do emissor de eventos.
 */

/** Teto de nodes por execução. Grafo em anel que escape do validador para aqui. */
const MAX_PASSOS = 100

interface Run {
  id:            string
  tenant_id:     string
  automation_id: string
  evento_id:     string | null
  contexto:      ContextoDaExecucao
  no_atual:      string | null
  tentativas:    number
  profundidade:  number
}

interface Automacao {
  id:       string
  nome:     string
  grafo:    GrafoDeAutomacao
  limites:  Record<string, unknown>
  status:   string
}

/**
 * Quem está agindo, do ponto de vista de quem recebe a ação.
 *
 * A **profundidade vem do run**, não de um contador local: é ela que as ações
 * repassam aos eventos que emitem, e é o que faz um anel fechar em três voltas
 * em vez de três mil.
 */
function atorDaAutomacao(run: Run, automacao: Automacao): AtorDaAutomacao {
  return {
    tenantId:     run.tenant_id,
    automacaoId:  automacao.id,
    nome:         automacao.nome,
    profundidade: run.profundidade,
  }
}

/** O que um node devolve ao executor. */
export interface ResultadoDoNo {
  /** Qual saída seguir. `undefined` = a saída única. */
  saida?:      string
  /** Volte a rodar depois desta data, em vez de seguir agora. */
  esperarAte?: Date
  /** Encerra o fluxo aqui, sem erro. */
  parar?:      boolean
  /** Resumo legível, para o passo a passo. */
  resumo?:     Record<string, unknown>
}

// ─── Despacho: de um evento para execuções ──────────────────────────────────

/**
 * Cria uma execução por automação que assina este evento.
 *
 * Chamada em `after()` pelo emissor: o insert do evento continua síncrono e o
 * despacho não entra no caminho crítico de quem gravou o fato.
 */
export async function despacharEvento(
  evento: EventoDoGatilho,
  tenantId: string,
  profundidadeDoGatilho = 0,
): Promise<void> {
  try {
    // Evento nascido de automação pode disparar outra — é o que torna fluxos
    // encadeados possíveis — mas só até o teto. Sem isto, o primeiro grafo em
    // anel manda mensagem para o cliente em laço.
    if (profundidadeDoGatilho >= PROFUNDIDADE_MAXIMA) return

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('automations')
      .select('id, grafo')
      .eq('tenant_id', tenantId)
      .eq('status', 'ATIVA')
      .contains('gatilhos', [evento.nome])

    if (error) { console.error('[despacharEvento]', error.message); return }
    if (!data?.length) return

    for (const linha of data) {
      const grafo = linha.grafo as GrafoDeAutomacao
      const gatilho = grafo.nos?.find(n => n.tipo === NODES.GATILHO_EVENTO)
      if (!gatilho) continue

      // O filtro do gatilho roda ANTES de criar o run: "só quando o valor passa
      // de 500" não deveria deixar rastro de execução para todo pagamento.
      const config = gatilho.config as { filtro?: Parameters<typeof avaliarGrupo>[1] }
      if (config.filtro) {
        const ctx = contextoDoEvento(evento)
        await hidratarParaCaminhos(
          ctx, evento, tenantId,
          (config.filtro.regras ?? []).map(r => r.campo),
        )
        if (!avaliarGrupo(ctx, config.filtro)) continue
      }

      const { data: criado, error: insErro } = await admin.from('automation_runs').insert({
        tenant_id:     tenantId,
        automation_id: linha.id,
        evento_id:     evento.id,
        contexto:      contextoDoEvento(evento),
        no_atual:      gatilho.id,
        profundidade:  profundidadeDoGatilho,
        status:        'esperando',
      }).select('id').maybeSingle()

      // 23505 = a mesma automação já tem execução para este evento. É a trava
      // de idempotência fazendo o trabalho dela, não uma falha.
      if (insErro && insErro.code !== '23505') {
        console.error('[despacharEvento] insert', insErro.message)
        continue
      }
      if (insErro || !criado) continue

      // E roda AGORA. Enfileirar e esperar o cron faria "responder na hora
      // quem chegou pelo anúncio" virar "responder em até cinco minutos" — que
      // é exatamente o que essa automação não pode ser. O cron existe para o
      // que espera, o que falhou e o que é de tempo.
      await executarRun(criado.id as string)
    }
  } catch (e) {
    console.error('[despacharEvento]', (e as Error).message)
  }
}

// ─── Execução de um run ─────────────────────────────────────────────────────

/**
 * Roda uma execução até o fim, até uma espera ou até uma falha.
 *
 * Devolve o status final, para o cron somar o lote.
 */
export async function executarRun(runId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: runRow, error } = await admin
    .from('automation_runs')
    .select('id, tenant_id, automation_id, evento_id, contexto, no_atual, tentativas, profundidade')
    .eq('id', runId)
    .maybeSingle()

  if (error || !runRow) { console.error('[executarRun] run não encontrado', runId); return 'falhou' }
  const run = runRow as unknown as Run

  const { data: autoRow } = await admin
    .from('automations')
    .select('id, nome, grafo, limites, status')
    .eq('id', run.automation_id)
    .maybeSingle()

  if (!autoRow) return await encerrar(run.id, 'falhou', 'Automação não encontrada.')
  const automacao = autoRow as unknown as Automacao

  // Pausar uma automação tem de valer para o que já está na fila, senão uma
  // espera de três dias ressuscita o que alguém desligou ontem.
  if (automacao.status !== 'ATIVA') {
    return await encerrar(run.id, 'parado', 'Automação não está ativa.')
  }

  await admin.from('automation_runs').update({
    status:      'rodando',
    iniciado_em: new Date().toISOString(),
  }).eq('id', run.id)

  const evento = (run.contexto.evento ?? {}) as Record<string, unknown>
  const eventoDoGatilho: EventoDoGatilho = {
    id:         (evento.id as string) ?? '',
    nome:       (evento.nome as string) ?? '',
    entidade:   (evento.entidade as string) ?? '',
    entidadeId: (evento.entidadeId as string) ?? null,
    dados:      (evento.dados as Record<string, unknown>) ?? {},
    atorNome:   (evento.ator as string) ?? null,
    atorTipo:   (evento.atorTipo as string) ?? 'sistema',
    origem:     (evento.origem as string) ?? 'app',
    ocorridoEm: (evento.quando as string) ?? new Date().toISOString(),
    branchId:   null,
  }

  const porId = new Map(automacao.grafo.nos.map(n => [n.id, n]))
  let atual: NoDoGrafo | undefined = run.no_atual ? porId.get(run.no_atual) : undefined
  const contexto = run.contexto
  let ordem = await proximaOrdem(run.id)
  let passos = 0

  while (atual) {
    if (++passos > MAX_PASSOS) {
      return await encerrar(run.id, 'falhou', `Passou de ${MAX_PASSOS} passos — grafo em anel.`)
    }

    const comecou = Date.now()
    let resultado: ResultadoDoNo

    try {
      resultado = await rodarNo(atual, contexto, eventoDoGatilho, run, automacao)
    } catch (e) {
      await gravarPasso(run.id, ordem++, atual, 'falhou', { erro: (e as Error).message }, Date.now() - comecou)
      return await encerrar(run.id, 'falhou', `${atual.tipo}: ${(e as Error).message}`, contexto, atual.id)
    }

    if (resultado.esperarAte) {
      await gravarPasso(run.id, ordem++, atual, 'esperando', resultado.resumo ?? {}, Date.now() - comecou)
      await admin.from('automation_runs').update({
        status:     'esperando',
        contexto,
        no_atual:   atual.id,
        rodar_apos: resultado.esperarAte.toISOString(),
      }).eq('id', run.id)
      return 'esperando'
    }

    await gravarPasso(run.id, ordem++, atual, 'ok', resultado.resumo ?? {}, Date.now() - comecou)

    if (resultado.parar) {
      return await encerrar(run.id, 'ok', null, contexto, null)
    }

    const proximo = ligacaoSaindo(automacao.grafo, atual.id, resultado.saida)
    atual = proximo ? porId.get(proximo) : undefined
  }

  return await encerrar(run.id, 'ok', null, contexto, null)
}

/**
 * Executa um node.
 *
 * O `switch` é exaustivo de propósito: node novo no catálogo sem caso aqui
 * **não compila**. É a guarda que evita a automação que a tela deixa montar e
 * o motor ignora em silêncio.
 */
async function rodarNo(
  no: NoDoGrafo,
  contexto: ContextoDaExecucao,
  evento: EventoDoGatilho,
  run: Run,
  automacao: Automacao,
): Promise<ResultadoDoNo> {
  const tipo = no.tipo as TipoDeNo

  switch (tipo) {
    // O gatilho já foi avaliado no despacho; aqui ele é só o ponto de partida.
    case NODES.GATILHO_EVENTO:
    case NODES.GATILHO_AGENDA:
      return { resumo: { gatilho: evento.nome || 'agenda' } }

    case NODES.CONDICAO_SE: {
      const cfg = no.config as ConfigCondicaoSe
      await hidratarParaCaminhos(
        contexto, evento, run.tenant_id,
        (cfg.grupo?.regras ?? []).map(r => r.campo),
      )
      const passou = avaliarGrupo(contexto, cfg.grupo)
      return { saida: passou ? 'sim' : 'nao', resumo: { resultado: passou ? 'sim' : 'não' } }
    }

    case NODES.CONDICAO_ESCOLHA: {
      const cfg = no.config as ConfigCondicaoEscolha
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, [cfg.campo])
      const saida = escolherSaida(contexto, cfg.campo, cfg.casos ?? [])
      return { saida, resumo: { campo: cfg.campo, saida } }
    }

    case NODES.ACAO_NOTIFICAR_EQUIPE: {
      const cfg = no.config as ConfigAcaoNotificarEquipe
      const textos = [cfg.titulo ?? '', cfg.corpo ?? '']
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, textos.flatMap(caminhosDoTexto))
      const r = await notificarEquipe(run.tenant_id, {
        alvo:   cfg.alvo,
        alvoId: cfg.alvoId ?? null,
        titulo: interpolarTexto(cfg.titulo ?? '', contexto),
        corpo:  interpolarTexto(cfg.corpo ?? '', contexto),
        automacao: automacao.nome,
      })
      return { resumo: r }
    }

    case NODES.ACAO_ANOTAR: {
      const cfg = no.config as ConfigAcaoAnotar
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, [
        ...caminhosDoTexto(cfg.texto ?? ''), 'lead',
      ])
      const r = await anotarNaLinhaDoTempo(run.tenant_id, contexto, {
        texto:     interpolarTexto(cfg.texto ?? '', contexto),
        automacao: automacao.nome,
      })
      return { resumo: r }
    }

    case NODES.ACAO_MENSAGEM: {
      const cfg = no.config as ConfigAcaoMensagem
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, [
        ...caminhosDoTexto(cfg.texto ?? ''), 'cliente', 'conversa',
      ])

      // Só o que FALA COM O CLIENTE passa pelos limites. Avisar a equipe não
      // acorda ninguém, e travá-lo faria a recepção descobrir de manhã um
      // no-show da véspera.
      const veredito = await podeFalarCom(
        automacao.id,
        (contexto.cliente as { id?: string } | null)?.id ?? null,
        limitesDe(automacao.limites),
      )
      if (!veredito.liberado) {
        // Silêncio noturno ESPERA; teto recusa. Descartar a mensagem por causa
        // do horário faria o lembrete simplesmente não acontecer.
        return veredito.esperarAte
          ? { esperarAte: veredito.esperarAte, resumo: { adiado: veredito.motivo } }
          : { parar: true, resumo: { enviada: false, motivo: veredito.motivo } }
      }

      const r = await mandarMensagem(atorDaAutomacao(run, automacao), contexto, {
        canal: cfg.canal,
        texto: interpolarTexto(cfg.texto ?? '', contexto),
        templateId: cfg.templateId ?? null,
      })
      return { resumo: r.resumo, esperarAte: r.esperarAte }
    }

    case NODES.ACAO_MOVER_ETAPA: {
      const cfg = no.config as ConfigAcaoMoverEtapa
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, ['lead'])
      return { resumo: await moverDeEtapa(atorDaAutomacao(run, automacao), contexto, cfg.etapaId) }
    }

    case NODES.ACAO_DESFECHO: {
      const cfg = no.config as ConfigAcaoDesfecho
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, ['lead'])
      return { resumo: await marcarDesfecho(atorDaAutomacao(run, automacao), contexto, cfg.desfecho) }
    }

    case NODES.ACAO_TAG_CLIENTE: {
      const cfg = no.config as ConfigAcaoTagCliente
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, ['cliente'])
      return {
        resumo: await mudarTagDoCliente(
          atorDaAutomacao(run, automacao), contexto, cfg.tag, cfg.modo ?? 'adicionar',
        ),
      }
    }

    case NODES.ACAO_ATRIBUIR: {
      const cfg = no.config as ConfigAcaoAtribuir
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, ['lead'])
      return {
        resumo: await definirResponsavel(atorDaAutomacao(run, automacao), contexto, cfg.usuarioId ?? null),
      }
    }

    // Declarados no catálogo, executores na fase do TEMPO. Parar com motivo é
    // melhor que seguir adiante fingindo que a ação aconteceu.
    case NODES.BUSCAR_CLIENTES:
    case NODES.ESPERA_DURACAO:
    case NODES.ESPERA_ATE:
    case NODES.ACAO_LEMBRETE:
      throw new Error(`O node "${tipo}" ainda não é executável.`)
  }

  // Sem `default`: o switch acima cobre o catálogo inteiro, e é o compilador
  // que garante isso. Este ponto só é alcançável por dado corrompido no grafo.
  throw new Error(`Node desconhecido: ${String(tipo)}`)
}

// ─── Utilidades do grafo e do registro ──────────────────────────────────────

function ligacaoSaindo(
  grafo: GrafoDeAutomacao,
  deId: string,
  saida?: string,
): string | null {
  const candidatas = grafo.ligacoes.filter(l => l.de === deId)
  if (!candidatas.length) return null

  if (saida) {
    const exata = candidatas.find(l => l.saida === saida)
    if (exata) return exata.para
    // Saída sem ligação é fim de ramo legítimo: um IF pode ter só o "sim"
    // ligado. Cair na primeira ligação seria mandar o fluxo pelo caminho
    // errado — pior que parar.
    return null
  }

  return candidatas[0]?.para ?? null
}

async function proximaOrdem(runId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from('automation_run_steps')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
  return (count ?? 0) + 1
}

async function gravarPasso(
  runId: string, ordem: number, no: NoDoGrafo,
  status: 'ok' | 'falhou' | 'pulado' | 'esperando',
  resumo: Record<string, unknown>, ms: number,
): Promise<void> {
  const { error } = await createAdminClient().from('automation_run_steps').insert({
    run_id: runId, ordem, no_id: no.id, tipo: no.tipo, status, resumo, ms,
  })
  if (error) console.error('[gravarPasso]', error.message)
}

async function encerrar(
  runId: string,
  status: 'ok' | 'falhou' | 'parado',
  erro: string | null,
  contexto?: ContextoDaExecucao,
  noAtual?: string | null,
): Promise<string> {
  const patch: Record<string, unknown> = {
    status, erro, fim_em: new Date().toISOString(),
  }
  if (contexto !== undefined) patch.contexto = contexto
  if (noAtual !== undefined)  patch.no_atual = noAtual

  const { error } = await createAdminClient()
    .from('automation_runs').update(patch).eq('id', runId)
  if (error) console.error('[encerrar]', error.message)
  return status
}
