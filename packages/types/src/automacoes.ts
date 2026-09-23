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
  ACAO_LEMBRETE:         'acao.lembrete',
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

// ─── Condições ──────────────────────────────────────────────────────────────

/**
 * Operadores de comparação.
 *
 * Deliberadamente poucos e sem expressão livre: quem monta isto é a recepção da
 * clínica, não um programador. `vazio`/`preenchido` existem porque "o cliente
 * não tem e-mail" é uma pergunta comum e, com `igual a ""`, dá a resposta
 * errada quando o campo é nulo.
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

export interface ConfigAcaoLembrete {
  /** Para quem, no mesmo formato do aviso à equipe. */
  alvo:       'usuario' | 'cargo' | 'unidade'
  alvoId?:    string | null
  titulo:     string
  corpo:      string
  quantidade: number
  unidade:    'minutos' | 'horas' | 'dias'
}

export type ConfigDeNo =
  | ConfigGatilhoEvento | ConfigGatilhoAgenda | ConfigBuscarClientes
  | ConfigCondicaoSe | ConfigCondicaoEscolha
  | ConfigEsperaDuracao | ConfigEsperaAte
  | ConfigAcaoMensagem | ConfigAcaoNotificarEquipe
  | ConfigAcaoMoverEtapa | ConfigAcaoDesfecho
  | ConfigAcaoTagCliente | ConfigAcaoAtribuir
  | ConfigAcaoAnotar | ConfigAcaoLembrete

// ─── O grafo ────────────────────────────────────────────────────────────────

export interface NoDoGrafo {
  id:     string
  tipo:   TipoDeNo
  /** Posição no quadro. Só a tela usa; o executor ignora. */
  pos:    { x: number; y: number }
  config: Partial<ConfigDeNo>
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
