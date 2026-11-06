/**
 * O que o pacote da LGPD diz do prontuário quando ele NÃO vai junto.
 *
 * Até 2026-10-20 era sempre "Não incluído nesta solicitação" — inclusive para
 * quem pediu e estava esperando a clínica liberar (a simulação de um dia de
 * clínica achou). São três situações diferentes, e a pessoa precisa saber em
 * qual está. Aprovar refaz o pacote, já com o prontuário.
 */
export type SituacaoDoProntuario = 'not_requested' | 'pending' | 'denied' | string | null

export function textoDoProntuarioForaDoPacote(situacao: SituacaoDoProntuario): { json: string; pdf: string[] } {
  if (situacao === 'pending') {
    return {
      json: 'Pedido — em análise pela clínica. Quando ela liberar, um pacote novo é preparado com o prontuário.',
      pdf: [
        'Você pediu também o prontuário (anamnese, evolução dos atendimentos e',
        'fotos clínicas), e o pedido está em análise pela clínica. Quando ela',
        'liberar, um pacote novo é preparado já com ele.',
      ],
    }
  }
  if (situacao === 'denied') {
    return {
      json: 'Pedido — a clínica não liberou o prontuário nesta solicitação.',
      pdf: [
        'Você pediu também o prontuário, e a clínica não o liberou nesta',
        'solicitação. Para saber o motivo, procure a unidade onde você é atendido.',
      ],
    }
  }
  return {
    json: 'Não incluído nesta solicitação.',
    pdf: [
      'Os dados de prontuário (anamnese, evolução dos atendimentos e fotos',
      'clínicas) não fazem parte deste pacote. Para',
      'solicitá-los, procure a unidade onde você é atendido.',
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
  if (situacao === 'pending') return 'pedido — pendente de liberação pela clínica'
  if (situacao === 'denied') return 'pedido — não liberado pela clínica'
  return 'não pedido'
}
