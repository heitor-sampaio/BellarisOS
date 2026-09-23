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

  // ── Clientes ──────────────────────────────────────────────────────────
  CLIENTE_CRIADO:          'cliente.criado',
  CLIENTE_DADOS_ALTERADOS: 'cliente.dados_alterados',
  CLIENTE_DESATIVADO:      'cliente.desativado',
  CLIENTE_REATIVADO:       'cliente.reativado',

  // ── CRM ───────────────────────────────────────────────────────────────
  // `ganho` e `perdido` são eventos próprios, e não `etapa_mudou` com um
  // campo: são os dois momentos em que a automação mais tem o que fazer
  // (agradecer, pedir avaliação, recuperar), e obrigar o motor a ler o
  // `outcome` da etapa para descobrir isso seria devolver a ele o trabalho
  // que este catálogo existe para poupar.
  LEAD_CRIADO:      'lead.criado',
  LEAD_ETAPA_MUDOU: 'lead.etapa_mudou',
  LEAD_GANHO:       'lead.ganho',
  LEAD_PERDIDO:     'lead.perdido',

  // ── Inbox ─────────────────────────────────────────────────────────────
  // Metade destes nasce no WEBHOOK, não numa ação — é o motivo de o emissor
  // aceitar `origem` e ator 'sistema'.
  CONVERSA_INICIADA:          'conversa.iniciada',
  CONVERSA_MENSAGEM_RECEBIDA: 'conversa.mensagem_recebida',
  CONVERSA_MENSAGEM_ENVIADA:  'conversa.mensagem_enviada',
  CONVERSA_VEIO_DE_ANUNCIO:   'conversa.veio_de_anuncio',
} as const

export type NomeDeEvento = typeof EVENTOS[keyof typeof EVENTOS]

/** Entidade a que o evento se refere — o prefixo do nome. */
export type EntidadeDeEvento = 'agendamento' | 'cliente' | 'lead' | 'conversa'

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

/**
 * Retrato do cliente nos eventos de cliente.
 *
 * Telefone e e-mail viajam junto porque é por eles que quase toda automação
 * fala com a pessoa; ir ao banco buscá-los seria uma consulta por disparo.
 */
export interface DadosDeCliente extends DadosDeEvento {
  nome:     string | null
  telefone: string | null
  email:    string | null
  /** Só em desativação/reativação. */
  ativo?:   boolean
}

/** Retrato do card no funil. */
export interface DadosDeLead extends DadosDeEvento {
  nome:        string | null
  telefone:    string | null
  clienteId:   string | null
  funilNome:   string | null
  etapaNome:   string | null
  /** Só em mudança de etapa: de onde saiu. */
  deEtapaNome?: string | null
  /** 'OPEN' | 'WON' | 'LOST' — o desfecho da etapa de destino. */
  desfecho?:   string | null
  /** De onde o contato veio: 'Meta Ads', 'Orgânico'… */
  origemDoLead?: string | null
}

/**
 * Retrato da conversa e da mensagem.
 *
 * `texto` entra porque a automação de primeiro atendimento decide pelo que a
 * pessoa escreveu ("quanto custa", "quero agendar") — sem ele, o motor teria
 * de buscar a mensagem que acabou de chegar.
 */
export interface DadosDeConversa extends DadosDeEvento {
  contatoNome:     string | null
  contatoTelefone: string | null
  canal:           string
  clienteId:       string | null
  /** Nas mensagens. */
  texto?:          string | null
  mensagemId?:     string | null
  temMidia?:       boolean
  /** Quando veio de anúncio (click-to-WhatsApp). */
  anuncioId?:      string | null
  anuncioTitulo?:  string | null
  campanhaNome?:   string | null
}
