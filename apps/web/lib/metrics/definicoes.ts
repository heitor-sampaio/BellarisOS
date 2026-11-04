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
  /**
   * A receita por procedimento e por profissional — a da EXECUÇÃO (D3 da 5ª,
   * 2026-11-02; r2-ind-01, 2026-11-03: a sessão de pacote pelo rateio).
   */
  receitaDosAtendimentos: {
    rotulo: 'O que a receita dos atendimentos conta',
    texto: 'O valor dos atendimentos FEITOS, para quem atendeu, no dia em que o atendimento foi FEITO (horário de Brasília): '
      + 'o que a cliente pagou pelo avulso (com o desconto e sem estornos; pago depois, entra no dia do atendimento) e, na '
      + 'sessão de pacote, de pré-pago ou de plano, a parte dela no que foi vendido (na de plano, cada procedimento da sessão '
      + 'conta no seu). É a conta da EXECUÇÃO; o caixa e o "Meu faturamento" contam no dia do pagamento (o pacote e o '
      + 'pré-pago inteiros para quem vendeu). O concluído ainda não pago não entra; o produto também não (está '
      + 'no faturamento e nas Vendas).',
  },
  /** A ficha da cliente (A56): o preço médio dos atendimentos, ao lado do investido total. */
  precoMedioPorAtendimento: {
    rotulo: 'O que o preço médio por atendimento conta',
    texto: 'O preço dos atendimentos concluídos e cobrados dela ÷ quantos foram (o preço do atendimento, antes do '
      + 'desconto). O "Investido total" é outra conta: tudo o que ela PAGOU — atendimentos, pacotes, planos e produtos.',
  },
  /** Relatórios → Visão geral: o status dos agendamentos do período inteiro (J-57). */
  statusDoPeriodo: {
    rotulo: 'O que o gráfico de status conta',
    texto: 'Todos os agendamentos do período, até o fim dele, pela hora marcada (horário de Brasília). "Em aberto" '
      + 'são os agendados, confirmados ou em atendimento — inclusive os que ainda vão acontecer. Os cartões de '
      + 'cima contam só até agora.',
  },
} satisfies Record<string, DefinicaoDoNumero>
