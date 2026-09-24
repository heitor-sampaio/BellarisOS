import { NODES, TIPOS_DE_GATILHO, ROTULOS_DE_NO, INTERVALO_MINIMO_MIN } from '@estetica-os/types'
import type {
  GrafoDeAutomacao, NoDoGrafo, TipoDeNo, GrupoDeCondicao, ConfigGatilhoAgenda,
} from '@estetica-os/types'
import { caminhosDoTexto } from './variaveis'
import { conferirExpressao, ehCaminhoSimples } from './expressao'
import { antecessoresDe } from './disponiveis'
import { chaveDoPasso, nomeDoPasso } from './passos'

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

    // O gatilho de horário pede coisas diferentes conforme a frequência: "a
    // cada 30 minutos" não tem horário do dia, e "todo dia" não tem intervalo.
    // Uma tabela de campos fixos cobraria sempre os dois.
    if (no.tipo === NODES.GATILHO_AGENDA) {
      const cfg = no.config as ConfigGatilhoAgenda
      const porIntervalo = cfg?.frequencia === 'minutos' || cfg?.frequencia === 'horas'

      if (porIntervalo) {
        const n = Number(cfg?.intervalo ?? 0)
        if (!Number.isFinite(n) || n <= 0) {
          problemas.push({
            grau: 'erro', noId: no.id,
            mensagem: `Falta de quanto em quanto disparar em "${rotuloCurto(no)}".`,
          })
        } else if (cfg.frequencia === 'minutos' && n < INTERVALO_MINIMO_MIN) {
          // Não é preciosismo: o cron passa de cinco em cinco minutos, e
          // aceitar "a cada 1 minuto" seria prometer um ritmo que o relógio
          // não entrega — a automação sairia de cinco em cinco do mesmo jeito,
          // sem nada dizendo por quê.
          problemas.push({
            grau: 'erro', noId: no.id,
            mensagem: `O menor intervalo é de ${INTERVALO_MINIMO_MIN} minutos — é de quanto em quanto o relógio passa.`,
          })
        }
      } else if (!cfg?.hora) {
        problemas.push({
          grau: 'erro', noId: no.id,
          mensagem: `Falta o horário em "${rotuloCurto(no)}".`,
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

  problemas.push(...conferirReferencias(grafo))
  problemas.push(...conferirExpressoes(grafo))

  return problemas
}

/**
 * Expressão com erro de escrita não pode passar daqui.
 *
 * No motor, expressão quebrada devolve vazio em vez de explodir — derrubar o
 * run no meio de um fluxo com efeitos seria pior. O preço disso é que o erro
 * fica MUDO na execução: a mensagem sai com um buraco e ninguém sabe por quê.
 * Então a hora de reclamar é esta, antes de ativar.
 */
function conferirExpressoes(grafo: GrafoDeAutomacao): ProblemaDoGrafo[] {
  const problemas: ProblemaDoGrafo[] = []

  for (const no of grafo?.nos ?? []) {
    for (const texto of expressoesDoNo(no)) {
      if (ehCaminhoSimples(texto)) continue
      const erro = conferirExpressao(texto)
      if (!erro) continue
      problemas.push({
        grau: 'erro', noId: no.id,
        mensagem: `Em "${rotuloCurto(no)}", a expressão \`${texto.trim()}\` tem um problema: ${erro}`,
      })
    }
  }

  return problemas
}

/** Tudo que este node guarda e que é avaliado como expressão. */
function expressoesDoNo(no: NoDoGrafo): string[] {
  const c = (no.config ?? {}) as Record<string, unknown>
  const achadas: string[] = []

  // Dentro das chaves duplas, nos textos.
  for (const chave of ['titulo', 'corpo', 'texto']) {
    const v = c[chave]
    if (typeof v !== 'string') continue
    for (const m of v.matchAll(/\{\{([^}]*)\}\}/g)) achadas.push(m[1]!)
  }

  if (typeof c.campo === 'string' && c.campo.trim()) achadas.push(c.campo)

  for (const chave of ['grupo', 'filtro']) {
    for (const r of (c[chave] as GrupoDeCondicao | undefined)?.regras ?? []) {
      if (r.campo?.trim()) achadas.push(r.campo)
    }
  }

  return achadas
}

/**
 * As referências a outros passos (`{{passos.x.campo}}`) apontam para algo que
 * de fato acontece antes?
 *
 * Duas formas de quebrar, as duas mudas em produção:
 *
 *  - **citar um passo que não é antecessor** — o do outro ramo do IF, ou um que
 *    vem depois. No disparo o valor não existe, e variável sem valor vira
 *    string vazia: a frase sai pela metade para o cliente sem nada avisar;
 *  - **dois passos com o mesmo nome** — a chave é a mesma, e o segundo
 *    sobrescreve o que o primeiro deixou.
 *
 * Renomear um passo depois de citá-lo cai no primeiro caso — que é
 * exatamente o motivo de esta conferência existir.
 */
function conferirReferencias(grafo: GrafoDeAutomacao): ProblemaDoGrafo[] {
  const problemas: ProblemaDoGrafo[] = []
  const nos = grafo?.nos ?? []

  const vistas = new Map<string, string>()
  for (const no of nos) {
    const chave = chaveDoPasso(no, grafo)
    const dono = vistas.get(chave)
    if (dono) {
      problemas.push({
        grau: 'erro', noId: no.id,
        mensagem: `Há dois passos chamados "${nomeDoPasso(no, grafo)}". `
          + 'O nome é a chave por onde os seguintes leem o resultado — dê outro a um deles.',
      })
    } else {
      vistas.set(chave, no.id)
    }
  }

  for (const no of nos) {
    const antes = new Set(antecessoresDe(grafo, no.id).map(a => chaveDoPasso(a, grafo)))
    for (const caminho of caminhosCitados(no)) {
      if (!caminho.startsWith('passos.')) continue
      const chave = caminho.split('.')[1] ?? ''
      if (!chave || antes.has(chave)) continue
      problemas.push({
        grau: 'erro', noId: no.id,
        mensagem: `"${rotuloCurto(no)}" usa o resultado do passo "${chave}", `
          + 'que não acontece antes dele.',
      })
    }
  }

  return problemas
}

/** Todo caminho de contexto que este node cita — em texto ou em condição. */
function caminhosCitados(no: NoDoGrafo): string[] {
  const c = (no.config ?? {}) as Record<string, unknown>
  const achados: string[] = []

  for (const chave of ['titulo', 'corpo', 'texto']) {
    const v = c[chave]
    if (typeof v === 'string') achados.push(...caminhosDoTexto(v))
  }

  if (typeof c.campo === 'string' && c.campo) achados.push(c.campo)

  // `grupo` é o IF; `filtro` é a condição do próprio gatilho.
  for (const chave of ['grupo', 'filtro']) {
    for (const r of (c[chave] as GrupoDeCondicao | undefined)?.regras ?? []) {
      if (r.campo) achados.push(r.campo)
    }
  }

  return achados
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
  return ROTULOS_DE_NO[no.tipo as TipoDeNo] ?? no.tipo
}

/**
 * Nome de cada node em pt-BR.
 *
 * Mora no catálogo (`@estetica-os/types`) desde que o executor passou a
 * precisar dele para nomear o passo: deixá-lo aqui faria `passos.ts` importar
 * o validador, e o validador importar `passos.ts` de volta.
 */
export { ROTULOS_DE_NO as ROTULOS } from '@estetica-os/types'
