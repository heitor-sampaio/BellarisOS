# Sugestões de funcionalidades

O Heitor, 24/11: "Em teoria não é pra ter pergunta de regra e de escopo, as regras já foram definidas e o escopo
também. O sistema tem que fazer o que ele foi feito pra fazer, não dá pra ficar querendo reinventar a roda. Se você
achar que algo deve ser adicionado, anota numa lista de sugestões de features. Precisamos fazer que o que já tem,
funcione 100% sem defeitos e sem atritos."

Esta lista NÃO é trabalho a fazer: é o que apareceu (nas simulações, no catálogo, nas correções) e que o sistema não faz
por nenhuma regra. Nada daqui vira código sem o Heitor escolher. Quando uma rodada achar algo que é recurso novo, entra
aqui com a origem e sai da conta dos defeitos e atritos.

| # | Sugestão | De onde veio |
|---|---|---|
| 1 | Estorno parcial de um atendimento (devolver parte do valor recebido, sem estornar o lançamento inteiro) | 27ª, B08 (e item 16 da 26ª) |
| 2 | Cobrar na comanda um valor diferente do preço do procedimento | 27ª, B13 |
| 3 | A agenda de uma unidade mostrar, de quem atende em duas, o horário ocupado na outra | 27ª, B05 |
| 4 | A alergia da ficha de saúde no modal do agendamento | 27ª (Time C); item 3 da 26ª |
| 5 | Anotação clínica avulsa no prontuário, sem um atendimento | 27ª, a Yara (Time C) |
| 6 | A cliente confirmar presença pelo app antes do atendimento | 27ª, D01; item 7 da 25ª, 20 da 26ª |
| 7 | As avaliações das clientes numa tela própria (hoje só na ficha) | 27ª (Time D) |
| 8 | Crédito pré-pago também de produto (hoje só de procedimento) | 27ª (Time D) |
| 9 | O de → para da etapa do funil na Auditoria | 27ª (Time E); 31ª (também a regra de comissão: procedimento, quem e valor, A9) |
| 10 | Ranking por quem vendeu nos Relatórios | 27ª (Time E) |
| 11 | Outra base de CEP (o 66035-000 não foi encontrado; na 28ª também 76804-000, 74210-000 e 64049-000) | 27ª, A; A37 da 26ª; 28ª, A, B e C; 31ª |
| 12 | Uma resposta da ficha de saúde que a rede marca como alerta (ex.: "Grávida = Sim"), além da alergia | 28ª, C10 (ligada à nº 4) |
| 13 | Comparar as fotos Antes e Depois lado a lado | 28ª, C07 |
| 14 | Os pontos e as recompensas da cliente na tela do atendimento | 28ª, Time E |
| 15 | Os pontos ganhos na confirmação do recebimento no PDV | 28ª, Time E |
| 16 | O aviso programado (lembrete) visível no agendamento | 28ª, Time E |
| 17 | Aviso no sino da equipe quando chega uma avaliação baixa | 28ª, E06 (ligada à nº 7) |
| 18 | O pacote, o crédito e a dívida da cliente no cartão do agendamento | 28ª, Time B |
| 19 | O lote do produto na comanda e no recibo | 28ª, Time A |
| 20 | Dizer a quem só vê o Estoque quem registra a perda | 28ª, Time A |
| 21 | Cadastro de fornecedor (com CNPJ), usado no estoque e nas despesas | 28ª, Times A e B; 31ª (com a marca e o custo padrão no cadastro do produto) |
| 22 | O fornecedor e a forma na lista "A pagar" | 28ª, Time B; 31ª (ligada à nº 21) |
| 23 | Mostrar a linha de comissão de R$ 0 (atendimento pago com voucher) | 28ª, E03 |
| 24 | Importar a coluna "origem" da planilha sem criar oportunidade | 28ª, Times A, B, D e E |
| 25 | O telefone da rede como padrão no da unidade, no /setup | 28ª, Time E |
| 26 | Vender o pacote pela internet ou pelo app da cliente | pergunta do catálogo de Vendas, decidida em 25/11 |
| 27 | O botão "Desativar produto" na tela do Estoque (a action já existe) | pergunta do catálogo do Atendimento, decidida em 25/11 |
| 28 | O "a receber" ao lado da situação do plano de tratamento | correções da 28ª (plano no crediário) |
| 29 | A busca não achar a cliente pelo telefone ou CPF para quem só tem o Prontuário (a linha já não mostra esses dados) | correções da 28ª (a ficha só do prontuário) |
| 30 | Gravar o "valor entregue" e o troco do dinheiro, e não só mostrar na tela | 29ª, A07 e B05 |
| 31 | O aviso da AG-53 também quando a equipe agenda | 29ª, B08 |
| 32 | O recibo do PDV para a cliente | 29ª, Times A e C |
| 33 | Filtro por tag e por forma no PDV | 29ª, Time B |
| 34 | O "pagador" (outra pessoa que pagou) na comanda | 29ª, C06 |
| 35 | Importar procedimentos de planilha | 29ª, Time A |
| 36 | Os próximos passos do /setup também no dashboard da rede nova | 29ª, Time A (RB-03) |
| 37 | Converter a dose do injetável em UI para o frasco pelo rendimento, e avisar a diferença | 29ª, C01 (PT-18); 31ª (a dose do mapa × o estoque, na tela) |
| 38 | Um termo avulso para a menor, sem o procedimento ter documento | 29ª, C06 (DA-11) |
| 39 | A prévia da importação com todas as colunas, além das 3 primeiras linhas | 29ª, Time A (IM-22); 31ª (ligada à nº 77) |
| 40 | Salas e CEP da unidade dentro do /setup | 29ª, Time A (ligada à nº 11) |
| 41 | A Equipe da unidade mostrar a Admin da rede que atende ali | 29ª, Time D |
| 42 | O histórico do agendamento cancelado (quem, quando, o de → para) na janela dele | 29ª, B12 |
| 43 | O app ativar os avisos com um botão "Receber avisos no celular" | 29ª, B14 (ligada ao A20) |
| 44 | O "retorno em N dias" propor o horário na conclusão, sem agendar sozinho | 29ª, C01 (AT-19) |
| 45 | Revogar o consentimento e pedir a exclusão pelo app | 29ª, C09 e C11 (LG-01/LG-03) |
| 46 | A comissão em aberto da pessoa no repasse do desativar | 29ª, Time D (ligada ao A11) |
| 47 | O de → para da troca de forma (estorno e novo lançamento) numa linha só da Auditoria | 29ª, E10 |
| 48 | A validade e as sessões na linha do pacote de antes, na ficha | 29ª, E02 (ligada ao A24) |
| 49 | Ver o plano proposto e não aceito na ficha da cliente, com o "propor de novo" | 29ª, E07 |
| 50 | O resumo do quadro de oportunidades acompanhar os filtros aplicados | 30ª, Time A |
| 51 | Abrir a oportunidade da aba Oportunidades da ficha sem passar pelo Inbox | 30ª, Time A |
| 52 | Escolher o funil ao abrir o contato do CRM pela busca | 30ª, A03 |
| 53 | Escolher a etapa no "Mover para outro funil" | 30ª, A06 |
| 54 | A busca achar a pessoa cuja oportunidade está em funil arquivado | 30ª, A09 (BA-04) |
| 55 | O resumo do cargo sem "ela" fixo | 30ª, Time B |
| 56 | O `?unidade=` aceitar o endereço curto da unidade, ou avisar que não achou | 30ª, Time B |
| 57 | A agenda "Toda a rede" indicar que as unidades têm fusos diferentes | 30ª, Time B (ligada à nº 3) |
| 58 | O recibo avisar que sai sem CPF quando a ficha não tem | 30ª, C12 |
| 59 | O arquivo da DRE com nome em português (não "dre-month.csv") | 30ª, Time C |
| 60 | O limite de parcelas do crediário também em Configurações → Geral | 30ª, Time C |
| 61 | O histórico das autorizações do suporte revogadas (por quem, quando) | 30ª, Time D (SU-04) |
| 62 | A coluna do saldo de pontos (cartão de papel) na importação de clientes | 30ª, Time E |
| 63 | A prévia da comanda dizer a ordem desconto → voucher → pontos | 30ª, E03 |
| 64 | Tirar a marca da biblioteca do desenho das automações (depende da licença dela) | 30ª, Time E |
| 65 | Dividir a comanda entre pago e "A receber" sem passar pelo crediário | 30ª, B13 |
| 66 | A Equipe mostrar e filtrar quem é da unidade desativada | 30ª, Time B (UN-13) |
| 67 | A remarcação com o rastro de → para (de quando para quando) no cartão do agendamento e na linha do tempo da ficha | 31ª, A01 (ligada à nº 42) |
| 68 | Avisar a cliente quando o repasse troca a pessoa que ela escolheu para atender | 31ª, B13 |
| 69 | Escolher o lote na transferência (hoje sai o que vence antes, ES-24) | 31ª, Time E |
| 70 | Ligar o avulso já agendado à sessão do pacote no momento da venda | 31ª, D07 |
| 71 | A versão do modelo na lista de Documentos e, ao publicar a v2, o aviso de quantos emitidos pendentes seguem na v1 | 31ª, Time D |
| 72 | Da tela que avisa "taxa 0%", um caminho ao cadastro da maquininha | 31ª, Times C, D e E |
| 73 | A lista de acessos ao prontuário dizer que a repetição em ~5 min não entra de novo | 31ª, D12 |
| 74 | O Copilot contar os produtos do estoque e cadastrar produto | 31ª, Time E |
| 75 | Fechamento do dia: "conferido = registrado" num clique para as formas sem divergência | 31ª, Times B e E |
| 76 | O Confirmar do app e o /verificar dizerem o fuso da unidade | 31ª, Time D |
| 77 | A prévia da importação dizer as tags que cada linha recebe | 31ª, Time E (2ª planilha; ligada à nº 39) |
| 78 | O total do plano proposto na lista de Tratamentos | 31ª, C12 |
| 79 | O aviso do valor em aberto do plano na Visão geral da ficha | 31ª, C05 (ligada à nº 28) |
| 80 | A matriz de Cargos avisar, ao pôr Relatórios em Ver sem nenhuma aba, que o módulo vale nada (A5) | 31ª, Time C |
| 81 | A ficha de saúde sem as perguntas de gestação para cliente do sexo masculino | 31ª, Times A e B |
| 82 | No "Receber o plano", sugerir o pacote que cobre PARTE do plano (hoje só o equivalente inteiro, DP-05) | 31ª, D14 |
| 83 | Na janela de venda do pacote, antes de vender, os termos que vão nascer | 31ª, D17 |
| 84 | "Pote" na lista fixa de embalagens do estoque (ES-05) | 31ª, D2 |
