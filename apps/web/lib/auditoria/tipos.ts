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
}
