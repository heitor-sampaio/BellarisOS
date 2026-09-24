import { EVENTOS } from './eventos'
import type { NomeDeEvento } from './eventos'

/**
 * O que cada evento carrega no `dados` — em português, para a tela oferecer.
 *
 * As interfaces logo acima (`DadosDeConversa`, `DadosDeAgendamento`…) dizem ao
 * TypeScript o que o emissor precisa preencher. **Isto aqui é a mesma verdade,
 * em runtime**: interface some na compilação, e o painel de automações precisa
 * da lista para deixar a pessoa escolher "o texto da mensagem" sem saber que
 * ele se chama `evento.dados.texto`.
 *
 * Sem esta lista, o motor lia o payload inteiro e a tela não oferecia nada
 * dele: o IF sabia comparar `evento.dados.texto` e ninguém conseguia escolhê-lo
 * — o dado estava lá e era inalcançável.
 *
 * ⚠️ **Não é a lista completa do que pode chegar.** `DadosDeEvento` tem índice
 * livre, e um emissor pode acrescentar um campo sem passar por aqui. Por isso o
 * painel soma a esta lista o que encontra no ÚLTIMO fato real daquele nome
 * (`amostraDoEvento`): o catálogo garante o previsível e com rótulo decente, a
 * amostra pega o resto. Campo declarado aqui e nunca emitido aparece vazio na
 * amostra — que é como se descobre a divergência.
 */

export interface CampoDeEvento {
  /** Caminho completo no contexto da automação. */
  caminho: string
  rotulo:  string
  tipo:    'texto' | 'numero' | 'booleano' | 'data' | 'lista'
}

/** Atalho: os campos moram todos sob `evento.dados`. */
function campo(nome: string, rotulo: string, tipo: CampoDeEvento['tipo'] = 'texto'): CampoDeEvento {
  return { caminho: `evento.dados.${nome}`, rotulo, tipo }
}

// ─── Por família ────────────────────────────────────────────────────────────
// O retrato é o mesmo dentro de cada família; o que varia são os extras de
// cada momento (o motivo só existe no cancelamento, o texto só nas mensagens).

const AGENDAMENTO: CampoDeEvento[] = [
  campo('clienteNome',      'Nome do cliente'),
  campo('clienteTelefone',  'Telefone do cliente'),
  campo('clienteId',        'Id do cliente'),
  campo('procedimentoNome', 'Procedimento'),
  campo('profissionalNome', 'Profissional'),
  campo('agendadoPara',     'Data e hora do agendamento', 'data'),
  campo('status',           'Situação'),
]

const CLIENTE: CampoDeEvento[] = [
  campo('nome',     'Nome'),
  campo('telefone', 'Telefone'),
  campo('email',    'E-mail'),
]

const LEAD: CampoDeEvento[] = [
  campo('nome',         'Nome do contato'),
  campo('telefone',     'Telefone'),
  campo('funilNome',    'Funil'),
  campo('etapaNome',    'Etapa'),
  campo('origemDoLead', 'De onde veio'),
  campo('clienteId',    'Id do cliente'),
]

const CONVERSA: CampoDeEvento[] = [
  campo('contatoNome',     'Nome do contato'),
  campo('contatoTelefone', 'Telefone do contato'),
  campo('canal',           'Canal'),
  campo('clienteId',       'Id do cliente'),
]

/** O que chega junto de uma mensagem — é o que a automação lê para decidir. */
const MENSAGEM: CampoDeEvento[] = [
  campo('texto',      'Texto da mensagem'),
  campo('temMidia',   'Tem mídia (foto, áudio…)', 'booleano'),
  campo('mensagemId', 'Id da mensagem'),
]

const ANUNCIO: CampoDeEvento[] = [
  campo('anuncioId',     'Id do anúncio'),
  campo('anuncioTitulo', 'Título do anúncio'),
  campo('campanhaNome',  'Campanha'),
]

const PAGAMENTO: CampoDeEvento[] = [
  campo('clienteNome',    'Nome do cliente'),
  campo('clienteId',      'Id do cliente'),
  campo('valor',          'Valor', 'numero'),
  campo('formaPagamento', 'Forma de pagamento'),
  campo('categoria',      'Categoria'),
  campo('descricao',      'Descrição'),
  campo('planoId',        'Id do plano'),
  campo('agendamentoId',  'Id do agendamento'),
]

const PLANO: CampoDeEvento[] = [
  campo('nome',        'Nome do plano'),
  campo('clienteNome', 'Nome do cliente'),
  campo('clienteId',   'Id do cliente'),
  campo('total',       'Valor total', 'numero'),
  campo('sessoes',     'Quantidade de sessões', 'numero'),
  campo('status',      'Situação'),
]

const CLINICO: CampoDeEvento[] = [
  campo('clienteNome',   'Nome do cliente'),
  campo('clienteId',     'Id do cliente'),
  campo('agendamentoId', 'Id do agendamento'),
  campo('referencia',    'Ficha, termo ou procedimento'),
]

const ESTOQUE: CampoDeEvento[] = [
  campo('produtoNome', 'Produto'),
  campo('produtoId',   'Id do produto'),
  campo('unidade',     'Unidade de medida'),
]

const MEMBRO: CampoDeEvento[] = [
  campo('nome',      'Nome'),
  campo('email',     'E-mail'),
  campo('cargoNome', 'Cargo'),
  campo('unidadeId', 'Id da unidade (vazio = rede)'),
]

const INTEGRACAO: CampoDeEvento[] = [
  campo('provedor', 'Provedor'),
  campo('rotulo',   'Como aparece (número, conta, página)'),
]

/** Muda de propósito em todo evento de alteração: o que mudou. */
const ALTEROU = campo('alterou', 'Campos que mudaram', 'lista')

export const CAMPOS_DO_EVENTO: Record<NomeDeEvento, CampoDeEvento[]> = {
  // ── Agenda ────────────────────────────────────────────────────────────
  [EVENTOS.AGENDAMENTO_CRIADO]:         AGENDAMENTO,
  [EVENTOS.AGENDAMENTO_CONFIRMADO]:     AGENDAMENTO,
  [EVENTOS.AGENDAMENTO_CHECK_IN]:       AGENDAMENTO,
  [EVENTOS.AGENDAMENTO_INICIADO]:       AGENDAMENTO,
  [EVENTOS.AGENDAMENTO_CONCLUIDO]:      AGENDAMENTO,
  [EVENTOS.AGENDAMENTO_NAO_COMPARECEU]: AGENDAMENTO,
  [EVENTOS.AGENDAMENTO_CANCELADO]: [
    ...AGENDAMENTO,
    // Obrigatório na action, e é o que a mensagem de recuperação usa.
    campo('motivo', 'Motivo do cancelamento'),
  ],
  [EVENTOS.AGENDAMENTO_REMARCADO]: [
    ...AGENDAMENTO,
    campo('deAgendadoPara', 'Data anterior', 'data'),
  ],

  // ── Clientes ──────────────────────────────────────────────────────────
  [EVENTOS.CLIENTE_CRIADO]:          CLIENTE,
  [EVENTOS.CLIENTE_DADOS_ALTERADOS]: [...CLIENTE, ALTEROU],
  [EVENTOS.CLIENTE_DESATIVADO]:      [...CLIENTE, campo('ativo', 'Está ativo', 'booleano')],
  [EVENTOS.CLIENTE_REATIVADO]:       [...CLIENTE, campo('ativo', 'Está ativo', 'booleano')],

  // ── CRM ───────────────────────────────────────────────────────────────
  [EVENTOS.LEAD_CRIADO]: LEAD,
  [EVENTOS.LEAD_ETAPA_MUDOU]: [
    ...LEAD,
    campo('deEtapaNome', 'Etapa anterior'),
    campo('desfecho',    'Desfecho da etapa (OPEN, WON, LOST)'),
  ],
  [EVENTOS.LEAD_GANHO]:   [...LEAD, campo('desfecho', 'Desfecho')],
  [EVENTOS.LEAD_PERDIDO]: [...LEAD, campo('desfecho', 'Desfecho')],

  // ── Inbox ─────────────────────────────────────────────────────────────
  // O anúncio entra em `iniciada` e em `mensagem_recebida` porque o clique no
  // criativo chega junto da mensagem, e não num evento à parte.
  [EVENTOS.CONVERSA_INICIADA]:          [...CONVERSA, ...ANUNCIO],
  [EVENTOS.CONVERSA_MENSAGEM_RECEBIDA]: [...CONVERSA, ...MENSAGEM, ...ANUNCIO],
  [EVENTOS.CONVERSA_MENSAGEM_ENVIADA]:  [...CONVERSA, ...MENSAGEM],
  [EVENTOS.CONVERSA_VEIO_DE_ANUNCIO]:   [...CONVERSA, ...ANUNCIO],

  // ── Dinheiro ──────────────────────────────────────────────────────────
  [EVENTOS.PAGAMENTO_RECEBIDO]:  PAGAMENTO,
  [EVENTOS.PAGAMENTO_ESTORNADO]: PAGAMENTO,

  [EVENTOS.PLANO_CRIADO]:   PLANO,
  [EVENTOS.PLANO_PROPOSTO]: PLANO,
  [EVENTOS.PLANO_ACEITO]:   PLANO,

  [EVENTOS.PACOTE_SESSAO_USADA]: [
    campo('clienteNome',   'Nome do cliente'),
    campo('clienteId',     'Id do cliente'),
    campo('pacoteNome',    'Pacote'),
    campo('agendamentoId', 'Id do agendamento'),
    // Zero é o gatilho de "acabou, renove" — o campo mais útil do evento.
    campo('restantes',     'Sessões restantes', 'numero'),
  ],

  [EVENTOS.COMISSAO_GERADA]: [
    campo('profissionalNome', 'Profissional'),
    campo('profissionalId',   'Id do profissional'),
    campo('agendamentoId',    'Id do agendamento'),
    campo('valor',            'Valor', 'numero'),
    campo('periodo',          'Período (AAAA-MM)'),
  ],

  // ── Clínico ───────────────────────────────────────────────────────────
  // ⚠️ Retrato magro de propósito: nenhum CONTEÚDO de prontuário atravessa.
  [EVENTOS.PRONTUARIO_ENTRADA_CRIADA]: CLINICO,
  [EVENTOS.ANAMNESE_RESPONDIDA]:       CLINICO,
  [EVENTOS.TERMO_ASSINADO]:            CLINICO,
  [EVENTOS.INJETAVEL_APLICADO]:        CLINICO,
  [EVENTOS.FOTO_ENVIADA]:              CLINICO,

  // ── Estoque ───────────────────────────────────────────────────────────
  [EVENTOS.ESTOQUE_MOVIMENTADO]: [
    ...ESTOQUE,
    campo('tipo',       'Tipo de movimentação'),
    campo('quantidade', 'Quantidade', 'numero'),
    campo('saldoApos',  'Saldo depois', 'numero'),
    campo('observacao', 'Observação'),
  ],
  [EVENTOS.ESTOQUE_ABAIXO_DO_MINIMO]: [
    ...ESTOQUE,
    campo('saldo',  'Saldo atual', 'numero'),
    campo('minimo', 'Mínimo configurado', 'numero'),
  ],

  // ── Cadastro e configuração ───────────────────────────────────────────
  [EVENTOS.PROCEDIMENTO_CRIADO]: [
    campo('nome',       'Nome'),
    campo('categoria',  'Categoria'),
    campo('preco',      'Preço', 'numero'),
    campo('duracaoMin', 'Duração em minutos', 'numero'),
  ],
  [EVENTOS.PROCEDIMENTO_PRECO_ALTERADO]: [
    campo('nome',          'Nome'),
    campo('categoria',     'Categoria'),
    campo('preco',         'Preço novo', 'numero'),
    // Sem ele não dá para perguntar "subiu?" — só "quanto custa agora?".
    campo('precoAnterior', 'Preço anterior', 'numero'),
  ],

  [EVENTOS.MEMBRO_CRIADO]:     [...MEMBRO, campo('atendeNaAgenda', 'Atende na agenda', 'booleano')],
  [EVENTOS.MEMBRO_DESATIVADO]: MEMBRO,
  [EVENTOS.MEMBRO_REATIVADO]:  MEMBRO,

  [EVENTOS.CARGO_PERMISSOES_ALTERADAS]: [
    campo('nome',       'Nome do cargo'),
    campo('alterou',    'Módulos que mudaram', 'lista'),
    campo('relatorios', 'Abas de relatório', 'lista'),
  ],

  [EVENTOS.INTEGRACAO_CONECTADA]:    INTEGRACAO,
  [EVENTOS.INTEGRACAO_DESCONECTADA]: [...INTEGRACAO, campo('motivo', 'Motivo')],
}

/**
 * Os campos que TODO evento carrega, fora do `dados`.
 *
 * Ficam à parte porque não dependem de qual evento é: quem monta um fluxo
 * genérico ("qualquer coisa feita pelo sistema") pergunta por aqui.
 */
export const CAMPOS_DO_FATO: CampoDeEvento[] = [
  { caminho: 'evento.nome',     rotulo: 'Nome do evento',                tipo: 'texto' },
  { caminho: 'evento.origem',   rotulo: 'Origem (app, webhook, banco…)', tipo: 'texto' },
  { caminho: 'evento.ator',     rotulo: 'Quem fez (nome)',               tipo: 'texto' },
  { caminho: 'evento.atorTipo', rotulo: 'Quem fez (usuário, sistema…)',  tipo: 'texto' },
  { caminho: 'evento.quando',   rotulo: 'Quando aconteceu',              tipo: 'data'  },
]
