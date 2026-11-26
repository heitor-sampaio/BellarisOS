# Para o Heitor: o que precisa de você

O Heitor, 24/11: "Quando eu voltar a gente revisa as decisoes que precisam de mim." O que está aqui não foi feito, ou foi
feito e mudou teste. Cada item diz o que é, o que o Claude propõe e o teste em jogo. As regras que o Claude decidiu sozinho
estão no catálogo, marcadas "decisão do Claude, 25/11 (o Heitor revisa)".

## 1. Testes alterados ou apagados nas correções da 28ª (25/11)

Pela regra do CLAUDE.md §15, todo teste alterado vem aqui, com a fala que o permite.

**Pelo "o pagamento acontece por dentro desse PDV, seja do que for" (13/11) e pelo "cada passo do atendimento, um módulo" (23/11)**

O plano saiu da tela do atendimento: agora se recebe só no PDV.
- `tests/varredura-vendas-financeiro.test.ts`
- `tests/atritos-da-20-vendas.test.ts`
- `tests/pdv-varias-formas-e-crediario-avulso.test.ts`
- `tests/checkout-pagamento.test.ts`: "a receber no atendimento" virou "a receber no PDV"
- `e2e/financeiro-f67.spec.ts`
- `e2e/maquininhas-f67.spec.ts`
- `e2e/plano-recebimento.spec.ts`: reescrito
- `e2e/plano-recebimento-concorrente.spec.ts`: reescrito
- `e2e/vendas-forma-nasce-vazia.spec.ts`
- `e2e/atendimento-atritos-da-7.spec.ts`

**APAGADO**: o caso do duplo clique ("o mesmo envio duas vezes: grava uma, e as duas respostas dizem o recebido"), em
`plano-recebimento-concorrente`. No PDV a gravação também é uma só, mas a segunda resposta é um erro, não "recebido".
Decida se o PDV deve responder "recebido" às duas vezes; se sim, o caso volta, no PDV. (Respondida: voltou, §9.)

**Pelo "não recusar o valor que a rede escolheu, no máximo avisar" (princípio 2, 04/11)**

Os limites viraram aviso. Os valores do "comum" acima dos quais se avisa são decisão do Claude.
- `tests/fidelidade-config.test.ts`: três casos
- `tests/fidelidade-voucher.test.ts`
- `tests/checkout-lancamentos.test.ts`: as parcelas
- `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`: o texto da recusa do zero

**Pelo "o sistema precisa ser intuitivo" (princípio 7, 11/11)**

"Cancelar" virou "Desistir do atendimento" no atendimento em andamento. O NOME é decisão do Claude. (Você discordou em 25/11: voltou a "Cancelar", §9.)
- `e2e/atendimento-atritos-da-8.spec.ts`
- `e2e/atendimento-atritos-da-10.spec.ts`
- `e2e/atendimento-quem-inicia-e-conclui.spec.ts`

**Por regras suas de antes**
- `e2e/configuracoes-textos-e-estados-vazios.spec.ts`: a aba Assinatura é só da Admin da rede ("Configuração da rede
  toda só pela conta admin", 18/11).
- `tests/sessao-so-le-prontuario-e-automacoes.test.ts`: a sessão não lê mais as automações ("vai na 2", 19/11).
- `tests/auditoria-atendimento-e-permissao.test.ts`: o "OWN" saiu ("pode tirar, as vistas pessoais resolvem", 23/11).
- `e2e/campanha-data-anual.spec.ts`: a cliente sem aparelho não conta como enviada ("O que a tela mostra é o que vale
  na conta", princípio 3).
- `e2e/indicadores-cada-numero-no-seu-modulo.spec.ts`: quem atende sem a Agenda vê as etapas da Agenda com os números
  dela ("as vistas pessoais resolvem", 23/11).
- `e2e/indicadores-dashboard-da-rede-so-os-meus.spec.ts`: no dashboard da unidade, quem atende sem a Agenda vê a etapa
  Agendamentos com os agendamentos dela (era "a etapa não aparece"); mesma fala de 23/11.

## 2. Testes que o Claude NÃO mudou e propõe mudar (a regra é só decisão do Claude)

1. **"Completar a ficha" ou "Completar o cadastro"?** Hoje os dois nomes convivem no checkout. O catálogo diz "o
   cadastro", e os testes exigem "a ficha": `tests/atritos-da-15.test.ts:250` e
   `e2e/documentos-completar-a-ficha-f73.spec.ts:73`.
   **Decidido pelo Heitor, 25/11: "Completar cadastro".** O nome é "Completar o cadastro"; os dois testes mudam por essa fala.
   **Feito (§8).**
2. **O texto "Atende clientes em"** no aviso de desativar alguém da equipe e no agendamento. O controle hoje se chama
   "Atende clientes", e a lista só aparece depois de "Escolher em quais unidades atende". Proposta: citar o botão.
   Teste: `e2e/equipe-atritos-da-8.spec.ts:102`.
   **O Heitor, 25/11: "Não entendi. Citar o botão no teste?"** Explicado na conversa (25/11): a mudança é no TEXTO das
   duas telas (o aviso do Desativar e o da janela do agendamento), que mandam procurar um "Atende clientes em" que a
   ficha não mostra; a proposta é a frase que a Equipe já usa (`app/admin/team/page.tsx:194`). O teste só entra porque
   confere o texto antigo (`e2e/equipe-atritos-da-8.spec.ts:110`).
   **Decidido pelo Heitor, 25/11: "ok".** **Feito (§8).**
3. **O resumo do cargo**: três casos testam um jeito de montar o resumo que nenhuma tela usa. Proposta: apagar os três
   casos e o código. Teste: `tests/resumo-do-cargo.test.ts:9`, `:12` e `:15`.
   **Decidido pelo Heitor, 25/11: "ok mas tenha certeza absoluta que ninguem usa".** **Feito (§8).**
4. **O Reativar por unidade**: a função do banco `metrics_clientes_para_reativar` (por unidade) é código morto, porque
   a tela usa a da rede (CC-05). Proposta: apagar a função e os seis testes que a usam:
   - `e2e/indicadores-f68-contas:139`
   - `e2e/indicadores-cenario:346`
   - `e2e/fuso-da-unidade:440`
   - `e2e/indicadores-reativar-clientes:28`
   - `e2e/tags-sem-unidade:207`
   - `tests/tags-so-quem-marca:186`
   **Decidido pelo Heitor, 25/11: "ok mas tenha certeza absoluta que não é usada".** **Feito (§8).**
5. **A busca e o "Cadastrar «termo»"**: o seu "Ok" de 13/11 (BU1) diz que a oferta aparece sempre que nenhuma cliente
   bate. Desde 16/11 ela some quando o termo é nome de página, por decisão do Claude. Fica a exceção, ou volta o
   "sempre"? Teste: `tests/atritos-da-15.test.ts:78-93`.
   **Decidido pelo Heitor, 25/11: "Sim, se o termo for nome de funcionalidade não faz sentido aparecer".** Fica a exceção; nenhum teste muda.
6. **O produto de revenda nasce com "Insumo" marcado.** Proposta: nasce sem nenhuma caixa marcada; salvar sem nenhuma
   já é recusado com mensagem. Teste: `e2e/estoque-marcas-e-fornecedores.spec.ts:185-206`.
   **Decidido pelo Heitor, 25/11: "ok".** **Feito (§8).**
7. **Agendar no passado**: pelo princípio 2, o "+ Agendar" da equipe com horário passado avisaria e deixaria, como o
   remarcar já faz. Hoje recusa. Testes: `tests/validacao-limite-legivel.test.ts` e o E2E da agenda.
   **Decidido pelo Heitor, 25/11: "recusa, não dá pra agendar no passado".** Fica a recusa; nenhum teste muda. O
   catálogo (AG-06, Q11) voltou para a recusa. Em aberto, perguntado na conversa (25/11): o REMARCAR para um horário
   que já passou hoje avisa e deixa (AG-41). A recusa vale também para ele?
   **Decidido pelo Heitor, 25/11: "remarcar para o passado é possível desde que não tenha passado do horario já, o que
   tornaria impossível desse atendimento acontecer"**, e confirmado na mesma data: para mais cedo que o marcado pode;
   para um horário que já passou, recusa. (O exemplo que o Claude deu, corrigir a hora de um atendimento já feito,
   estava errado: o remarcar não alcança o agendamento em atendimento nem o concluído.) **Feito (§8).**
8. **O nome do número de WhatsApp**: vindo da Meta, é cortado em 60 caracteres sem aviso; ao renomear, não tem limite.
   Proposta: um limite só, que avisa, ou nenhum. Teste: `tests/whatsapp-rotulo.test.ts:34`.
   **Decidido pelo Heitor, 25/11: "60 pra tudo".** O limite é 60 caracteres, vindo da Meta e ao renomear. **Feito (§8).**
9. **O nome da tag** recusa acima de 60 caracteres, e o banco não tem limite. Teste:
   `tests/tags.test.ts:31`.
   **Decidido pelo Heitor, 25/11: "60 caracteres".** Fica o limite de 60; nenhum teste muda.
10. **Desativar unidade**: a janela segue listando à parte o atendimento concluído sem pagamento, como o Financeiro
    faz? Testes: `tests/unidades-da-tela.test.ts:56`, `:70`, `:83` e `:118`.
    **O Heitor, 25/11: "nao sei, preciso de mais contexto".** Explicado na conversa (25/11): desde a CX3 (16/11) o
    atendimento concluído sem pagamento é uma comanda aberta, recebida no PDV, e a janela ainda o chama pelo nome
    antigo e manda ao "Ver o a receber" do Financeiro. Proposta: "1 comanda aberta no PDV (R$ 150,00)", com o caminho
    "Receber no PDV" da unidade (que segue recebendo o que ficou).
    **Decidido pelo Heitor, 25/11: "ok".** **Feito (§8).**

## 3. Outros limites que o princípio 2 talvez alcance

Ninguém mexeu. A pergunta: o "no máximo, avisar" vale para estes também?

**O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."** Cada limite abaixo passa a avisar,
salvo o que se provar impossível (conferido um a um: o banco, a operadora, o Asaas). Os 7, 8 e 9 da seção 2 não são
exceções ao princípio 2: o horário passado é impossível, e o tamanho de um nome não é valor do negócio.

- a validade do pré-pago: de 1 a 3.650 dias;
- o custo da recompensa: até 10 milhões de pontos;
- o cartão: em até 12 vezes;
- a despesa parcelada: até 48; a recorrente: até 60;
- a validade do plano: até 365 dias;
- o prazo para alterar pelo portal: até 720 horas;
- a validade da ficha de saúde: até 36 meses.

**Feito (§8).** Todos passaram a avisar ("Acima do comum (…). Confira: o valor vale como está.") e a gravar; o impossível, que
recusa, é o que o banco não guarda (os prazos até 100 anos, o limite das datas; as vezes do cartão até 1.200, os pontos
até 2.147.483.647). E o princípio alcançou outros limites do mesmo tipo, achados na varredura: as comissões em R$ fixo,
as quantidades do estoque e da venda, o valor do lançamento, os pontos do ajuste e do procedimento, o "Pacote de antes"
da importação (o teto de 200 sessões, que você aprovou em 06/11, saiu: vai até 32.767, o limite do registro), o nome e o
contato da oportunidade (eram 255 caracteres; agora como na ficha) e as ferramentas do Copilot (sem teto que a tela
não tenha).

## 4. Fatos que só você sabe

1. **O app Android já está na Play Store?** Se não está, a menção sai do site (`apps/site/lib/perguntas.ts:30`,
   `apps/site/components/conteudo.tsx:253`).
   **O Heitor, 25/11: "Sim".** A menção fica.
2. **A mensalidade em R$ 0.** A pergunta estava errada (erro do Claude): a trava que ela descrevia saiu em 07/10
   (migration `20261007000008`), e o banco de produção, conferido em 25/11, não a tem. Hoje: o total zero (100% de
   desconto no plano, sem adicional pago) é aceito e a rede vira cortesia — volta a ativa, o atraso é perdoado e a
   cobrança no Asaas fica em pausa (`private.cortesia_pela_mensalidade`); voltou a ter valor, a cobrança religa. Só se
   recusa o total entre R$ 0,01 e R$ 4,99 (o Asaas não cobra abaixo de R$ 5,00: impossível). A PN-20 do catálogo, que
   citava a trava, está errada.
   **O Heitor, 25/11: "Precisamos melhorar essa questão".** Respondida com a premissa errada; o Claude perguntou na
   conversa o que é melhorar aqui. **O Heitor, 25/11, com o funcionamento de hoje explicado: "ta acho que ta bom
   assim".** Nada muda; a PN-20 do catálogo já descreve o de hoje, com a sua confirmação.

## 5. As decisões do Claude no catálogo (25/11)

As 10 perguntas que tinham ficado foram decididas pelo Claude, com a regra, e estão no catálogo como "Decidida pelo
Claude, 25/11 (o Heitor revisa)". Duas delas viraram sugestão, na lista `docs/sugestoes-de-funcionalidades.md`.

## 6. A 29ª simulação (25/11)

Respondidas em 25/11: o que foi feito está no §9.

Nas correções da 29ª, nenhum teste existente foi alterado nem apagado. Ficaram para você cinco propostas, que mudariam
testes cuja regra é só decisão do Claude:

1. **Importação, o mesmo telefone sem CPF e outro nome.** Hoje a prévia já vem marcada para juntar (ou completar a
   ficha) quando duas pessoas sem CPF dividem o telefone, mesmo com nomes diferentes (IM-13, IM-15). Proposta: vir
   desmarcada ("Mesmo telefone de <nome>") e só marcar quando o nome também casa (princípio 4, não chutar). Testes:
   `e2e/importacao-previa-cruzamento.spec.ts`, casos "cli-07 e A15…" e "A14: na ficha, o mesmo telefone com outro
   nome…". A causa do caso da 29ª (a linha achava a ficha mais antiga do telefone, mesmo havendo a de mesmo nome) foi
   corrigida sem mexer nesses testes.
2. **"A equipe" no app da cliente.** Onde a rede fala com a cliente, o app agora diz o nome da rede; onde é a equipe que
   age ("a equipe ainda vai registrar o atendimento"), fica "a equipe", como diz `docs/regras/crm-inbox.md` (decisão do
   Claude). Três textos que testes exigem ficaram como estão; com o nome da rede, mudariam:
   - "A equipe já foi avisada. O pagamento é combinado na unidade…" (`tests/atritos-da-22-montar-crm-app.test.ts:105-113`);
   - a dica "Esta parte passa por liberação da equipe…" no pedido de dados (`e2e/dicas-portal-da-cliente.spec.ts:63-73`),
     enquanto o parágrafo do mesmo cartão já diz "da liberação de <rede>";
   - "Confira as respostas que a equipe preencheu" (`e2e/ficha-pre-atendimento.spec.ts:771`).
3. **A comissão de venda na linha da Equipe** diz "Venda: a do pacote, produto ou rede", sem dizer quanto. Proposta:
   "Venda: a do pacote ou produto vendido (sem ela, a da rede: X%)". Testes: `tests/atritos-da-19-cadastros.test.ts:62`,
   `tests/atritos-da-24-cargos-atendimento-app.test.ts:80`.
4. **A linha da LGPD no app.** O "Meus dados" ganhou uma linha: "Para apagar os seus dados ou retirar o seu
   consentimento, fale com <rede>." Sem botão: a sua decisão da 8ª ("mantem do jeito que tá") segue valendo. Confira se
   a linha cabe nela.
5. **O CSV de Relatórios → Vendas e o crédito interno.** A tela diz que o crédito interno vendido está fora do "Total
   vendido"; o CSV traz a linha dele sem dizer, e quem soma a coluna acha o crédito dentro (A21 da 29ª, VE-05 com o
   princípio 3). Proposta: uma linha no fim, "Fora do total: 1 crédito interno vendido, R$ 300,00 — a venda é o que for
   pago com ele." (ou a marca na descrição da linha). Os testes exigem o CSV sem ela:
   `e2e/relatorio-vendas-comandas.spec.ts:117` (três linhas exatas) e `tests/relatorio-vendas-comandas.test.ts:36` (a
   descrição "Crédito interno"). A correção foi feita, quebrou o primeiro na suíte completa e foi desfeita.

## 7. A 30ª simulação (25/11)

Respondidas em 25/11: o que foi feito está no §9.

Nas correções da 30ª, nenhum teste existente foi alterado nem apagado (oito ganharam casos novos). Ficaram para você
estas propostas, que mudariam testes cuja regra é só decisão do Claude, ou que precisam de uma regra sua:

1. **O resumo do cargo com o Atendimento e o Prontuário em Gerenciar** não diz nada sobre iniciar e concluir
   (`conclusaoNoResumo` devolve nulo quando os dois estão em Gerenciar, que é o caso completo). Proposta: "Inicia e
   conclui os atendimentos." Testes: `tests/atritos-da-23-cargos-atendimento-app.test.ts:82`,
   `tests/atritos-da-24-cargos-atendimento-app.test.ts:43`, `tests/auditoria-atendimento-e-permissao.test.ts:74`.
2. **As Fichas e os Cargos na matriz de Cargos.** São configuração da rede toda, só da Admin da rede (você, 18/11:
   "Configuração da rede toda só pela conta admin"): o Gerenciar deles não abre nada a quem não é a Admin. A tela de
   Cargos ainda os oferece, e o resumo agora diz isso. Proposta: tirá-los da matriz, como a Auditoria (só da Admin).
   Teste: `tests/permissions.test.ts`, "cashier, forms, roles e settings são tudo ou nada".
3. **O aviso do cargo "Não definido" e do cargo sem módulo** diz "entra e não vê nada" e "não abre a agenda nem os
   atendimentos" (`lib/cargos/sem-acesso.ts:83`, `:90-94`). Mas quem atende vê a Minha agenda e as Minhas comissões (as
   vistas pessoais não olham o cargo). Proposta: "entra e vê só a Minha agenda e as Minhas comissões, se atende".
   Testes: `tests/permissions.test.ts:261-262`, `e2e/equipe-cargo-nao-definido.spec.ts:32`, `:165`.
4. **O "A receber da cliente" e o lançamento sem cliente.** O cartão soma todo o em aberto (FN-11), inclusive o que
   não é de cliente nenhuma (a sublocação de uma sala). Agora a nota diz "Inclui sem cliente: R$ …". O nome do cartão
   diz "da cliente", e a regra diz "todo o em aberto". Fica no número, com a nota, ou sai do número?
5. **Os exemplos do nome e do título da campanha** são "ex: Aniversariantes de julho" e "ex: Feliz aniversário,
   {{first_name}}! 🎂", numa campanha de data fixa (o aniversário de cada cliente é a automação). Proposta: "ex: Dia das
   Mães" e "ex: Feliz Dia das Mães, {{first_name}}!". Seis E2E acham o nome por esse texto (`getByPlaceholder`) e cinco
   deles acham também o título; mudariam junto. (Nas correções, o título chegou a ser trocado sem perguntar, e a
   completa pegou: cinco specs não achavam o campo. Voltou ao texto de antes.)

## 8. O que foi feito com as suas respostas de 25/11

Cada teste alterado ou apagado, com a sua fala que o permite (CLAUDE.md §15).

**2.1, "Completar cadastro".** O link do checkout e o de Documentos dizem "Completar o cadastro" (a caixa da importação
"Completar a ficha de X" é outra ação e ficou).
- `tests/atritos-da-15.test.ts` (o caso A5): exige "Completar o cadastro" e que "Completar a ficha" não volte.
- `e2e/documentos-completar-a-ficha-f73.spec.ts`: o texto do link e o título do caso DOC-01.
- `tests/varredura-plataforma.test.ts`: só o comentário e o título do bloco.

**2.3, "ok mas tenha certeza absoluta que ninguem usa".** Conferido no repositório inteiro (os cinco apps e os
pacotes): `rotuloDasAbasAlcancadas` tem um chamador só, a tela de Cargos, e ele sempre ligava a opção `soAsDela`. A
opção saiu; o resumo sempre deixa de fora as abas da rede toda.
- `tests/resumo-do-cargo.test.ts`: APAGADOS os três casos (`:9`, `:12`, `:15`); fica o de Configurações em Gerenciar.
- `tests/config-da-rede-sobras-da-25.test.ts:65`: só perdeu o argumento `{ soAsDela: true }`; espera o mesmo resultado.

**2.4, "ok mas tenha certeza absoluta que não é usada".** Conferido: nenhum app chama a função; nenhuma função, view ou
agendamento do banco a chama; os registros da API de três dias (23 a 25/11, com duas simulações em produção) têm 997
chamadas à da rede e nenhuma à por unidade. A migration `20261206700001` apaga a função. A regra que só o caso que saiu
provava ("cliente nova não é cliente sumida", 20/10) ganhou um caso novo, na função da rede:
`e2e/indicadores-reativar-clientes-da-rede.spec.ts`, "cadastrada há pouco e sem visita…".
- `e2e/indicadores-reativar-clientes.spec.ts`: APAGADO o caso da função por unidade; fica o do quadro do mês.
- `e2e/indicadores-f68-contas.spec.ts`: APAGADO o caso C49 do "Reativar" da unidade.
- `e2e/tags-sem-unidade.spec.ts`: APAGADO o caso T1 do "Reativar" da unidade.
- `e2e/indicadores-cenario.spec.ts`: saiu só o trecho do "Reativar"; o título do caso perdeu "e clientes para reativar".
- `e2e/fuso-da-unidade.spec.ts`: saiu só a linha da função por unidade; a da rede segue conferida.
- `tests/tags-so-quem-marca.test.ts`: saiu só o nome da função da lista.

**2.6, "ok".** O produto novo nasce sem caixa marcada (`checkboxesIniciais`, `lib/estoque/uso.ts`). A proposta citava
um teste; mudaram NOVE, porque oito E2E contavam com o Insumo já marcado:
- `e2e/estoque-marcas-e-fornecedores.spec.ts`: exige as duas caixas desmarcadas e marca Insumo e Venda direta.
- Marcam "Insumo" antes de "Criar produto": `e2e/acoes-entre-redes.spec.ts`, `e2e/atendimento-fechamento.spec.ts`,
  `e2e/estoque-movimentos.spec.ts`, `e2e/estoque-nunca-gera-despesa.spec.ts`, `e2e/estoque-produto-por-unidades.spec.ts`,
  `e2e/estoque-unidade-da-9.spec.ts`, `e2e/fase3-estoque.spec.ts`.
- `e2e/dicas-estoque-procedimentos.spec.ts:62`: marca "Insumo" antes de conferir a dica de onde o produto aparece (a
  completa pegou; sem nenhuma caixa, a janela mostra o aviso, que o mesmo caso confere logo depois).

**2.8, "60 pra tudo".** Ao renomear ("Nome e vínculos"), o campo para em 60 e a action recusa acima ("O nome da conexão
tem no máximo 60 caracteres."). Nenhum teste existente mudou; o novo é `tests/whatsapp-nome-ao-renomear.test.ts`.

**2.7, o remarcar para o passado.** Você, 25/11: "remarcar para o passado é possível desde que não tenha passado do
horario já" e, sobre o Agendar, "recusa, não dá pra agendar no passado". O horário que já passou é recusado nos dois
(era aviso no remarcar, A24 da 11ª); para mais cedo que o marcado, desde que ainda não tenha passado, pode.
- `tests/agenda-remarcar-no-passado.test.ts`: o aviso virou a recusa ("Esse horário (…) já passou. Escolha a partir
  de …"); o minuto de agora vale (decisão do Claude).
- `tests/fuso-da-unidade.test.ts:385` e `:394`: só o nome da função (`recusaDoHorarioPassado`); o fuso conferido é o
  mesmo.

**1, o texto do "Atende clientes"** ("ok"). O aviso da Equipe cita o que a ficha mostra.
- `e2e/equipe-atritos-da-8.spec.ts:110`: o texto novo ("marque o “Atende clientes” (com mais de uma unidade, … em
  “Escolher em quais unidades atende”) no lápis dela").

**2.10, desativar unidade** ("ok"). "1 comanda aberta no PDV (R$ 150,00)", com "Receber no PDV".
- `tests/unidades-da-tela.test.ts:70` e `:118`: o texto e o caminho novos (`pdv` no lugar de `a-receber`); um caso
  novo confere o caminho.

**O bloqueio acima de um ano** ("Acima de 1 ano avisa").
- `tests/agenda-bloqueio.test.ts:38-41`: mais de um ano deixou de ser recusado; um teste novo confere o aviso.

**As cinco formas da baixa** ("Não precisa de aviso, essa não é uma ação automatica, o usuario vai precisar clicar em
um botão, então ele fez de proposito.").
- `tests/atritos-da-21-caixa.test.ts:151`: seis formas deixaram de ser recusadas.

**§3, as vezes do cartão** ("Se não for impossível, ainda que improvável, pode ser feito."). Acima de 12 vezes avisa;
recusa acima de 1.200 (decisão do Claude: o limite da tabela de taxas).
- `tests/cartao-por-bandeira.test.ts`, `tests/checkout-crediario-da-rede.test.ts`, `tests/checkout-lancamentos.test.ts`,
  `tests/financeiro-vezes-do-cartao.test.ts`, `tests/tabela-da-operadora.test.ts`: 13 vezes passou a valer; cada um
  ganhou a recusa acima de 1.200.
- `tests/comissoes-base-efetiva.test.ts`: a migration que troca as vezes no corpo das funções de cancelar pacote e
  plano também conta como a última que mexe nelas (ela troca só o trecho das vezes; o resto conferido é o mesmo).

**§3, os pontos** (a mesma fala; e, à pergunta de mudar o jeito de achar a migration, "Sim, muda como acha").
- `tests/fidelidade-config.test.ts`: a migration da conta cumulativa se acha por dois trechos juntos
  (`ultimaCom('fidelidade_pontos_do_pagamento', 'v_ligado')`), porque uma migration nova mexe na mesma função; nenhuma
  conferência mudou.

**O "Em andamento" no app da cliente** (você, 25/11: "Um "Em andamento" não seria melhor?", e a definição "Já começou e
não acabou").
- `tests/agenda-do-portal.test.ts`, os casos D14 e A51: o que já começou e não acabou sai dos "Próximos" e vai ao "Em
  andamento"; o que acabou sem ser fechado segue a regra de sempre (D14 não mudou).
- `e2e/portal-cliente-alterar-agendamento.spec.ts`, o fim do caso A51: o agendamento em andamento aparece em "Em
  andamento", sem o "o horário passou".


## 9. As suas respostas de 25/11 (a página de perguntas): o que foi feito

Cada teste alterado, com a sua fala que o permite (CLAUDE.md §15). Nenhum teste foi apagado.

**1, o clique duplo no "Receber" do PDV** ("As duas respostas dizem "recebido""). O mesmo envio grava uma vez e as duas
respostas dizem o recebido, no "Receber esta parcela", no "Receber" da comanda e no receber do plano (`umaVez`, com a
chave da tela). Duas abas seguem como antes: uma recebe, a outra ouve que já está pago. O caso apagado na 28ª volta, no
PDV.
- `e2e/plano-recebimento-concorrente.spec.ts`: o caso "o mesmo envio duas vezes (duplo clique)…" voltou, no
  `receberParcelaNoPdv`. Casos novos do mesmo gesto: `e2e/plano-checkout-uma-transacao.spec.ts` e
  `e2e/pdv-varias-formas-e-crediario-avulso.spec.ts`.

**2, a importação** ("Vem desmarcada, a não ser que o nome case"). Com o mesmo telefone sem CPF, "Completar a ficha de X"
vem marcada só quando o nome casa; o "Juntar X com Y" (duas linhas da planilha) vem desmarcado. O servidor confere
sozinho: sem a marca, a linha de outro nome vira ficha nova, mesmo que a prévia não tenha chegado a cruzar.
- `e2e/importacao-previa-cruzamento.spec.ts`: o caso "cli-07 e A15…" (a caixa da Marlene vem desmarcada; antes o caso a
  desmarcava) e o caso "A14…" (a Karina e a Clarinha vêm desmarcadas; a Clarinha é marcada para juntar). As fichas
  conferidas no fim são as mesmas.
- `tests/auditoria-e-grupos.test.ts:95`: a coluna nova `importacoes.juntar` (a marca de juntar que vai ao servidor) entrou na
  lista das colunas auditadas.

**4, a comissão de venda na linha da Equipe** ("Diz o percentual da rede"). "Venda: a do pacote ou produto vendido (sem
ela, a da rede: 5%)". A rede tem duas regras de venda, a do plano e a do produto; diferentes, a linha diz as duas ("5% no
plano, 2,5% no produto"); nenhuma, "(sem ela, nenhuma: a rede não tem)" (decisão do Claude, 25/11, princípios 3 e 4).
- `tests/atritos-da-19-cadastros.test.ts:62` e `tests/atritos-da-24-cargos-atendimento-app.test.ts:80`: o texto novo.

**6, o crédito interno vendido** ("se o crédito foi vendido, é venda, tem que contar, não conta é quando só usa"). O
crédito vendido conta no "Total vendido", e o "Fora do total" saiu da tela. O que a cliente paga com crédito interno não
conta de novo: a venda paga só com crédito não entra, e a paga em parte entra no dia do primeiro dinheiro, valendo o
resto. Decisão do Claude, pela sua fala: a parte paga com crédito sai da linha da VENDA, não do crédito.
- `e2e/relatorio-vendas-comandas.spec.ts`: o Total vendido do caso passou de R$ 400,00 ("1 venda") para R$ 700,00 ("2
  vendas"), e o "Fora do total" não aparece; o título do caso e o comentário do topo dizem a regra nova.
- `e2e/relatorio-vendas-so-o-pago.spec.ts:142`: o Total vendido das pagas passou de 4 (R$ 400) para 5 (R$ 500). Caso
  novo no mesmo spec: a venda paga só com crédito não entra; a paga em parte vale o resto.
- `tests/relatorio-vendas-comandas.test.ts`: saiu o caso que exigia o crédito fora do total (`FORA_DO_TOTAL`).

**7, o resumo do cargo** ("Diz "Inicia e conclui os atendimentos.""). Com o Atendimento e o Prontuário em Gerenciar, o
resumo diz "Inicia e conclui os atendimentos." (antes não dizia nada).
- `tests/atritos-da-23-cargos-atendimento-app.test.ts:82`, `tests/atritos-da-24-cargos-atendimento-app.test.ts:43`,
  `tests/auditoria-atendimento-e-permissao.test.ts:74`: esperavam nada; esperam a frase.

**8, as Fichas e os Cargos** ("8 - a": o nível passa a se chamar "Ver"). A matriz oferece Sem acesso e Ver; o Ver abre a
aba e lê, e mudar segue só da Admin da rede. Os dois cargos que tinham o Gerenciar (um com cada) passam a Ver. O resumo
diz "Fichas e Cargos em Ver: abre as duas abas e lê."
- `tests/permissions.test.ts:65`: "cashier, forms, roles e settings são tudo ou nada" virou "cashier e settings são tudo
  ou nada; forms e roles vão até o Ver"; e `:144`, o texto dos Cargos é o do Ver.
- `tests/cargos-resumo-da-fidelidade-e-da-config.test.ts:44-57`: o texto das Fichas é o do Ver, e o resumo diz "em Ver:
  abre a aba e lê" (era "estas permissões não abrem nada", que estava errado).

**10, o cartão do Financeiro** ("O cartão vira "A receber · em aberto" e soma tudo"). O número continua somando todo o em
aberto, com a nota "Inclui sem cliente: R$ …".
- `tests/atritos-da-22-caixa.test.ts:50`, `tests/atritos-da-23-financeiro.test.ts:160`,
  `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts:245`: o nome novo.

**11, os exemplos da campanha** ("Exemplos do Dia das Mães"). "ex: Dia das Mães" e "ex: Feliz Dia das Mães,
{{first_name}}!".
- Os seis E2E que acham o campo pelo exemplo: `e2e/campanha-aviso-no-celular.spec.ts:60-61`,
  `e2e/campanha-defeitos-da-11.spec.ts:50-51`, `e2e/campanha-imediata-ou-agendada.spec.ts:79-80`,
  `e2e/campanha-seletor-de-tags.spec.ts:41-42`, `e2e/funcionalidades-ligadas.spec.ts:93`,
  `e2e/tags-sem-unidade.spec.ts:207-208`.

**O botão do atendimento em andamento** ("Discordo — Mantem o Cancelar"). Volta a "Cancelar", com "Cancelar
atendimento", "Motivo do cancelamento *" e "Confirmar cancelamento". Por dentro segue a desistência de sempre (o insumo,
a intercorrência, a sessão paga).
- `tests/sessao-do-atendimento-o-que-a-tela-diz.test.ts:82-104`, `e2e/atendimento-atritos-da-8.spec.ts:94-100`,
  `e2e/atendimento-atritos-da-10.spec.ts:89-90`, `e2e/atendimento-quem-inicia-e-conclui.spec.ts:83-84` e `:98`: os
  textos de antes da 28ª.

**A remarcação pela cliente no app** ("Discordo — Ela já desmarcou uma vez, pode acabar desmarcando de novo, melhor
reconfirmar."). Volta a Agendado, como a da equipe e a do Copilot. O app diz "O horário novo fica como Agendado até ser
confirmado." (o texto é decisão do Claude).
- `tests/atritos-da-19-atendimento.test.ts:115-123`, `tests/textos-do-app-da-cliente-f73.test.ts:9-23`: o texto novo do
  app.
- `e2e/portal-cliente-remarcar-pelo-nucleo.spec.ts`: o caso do app espera Agendado e sem a confirmação (antes,
  Confirmado); o agendamento é posto em Confirmado antes de remarcar, para o caso provar que a confirmação sai.

**Sem mudança:** 3, 5, 9, 12 e as outras nove revisões.

**As pendências da entrega** ("1 ok, 2 sim, 3 sim, 4 ok"). 2: o cartão do Copilot ao cancelar o Em atendimento diz
"Cancelar atendimento" (era "Desistir do atendimento"), e a recusa diz "Cancelar o atendimento em andamento é de quem tem
o Atendimento em Gerenciar." 3: a série do fluxo de caixa é "A receber · em aberto", e a dica diz "O que entra (o a
receber em aberto e o que a operadora do cartão deposita)". 1 e 4 ficam como estão.
- `e2e/financeiro-dicas.spec.ts:49` e `:51`: a dica do fluxo diz "o a receber em aberto" (era "o a receber da cliente").

## 10. A 31ª simulação (26/11)

Nas correções da 31ª, nenhum teste existente foi alterado nem apagado. Ficaram para você estas, que mudariam testes cuja
regra é só decisão do Claude, ou que pedem uma regra sua:

1. **O "— da <nome>" de quem tem a regra de comissão** ("3% — da Tatiane"). Com um nome de homem fica "5% — da
   Gilberto". Proposta: "— de <nome>" ("3% — de Tatiane", "3% — de Gilberto"); "— da rede", "— do pacote" e "— do
   produto" ficam. Testes: `tests/comissoes-extrato-texto.test.ts:33`, `tests/vendas-atritos-da-12.test.ts:14`, `:17` e
   `:27`, `tests/vendas-f67.test.ts:9`.
2. **O texto do acesso criado sem documento** (`lib/clients/textos-do-cadastro.ts:36`) diz "enviamos a ele o e-mail para
   criar a senha" — "ele" para qualquer pessoa. Proposta: "enviamos para esse e-mail o link para criar a senha". Teste:
   `tests/copilot-acesso-senha-por-email.test.ts:37` e `:64`.
3. **"Pote" na lista de embalagens do estoque — está no escopo?** A lista é fixa (ES-05, 13 medidas), sem "pote"; na
   simulação, o pote de alginato virou "g" com conteúdo 1.000 g, e foi isso que levou à conta errada da embalagem.
4. **O "Dar entrada no Estoque" na venda de produto sem estoque** aparece a quem não tem o Estoque (o link leva a uma
   tela que ela não abre). A regra de esconder o botão que a pessoa não pode usar (CLAUDE.md §14) diria que some; mas o
   teste da 23ª exige o link para quem só tem o Caixa (`e2e/vendas-produto.spec.ts:198`). A correção foi feita e
   desfeita (a completa pegou). Proposta: o link só com o Estoque em Gerenciar; o aviso da falta segue a todos.
5. **O teste do filtro de tags do Financeiro falha de 26 a 30/11, e não é o sistema** (`e2e/financeiro-filtro-de-tags.spec.ts:121-127`,
   nos dois portais; falha igual sem as correções da 31ª). Ele clica em "A pagar" e confere o endereço com um padrão
   (`tags=VIP`) que já valia ANTES do clique; 50 ms depois desmarca a tag com a navegação ainda pendente, e a tela volta a
   Movimentações. Ali a despesa que vence em 5 dias só aparece se for do mês corrente: até o dia 25 ela aparecia e o caso
   passava; do 26 ao fim do mês, cai no mês seguinte e o caso falha. A regra FN-04 o sistema cumpre (a aba A pagar lista
   todo o em aberto). Proposta: o caso esperar o `aba=a-pagar` no endereço antes de mexer na tag — muda só a montagem do
   teste, não o que ele exige. Enquanto você não disser, ele fica como está (e falha até 30/11).


## 11. A 32ª simulação (26/11)

Nas correções da 32ª, nenhum teste existente foi alterado nem apagado (só saiu o nome da rodada do título dos casos NOVOS
desta rodada). Ficaram para você estas — as que mudariam testes cuja regra é só decisão do Claude, e as que pedem saber
se está no escopo:

1. **O "Confirmar" do agendamento com o choque na tela.** Quando a tela já diz "Não vai ser agendado" (o horário bate
   com outro), o "Confirmar" segue ligado, e o servidor recusa ao clicar. Desligar o botão quebraria três testes que
   clicam nele e esperam a recusa: `e2e/agenda-encaixe-avisa.spec.ts:97-99`, `e2e/agenda-modal-erro-mantem-campos.spec.ts:66-69`
   e `e2e/fase2-agenda.spec.ts:230-232`. Proposta: desligar, e os três passam a conferir o botão desligado.
2. **O texto exato do aviso do bloqueio.** O catálogo (AG-20) pede "O encaixe é permitido: confirme só se for isso
   mesmo."; a tela agora diz "O encaixe é permitido. Confirme só se for isso mesmo." (o mesmo sentido, numa frase à
   parte), porque `tests/agenda-bloqueio.test.ts:29-31`, `tests/agenda-bloqueio-dia-inteiro.test.ts:12` e
   `e2e/agenda-bloqueio.spec.ts:134` travam a frase de cada bloqueio. Proposta: fica como está.
3. **O porquê do estorno parcial no cartão, no pacote e no plano.** No pré-pago, na devolução de produto e na parcela da
   operadora, a recusa agora diz "No cartão, o estorno é do pagamento inteiro (a operadora não estorna só uma parte):".
   No cancelamento do pacote e do plano ficou a frase antiga, porque `tests/comissoes-base-efetiva.test.ts:55-65` exige
   que a migration mais nova que cita essas duas funções seja a da comissão. Proposta: o teste aceitar também uma
   migration que só troca texto, e as duas dizerem o mesmo.
4. **O link do CSV no Fechamento do dia.** A FC-14 (a CX6 que você aprovou em 13/11: "Blz pode ser assim") diz que o CSV
   do fechamento mora no Financeiro e que "nada disso aparece no Fechamento". Mas o Fechamento mostra "Baixar o CSV do
   fechamento · no Financeiro → Movimentações" (um link para lá, decisão do Claude da 24ª), e
   `tests/atritos-da-24-caixa.test.ts:213-216` exige esse link. Fica ou sai?
5. **"Abrir pelo número padrão" nas automações — está no escopo?** A AX-06 tem três escolhas para quem não tem conversa
   aberta. As duas primeiras estão feitas ("Não mandar", o padrão, e "Mandar como aviso no celular"). A terceira, abrir
   a conversa pelo número padrão, depende de a automação mandar modelo de mensagem aprovado pela Meta, que a própria
   regra diz que ainda falta construir.
6. **O "Tentar de novo" da mensagem que não saiu — está no escopo?** A decisão da 32ª sobre a resposta "Não enviada"
   (ela não conta como resposta, e a conversa segue aguardando) cita um "Tentar de novo" na bolha, que não existe no
   inbox. Hoje a pessoa manda de novo escrevendo. Se a mensagem for aceita depois, o sistema já conta a resposta nesse
   momento.

O que mais ficou da rodada: a única automação em produção com a variável `{{first_name}}` (das campanhas, que a
automação não conhece) é da rede da simulação; ela deixa de ser aceita ao salvar, e a mensagem com o nome vazio não sai.
