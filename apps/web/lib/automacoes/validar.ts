import { NODES, TIPOS_DE_GATILHO } from '@estetica-os/types'
import type { GrafoDeAutomacao, NoDoGrafo, TipoDeNo } from '@estetica-os/types'

/**
 * A conferência do grafo antes de ativar.
 *
 * Existe pelo mesmo motivo do painel de eventos: **automação inválida não
 * avisa**. Ela fica salva, ligada e silenciosa, e o sintoma de "o node não
 * está conectado" é idêntico ao de "ainda não aconteceu". Aqui os problemas
 * viram frases antes de alguém depender do fluxo.
 *
 * Função pura, sem banco: é ela que os testes cobrem, e é ela que a tela chama
 * a cada mudança para acender o aviso.
 */

export interface ProblemaDoGrafo {
  /** Node a culpar, quando há um. A tela destaca. */
  noId?:   string
  mensagem: string
  /** `erro` impede ativar; `aviso` só alerta. */
  grau:    'erro' | 'aviso'
}

/** Campos sem os quais o node não faz nada — por tipo. */
const OBRIGATORIOS: Partial<Record<TipoDeNo, { campo: string; rotulo: string }[]>> = {
  [NODES.GATILHO_EVENTO]:        [{ campo: 'evento', rotulo: 'o evento que dispara' }],
  [NODES.GATILHO_AGENDA]:        [{ campo: 'hora',   rotulo: 'o horário' }],
  [NODES.ACAO_NOTIFICAR_EQUIPE]: [{ campo: 'alvo',   rotulo: 'quem avisar' }, { campo: 'corpo', rotulo: 'a mensagem' }],
  [NODES.ACAO_ANOTAR]:           [{ campo: 'texto',  rotulo: 'o texto da anotação' }],
  [NODES.ACAO_MENSAGEM]:         [{ campo: 'canal',  rotulo: 'o canal' }, { campo: 'texto', rotulo: 'a mensagem' }],
  [NODES.ACAO_MOVER_ETAPA]:      [{ campo: 'etapaId', rotulo: 'a etapa de destino' }],
  [NODES.ACAO_TAG_CLIENTE]:      [{ campo: 'tag',    rotulo: 'a tag' }],
  [NODES.CONDICAO_ESCOLHA]:      [{ campo: 'campo',  rotulo: 'o campo a comparar' }],
}

export function validarGrafo(grafo: GrafoDeAutomacao): ProblemaDoGrafo[] {
  const problemas: ProblemaDoGrafo[] = []
  const nos = grafo?.nos ?? []
  const ligacoes = grafo?.ligacoes ?? []

  // ── Gatilho: exatamente um ────────────────────────────────────────────
  const gatilhos = nos.filter(n => (TIPOS_DE_GATILHO as readonly string[]).includes(n.tipo))

  if (gatilhos.length === 0) {
    problemas.push({ grau: 'erro', mensagem: 'O fluxo precisa de um gatilho — sem ele nada o inicia.' })
  } else if (gatilhos.length > 1) {
    // Dois gatilhos pareceriam "dispara nos dois casos", mas o motor entra por
    // um só. Melhor recusar do que deixar metade do fluxo morta.
    problemas.push({
      grau: 'erro',
      noId: gatilhos[1]!.id,
      mensagem: 'Há mais de um gatilho. Um fluxo começa em um ponto só.',
    })
  }

  if (nos.length === 0) {
    return problemas
  }

  // ── Campos obrigatórios ───────────────────────────────────────────────
  for (const no of nos) {
    for (const exigido of OBRIGATORIOS[no.tipo as TipoDeNo] ?? []) {
      const v = (no.config as Record<string, unknown>)?.[exigido.campo]
      if (v === undefined || v === null || v === '') {
        problemas.push({
          grau: 'erro', noId: no.id,
          mensagem: `Falta ${exigido.rotulo} em "${rotuloCurto(no)}".`,
        })
      }
    }
  }

  // ── Órfãos: node que nunca é alcançado ────────────────────────────────
  const alcancados = alcancaveis(grafo, gatilhos[0]?.id)
  for (const no of nos) {
    if ((TIPOS_DE_GATILHO as readonly string[]).includes(no.tipo)) continue
    if (!alcancados.has(no.id)) {
      problemas.push({
        grau: 'erro', noId: no.id,
        mensagem: `"${rotuloCurto(no)}" não está ligado ao fluxo — nunca vai acontecer.`,
      })
    }
  }

  // ── Ciclo ─────────────────────────────────────────────────────────────
  // O executor tem teto de passos, mas descobrir o anel só na execução é
  // descobrir tarde: já houve ações repetidas até o teto bater.
  const noDoCiclo = acharCiclo(grafo)
  if (noDoCiclo) {
    problemas.push({
      grau: 'erro', noId: noDoCiclo,
      mensagem: 'O fluxo volta para si mesmo. Um caminho circular repetiria as ações sem parar.',
    })
  }

  // ── Avisos: não impedem ativar, mas quase sempre são engano ───────────
  for (const no of nos) {
    if (no.tipo === NODES.CONDICAO_SE) {
      const saidas = ligacoes.filter(l => l.de === no.id).map(l => l.saida)
      if (!saidas.includes('sim') && !saidas.includes('nao')) {
        problemas.push({
          grau: 'erro', noId: no.id,
          mensagem: 'A condição não leva a lugar nenhum: ligue ao menos uma das saídas.',
        })
      } else if (!saidas.includes('sim') || !saidas.includes('nao')) {
        problemas.push({
          grau: 'aviso', noId: no.id,
          mensagem: 'Só um lado da condição está ligado — o outro caminho termina aqui.',
        })
      }
    }

    if (no.tipo === NODES.BUSCAR_CLIENTES) {
      const veioDeAgenda = ligacoes.some(l =>
        l.para === no.id &&
        nos.find(n => n.id === l.de)?.tipo === NODES.GATILHO_AGENDA,
      )
      if (!veioDeAgenda) {
        problemas.push({
          grau: 'aviso', noId: no.id,
          mensagem: 'Buscar clientes foi feito para gatilho de horário; num gatilho de evento o fluxo já tem o cliente.',
        })
      }
    }
  }

  return problemas
}

/** Só os erros impedem ativar; avisos ficam na tela. */
export function podeAtivar(grafo: GrafoDeAutomacao): boolean {
  return !validarGrafo(grafo).some(p => p.grau === 'erro')
}

/**
 * Os nomes de evento que o grafo assina.
 *
 * É o que vai para a coluna `gatilhos`, e é por ela que o motor acha as
 * automações sem abrir o grafo de ninguém. Derivado a cada salvamento —
 * escrito à mão, dessincronizaria no primeiro ajuste.
 */
export function gatilhosDoGrafo(grafo: GrafoDeAutomacao): string[] {
  const nomes = (grafo?.nos ?? [])
    .filter(n => n.tipo === NODES.GATILHO_EVENTO)
    .map(n => (n.config as { evento?: string })?.evento)
    .filter((n): n is string => !!n)
  return [...new Set(nomes)]
}

function alcancaveis(grafo: GrafoDeAutomacao, inicio?: string): Set<string> {
  const vistos = new Set<string>()
  if (!inicio) return vistos

  const fila = [inicio]
  vistos.add(inicio)

  while (fila.length) {
    const atual = fila.shift()!
    for (const l of grafo.ligacoes) {
      if (l.de === atual && !vistos.has(l.para)) {
        vistos.add(l.para)
        fila.push(l.para)
      }
    }
  }
  return vistos
}

/** Busca em profundidade com marcação de cinza — devolve o node que fecha o anel. */
function acharCiclo(grafo: GrafoDeAutomacao): string | null {
  const saindo = new Map<string, string[]>()
  for (const l of grafo.ligacoes) {
    saindo.set(l.de, [...(saindo.get(l.de) ?? []), l.para])
  }

  const cor = new Map<string, 'cinza' | 'preto'>()

  function visitar(id: string): string | null {
    cor.set(id, 'cinza')
    for (const proximo of saindo.get(id) ?? []) {
      if (cor.get(proximo) === 'cinza') return proximo
      if (!cor.has(proximo)) {
        const achado = visitar(proximo)
        if (achado) return achado
      }
    }
    cor.set(id, 'preto')
    return null
  }

  for (const no of grafo.nos) {
    if (!cor.has(no.id)) {
      const achado = visitar(no.id)
      if (achado) return achado
    }
  }
  return null
}

function rotuloCurto(no: NoDoGrafo): string {
  return ROTULOS[no.tipo as TipoDeNo] ?? no.tipo
}

/** Nome de cada node em pt-BR — usado na validação e na paleta do quadro. */
export const ROTULOS: Record<TipoDeNo, string> = {
  [NODES.GATILHO_EVENTO]:        'Quando acontecer',
  [NODES.GATILHO_AGENDA]:        'Todo dia, no horário',
  [NODES.BUSCAR_CLIENTES]:       'Buscar clientes',
  [NODES.CONDICAO_SE]:           'Se',
  [NODES.CONDICAO_ESCOLHA]:      'Escolher por',
  [NODES.ESPERA_DURACAO]:        'Esperar',
  [NODES.ESPERA_ATE]:            'Esperar até',
  [NODES.ACAO_MENSAGEM]:         'Mandar mensagem',
  [NODES.ACAO_NOTIFICAR_EQUIPE]: 'Avisar a equipe',
  [NODES.ACAO_MOVER_ETAPA]:      'Mover de etapa',
  [NODES.ACAO_DESFECHO]:         'Marcar ganho ou perdido',
  [NODES.ACAO_TAG_CLIENTE]:      'Marcar com tag',
  [NODES.ACAO_ATRIBUIR]:         'Definir responsável',
  [NODES.ACAO_ANOTAR]:           'Anotar na oportunidade',
  [NODES.ACAO_LEMBRETE]:         'Criar lembrete',
}
