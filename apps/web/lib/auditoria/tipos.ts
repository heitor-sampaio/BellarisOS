/**
 * A auditoria (CF3a/CF3b) — os tipos da tela, num arquivo sem servidor: a
 * leitura (`leitura.ts`) puxa o cliente de serviço, e componente de navegador
 * que importasse dela quebraria a página.
 */
export type OperacaoDaAuditoria = 'criou' | 'editou' | 'apagou' | 'abriu' | 'entrou'

export const OPERACOES: readonly { key: OperacaoDaAuditoria; label: string }[] = [
  { key: 'criou',  label: 'Criou' },
  { key: 'editou', label: 'Editou' },
  { key: 'apagou', label: 'Apagou' },
  { key: 'abriu',  label: 'Abriu o prontuário' },
  { key: 'entrou', label: 'Entrou no sistema' },
]

export type TipoDeAtor = 'membro' | 'suporte' | 'cliente' | 'plataforma' | 'sistema'

/** Uma linha como o banco a guarda (`public.auditoria`). */
export interface RegistroDaAuditoria {
  id:          number
  criado_em:   string
  branch_id:   string | null
  client_id:   string | null
  tabela:      string
  operacao:    OperacaoDaAuditoria
  registro_id: string | null
  colunas:     string[]
  antes:       Record<string, unknown>
  depois:      Record<string, unknown>
  ator_user_id: string | null
  ator_nome:   string
  ator_tipo:   TipoDeAtor
  incompleto:  boolean
}

/** Os nomes que a frase usa, lidos na hora (a anonimização da LGPD vale aqui). */
export interface NomesDaAuditoria {
  clientes: Record<string, string>
  membros:  Record<string, string>
  unidades: Record<string, string>
  /** D2 da 23ª: o fuso de cada unidade (o id → o fuso), para a hora do agendamento citado. */
  fusos?:   Record<string, string>
  /** D6 da 26ª: o fuso da rede — o "Quando" da linha sem unidade (a da unidade sai no fuso dela). */
  fusoDaRede?: string
  /** O produto do movimento de estoque (A28 da 15ª), lido agora. */
  produtos?: Record<string, string>
  /**
   * A33 da 21ª: a medida em que o movimento do produto se grava (a de consumo,
   * quando há; senão a embalagem), lida agora — "2 frascos de Toxina 1 frasco".
   */
  medidasDosProdutos?: Record<string, string>
  /**
   * A10 da 24ª: a embalagem do produto (o nome dela e quantas medidas de
   * consumo ela rende) — o custo do lote corrigido se diz "por seringa".
   */
  embalagensDosProdutos?: Record<string, { unidade: string; fator: number }>
  /** O cargo de cada permissão e de cada aba de relatório (o id da linha → o nome do cargo), lido agora. */
  cargos?:   Record<string, string>
  /** O nome do pacote vendido (`client_packages.package_id` → o pacote), lido agora (D7 da 16ª). */
  pacotes?:  Record<string, string>
  /**
   * O lançamento da gravação, lido agora (D7 da 16ª): a baixa grava só as
   * colunas que mudaram, e "Recebeu a parcela 1/4 (R$ 200,00)" precisa do
   * tipo, do valor e da parcela. A38 da 22ª: também o CRIADO (a auditoria não
   * guarda as vezes nem a parcela), para "Crédito 8x" e o crediário da venda.
   */
  lancamentos?: Record<string, LancamentoDaAuditoria>
  /**
   * A26/A27 da 17ª: o que a gravação não guarda e a frase precisa, lido agora
   * pelo id do registro. A oportunidade e o contato (a auditoria grava `{}`
   * neles, por minimização) saem pelo nome, como a cliente.
   */
  oportunidades?: Record<string, string>
  contatos?: Record<string, string>
  /** O nome da etapa do funil (o id → o nome), quando a etapa está no registro. */
  etapas?: Record<string, string>
  /** O produto do item da comanda (o id do item → o produto). */
  itensDaComanda?: Record<string, string>
  /** De quem é a comissão paga (o id do pagamento → quem atende). */
  pagamentosDeComissao?: Record<string, string>
  /** A cliente do lançamento de pontos (o id do lançamento → a cliente; a tabela não tem `client_id`). */
  clientesDosPontos?: Record<string, string>
  /** O fechamento do dia que veio depois de outro do mesmo dia e unidade (o "Fechar de novo"). */
  fechamentosDeNovo?: Record<string, boolean>
  /** A31 da 18ª: o motivo do cancelamento (o id do agendamento → o motivo), lido agora — a auditoria não guarda texto livre. */
  motivosDoCancelamento?: Record<string, string>
  /** A33 da 18ª: de qual é a comissão (o id → "do atendimento de X (procedimento)" ou "da venda a X"), lido agora. */
  comissoes?: Record<string, string>
  /** A33 da 19ª: o conferido do fechamento (o id → "Dinheiro R$ 300,00 e Pix R$ 1.200,00"), lido agora. */
  conferidosDoFechamento?: Record<string, string>
  /** A34 da 20ª: o motivo do fechamento do documento (o id → `closed_reason`), lido agora. */
  motivosDoDocumento?: Record<string, string>
  /** A34 da 20ª: qual sessão de qual pacote (o id → "a sessão 2 do pacote 5 peelings"), lido agora. */
  sessoesDoPacote?: Record<string, string>
  /** A34 da 20ª: o pacote vendido (o id de `client_packages` → o nome do pacote), lido agora. */
  pacotesDaCliente?: Record<string, string>
  /** A34/A35 da 20ª: o arquivo e o placar da importação, lidos agora. */
  importacoes?: Record<string, ImportacaoDaAuditoria>
  /** A35 da 20ª: o custo da entrada de estoque (o id do movimento → quantidade × custo), lido agora. */
  custosDasEntradas?: Record<string, number>
  /** A36 da 20ª: o nome do procedimento (o id → o nome), lido agora. */
  procedimentos?: Record<string, string>
  /**
   * A24 da 26ª: a categoria do anexo da cliente (o id de `client_documents` →
   * `category`), lida agora — a auditoria grava o anexo como clínico, sem valores.
   */
  categoriasDosAnexos?: Record<string, string>
  /**
   * A24 da 26ª: o que a devolução devolveu (o id de `product_sale_returns` → os
   * itens do retrato: o produto, quantas e de quantas), lido agora.
   */
  devolucoes?: Record<string, ItemDevolvidoDaAuditoria[]>
  /** A16 (AD-13): a sala do bloqueio da agenda (o id → o nome), lida agora. */
  salas?: Record<string, string>
  /**
   * A17 (AD-13, AD-21): o cargo do membro editado (o id do cargo → o nome e se é
   * o cargo de SISTEMA Admin da rede, pela chave no banco), lido agora — para o
   * "cargo: Recepção → Admin da rede" e o "Promoveu".
   */
  cargosDosMembros?: Record<string, { nome: string; adminDaRede: boolean }>
}

export interface ItemDevolvidoDaAuditoria {
  produto:    string
  quantidade: number
  /** Quantas a venda tinha daquele item; nulo = não se sabe. */
  de:         number | null
}

export interface ImportacaoDaAuditoria {
  arquivo:     string
  destino:     string
  total:       number
  novas:       number
  completadas: number
  comErro:     number
}

export interface LancamentoDaAuditoria {
  tipo:    string | null
  valor:   number | null
  forma:   string | null
  parcela: number | null
  de:      number | null
  /** É o lançamento de um atendimento (A26 da 17ª: "Estornou o atendimento"). */
  agendamento?: boolean
  /** A38 da 22ª: as vezes no cartão de crédito ("Crédito 8x"); nulo fora dele. */
  vezes?: number | null
}

/** Uma linha pronta para a tela e para o CSV. */
export interface LinhaDaAuditoria {
  id:       number
  /** D6 da 26ª: no fuso da unidade da linha (sem unidade, o da rede). */
  quando:   string
  /** O relógio do "Quando" — "horário de Cuiabá" — fora do de Brasília; senão, nulo (princípio 3). */
  relogio:  string | null
  quem:     string
  tipoDeAtor: TipoDeAtor
  oQue:     string
  unidade:  string | null
  href:     string | null
}

export interface FiltrosDaAuditoria {
  period?:  string
  from?:    string
  to?:      string
  pessoa?:  string
  tipo?:    string
  unidade?: string
  cliente?: string
  pagina?:  string
  /** A tela segue por gravação (A27 da 15ª): as linhas antes deste id. O CSV segue por `pagina`. */
  antes?:   string
}

