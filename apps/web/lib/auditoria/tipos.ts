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
  /** O produto do movimento de estoque (A28 da 15ª), lido agora. */
  produtos?: Record<string, string>
  /** O cargo de cada permissão (o id da linha de `role_permissions` → o nome do cargo), lido agora. */
  cargos?:   Record<string, string>
  /** O nome do pacote vendido (`client_packages.package_id` → o pacote), lido agora (D7 da 16ª). */
  pacotes?:  Record<string, string>
  /**
   * O lançamento EDITADO na gravação, lido agora (D7 da 16ª): a baixa grava só
   * as colunas que mudaram, e "Recebeu a parcela 1/4 (R$ 200,00)" precisa do
   * tipo, do valor e da parcela.
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
}

export interface LancamentoDaAuditoria {
  tipo:    string | null
  valor:   number | null
  forma:   string | null
  parcela: number | null
  de:      number | null
  /** É o lançamento de um atendimento (A26 da 17ª: "Estornou o atendimento"). */
  agendamento?: boolean
}

/** Uma linha pronta para a tela e para o CSV. */
export interface LinhaDaAuditoria {
  id:       number
  quando:   string
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

/**
 * As ações do filtro "O que foi feito" que a pessoa ALCANÇA (A28 da 15ª
 * simulação): a abertura do prontuário é de quem tem a rede (o registro de
 * quem abriu, 2026-10-27; desde a A32 da 18ª a linha leva a unidade do
 * endereço, e a leitura a tira de quem tem unidades) — o filtro sai da lista
 * dela em vez de ficar sempre vazio.
 */
export function operacoesDoFiltro(minhas: readonly string[] | null): readonly { key: OperacaoDaAuditoria; label: string }[] {
  return minhas === null ? OPERACOES : OPERACOES.filter(o => o.key !== 'abriu')
}
