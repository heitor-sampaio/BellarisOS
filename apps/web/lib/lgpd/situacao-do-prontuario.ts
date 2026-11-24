/**
 * O que o pacote da LGPD diz do prontuário quando ele NÃO vai junto.
 *
 * Até 2026-10-20 era sempre "Não incluído nesta solicitação" — inclusive para
 * quem pediu e estava esperando a clínica liberar (a simulação de um dia de
 * clínica achou). São três situações diferentes, e a pessoa precisa saber em
 * qual está. Aprovar refaz o pacote, já com o prontuário.
 */
export type SituacaoDoProntuario = 'not_requested' | 'pending' | 'denied' | string | null

/**
 * O que o prontuário do pacote leva DE FATO (A35 da 26ª, princípio 3): as
 * respostas da ficha de saúde e o registro de cada atendimento
 * (`prontuarioLegivel`, `lib/lgpd/export.ts`). A caixa do app dizia "termos
 * assinados" (vão SEMPRE, na parte geral) e o Liberar, "as fotos" (vai só
 * quantas foram, não o arquivo). Um texto só para a caixa, o Liberar e o PDF.
 */
export const CONTEUDO_DO_PRONTUARIO =
  'a ficha de saúde respondida e o registro de cada atendimento (evolução, ficha de atendimento, dores, intercorrências, insumos e anotações)'

/** Cada pedido diz o que é (A34 da 26ª, princípio 7). */
export function oQueOPedidoLeva(incluiProntuario: boolean): string {
  return incluiProntuario ? 'com o prontuário' : 'sem o prontuário'
}

export function textoDoProntuarioForaDoPacote(situacao: SituacaoDoProntuario): { json: string; pdf: string[] } {
  if (situacao === 'pending') {
    return {
      json: 'Pedido — em análise pela equipe. Quando ela liberar, um pacote novo é preparado com o prontuário.',
      pdf: [
        `Você pediu também o prontuário (${CONTEUDO_DO_PRONTUARIO}), e o pedido está em análise pela equipe. Quando ela liberar, um pacote novo é preparado já com ele.`,
      ],
    }
  }
  if (situacao === 'denied') {
    return {
      json: 'Pedido — a equipe não liberou o prontuário nesta solicitação.',
      pdf: [
        'Você pediu também o prontuário, e a equipe não o liberou nesta',
        'solicitação. Para saber o motivo, procure a unidade onde você é atendido.',
      ],
    }
  }
  return {
    json: 'Não incluído nesta solicitação.',
    pdf: [
      `O prontuário (${CONTEUDO_DO_PRONTUARIO}) não faz parte deste pacote. Para solicitá-lo, procure a unidade onde você é atendido.`,
    ],
  }
}

/**
 * A situação do prontuário NO PEDIDO, por extenso (A56 da 8ª simulação,
 * 2026-11-06): com "Incluir prontuário" marcado, o JSON dizia só
 * `incluiProntuario: false` antes da liberação, e o pedido parecia ignorado.
 * Vai ao lado do `incluiProntuario` em `solicitacao` (`lib/lgpd/export.ts`).
 */
export function prontuarioNaSolicitacao(situacao: SituacaoDoProntuario, incluido: boolean): string {
  if (incluido || situacao === 'approved') return 'pedido — liberado e incluído neste pacote'
  if (situacao === 'pending') return 'pedido — pendente de liberação pela equipe'
  if (situacao === 'denied') return 'pedido — não liberado pela equipe'
  return 'não pedido'
}
