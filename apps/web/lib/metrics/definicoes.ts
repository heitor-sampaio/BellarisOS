/**
 * O que cada número da tela conta, escrito UMA vez (J-55/J-56, 2026-10-30) —
 * as dicas (`<Dica>`) ao lado dos números no dashboard e nos Relatórios. O
 * texto segue `docs/regras/indicadores.md`: mudou a conta, muda aqui junto.
 */
export interface DefinicaoDoNumero { rotulo: string; texto: string }

export const DEFINICOES = {
  /** A ocupação da agenda (A53 da 9ª): a conta de `ocupacaoEmPct`. */
  ocupacao: {
    rotulo: 'Como a ocupação é contada',
    texto: 'Os minutos agendados (os concluídos contam; cancelados e faltas não) ÷ os minutos abertos: o horário de '
      + 'cada profissional que atende nesta unidade, dentro do horário da unidade, menos o tempo bloqueado e o que ela '
      + 'tem agendado em outra unidade.',
  },
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
  /** A receita paga: o dia é o do PAGAMENTO, no fuso da unidade (F62); o estorno, no dia dele (F59). */
  receita: {
    rotulo: 'Qual data a receita usa',
    texto: 'O que entrou no caixa, pelo dia do PAGAMENTO (no fuso da unidade). O estorno sai no dia em que foi '
      + 'feito: o de um pagamento de outro período desconta deste. O atendimento concluído ontem e pago hoje entra hoje.',
  },
  /** A despesa paga: também pelo pagamento. */
  despesa: {
    rotulo: 'Qual data a despesa usa',
    texto: 'O que saiu do caixa, pelo dia do PAGAMENTO (no fuso da unidade).',
  },
  /** Os atendimentos: o dia é o da hora MARCADA. */
  atendimentos: {
    rotulo: 'Qual data os atendimentos usam',
    texto: 'Atendimentos concluídos, pelo dia da hora MARCADA (no fuso da unidade) — ou da conclusão, quando ela '
      + 'veio antes. O atendimento das 23:30 concluído à meia-noite e pouco conta no dia em que foi marcado.',
  },
  /** O ticket médio: o pago pelas clientes ÷ as clientes que pagaram. */
  ticket: {
    rotulo: 'Como o ticket médio é contado',
    texto: 'O que as clientes pagaram no período ÷ quantas clientes pagaram, pelo dia do PAGAMENTO (no fuso da unidade).',
  },
  /**
   * A receita por procedimento e por profissional — a da EXECUÇÃO (D3 da 5ª,
   * 2026-11-02; r2-ind-01, 2026-11-03: a sessão de pacote pelo rateio).
   */
  /** "Meu faturamento" (financeiro "só os meus"): a VENDA dela, pelo pagamento (A41). */
  meuFaturamento: {
    rotulo: 'O que o "Meu faturamento" conta',
    texto: 'O que entrou no caixa pelas SUAS vendas e pelos SEUS atendimentos, no dia do PAGAMENTO (no fuso da unidade): '
      + 'o atendimento avulso que você fez e foi pago, e o pacote, o pré-pago e o produto que você vendeu (inteiros; no '
      + 'crediário, cada parcela quando entra). A sessão de pacote ou de plano que você atende não soma de novo: o dinheiro '
      + 'é de quem vendeu. Os Relatórios contam outra coisa — a receita dos atendimentos que você FEZ, no dia em que fez —, '
      + 'e as comissões são a sua parte, em "Minhas comissões".',
  },
  /**
   * A33 da 10ª simulação (2026-11-10): à vista, embaixo do "Meu faturamento" — a
   * Daniela via a comissão da sessão do plano e não a sessão no faturamento.
   */
  foraDoMeuFaturamento: {
    rotulo: 'O que fica fora do "Meu faturamento"',
    texto: 'A sessão de pacote, de plano ou pré-paga que você atende não entra aqui: o dinheiro é de quem vendeu. '
      + 'Ela aparece nas suas comissões e na receita dos atendimentos dos Relatórios.',
  },
  receitaDosAtendimentos: {
    rotulo: 'O que a receita dos atendimentos conta',
    texto: 'O valor dos atendimentos FEITOS, para quem atendeu, no dia em que o atendimento foi FEITO (no fuso da unidade): '
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
    texto: 'Todos os agendamentos do período, até o fim dele, pela hora marcada (no fuso da unidade). "Em aberto" '
      + 'são os agendados, confirmados ou em atendimento — inclusive os que ainda vão acontecer. Os cartões de '
      + 'cima contam só até agora.',
  },
  /**
   * A linha "Custo do lucro" do gráfico de evolução (A39 da 11ª simulação):
   * a legenda dizia o nome sem dizer o que soma — a parcela de `pontosDaEvolucao`.
   */
  custoDoLucro: {
    rotulo: 'O que o Custo do lucro soma',
    texto: 'Custo do lucro = despesas operacionais + insumos e produtos vendidos + taxas da maquininha + comissões lançadas. '
      + 'As despesas operacionais são as pagas no período, sem a compra de estoque e sem o pagamento das comissões '
      + '(essas ficam no caixa). Faturamento − Custo do lucro = Lucro.',
  },
  /** Relatórios → Financeiro e o DRE: o estoque que saiu para gerar a receita (A50 da 7ª simulação). */
  insumosEProdutos: {
    rotulo: 'O que entra em Insumos e produtos vendidos',
    texto: 'O insumo usado nos atendimentos do período (ao custo de consumo: o preço da embalagem ÷ o que ela rende) '
      + 'mais o custo dos produtos vendidos (o dos lotes que saíram). Desconta do lucro. A perda e o ajuste de '
      + 'estoque ficam fora: são métrica, não entram no lucro nem quando a compra é paga — eles aparecem em Relatórios → Estoque.',
  },
} satisfies Record<string, DefinicaoDoNumero>
