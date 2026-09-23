/**
 * Catálogo de eventos de domínio.
 *
 * É a lista de tudo que o sistema sabe dizer que aconteceu, e a fonte dos
 * gatilhos das automações. Vive aqui, e não num `check` da tabela, por dois
 * motivos: um check obrigaria migração a cada evento novo, e é o TypeScript
 * que barra nome inventado no momento da emissão — que é onde o erro
 * aconteceria.
 *
 * **Nomeado pela INTENÇÃO, não pela operação.** `agendamento.nao_compareceu`,
 * nunca `appointments.atualizado`: automação não consegue fazer nada com
 * "atualizado" sem inspecionar campos, e uma lista de 290 itens desses não cabe
 * numa tela de escolha. Decisão do Heitor em 2026-09-23.
 *
 * Convenção: `entidade.verbo_no_passado`, em pt-BR como o resto do sistema.
 *
 * ⚠️ Acrescentar um nome aqui NÃO cria o evento. `tests/eventos-catalogo.test.ts`
 * falha enquanto não houver um `emitirEvento` correspondente no código —
 * catálogo que promete evento sem emissor é a forma de drift mais cruel, porque
 * a automação é montada, salva, e simplesmente nunca dispara.
 */

export const EVENTOS = {
  // ── Agenda ────────────────────────────────────────────────────────────
  // A agenda é onde a intenção mais se distingue da operação: cancelar,
  // remarcar e não comparecer são o mesmo UPDATE para o banco e três
  // automações diferentes para a clínica.
  AGENDAMENTO_CRIADO:         'agendamento.criado',
  AGENDAMENTO_CONFIRMADO:     'agendamento.confirmado',
  AGENDAMENTO_CHECK_IN:       'agendamento.check_in',
  AGENDAMENTO_INICIADO:       'agendamento.iniciado',
  AGENDAMENTO_CONCLUIDO:      'agendamento.concluido',
  AGENDAMENTO_CANCELADO:      'agendamento.cancelado',
  AGENDAMENTO_NAO_COMPARECEU: 'agendamento.nao_compareceu',
  AGENDAMENTO_REMARCADO:      'agendamento.remarcado',
} as const

export type NomeDeEvento = typeof EVENTOS[keyof typeof EVENTOS]

/** Entidade a que o evento se refere — o prefixo do nome. */
export type EntidadeDeEvento = 'agendamento'

/** De onde o fato veio. Webhook e cron não têm ator humano. */
export type OrigemDeEvento = 'app' | 'webhook' | 'cron'

export type TipoDeAtor = 'usuario' | 'cliente' | 'sistema'

export interface AtorDoEvento {
  id?:   string | null
  nome?: string | null
  tipo:  TipoDeAtor
}

/**
 * Campos que todo `dados` carrega, quando fazem sentido.
 *
 * `alterou` é o que separa "o cliente mudou" de "o TELEFONE do cliente mudou",
 * e é o que permite a automação reagir a um campo específico. Mesmo desenho de
 * `lead_events.changes`, que já provou servir na linha do tempo do card.
 */
export interface DadosDeEvento {
  alterou?: string[]
  [campo: string]: unknown
}

/** Uma linha da corrente, do jeito que quem lê recebe. */
export interface EventoDeDominio {
  id:          string
  nome:        NomeDeEvento
  entidade:    EntidadeDeEvento
  entidade_id: string | null
  branch_id:   string | null
  dados:       DadosDeEvento
  ator_id:     string | null
  ator_nome:   string | null
  ator_tipo:   TipoDeAtor
  origem:      OrigemDeEvento
  ocorrido_em: string
}

/**
 * Payload de um agendamento nos eventos da agenda.
 *
 * O snapshot existe para a automação não precisar consultar o banco para
 * decidir se dispara: nome e telefone do cliente são o que a maioria das
 * automações de agenda usa (mandar lembrete, avisar do no-show).
 */
export interface DadosDeAgendamento extends DadosDeEvento {
  clienteId:       string | null
  clienteNome:     string | null
  clienteTelefone: string | null
  procedimentoId:   string | null
  procedimentoNome: string | null
  profissionalId:   string | null
  profissionalNome: string | null
  agendadoPara:    string | null   // ISO
  status:          string
  /** Só em cancelamento — é obrigatório na action, e a automação usa no texto. */
  motivo?:         string | null
  /** Só em remarcação: de quando para quando. */
  deAgendadoPara?: string | null
}
