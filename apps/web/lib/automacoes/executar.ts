import { createAdminClient } from '@/lib/supabase/admin'
import { NODES, PROFUNDIDADE_MAXIMA } from '@estetica-os/types'
import type {
  GrafoDeAutomacao, NoDoGrafo, TipoDeNo,
  ConfigCondicaoSe, ConfigCondicaoEscolha,
  ConfigAcaoNotificarEquipe, ConfigAcaoAnotar, ConfigAcaoMensagem,
  ConfigAcaoMoverEtapa, ConfigAcaoDesfecho, ConfigAcaoTagCliente, ConfigAcaoAtribuir,
  ConfigEsperaDuracao, ConfigEsperaAte, ConfigBuscarClientes,
} from '@estetica-os/types'
import { avaliarGrupo, escolherSaida, caminhosDoCampo } from './condicoes'
import { gatilhoCasa } from './gatilho-casa'
import {
  contextoDoEvento, hidratarParaCaminhos,
  type ContextoDaExecucao, type EventoDoGatilho,
} from './contexto'
import { interpolarTexto, caminhosDoTexto, variaveisSemDado } from './variaveis'
import { fusoDaUnidade, fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { notificarEquipe, anotarNaLinhaDoTempo } from './acoes'
import {
  moverDeEtapa, marcarDesfecho, adicionarTagAoCliente, removerTagDoCliente, definirResponsavel,
  type AtorDaAutomacao,
} from './acoes-crm'
import { mandarMensagem, EnvioNaoSaiu } from './acoes-mensagem'
import { naoEnviadaDoPasso, guardarNaoEnviada, esquecerNaoEnviada } from './mensagem-nao-enviada'
import { podeFalarCom, limitesDe, vesperaSeCairNoSilencio } from './limites'
import { retidaPeloSilencio, reconferirDepoisDoSilencio } from './silencio'
import { quandoVoltar, quandoChegarEm, buscarClientes } from './tempo'
import { resumoDoNo } from './resumo'
import { chaveDoPasso } from './passos'
import { fimDoPasso } from './em-portugues'
import { gravar, ler, contar } from '@/lib/db'
import { redeEstaBloqueada } from '@/lib/redes/bloqueio'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'

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

/**
 * Os tipos que produzem EFEITO fora do motor.
 *
 * É a lista que o ensaio respeita: tudo aqui é anotado em vez de executado.
 * `buscar.clientes` entra porque abrir cem execuções filhas é efeito — cada
 * uma delas agiria de verdade.
 */
const ACOES: TipoDeNo[] = [
  NODES.ACAO_MENSAGEM, NODES.ACAO_NOTIFICAR_EQUIPE, NODES.ACAO_MOVER_ETAPA,
  NODES.ACAO_DESFECHO, NODES.ACAO_TAG_CLIENTE, NODES.ACAO_REMOVER_TAG, NODES.ACAO_ATRIBUIR,
  NODES.ACAO_ANOTAR, NODES.BUSCAR_CLIENTES,
]

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
  simulacao:     boolean
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
  /** Com `esperarAte`: volte a ESTE passo, não ao seguinte (a mensagem que o
   *  silêncio reteve ainda não saiu — D2 da 19ª). */
  repetir?:    boolean
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
    // Rede bloqueada (assinatura): automação não dispara.
    if (await redeEstaBloqueada(tenantId)) return
    // Automações fora do PLANO da rede (lib/planos/recursos.ts): não disparam.
    if (!(await redeTemRecurso(tenantId, 'automacoes'))) return

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
      // de 500" não deveria deixar rastro de execução para todo pagamento. A
      // régua é a mesma da pergunta "Mover dispara…?" da tela (A35 da 22ª);
      // a entidade do filtro que não carrega não dispara (falha fechada, D3 da
      // 16ª), e as outras do mesmo fato seguem.
      if (!(await gatilhoCasa(grafo, evento, tenantId, { rotulo: linha.id as string }))) continue

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
export async function executarRun(
  runId: string,
  opcoes?: { ignorarStatus?: boolean },
): Promise<string> {
  const admin = createAdminClient()

  const { data: runRow, error } = await admin
    .from('automation_runs')
    .select('id, tenant_id, automation_id, evento_id, contexto, no_atual, tentativas, profundidade, simulacao')
    .eq('id', runId)
    .maybeSingle()

  if (error || !runRow) { console.error('[executarRun] run não encontrado', runId); return 'falhou' }
  const run = runRow as unknown as Run

  const autoRow = await ler(admin
    .from('automations')
    .select('id, nome, grafo, limites, status')
    .eq('id', run.automation_id)
    .maybeSingle(), 'buscar a automação')

  if (!autoRow) return await encerrar(run.id, 'falhou', 'Automação não encontrada.')
  const automacao = autoRow as unknown as Automacao

  // Pausar uma automação tem de valer para o que já está na fila, senão uma
  // espera de três dias ressuscita o que alguém desligou ontem.
  //
  // O ENSAIO é a exceção, e é o ponto dele: conferir o fluxo ANTES de ligar.
  if (automacao.status !== 'ATIVA' && !opcoes?.ignorarStatus) {
    return await encerrar(run.id, 'parado', 'Automação não está ativa.')
  }
  // A rede bloqueada (desligada, suspensa ou cancelada) não manda nada: o
  // run VOLTA à fila, sem gastar a tentativa, e anda quando a rede voltar.
  if (!opcoes?.ignorarStatus && await redeEstaBloqueada(run.tenant_id)) {
    await gravar(admin.from('automation_runs').update({ status: 'esperando', tentativas: Math.max(0, run.tentativas - 1) })
      .eq('id', run.id), 'devolver a execução à fila')
    return 'esperando'
  }
  // Automações fora do PLANO da rede: o que estava na fila para, com o motivo.
  if (!opcoes?.ignorarStatus && !(await redeTemRecurso(run.tenant_id, 'automacoes'))) {
    return await encerrar(run.id, 'parado', 'Automações não estão no plano da rede.')
  }

  await gravar(admin.from('automation_runs').update({
    status:      'rodando',
    iniciado_em: new Date().toISOString(),
  }).eq('id', run.id), 'marcar a execução como em andamento')

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

    guardarSaida(contexto, atual, automacao.grafo, resultado.resumo)

    if (resultado.esperarAte) {
      await gravarPasso(run.id, ordem++, atual, 'esperando', resultado.resumo ?? {}, Date.now() - comecou)

      // ⚠️ `no_atual` guarda o PRÓXIMO node, não o da espera.
      //
      // A espera já aconteceu; o que falta é o que vem depois dela. Gravar o
      // próprio node de espera faria o cron re-executá-lo ao retomar — e
      // "esperar 3 dias" viraria esperar 3 dias, para sempre, a cada
      // retomada. O fluxo nunca passaria dali, sem nada explicar.
      //
      // A exceção é o passo que ainda NÃO FEZ o que devia (`repetir`: a
      // mensagem que o silêncio reteve). Ele volta a si mesmo — até a 19ª
      // simulação guardava o seguinte, e o lembrete do último passo nunca saía.
      const depois = resultado.repetir
        ? atual.id
        : ligacaoSaindo(automacao.grafo, atual.id, resultado.saida)
      if (!depois) {
        // Esperar e não ter para onde ir é fim de ramo: não há por que
        // guardar um run que vai acordar para não fazer nada.
        return await encerrar(run.id, 'ok', null, contexto, null)
      }

      await gravar(admin.from('automation_runs').update({
        status:     'esperando',
        contexto,
        no_atual:   depois,
        rodar_apos: resultado.esperarAte.toISOString(),
      }).eq('id', run.id), 'guardar a espera da execução')
      return 'esperando'
    }

    await gravarPasso(run.id, ordem++, atual, 'ok', resultado.resumo ?? {}, Date.now() - comecou)

    const proximo = resultado.parar ? null : ligacaoSaindo(automacao.grafo, atual.id, resultado.saida)

    // A28, D6 e D15 da 32ª (princípio 3): a condição que deu "Não" e termina
    // o caminho, e a mensagem que não saiu, ficam no contexto — a lista diz
    // "Parou"/"Não mandou" com o motivo, e não "Concluída". Vai no contexto
    // porque ele atravessa as esperas (a mensagem que não saiu antes de um
    // "Esperar" continua sendo o fim a dizer).
    const fim = fimDoPasso(atual, automacao.grafo, resultado.resumo, resultado.saida, !!proximo)
    if (fim) contexto.fimDaExecucao = fim

    if (resultado.parar) {
      return await encerrar(run.id, 'ok', null, contexto, null)
    }

    atual = proximo ? porId.get(proximo) : undefined
  }

  return await encerrar(run.id, 'ok', null, contexto, null)
}

/**
 * O que este passo deixa para os seguintes, em `passos.<nome do passo>`.
 *
 * O resumo da ação já existia e já era guardado — mas só no histórico do run,
 * onde nenhum node consegue lê-lo. Guardá-lo TAMBÉM no contexto é o que permite
 * um IF depois da mensagem perguntar `passos.mandar_mensagem.enviada`, ou o
 * texto do aviso citar `{{passos.mover_de_etapa.para}}`.
 *
 * Vai no contexto que é persistido no run, então atravessa espera e retomada
 * pelo cron — e também as execuções filhas da busca de clientes, que nascem
 * com uma cópia dele.
 */
function guardarSaida(
  contexto: ContextoDaExecucao,
  no:       NoDoGrafo,
  grafo:    GrafoDeAutomacao,
  resumo:   Record<string, unknown> | undefined,
): void {
  if (!resumo) return
  const passos = (contexto.passos ?? {}) as Record<string, unknown>
  passos[chaveDoPasso(no, grafo)] = resumo
  contexto.passos = passos
}

/**
 * Executa um node.
 *
 * O `switch` é exaustivo de propósito: node novo no catálogo sem caso aqui
 * **não compila**. É a guarda que evita a automação que a tela deixa montar e
 * o motor ignora em silêncio.
 */
/**
 * O fuso das datas de uma mensagem (F62): o da unidade do agendamento ou do
 * evento; sem unidade, o comum da rede. A cliente é da REDE: a unidade em que
 * a ficha nasceu não decide o fuso (auditoria das regras, 18/11).
 */
async function fusoDaMensagem(tenantId: string, contexto: ContextoDaExecucao, evento: EventoDoGatilho): Promise<string> {
  const unidade = (contexto.agendamento as { unidadeId?: string | null } | null | undefined)?.unidadeId
    ?? evento.branchId
    ?? null
  return unidade ? fusoDaUnidade(tenantId, unidade) : fusoDaRede(tenantId)
}

async function rodarNo(
  no: NoDoGrafo,
  contexto: ContextoDaExecucao,
  evento: EventoDoGatilho,
  run: Run,
  automacao: Automacao,
): Promise<ResultadoDoNo> {
  const tipo = no.tipo as TipoDeNo

  /**
   * No ENSAIO, o que muda é só o EFEITO.
   *
   * Condições são avaliadas de verdade, com o contexto de um fato que
   * realmente aconteceu — é isso que faz o ensaio responder "por que não
   * disparou". O que não acontece é a ação: a mensagem não sai, a etapa não
   * muda, a tag não é gravada. Simular também as condições transformaria o
   * ensaio num desenho bonito que não prova nada.
   */
  if (run.simulacao && ACOES.includes(tipo)) {
    return { resumo: { ensaio: true, faria: resumoDoNo(tipo, no.config as Record<string, unknown>) } }
  }

  // A espera, no ensaio, é anotada e pulada: ninguém confere um fluxo
  // esperando três dias para ver o próximo passo.
  if (run.simulacao && (tipo === NODES.ESPERA_DURACAO || tipo === NODES.ESPERA_ATE)) {
    return { resumo: { ensaio: true, pulou: resumoDoNo(tipo, no.config as Record<string, unknown>) } }
  }

  switch (tipo) {
    // O gatilho já foi avaliado no despacho; aqui ele é só o ponto de partida.
    case NODES.GATILHO_EVENTO:
    case NODES.GATILHO_AGENDA:
      return { resumo: { gatilho: evento.nome || 'agenda' } }

    case NODES.CONDICAO_SE: {
      const cfg = no.config as ConfigCondicaoSe
      await hidratarParaCaminhos(
        contexto, evento, run.tenant_id,
        (cfg.grupo?.regras ?? []).flatMap(r => caminhosDoCampo(r.campo)),
      )
      const passou = avaliarGrupo(contexto, cfg.grupo)
      return { saida: passou ? 'sim' : 'nao', resumo: { resultado: passou ? 'sim' : 'não' } }
    }

    case NODES.CONDICAO_ESCOLHA: {
      const cfg = no.config as ConfigCondicaoEscolha
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, caminhosDoCampo(cfg.campo))
      const saida = escolherSaida(contexto, cfg.campo, cfg.casos ?? [])
      return { saida, resumo: { campo: cfg.campo, saida } }
    }

    case NODES.ACAO_NOTIFICAR_EQUIPE: {
      const cfg = no.config as ConfigAcaoNotificarEquipe
      const textos = [cfg.titulo ?? '', cfg.corpo ?? '']
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, [
        ...textos.flatMap(caminhosDoTexto), ...(cfg.alvo === 'responsavel' ? ['lead'] : []),
      ])
      const lead = contexto.lead as { id?: string; responsavelId?: string | null } | null | undefined
      const r = await notificarEquipe(run.tenant_id, {
        alvo:   cfg.alvo,
        alvoId: cfg.alvoId ?? null,
        responsavelId: lead?.responsavelId ?? null,
        leadId: lead?.id ?? null,
        titulo: interpolarTexto(cfg.titulo ?? '', contexto, await fusoDaMensagem(run.tenant_id, contexto, evento)),
        corpo:  interpolarTexto(cfg.corpo ?? '', contexto, await fusoDaMensagem(run.tenant_id, contexto, evento)),
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
        texto:     interpolarTexto(cfg.texto ?? '', contexto, await fusoDaMensagem(run.tenant_id, contexto, evento)),
        automacao: automacao.nome,
      })
      return { resumo: r }
    }

    case NODES.ACAO_MENSAGEM: {
      const cfg = no.config as ConfigAcaoMensagem
      // Saindo do silêncio (D2 da 19ª): o agendamento pode ter sido concluído,
      // cancelado ou ter passado enquanto a mensagem esperava. As condições do
      // caminho são refeitas com o dado de agora.
      if (retidaPeloSilencio(contexto, no, automacao.grafo)) {
        const conferido = await reconferirDepoisDoSilencio(automacao.grafo, no, contexto, evento, run.tenant_id)
        if (!conferido.seguir) return { parar: true, resumo: { enviada: false, motivo: conferido.motivo } }
      }
      // R10: as variáveis do modelo (template) do passo também se hidratam.
      const doModelo = Object.values(cfg.variaveisDoTemplate ?? {})
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, [
        ...caminhosDoTexto(cfg.texto ?? ''), ...doModelo.flatMap(v => caminhosDoTexto(v)), 'cliente', 'conversa',
      ])

      // D15 da 32ª (princípio 4): a variável sem o dado não sai em branco
      // (", sentimos sua falta…"). A mensagem não sai, e o passo diz o que
      // faltou.
      const semDado = variaveisSemDado(cfg.texto ?? '', contexto)
      if (semDado.length) {
        return { resumo: { enviada: false, motivo: `Faltou o dado de ${semDado.join(', ')}: a mensagem não saiu.` } }
      }

      // Só o que FALA COM O CLIENTE passa pelos limites. Avisar a equipe não
      // acorda ninguém, e travá-lo faria a recepção descobrir de manhã um
      // no-show da véspera.
      const veredito = await podeFalarCom(
        automacao.id,
        (contexto.cliente as { id?: string } | null)?.id ?? null,
        limitesDe(automacao.limites),
        new Date(),
        // O silêncio e o "hoje" do teto no relógio da cliente (F62b).
        await fusoDaMensagem(run.tenant_id, contexto, evento),
      )
      if (!veredito.liberado) {
        // Silêncio noturno ESPERA; teto recusa. Descartar a mensagem por causa
        // do horário faria o lembrete simplesmente não acontecer.
        return veredito.esperarAte
          ? { esperarAte: veredito.esperarAte, repetir: true, resumo: { adiado: veredito.motivo } }
          : { parar: true, resumo: { enviada: false, motivo: veredito.motivo } }
      }

      const fuso = await fusoDaMensagem(run.tenant_id, contexto, evento)
      // D2 da 38ª (IN-18): a mensagem que a tentativa anterior deixou "Não
      // enviada" volta pela mesma linha — uma bolha só na conversa. Ela fica
      // no contexto, que a execução grava ao falhar e relê ao voltar pelo cron.
      let r: Awaited<ReturnType<typeof mandarMensagem>>
      try {
        r = await mandarMensagem(atorDaAutomacao(run, automacao), contexto, {
          naoEnviada: naoEnviadaDoPasso(contexto, no.id),
          canal: cfg.canal,
          texto: interpolarTexto(cfg.texto ?? '', contexto, fuso),
          templateId: cfg.templateId ?? null,
          // AX-06 (D6 da 32ª; R10): sem conversa aberta, o que a rede escolheu.
          semConversa: cfg.semConversa ?? 'nao_mandar',
          // R10 (o Heitor, 26/11): o modelo aprovado do passo, com as variáveis
          // da automação já trocadas — e as que saíram vazias (princípio 4).
          modelo: cfg.templateId
            ? {
                templateId: cfg.templateId,
                valores: Object.fromEntries(Object.entries(cfg.variaveisDoTemplate ?? {})
                  .map(([nome, v]) => [nome, interpolarTexto(v, contexto, fuso).trim()])),
                semDado: Object.values(cfg.variaveisDoTemplate ?? {}).flatMap(v => variaveisSemDado(v, contexto)),
              }
            : null,
        })
      } catch (e) {
        if (e instanceof EnvioNaoSaiu) guardarNaoEnviada(contexto, no.id, e.naoEnviada)
        throw e
      }
      esquecerNaoEnviada(contexto, no.id)
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
      const cfg = no.config as ConfigAcaoTagCliente & { modo?: string }
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, ['cliente'])
      // O passo de antes da "Remover tag" própria, gravado com o modo de
      // remover, tira a tag — o que a rede montou (auditoria das regras,
      // 2026-11-18; de 14/11 a 18/11 ele não fazia nada).
      if (cfg.modo === 'remover') {
        return { resumo: await removerTagDoCliente(atorDaAutomacao(run, automacao), contexto, cfg.tag) }
      }
      return { resumo: await adicionarTagAoCliente(atorDaAutomacao(run, automacao), contexto, cfg.tag) }
    }

    case NODES.ACAO_REMOVER_TAG: {
      const cfg = no.config as ConfigAcaoTagCliente
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, ['cliente'])
      return { resumo: await removerTagDoCliente(atorDaAutomacao(run, automacao), contexto, cfg.tag) }
    }

    case NODES.ACAO_ATRIBUIR: {
      const cfg = no.config as ConfigAcaoAtribuir
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, ['lead'])
      return {
        resumo: await definirResponsavel(atorDaAutomacao(run, automacao), contexto, cfg.usuarioId ?? null),
      }
    }

    case NODES.ESPERA_DURACAO: {
      const cfg = no.config as ConfigEsperaDuracao
      const ate = quandoVoltar(cfg)
      return {
        esperarAte: ate,
        resumo: { esperando: `${cfg.quantidade} ${cfg.unidade}`, ate: ate.toISOString() },
      }
    }

    case NODES.ESPERA_ATE: {
      const cfg = no.config as ConfigEsperaAte
      await hidratarParaCaminhos(contexto, evento, run.tenant_id, caminhosDoCampo(cfg.campo ?? ''))
      const r = quandoChegarEm(cfg, contexto)
      // D17 ("a + c opcional"): a espera "antes de" que terminaria no
      // silêncio termina na véspera às 20:00, se a rede ligou a opção.
      const vespera = r.data && Number(cfg.minutos ?? 0) < 0
        ? vesperaSeCairNoSilencio(limitesDe(automacao.limites), r.data, new Date(), await fusoDaMensagem(run.tenant_id, contexto, evento))
        : null
      // Momento que já passou não vira espera eterna: o fluxo segue agora, com
      // o motivo no passo. Travar num passado seria o pior sintoma possível —
      // nada acontece e nada explica.
      return vespera
        ? { esperarAte: vespera, resumo: { esperando: 'até', campo: cfg.campo, ate: vespera.toISOString(), naVespera: true } }
        : r.data
        ? { esperarAte: r.data, resumo: { esperando: 'até', campo: cfg.campo, ate: r.data.toISOString() } }
        : { resumo: { esperando: false, motivo: r.motivo } }
    }

    case NODES.BUSCAR_CLIENTES: {
      const cfg = no.config as ConfigBuscarClientes
      // A busca é da rede (T1 do Bloco Tags: a cliente é da rede, sem unidade),
      // e o dia do aniversário, no fuso da rede.
      const { clientes, truncado, limite } = await buscarClientes(run.tenant_id, cfg, await fusoDaRede(run.tenant_id))

      const proximo = ligacaoSaindo(automacao.grafo, no.id)
      if (!proximo) return { parar: true, resumo: { encontrados: clientes.length, motivo: 'Nada ligado depois da busca.' } }

      // Uma EXECUÇÃO POR CLIENTE, e não um laço aqui dentro: cada cliente tem
      // o próprio contexto, o próprio passo a passo e os próprios limites. Um
      // laço faria os mil clientes compartilharem um histórico só, e o teto por
      // cliente não teria como funcionar.
      const abertas = await abrirExecucoesFilhas(run, automacao, clientes, proximo)

      return {
        parar: true,
        resumo: {
          encontrados: clientes.length, abertas,
          // O teto que VALEU (o gravado; sem ele, os 200 da tela) — princípio 3.
          ...(truncado ? { aviso: `O teto de ${limite.toLocaleString('pt-BR')} cortou a lista.` } : {}),
        },
      }
    }

  }

  // Sem `default`: o switch acima cobre o catálogo inteiro, e é o compilador
  // que garante isso. Este ponto só é alcançável por dado corrompido no grafo.
  throw new Error(`Node desconhecido: ${String(tipo)}`)
}

// ─── Utilidades do grafo e do registro ──────────────────────────────────────

/** Quantas execuções filhas se gravam por vez. */
const LOTE_DE_EXECUCOES = 500

/**
 * Uma execução por cliente, a partir da busca.
 *
 * Cada cliente ganha o próprio run — com o próprio contexto, o próprio passo a
 * passo e os próprios limites. Um laço aqui dentro faria os mil clientes
 * compartilharem um histórico só, e o teto por cliente não teria como
 * funcionar: ele conta execuções.
 *
 * As filhas nascem no node SEGUINTE à busca, já com o cliente no contexto —
 * não há evento para hidratar.
 */
async function abrirExecucoesFilhas(
  pai: Run,
  automacao: Automacao,
  clientes: { id: string; nome: string; telefone: string | null }[],
  noInicial: string,
): Promise<number> {
  if (!clientes.length) return 0

  const admin = createAdminClient()

  const linhas = clientes.map(c => ({
    tenant_id:     pai.tenant_id,
    automation_id: automacao.id,
    pai_id:        pai.id,
    evento_id:     null,
    no_atual:      noInicial,
    status:        'esperando',
    profundidade:  pai.profundidade,
    contexto: {
      ...pai.contexto,
      cliente: { id: c.id, nome: c.nome, telefone: c.telefone },
      // Cada filha diz o próprio fim (A28/D6 da 32ª), não o da mãe.
      fimDaExecucao: undefined,
    },
  }))

  // Em lotes: o "No máximo" vale o número que a rede gravou (sem o 500 de
  // antes), e a resposta do PostgREST passa de 1.000 linhas calada.
  const abertas: string[] = []
  for (let i = 0; i < linhas.length; i += LOTE_DE_EXECUCOES) {
    const { data, error } = await admin.from('automation_runs').insert(linhas.slice(i, i + LOTE_DE_EXECUCOES)).select('id')
    if (error) throw new Error(`Não consegui abrir as execuções: ${error.message}`)
    abertas.push(...(data ?? []).map(l => l.id as string))
  }

  // Rodam JÁ, em sequência. Em paralelo, cem clientes virariam cem envios
  // simultâneos pelo mesmo canal — e o provedor de WhatsApp trata isso como
  // disparo em massa.
  for (const id of abertas) {
    await executarRun(id)
  }

  return abertas.length
}

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

/** Contagem que falha não pode virar "começa do 1": o passo a passo do run
 *  ficaria com duas ordens iguais e o histórico, embaralhado. */
async function proximaOrdem(runId: string): Promise<number> {
  const feitos = await contar(createAdminClient()
    .from('automation_run_steps')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId), 'contar os passos do run')
  return feitos + 1
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
