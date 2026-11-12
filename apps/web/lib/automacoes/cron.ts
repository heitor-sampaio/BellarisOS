import { createAdminClient } from '@/lib/supabase/admin'
import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao, ConfigGatilhoAgenda } from '@estetica-os/types'
import { executarRun, despacharEvento } from './executar'
import { estaNaHora } from './tempo'
import { partsInTZ } from '@/lib/datetime'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { gravar } from '@/lib/db'
import { redeEstaBloqueada } from '@/lib/redes/bloqueio'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'

/**
 * O que o cron faz a cada cinco minutos.
 *
 * Três populações, por três motivos diferentes:
 *
 *  - **o que espera** — `espera.duracao` e `espera.ate` gravaram uma data e
 *    devolveram o run à fila; é aqui que ele volta a andar;
 *  - **o que falhou** — a rede caiu, a Graph API recusou. Vale tentar de novo,
 *    mas não para sempre;
 *  - **os gatilhos de agenda** — "todo dia às 9h" não nasce de ação nenhuma, e
 *    só existe porque alguém pergunta pela hora;
 *  - **os fatos do banco** (C2, F69) — pagamento recebido e estornado, estoque,
 *    comissão, termo emitido, pontos: os gatilhos SQL gravam o fato em
 *    `domain_events` com `origem = 'banco'`, e nenhum `emitirEvento` os
 *    despacha. Até a F69 a automação montada sobre eles nunca disparava.
 *
 * O disparo imediato continua acontecendo dentro do request (`after()`): este
 * cron é a rede de segurança e o relógio, não o caminho principal.
 */

/** Quantas vezes vale tentar de novo antes de desistir. */
const MAX_TENTATIVAS = 3

/** Teto por passagem: cinco minutos não dão para drenar uma fila infinita. */
const LOTE = 50

export interface ResultadoDoCron {
  retomadas: number
  agendas:   number
  fatos:     number
  erros:     number
}

export async function rodarFilaDeAutomacoes(): Promise<ResultadoDoCron> {
  const fatos     = await despacharFatosDoBanco()
  const agendas   = await dispararAgendas()
  const retomadas = await retomarPendentes()
  return { ...retomadas, agendas, fatos }
}

/**
 * Os fatos que nasceram no banco e ainda não foram despachados.
 *
 * Cada um é REIVINDICADO antes de despachar (`despachado_em` de nulo para
 * agora, conferindo a linha devolvida): duas passagens do cron ao mesmo tempo
 * não despacham o mesmo fato duas vezes — e, se despachassem, o índice único
 * de `automation_runs (automation_id, evento_id)` ainda seguraria a segunda.
 *
 * Só o último dia: o fato mais velho que isso (o cron parado por um deploy
 * longo) já não é "quando o pagamento entrar". A migration da F69 marcou os
 * anteriores como despachados.
 *
 * O SUPORTE: o gatilho SQL não sabe que a gravação veio de uma sessão de
 * suporte (o servidor grava pelo cliente de serviço). O fato que ocorreu
 * enquanto a rede tinha uma sessão de suporte ATIVA não dispara — nada sai ao
 * paciente por causa do suporte (CLAUDE.md §14).
 */
async function despacharFatosDoBanco(): Promise<number> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 86_400_000).toISOString()
  const { data, error } = await admin
    .from('domain_events')
    .select('id, tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_nome, ator_tipo, origem, ocorrido_em, suporte_sessao_id')
    .eq('origem', 'banco')
    .is('despachado_em', null)
    .gte('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(LOTE)
  if (error) { console.error('[cron automacoes] fatos do banco:', error.message); return 0 }

  let despachados = 0
  for (const ev of data ?? []) {
    try {
      const { data: meu } = await admin.from('domain_events')
        .update({ despachado_em: new Date().toISOString() })
        .eq('id', ev.id as string).is('despachado_em', null)
        .select('id')
      if (!meu?.length) continue // outra passagem pegou
      if (ev.suporte_sessao_id) continue
      if (await suporteAtivoEm(ev.tenant_id as string, ev.ocorrido_em as string)) continue
      await despacharEvento({
        id:         ev.id as string,
        nome:       ev.nome as string,
        entidade:   ev.entidade as string,
        entidadeId: (ev.entidade_id as string | null) ?? null,
        dados:      (ev.dados as Record<string, unknown> | null) ?? {},
        atorNome:   (ev.ator_nome as string | null) ?? null,
        atorTipo:   (ev.ator_tipo as string | null) ?? 'sistema',
        origem:     'banco',
        ocorridoEm: ev.ocorrido_em as string,
        branchId:   (ev.branch_id as string | null) ?? null,
      }, ev.tenant_id as string, 0)
      despachados++
    } catch (e) {
      console.error('[cron automacoes] fato', ev.id, (e as Error).message)
    }
  }
  return despachados
}

/** A rede tinha uma sessão de suporte aberta naquele instante? */
async function suporteAtivoEm(tenantId: string, quando: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('support_sessions')
    .select('id')
    .eq('tenant_id', tenantId)
    .lte('started_at', quando)
    .or(`ended_at.is.null,ended_at.gte.${quando}`)
    .gte('expires_at', quando)
    .limit(1)
  return !!data?.length
}

/**
 * Runs prontos para continuar.
 *
 * `rodar_apos <= agora` cobre os dois casos: a espera que venceu e a falha que
 * merece nova tentativa. A ordem é a mais antiga primeiro — quem espera há
 * mais tempo tem prioridade sobre quem acabou de entrar.
 */
async function retomarPendentes(): Promise<{ retomadas: number; erros: number }> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('automation_runs')
    .select('id, tenant_id, status, tentativas')
    .in('status', ['esperando', 'falhou'])
    .lte('rodar_apos', new Date().toISOString())
    .lt('tentativas', MAX_TENTATIVAS)
    .order('rodar_apos', { ascending: true })
    .limit(LOTE)

  if (error) { console.error('[cron automacoes] fila:', error.message); return { retomadas: 0, erros: 1 } }

  let retomadas = 0
  let erros = 0

  for (const run of data ?? []) {
    // Um run não pode derrubar a passagem inteira. As gravações do motor agora
    // falham alto — que é o certo para o run —, mas deixar a exceção subir daqui
    // faria um registro problemático impedir que TODOS os outros rodassem, e o
    // sintoma seria uma fila que para de andar sem nada explicando.
    try {
      // Rede bloqueada: o run fica na fila, sem gastar tentativa — volta a
      // andar quando a rede voltar (o "esperar 3 dias" não se perde).
      if (await redeEstaBloqueada(run.tenant_id as string)) continue
      // A tentativa é contada ANTES de rodar. Contar depois faria um run que
      // derruba o processo no meio ser tentado para sempre — e um run que
      // derruba o processo é exatamente o que mais precisa parar de voltar.
      //
      // ⚠️ E a contagem é também a REIVINDICAÇÃO da execução. O `.eq('tentativas',
      // …)` faz dela um compare-and-swap: quem escreve primeiro leva, e o segundo
      // não acha linha para atualizar. Sem isso, duas passagens concorrentes do
      // cron selecionam o mesmo run e executam os passos dele DUAS VEZES — num
      // `notificar_equipe` é um aviso duplicado; numa ação de mensagem, é o
      // cliente recebendo a mesma coisa duas vezes.
      //
      // Concorrer é normal: o serviço roda de 5 em 5 minutos e uma passagem com
      // fila grande passa disso. Mesmo idioma de `ultimo_disparo_agenda` (§9.9):
      // a marca vai antes de executar, e o que decide é quantas linhas mudaram.
      //
      // ⚠️ E a reivindicação TIRA o run da fila (status `rodando`) na mesma
      // escrita. Só o compare-and-swap não bastava: se a passagem B lesse a fila
      // DEPOIS de A reivindicar — e antes de o motor marcar `rodando`, o que só
      // acontece depois de ler o run e a automação —, B via o run ainda
      // `esperando`, agora com `tentativas` já somada, e o CAS dela (1 → 2)
      // também passava: o passo rodava duas vezes. Foi o que a suíte completa
      // pegou em 2026-09-30 (automacoes-cron-concorrente, intermitente).
      const tentativas = (run.tentativas as number) ?? 0
      const reivindicado = await gravar(admin
        .from('automation_runs')
        .update({ tentativas: tentativas + 1, status: 'rodando' })
        .eq('id', run.id as string)
        .eq('tentativas', tentativas)
        .in('status', ['esperando', 'falhou'])
        .select('id'), 'reivindicar a execução')

      // Zero linhas não é erro: é outra passagem que chegou primeiro. Seguir
      // daqui executaria o mesmo fluxo de novo.
      if (!reivindicado || (reivindicado as unknown[]).length === 0) continue

      const status = await executarRun(run.id as string)
      if (status === 'falhou') erros += 1
      retomadas += 1
    } catch (e) {
      console.error(`[cron automacoes] run ${run.id}:`, e)
      erros += 1
    }
  }

  return { retomadas, erros }
}

/**
 * Os gatilhos de horário.
 *
 * Só automações ATIVAS com um `gatilho.agenda` no grafo. A checagem de "já
 * disparou hoje" mora em `automations.ultimo_disparo_agenda`: sem ela, das
 * 9:00 às 9:05 o lembrete diário sairia uma vez por passagem do cron.
 */
async function dispararAgendas(): Promise<number> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('automations')
    .select('id, tenant_id, grafo, ultimo_disparo_agenda')
    .eq('status', 'ATIVA')

  if (error) { console.error('[cron automacoes] agendas:', error.message); return 0 }

  let disparadas = 0

  for (const a of data ?? []) {
    const grafo = a.grafo as GrafoDeAutomacao
    const gatilho = grafo?.nos?.find(n => n.tipo === NODES.GATILHO_AGENDA)
    if (!gatilho) continue

    const cfg = gatilho.config as ConfigGatilhoAgenda
    // O relógio da clínica (F62b): o fuso comum das unidades.
    const fuso = await fusoDaRede(a.tenant_id as string)
    if (!estaNaHora(cfg, a.ultimo_disparo_agenda as string | null, new Date(), fuso)) continue
    if (await redeEstaBloqueada(a.tenant_id as string)) continue
    // Automações fora do PLANO da rede: o gatilho de tempo não dispara.
    if (!(await redeTemRecurso(a.tenant_id as string, 'automacoes'))) continue

    // Marca ANTES de executar. Se a execução demorar mais que a passagem
    // seguinte do cron — uma busca de quinhentos clientes leva —, a próxima
    // passagem encontraria o gatilho ainda "na hora" e abriria tudo de novo.
    const anterior = a.ultimo_disparo_agenda as string | null
    let marca = admin
      .from('automations')
      .update({ ultimo_disparo_agenda: new Date().toISOString() })
      .eq('id', a.id as string)
      .select('id')

    // Só marca se ninguém marcou no meio-tempo: duas instâncias do cron não
    // podem disparar o mesmo gatilho. NULL exige `is`: `eq.null` compara com
    // NULL e nunca casa, e o update passava sem gravar nada — no primeiro
    // disparo de cada automação, justamente.
    marca = anterior === null
      ? marca.is('ultimo_disparo_agenda', null)
      : marca.eq('ultimo_disparo_agenda', anterior)

    const { data: marcadas, error: erroMarca } = await marca

    if (erroMarca) { console.error('[cron automacoes] marca:', erroMarca.message); continue }
    // Nenhuma linha: outra passagem do cron chegou primeiro. Sem isto os dois
    // processos disparariam o mesmo gatilho — e com "a cada 5 minutos" uma
    // marca que não grava vira disparo em toda passagem, para sempre.
    if (!marcadas || marcadas.length === 0) continue

    const { data: run, error: erroRun } = await admin
      .from('automation_runs')
      .insert({
        tenant_id:     a.tenant_id,
        automation_id: a.id,
        evento_id:     null,
        no_atual:      gatilho.id,
        status:        'esperando',
        // Gatilho de tempo nasce na profundidade zero: não veio de automação
        // nenhuma, veio do relógio.
        profundidade:  0,
        // Gatilho de intervalo não tem horário configurado — o que ele tem é a
        // hora em que de fato saiu. Deixar `hora` vazia faria a variável sair
        // em branco no meio da mensagem, sem nada explicando.
        contexto:      { agenda: { hora: cfg.hora ?? horaAgora(fuso), quando: new Date().toISOString() } },
      })
      .select('id')
      .single()

    if (erroRun || !run) { console.error('[cron automacoes] run:', erroRun?.message); continue }

    await executarRun(run.id as string)
    disparadas += 1
  }

  return disparadas
}

/** 'HH:MM' no fuso da clínica, para o gatilho que não tem horário marcado. */
function horaAgora(fuso?: string): string {
  const p = partsInTZ(new Date(), fuso)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
