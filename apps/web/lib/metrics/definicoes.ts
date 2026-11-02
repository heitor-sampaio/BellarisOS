/**
 * O que cada número da tela conta, escrito UMA vez (J-55/J-56, 2026-10-30) —
 * as dicas (`<Dica>`) ao lado dos números no dashboard e nos Relatórios. O
 * texto segue `docs/regras/indicadores.md`: mudou a conta, muda aqui junto.
 */
export interface DefinicaoDoNumero { rotulo: string; texto: string }

export const DEFINICOES = {
  /** Dashboard da rede: o aproveitamento de cada unidade (getByBranch, até agora). */
  aproveitamento: {
    rotulo: 'O que é a taxa de aproveitamento',
    texto: 'Atendimentos concluídos ÷ agendamentos marcados no período até agora (cancelados e faltas entram no total). '
      + 'O que está marcado para mais tarde ainda não entra. Por isso difere da Taxa de Conclusão dos Relatórios, '
      + 'que conta o período inteiro, até o fim dele.',
  },
  /** Relatórios → Agenda: a taxa de conclusão (o núcleo até o fim do período). */
  conclusao: {
    rotulo: 'O que é a taxa de conclusão',
    texto: 'Atendimentos concluídos ÷ todos os agendamentos do período, até o fim do período — inclusive os que '
      + 'ainda vão acontecer e os cancelados. No meio do mês ela fica abaixo da taxa de aproveitamento do '
      + 'dashboard, que conta só até agora.',
  },
  /** A receita paga: o dia é o do PAGAMENTO, no fuso de Brasília. */
  receita: {
    rotulo: 'Qual data a receita usa',
    texto: 'O que entrou no caixa, pelo dia do PAGAMENTO (horário de Brasília), sem estornos. '
      + 'O atendimento concluído ontem e pago hoje entra hoje.',
  },
  /** A despesa paga: também pelo pagamento. */
  despesa: {
    rotulo: 'Qual data a despesa usa',
    texto: 'O que saiu do caixa, pelo dia do PAGAMENTO (horário de Brasília).',
  },
  /** Os atendimentos: o dia é o da hora MARCADA. */
  atendimentos: {
    rotulo: 'Qual data os atendimentos usam',
    texto: 'Atendimentos concluídos, pelo dia da hora MARCADA (horário de Brasília) — ou da conclusão, quando ela '
      + 'veio antes. O atendimento das 23:30 concluído à meia-noite e pouco conta no dia em que foi marcado.',
  },
  /** O ticket médio: o pago pelas clientes ÷ as clientes que pagaram. */
  ticket: {
    rotulo: 'Como o ticket médio é contado',
    texto: 'O que as clientes pagaram no período ÷ quantas clientes pagaram, pelo dia do PAGAMENTO (horário de Brasília).',
  },
  /** A receita por procedimento e por profissional (D3 da 5ª, 2026-11-02): o pago dos atendimentos. */
  receitaDosAtendimentos: {
    rotulo: 'O que a receita paga dos atendimentos conta',
    texto: 'O que as clientes pagaram pelos atendimentos, pelo dia do PAGAMENTO (horário de Brasília), com o desconto e sem '
      + 'estornos — de cada procedimento ou de cada profissional. O concluído ainda não pago não entra; pacote, pré-pago, '
      + 'plano e produto também não, porque não são pagos num atendimento (estão no faturamento e nas Vendas).',
  },
  /** Relatórios → Visão geral: o status dos agendamentos do período inteiro (J-57). */
  statusDoPeriodo: {
    rotulo: 'O que o gráfico de status conta',
    texto: 'Todos os agendamentos do período, até o fim dele, pela hora marcada (horário de Brasília). "Em aberto" '
      + 'são os agendados, confirmados ou em atendimento — inclusive os que ainda vão acontecer. Os cartões de '
      + 'cima contam só até agora.',
  },
} satisfies Record<string, DefinicaoDoNumero>
