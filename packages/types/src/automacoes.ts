/**
 * O catálogo de nodes das automações.
 *
 * É a fonte única, como `EVENTOS`: o quadro desenha a partir daqui e o executor
 * despacha a partir daqui. O `switch` exaustivo do executor garante que um tipo
 * declarado sem execução **não compila** — a mesma ideia da guarda do catálogo
 * de eventos, só que em tempo de build.
 *
 * Convenção de nome: `familia.coisa`, em pt-BR como o resto do sistema.
 */

import type { NomeDeEvento } from './eventos'

export const NODES = {
  // ── Gatilhos: por onde um fluxo começa ────────────────────────────────
  GATILHO_EVENTO: 'gatilho.evento',
  GATILHO_AGENDA: 'gatilho.agenda',

  // ── Busca: só faz sentido depois de um gatilho de tempo ───────────────
  BUSCAR_CLIENTES: 'buscar.clientes',

  // ── Decisão ───────────────────────────────────────────────────────────
  CONDICAO_SE:     'condicao.se',
  CONDICAO_ESCOLHA: 'condicao.escolha',

  // ── Tempo ─────────────────────────────────────────────────────────────
  ESPERA_DURACAO: 'espera.duracao',
  ESPERA_ATE:     'espera.ate',

  // ── Ações ─────────────────────────────────────────────────────────────
  ACAO_MENSAGEM:         'acao.mensagem',
  ACAO_NOTIFICAR_EQUIPE: 'acao.notificar_equipe',
  ACAO_MOVER_ETAPA:      'acao.mover_etapa',
  ACAO_DESFECHO:         'acao.desfecho',
  ACAO_TAG_CLIENTE:      'acao.tag_cliente',
  ACAO_ATRIBUIR:         'acao.atribuir',
  ACAO_ANOTAR:           'acao.anotar',
} as const

export type TipoDeNo = typeof NODES[keyof typeof NODES]

/** Gatilhos não têm entrada; o validador do grafo usa isto. */
export const TIPOS_DE_GATILHO: readonly TipoDeNo[] = [
  NODES.GATILHO_EVENTO,
  NODES.GATILHO_AGENDA,
]

/** Nodes com mais de uma saída — o quadro desenha uma alça por saída. */
export const SAIDAS_DE: Partial<Record<TipoDeNo, readonly string[]>> = {
  [NODES.CONDICAO_SE]: ['sim', 'nao'],
  // `condicao.escolha` é dinâmico: as saídas vêm dos casos configurados, mais
  // 'padrao'. Declarado aqui como vazio para deixar explícito que é exceção.
  [NODES.CONDICAO_ESCOLHA]: [],
}

/**
 * Nome de cada node em pt-BR.
 *
 * Aqui e não na tela porque o executor também precisa: é daqui que sai o nome
 * padrão do passo ("Mandar mensagem 1"), e o nome do passo é a chave por onde
 * os nodes seguintes leem o que ele deixou.
 */
export const ROTULOS_DE_NO: Record<TipoDeNo, string> = {
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
}

/**
 * O que cada node DEIXA para os seguintes, em `passos.<nome do passo>`.
 *
 * Toda ação já devolvia um resumo — `{ enviada: true, conversaId }`,
 * `{ avisados: 3 }` — que ia para o histórico do run e morria ali. Agora ele
 * também entra no contexto, e é isto que diz à tela o que existe para escolher
 * sem precisar rodar o fluxo antes.
 *
 * **`motivo` aparece em quase todo mundo de propósito.** É o campo que explica
 * o que NÃO aconteceu ("o cliente já tinha esta tag", "não há conversa aberta"),
 * e é justamente o que um IF depois da ação quer ler para tomar o outro caminho.
 *
 * ⚠️ No ENSAIO a ação não roda, e o passo deixa `{ ensaio: true, faria }` em vez
 * destes campos. Uma condição sobre `passos.x.enviada` dá falso ali — e isso é
 * honesto: nada foi enviado.
 */
export interface DadoDoPasso {
  campo:  string
  rotulo: string
  tipo:   'texto' | 'numero' | 'booleano' | 'data'
}

const MOTIVO: DadoDoPasso = { campo: 'motivo', rotulo: 'Motivo (quando não fez)', tipo: 'texto' }

export const DADOS_DO_NO: Record<TipoDeNo, readonly DadoDoPasso[]> = {
  [NODES.GATILHO_EVENTO]: [
    { campo: 'gatilho', rotulo: 'Evento que disparou', tipo: 'texto' },
  ],
  [NODES.GATILHO_AGENDA]: [
    { campo: 'gatilho', rotulo: 'Gatilho', tipo: 'texto' },
  ],
  [NODES.BUSCAR_CLIENTES]: [
    { campo: 'encontrados', rotulo: 'Quantos clientes achou', tipo: 'numero' },
    MOTIVO,
  ],
  [NODES.CONDICAO_SE]: [
    { campo: 'resultado', rotulo: 'Resultado (sim ou não)', tipo: 'texto' },
  ],
  [NODES.CONDICAO_ESCOLHA]: [
    { campo: 'campo', rotulo: 'Campo comparado', tipo: 'texto' },
    { campo: 'saida', rotulo: 'Caminho escolhido', tipo: 'texto' },
  ],
  [NODES.ESPERA_DURACAO]: [
    { campo: 'esperando', rotulo: 'Quanto esperou', tipo: 'texto' },
    { campo: 'ate',       rotulo: 'Até quando',    tipo: 'data'  },
  ],
  [NODES.ESPERA_ATE]: [
    { campo: 'campo', rotulo: 'Data usada',  tipo: 'texto' },
    { campo: 'ate',   rotulo: 'Até quando',  tipo: 'data'  },
    MOTIVO,
  ],
  [NODES.ACAO_MENSAGEM]: [
    { campo: 'enviada',    rotulo: 'Foi enviada',           tipo: 'booleano' },
    { campo: 'canal',      rotulo: 'Canal',                 tipo: 'texto' },
    { campo: 'conversaId', rotulo: 'Id da conversa',        tipo: 'texto' },
    { campo: 'texto',      rotulo: 'Texto que o cliente recebeu', tipo: 'texto' },
    MOTIVO,
  ],
  [NODES.ACAO_NOTIFICAR_EQUIPE]: [
    { campo: 'avisados', rotulo: 'Quantas pessoas avisou', tipo: 'numero' },
    { campo: 'alvo',     rotulo: 'Alvo do aviso',          tipo: 'texto' },
    MOTIVO,
  ],
  [NODES.ACAO_MOVER_ETAPA]: [
    { campo: 'movido', rotulo: 'Mudou de etapa', tipo: 'booleano' },
    { campo: 'de',     rotulo: 'Etapa anterior', tipo: 'texto' },
    { campo: 'para',   rotulo: 'Etapa nova',     tipo: 'texto' },
    MOTIVO,
  ],
  [NODES.ACAO_DESFECHO]: [
    { campo: 'movido',   rotulo: 'Marcou',          tipo: 'booleano' },
    { campo: 'desfecho', rotulo: 'Ganho ou perdido', tipo: 'texto' },
    { campo: 'para',     rotulo: 'Etapa de destino', tipo: 'texto' },
    MOTIVO,
  ],
  [NODES.ACAO_TAG_CLIENTE]: [
    { campo: 'alterado', rotulo: 'Mudou a tag',            tipo: 'booleano' },
    { campo: 'tag',      rotulo: 'Tag',                    tipo: 'texto' },
    { campo: 'modo',     rotulo: 'Adicionou ou removeu',   tipo: 'texto' },
    MOTIVO,
  ],
  [NODES.ACAO_ATRIBUIR]: [
    { campo: 'atribuido',   rotulo: 'Definiu responsável', tipo: 'booleano' },
    { campo: 'responsavel', rotulo: 'Quem ficou',          tipo: 'texto' },
    MOTIVO,
  ],
  [NODES.ACAO_ANOTAR]: [
    { campo: 'anotado', rotulo: 'Anotou', tipo: 'booleano' },
    { campo: 'leadId',  rotulo: 'Id da oportunidade', tipo: 'texto' },
    MOTIVO,
  ],
}

// ─── Condições ──────────────────────────────────────────────────────────────

/**
 * Operadores de comparação.
 *
 * Deliberadamente poucos: quem monta isto é a recepção da clínica, não um
 * programador. `vazio`/`preenchido` existem porque "o cliente não tem e-mail" é
 * uma pergunta comum e, com `igual a ""`, dá a resposta errada quando o campo
 * é nulo.
 *
 * O CAMPO comparado, por outro lado, deixou de ser só um caminho: desde
 * 2026-09-24 aceita expressão (`lib/automacoes/expressao.ts`), a pedido do
 * Heitor. A lista continua sendo o caminho normal da tela — a expressão é a
 * saída para o que ela não cobre, e nenhum operador novo nasceu daí.
 */
export type OperadorDeCondicao =
  | 'igual' | 'diferente'
  | 'contem' | 'nao_contem'
  | 'maior' | 'menor'
  | 'vazio' | 'preenchido'
  | 'em'    | 'nao_em'

export interface RegraDeCondicao {
  /** Caminho no contexto: 'cliente.nome', 'evento.dados.valor'. */
  campo:    string
  operador: OperadorDeCondicao
  /** Ausente em `vazio`/`preenchido`. Lista em `em`/`nao_em`. */
  valor?:   string | number | boolean | string[] | null
}

export interface GrupoDeCondicao {
  /** Como as regras deste grupo se combinam. */
  juncao: 'e' | 'ou'
  regras: RegraDeCondicao[]
}

// ─── Configuração de cada node ──────────────────────────────────────────────

export interface ConfigGatilhoEvento {
  /** O nome do catálogo de eventos que este fluxo assina. */
  evento:  NomeDeEvento
  /** Filtro opcional sobre o próprio evento, antes de criar a execução. */
  filtro?: GrupoDeCondicao
}

export interface ConfigGatilhoAgenda {
  frequencia: 'diaria' | 'semanal' | 'mensal'
  /** 'HH:MM' no fuso do negócio (America/Sao_Paulo). */
  hora:       string
  /** 0=domingo. Só em 'semanal'. */
  diaDaSemana?: number
  /** 1–28. Só em 'mensal' — 29 a 31 não existem todo mês. */
  diaDoMes?:    number
}

export interface ConfigBuscarClientes {
  semRetornoHaDias?: number
  aniversarioHoje?:  boolean
  tags?:             string[]
  unidadeId?:        string | null
  /** Teto de segurança por execução. */
  limite?:           number
}

export interface ConfigCondicaoSe {
  grupo: GrupoDeCondicao
}

export interface ConfigCondicaoEscolha {
  campo: string
  /** Cada caso vira uma saída com o mesmo nome da chave. */
  casos: { chave: string; valor: string }[]
}

export interface ConfigEsperaDuracao {
  quantidade: number
  unidade:    'minutos' | 'horas' | 'dias'
}

export interface ConfigEsperaAte {
  /** Campo de data no contexto: 'agendamento.data'. */
  campo:   string
  /** Deslocamento em minutos; negativo = antes. */
  minutos: number
}

export interface ConfigAcaoMensagem {
  canal: 'whatsapp' | 'instagram' | 'messenger'
  /** Texto com `{{variaveis}}`, usado dentro da janela de 24h. */
  texto: string
  /**
   * Template aprovado, usado FORA da janela. Sem ele, o passo falha com
   * motivo — mandar texto livre fora da janela é "enviado" que não chega.
   */
  templateId?: string | null
  /** Valores das variáveis do template, também interpolados. */
  variaveisDoTemplate?: Record<string, string>
}

export interface ConfigAcaoNotificarEquipe {
  alvo:    'usuario' | 'cargo' | 'unidade'
  alvoId?: string | null
  titulo:  string
  corpo:   string
}

export interface ConfigAcaoMoverEtapa {
  etapaId: string
}

export interface ConfigAcaoDesfecho {
  desfecho: 'ganho' | 'perdido'
  motivo?:  string
}

export interface ConfigAcaoTagCliente {
  tag:  string
  modo: 'adicionar' | 'remover'
}

export interface ConfigAcaoAtribuir {
  /** `null` = tirar o responsável. */
  usuarioId: string | null
}

export interface ConfigAcaoAnotar {
  texto: string
}

export type ConfigDeNo =
  | ConfigGatilhoEvento | ConfigGatilhoAgenda | ConfigBuscarClientes
  | ConfigCondicaoSe | ConfigCondicaoEscolha
  | ConfigEsperaDuracao | ConfigEsperaAte
  | ConfigAcaoMensagem | ConfigAcaoNotificarEquipe
  | ConfigAcaoMoverEtapa | ConfigAcaoDesfecho
  | ConfigAcaoTagCliente | ConfigAcaoAtribuir
  | ConfigAcaoAnotar

// ─── O grafo ────────────────────────────────────────────────────────────────

export interface NoDoGrafo {
  id:     string
  tipo:   TipoDeNo
  /** Posição no quadro. Só a tela usa; o executor ignora. */
  pos:    { x: number; y: number }
  config: Partial<ConfigDeNo>
  /**
   * Como este passo se chama — e, em forma de slug, a chave por onde os nodes
   * seguintes leem o que ele deixou: `{{passos.mandar_mensagem_1.conversaId}}`.
   *
   * Nasce automático a partir do tipo ("Mandar mensagem 1") e é editável. O id
   * serviria de chave e seria estável, mas `{{passos.n_7a3f.enviada}}` dentro
   * do texto de uma mensagem é ilegível para quem reler o fluxo depois.
   *
   * Opcional porque os grafos salvos antes disto não têm o campo — quem lê cai
   * no nome derivado do tipo (`nomeDoPasso`, em `lib/automacoes/passos.ts`).
   */
  nome?:  string
}

export interface LigacaoDoGrafo {
  id:      string
  de:      string
  para:    string
  /** Qual saída do node de origem: 'sim', 'nao', a chave de um caso. */
  saida?:  string
}

export interface GrafoDeAutomacao {
  nos:      NoDoGrafo[]
  ligacoes: LigacaoDoGrafo[]
}

// ─── Limites de bom comportamento ───────────────────────────────────────────

/**
 * O que impede a automação de incomodar.
 *
 * Padrão conservador de propósito: uma automação recém-criada não manda
 * mensagem de madrugada nem repete para a mesma pessoa no mesmo dia, mesmo que
 * quem a montou não tenha pensado nisso.
 */
export interface LimitesDaAutomacao {
  /** 'HH:MM' — fora desta faixa, ações de mensagem esperam o horário. */
  silencioDe?:   string
  silencioAte?:  string
  /** Máximo de execuções por cliente por dia. */
  tetoPorClienteDia?: number
}

export const LIMITES_PADRAO: LimitesDaAutomacao = {
  silencioDe:        '21:00',
  silencioAte:       '08:00',
  tetoPorClienteDia: 3,
}

/** Teto de encadeamento. Um anel fecha em três voltas, não em três mil. */
export const PROFUNDIDADE_MAXIMA = 3

export type StatusDaAutomacao = 'RASCUNHO' | 'ATIVA' | 'PAUSADA'
export type StatusDaExecucao   = 'esperando' | 'rodando' | 'ok' | 'falhou' | 'parado'
