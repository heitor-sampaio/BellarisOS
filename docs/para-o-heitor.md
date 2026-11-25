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
Decida se o PDV deve responder "recebido" às duas vezes; se sim, o caso volta, no PDV.

**Pelo "não recusar o valor que a rede escolheu, no máximo avisar" (princípio 2, 04/11)**

Os limites viraram aviso. Os valores do "comum" acima dos quais se avisa são decisão do Claude.
- `tests/fidelidade-config.test.ts`: três casos
- `tests/fidelidade-voucher.test.ts`
- `tests/checkout-lancamentos.test.ts`: as parcelas
- `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`: o texto da recusa do zero

**Pelo "o sistema precisa ser intuitivo" (princípio 7, 11/11)**

"Cancelar" virou "Desistir do atendimento" no atendimento em andamento. O NOME é decisão do Claude.
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
2. **O texto "Atende clientes em"** no aviso de desativar alguém da equipe e no agendamento. O controle hoje se chama
   "Atende clientes", e a lista só aparece depois de "Escolher em quais unidades atende". Proposta: citar o botão.
   Teste: `e2e/equipe-atritos-da-8.spec.ts:102`.
   **O Heitor, 25/11: "Não entendi. Citar o botão no teste?"** Explicado na conversa (25/11): a mudança é no TEXTO das
   duas telas (o aviso do Desativar e o da janela do agendamento), que mandam procurar um "Atende clientes em" que a
   ficha não mostra; a proposta é a frase que a Equipe já usa (`app/admin/team/page.tsx:194`). O teste só entra porque
   confere o texto antigo (`e2e/equipe-atritos-da-8.spec.ts:110`). Espera o sim.
3. **O resumo do cargo**: três casos testam um jeito de montar o resumo que nenhuma tela usa. Proposta: apagar os três
   casos e o código. Teste: `tests/resumo-do-cargo.test.ts:9`, `:12` e `:15`.
   **Decidido pelo Heitor, 25/11: "ok mas tenha certeza absoluta que ninguem usa".**
4. **O Reativar por unidade**: a função do banco `metrics_clientes_para_reativar` (por unidade) é código morto, porque
   a tela usa a da rede (CC-05). Proposta: apagar a função e os seis testes que a usam:
   - `e2e/indicadores-f68-contas:139`
   - `e2e/indicadores-cenario:346`
   - `e2e/fuso-da-unidade:440`
   - `e2e/indicadores-reativar-clientes:28`
   - `e2e/tags-sem-unidade:207`
   - `tests/tags-so-quem-marca:186`
   **Decidido pelo Heitor, 25/11: "ok mas tenha certeza absoluta que não é usada".**
5. **A busca e o "Cadastrar «termo»"**: o seu "Ok" de 13/11 (BU1) diz que a oferta aparece sempre que nenhuma cliente
   bate. Desde 16/11 ela some quando o termo é nome de página, por decisão do Claude. Fica a exceção, ou volta o
   "sempre"? Teste: `tests/atritos-da-15.test.ts:78-93`.
   **Decidido pelo Heitor, 25/11: "Sim, se o termo for nome de funcionalidade não faz sentido aparecer".** Fica a exceção; nenhum teste muda.
6. **O produto de revenda nasce com "Insumo" marcado.** Proposta: nasce sem nenhuma caixa marcada; salvar sem nenhuma
   já é recusado com mensagem. Teste: `e2e/estoque-marcas-e-fornecedores.spec.ts:185-206`.
   **Decidido pelo Heitor, 25/11: "ok".**
7. **Agendar no passado**: pelo princípio 2, o "+ Agendar" da equipe com horário passado avisaria e deixaria, como o
   remarcar já faz. Hoje recusa. Testes: `tests/validacao-limite-legivel.test.ts` e o E2E da agenda.
   **Decidido pelo Heitor, 25/11: "recusa, não dá pra agendar no passado".** Fica a recusa; nenhum teste muda. O
   catálogo (AG-06, Q11) voltou para a recusa. Em aberto, perguntado na conversa (25/11): o REMARCAR para um horário
   que já passou hoje avisa e deixa (AG-41) — o uso é corrigir a hora de um atendimento que já aconteceu. A recusa
   vale também para ele?
8. **O nome do número de WhatsApp**: vindo da Meta, é cortado em 60 caracteres sem aviso; ao renomear, não tem limite.
   Proposta: um limite só, que avisa, ou nenhum. Teste: `tests/whatsapp-rotulo.test.ts:34`.
   **Decidido pelo Heitor, 25/11: "60 pra tudo".** O limite é 60 caracteres, vindo da Meta e ao renomear.
9. **O nome da tag** recusa acima de 60 caracteres, e o banco não tem limite. Teste:
   `tests/tags.test.ts:31`.
   **Decidido pelo Heitor, 25/11: "60 caracteres".** Fica o limite de 60; nenhum teste muda.
10. **Desativar unidade**: a janela segue listando à parte o atendimento concluído sem pagamento, como o Financeiro
    faz? Testes: `tests/unidades-da-tela.test.ts:56`, `:70`, `:83` e `:118`.
    **O Heitor, 25/11: "nao sei, preciso de mais contexto".** Explicado na conversa (25/11): desde a CX3 (16/11) o
    atendimento concluído sem pagamento é uma comanda aberta, recebida no PDV, e a janela ainda o chama pelo nome
    antigo e manda ao "Ver o a receber" do Financeiro. Proposta: "1 comanda aberta no PDV (R$ 150,00)", com o caminho
    "Receber no PDV" da unidade (que segue recebendo o que ficou). Espera o sim.

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
   conversa o que é melhorar aqui. Espera a resposta.

## 5. As decisões do Claude no catálogo (25/11)

As 10 perguntas que tinham ficado foram decididas pelo Claude, com a regra, e estão no catálogo como "Decidida pelo
Claude, 25/11 (o Heitor revisa)". Duas delas viraram sugestão, na lista `docs/sugestoes-de-funcionalidades.md`.

## 6. A 29ª simulação (25/11)

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
