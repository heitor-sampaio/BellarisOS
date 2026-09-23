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

  // ── Dinheiro ──────────────────────────────────────────────────────────
  // ⚠️ `pagamento.*` são os ÚNICOS eventos que saem de gatilho no banco, e
  // por isso chegam com `origem: 'banco'` e SEM ator. A razão está na
  // migração `20260923000002`: um pagamento vira real em seis lugares do
  // código, e para dinheiro completude vale mais que saber quem digitou.
  PAGAMENTO_RECEBIDO:  'pagamento.recebido',
  PAGAMENTO_ESTORNADO: 'pagamento.estornado',

  PLANO_CRIADO:   'plano.criado',
  PLANO_PROPOSTO: 'plano.proposto',
  PLANO_ACEITO:   'plano.aceito',

  PACOTE_SESSAO_USADA: 'pacote.sessao_usada',
  COMISSAO_GERADA:     'comissao.gerada',

  // ── Clínico ───────────────────────────────────────────────────────────
  PRONTUARIO_ENTRADA_CRIADA: 'prontuario.entrada_criada',
  ANAMNESE_RESPONDIDA:       'anamnese.respondida',
  TERMO_ASSINADO:            'termo.assinado',
  INJETAVEL_APLICADO:        'injetavel.aplicado',
  // A foto vive DENTRO da resposta da ficha, não numa galeria à parte: o fato
  // é o upload, que acontece antes de salvar e pode acabar descartado. Serve
  // para "a foto do antes chegou", não como inventário do que existe.
  FOTO_ENVIADA:              'foto.enviada',

  // ── Estoque ───────────────────────────────────────────────────────────
  // ⚠️ Como `pagamento.*`, estes saem de GATILHO no banco (`origem: 'banco'`,
  // sem ator): cinco caminhos do código gravam movimentação.
  //
  // `abaixo_do_minimo` dispara na TRAVESSIA do mínimo, não enquanto o saldo
  // está baixo — senão cada consumo de um produto já em falta repetiria o
  // alerta, e a automação mandaria a mesma mensagem cinco vezes no dia.
  ESTOQUE_MOVIMENTADO:      'estoque.movimentado',
  ESTOQUE_ABAIXO_DO_MINIMO: 'estoque.abaixo_do_minimo',
} as const

export type NomeDeEvento = typeof EVENTOS[keyof typeof EVENTOS]

/** Entidade a que o evento se refere — o prefixo do nome. */
export type EntidadeDeEvento =
  | 'agendamento' | 'cliente' | 'lead' | 'conversa'
  | 'pagamento' | 'plano' | 'pacote' | 'comissao'
  | 'prontuario' | 'anamnese' | 'termo' | 'injetavel' | 'foto' | 'estoque'

/**
 * De onde o fato veio. Webhook, cron e banco não têm ator humano.
 *
 * `'banco'` é gatilho no Postgres — a escrita passa pelo service role e
 * `auth.uid()` é nulo, então ali **nunca** haverá ator. É por este campo que o
 * motor sabe que não adianta procurar por um.
 */
export type OrigemDeEvento = 'app' | 'webhook' | 'cron' | 'banco'

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

/**
 * Retrato de um pagamento.
 *
 * ⚠️ Montado pelo GATILHO no banco, não pela aplicação — o que explica a
 * ausência de ator e a origem `'banco'`. Ver `EVENTOS.PAGAMENTO_RECEBIDO`.
 */
export interface DadosDePagamento extends DadosDeEvento {
  clienteId:      string | null
  clienteNome:    string | null
  /** Em reais. Vem do banco como `numeric`, então chega string no JSON. */
  valor:          string | number | null
  formaPagamento: string | null
  categoria:      string | null
  descricao:      string | null
  planoId:        string | null
  agendamentoId:  string | null
}

/** Retrato do plano de tratamento. */
export interface DadosDePlano extends DadosDeEvento {
  nome:        string | null
  clienteId:   string | null
  clienteNome: string | null
  /** Soma dos procedimentos das sessões. */
  total:       number
  sessoes:     number
  status:      string
}

/** Sessão de pacote consumida num atendimento. */
export interface DadosDePacote extends DadosDeEvento {
  clienteId:     string | null
  clienteNome:   string | null
  pacoteNome:    string | null
  agendamentoId: string | null
  /** Quantas sobraram DEPOIS desta. Zero é o gatilho de "acabou, renove". */
  restantes:     number | null
}

/**
 * Retrato de um fato clínico.
 *
 * O cliente vem junto porque toda automação clínica termina falando com ele —
 * confirmar que a anamnese chegou, avisar que o termo foi assinado.
 */
export interface DadosClinicos extends DadosDeEvento {
  clienteId:      string | null
  clienteNome:    string | null
  agendamentoId:  string | null
  /** Nome da ficha/termo/procedimento, conforme o evento. */
  referencia:     string | null
}

/**
 * Retrato de estoque. Montado pelo GATILHO no banco — daí não haver ator.
 */
export interface DadosDeEstoque extends DadosDeEvento {
  produtoId:   string | null
  produtoNome: string | null
  unidade:     string | null
  /** Só em movimentação. */
  tipo?:       string | null
  quantidade?: string | number | null
  saldoApos?:  string | number | null
  observacao?: string | null
  /** Só no alerta de mínimo. */
  saldo?:      string | number | null
  minimo?:     string | number | null
}

/** Comissão gerada na conclusão de um atendimento. */
export interface DadosDeComissao extends DadosDeEvento {
  profissionalId:   string | null
  profissionalNome: string | null
  agendamentoId:    string | null
  valor:            number | null
  periodo:          string | null   // 'YYYY-MM'
}
