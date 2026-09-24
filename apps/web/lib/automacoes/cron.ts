import { createAdminClient } from '@/lib/supabase/admin'
import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao, ConfigGatilhoAgenda } from '@estetica-os/types'
import { executarRun } from './executar'
import { estaNaHora } from './tempo'
import { partsInTZ } from '@/lib/datetime'

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
 *    só existe porque alguém pergunta pela hora.
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
  erros:     number
}

export async function rodarFilaDeAutomacoes(): Promise<ResultadoDoCron> {
  const agendas   = await dispararAgendas()
  const retomadas = await retomarPendentes()
  return { ...retomadas, agendas }
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
    .select('id, status, tentativas')
    .in('status', ['esperando', 'falhou'])
    .lte('rodar_apos', new Date().toISOString())
    .lt('tentativas', MAX_TENTATIVAS)
    .order('rodar_apos', { ascending: true })
    .limit(LOTE)

  if (error) { console.error('[cron automacoes] fila:', error.message); return { retomadas: 0, erros: 1 } }

  let retomadas = 0
  let erros = 0

  for (const run of data ?? []) {
    // A tentativa é contada ANTES de rodar. Contar depois faria um run que
    // derruba o processo no meio ser tentado para sempre — e um run que
    // derruba o processo é exatamente o que mais precisa parar de voltar.
    await admin
      .from('automation_runs')
      .update({ tentativas: ((run.tentativas as number) ?? 0) + 1 })
      .eq('id', run.id as string)

    const status = await executarRun(run.id as string)
    if (status === 'falhou') erros += 1
    retomadas += 1
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
    if (!estaNaHora(cfg, a.ultimo_disparo_agenda as string | null)) continue

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
        contexto:      { agenda: { hora: cfg.hora ?? horaAgora(), quando: new Date().toISOString() } },
      })
      .select('id')
      .single()

    if (erroRun || !run) { console.error('[cron automacoes] run:', erroRun?.message); continue }

    await executarRun(run.id as string)
    disparadas += 1
  }

  return disparadas
}

/** 'HH:MM' no fuso do negócio, para o gatilho que não tem horário marcado. */
function horaAgora(): string {
  const p = partsInTZ(new Date())
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
