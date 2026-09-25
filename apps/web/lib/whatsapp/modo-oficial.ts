/**
 * Os dois jeitos de ligar um número à API oficial da Meta.
 *
 * A escolha não é de gosto: ela decide o que acontece com o aplicativo
 * WhatsApp Business que está no celular da clínica hoje. Pedido do Heitor em
 * 2026-09-25 para que o cliente escolha, sabendo o que está escolhendo.
 *
 * Fica fora do componente porque o texto é a parte que importa: quem vai ler é
 * quem opera a clínica, não quem programa, e essa explicação precisa sobreviver
 * a qualquer refação de tela.
 */

export type ModoOficial = 'coexistencia' | 'cloud_api'

export const MODO_OFICIAL_PADRAO: ModoOficial = 'coexistencia'

export interface ExplicacaoDoModo {
  chave:    ModoOficial
  rotulo:   string
  /** Uma linha, para a tela decidir sem abrir o detalhe. */
  resumo:   string
  /** O que muda no dia a dia de quem atende. */
  comoFica: string[]
  /** O que a clínica precisa ter ANTES de tentar. */
  exige:    string[]
  /** O preço da escolha. Aparece em destaque — é o que costuma surpreender. */
  atencao:  string
}

export const MODOS_OFICIAIS: Record<ModoOficial, ExplicacaoDoModo> = {
  coexistencia: {
    chave:  'coexistencia',
    rotulo: 'Coexistência',
    resumo: 'O aplicativo continua funcionando no celular, e o sistema passa a usar o mesmo número.',
    comoFica: [
      'A equipe segue atendendo pelo aplicativo WhatsApp Business no celular, como sempre fez.',
      'O sistema recebe e envia pelo MESMO número. Mensagem respondida no celular aparece no Inbox, e vice-versa.',
      'As conversas e os contatos que já existem no aplicativo são trazidos para o sistema na conexão.',
    ],
    exige: [
      'O número precisa estar num aplicativo WhatsApp Business (o verde de negócios), não no WhatsApp comum.',
      'O aplicativo precisa estar atualizado no celular que usa o número.',
      'O número não pode já estar ligado à API em outra conta.',
    ],
    atencao:
      'É o caminho mais seguro para quem já atende pelo celular: nada para de funcionar no dia da conexão.',
  },

  cloud_api: {
    chave:  'cloud_api',
    rotulo: 'Cloud API',
    resumo: 'O número passa a viver só no sistema. O aplicativo no celular deixa de atender por ele.',
    comoFica: [
      'Todo o atendimento passa a acontecer no Inbox do sistema — e só nele.',
      'Vários atendentes usam o mesmo número ao mesmo tempo, cada um com o próprio acesso.',
      'É o caminho de quem quer o número dedicado ao sistema, sem ninguém respondendo pelo celular.',
    ],
    exige: [
      'Um número que possa deixar de ser usado no aplicativo.',
      'Uma conta de negócios (WhatsApp Business Account) na Meta, verificada.',
    ],
    atencao:
      'O aplicativo WhatsApp Business PARA de funcionar com esse número, e o histórico de conversas dele não vem junto. Voltar atrás exige desfazer a migração na Meta.',
  },
}

/** Lê o modo gravado, com o padrão de quem nunca escolheu. */
export function modoDaConfig(config: Record<string, unknown> | null | undefined): ModoOficial {
  const bruto = config?.modo
  return bruto === 'cloud_api' || bruto === 'coexistencia' ? bruto : MODO_OFICIAL_PADRAO
}
