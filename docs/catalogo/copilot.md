# Catálogo de regras — Copilot

Este é o catálogo das regras do Copilot que valem HOJE: o que ele é e quem usa, a permissão e as unidades de quem pergunta, o cartão antes de gravar, o que ele consulta, como responde, o que grava, o que não faz, e o histórico, a cota e o botão. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, "decisão do Claude". "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/copilot.md:1-284`; KB: `docs/regras/copilot.md:285-550`; KC: as decisões de `docs/revisao.md`, do CLAUDE.md e dos outros arquivos de `docs/regras/`, que repetem várias de `copilot.md` — juntas aqui, com os dois "Onde"). A regra de um módulo que o Copilot só aplica (a agenda, a ficha, o estoque, o financeiro, as comissões, os documentos, as abas dos Relatórios) fica no catálogo da área dona e está em "É de outra área". É um RASCUNHO para o Heitor revisar. Contagem: 72 regras (O que é e quem usa 7, A permissão e as unidades de quem pergunta 5, O cartão antes de gravar 8, O que ele consulta 18, Como ele responde 6, O que ele grava 12, O que ele não faz 7, O histórico, a cota e o botão 9), 3 perguntas e 5 divergências. Dos 90 números do rascunho, nenhum ficou fora do catálogo e 6 são de outra área (ver os apêndices); todos os outros estão num "Antes". Das sete perguntas dos rascunhos: as de "regras escritas como suas" viraram a Q01; a do "não vende, não recebe" contra o CP1 tinha resposta na regra mais nova (17/11, CY-02) — fica na Q01 só para confirmar as palavras, e o catálogo de Vendas que leu "vende e recebe" está em "Divergências"; a da baixa da parcela do crediário também tinha resposta na mesma regra e no CR-06 ("a parcela se recebe no PDV"): o que o código faz está em "Divergências"; as duas sobre o Copilot em Gerenciar contra o "nenhuma ação pede dois" viraram a Q02; e a da vista pessoal é a Q03 ("está no escopo?"). A divergência das comissões do rascunho KB (que dava tudo à Admin da rede) foi refeita: a comissão de cada pessoa é do Financeiro em Gerenciar (CM-04), só a configuração das comissões é da Admin da rede (CM-03).

## O que é e quem usa (CO)

**CO-01.** O Copilot é um chat da equipe da rede que fica sobre todas as telas do portal da rede e do portal da unidade, nunca no portal nem no app da cliente. Ele recebe texto, voz, imagem e documento, e serve para consultar e operar o sistema conversando.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:12-15`; `docs/revisao.md:1413-1415`
- Antes: KA-01, KC-01

**CO-02.** Na tela, o Copilot não tem nome de função ("secretária" não aparece): na matriz de Cargos ele é "Consultar o sistema e pedir gravações conversando", e no plano, "Copilot (IA)".
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:3-6`, `:547`
- Antes: KA-02, KB-34, KC-18

**CO-03.** O Copilot só abre para um membro da equipe quando as três coisas valem: a rede tem o Copilot no plano (pelo plano ou pelo adicional contratado), o cargo dele tem o módulo Copilot, e ele não está numa sessão de suporte ("entrar como"). Sem ele no plano, não abre para ninguém, porque ele custa por uso.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:56-60`, `:529`, `:532`; `docs/revisao.md:1421-1423`; `docs/regras/plataforma.md:409-410`
- Antes: KA-03, KC-02

**CO-04.** Com o Copilot fora do plano, a equipe não ganha botão do Copilot. Quem abre Configurações → Assinatura vê no lugar dele um "Copilot: fora do plano", que abre só um aviso ("O Copilot não está no seu plano de teste." no teste grátis; senão, "O Copilot não faz parte do plano da rede.") e o link para a Assinatura. Nada se libera.
- Fonte: princípio 3
- Onde: `docs/regras/copilot.md:61-71`; `docs/revisao.md:1421-1423`; `docs/regras/plataforma.md:398-401`, `:517-518`
- Antes: KA-04, KC-04

**CO-05.** O módulo Copilot do cargo tem dois níveis: Sem acesso (não usa) e Ver, que liga a ferramenta — consultar e agir. Cada consulta e cada gravação pedem só a permissão da AÇÃO, como na tela (agendar pede a Agenda em Gerenciar, lançar pede o Financeiro em Gerenciar…): o Copilot é o canal, não o passo. O Gerenciar que já estava gravado num cargo vale Ver. O plano diz se a REDE tem o Copilot; o cargo diz QUEM usa.
- Fonte: o Heitor, 2026-11-23: "cada passo pertence a UM módulo, e nenhuma ação pede dois" (lida para o Copilot na revisão de 24/11, Q02 desta área — até ali, gravar pedia também o Copilot em Gerenciar); os dois níveis: decisão do Claude
- Onde: `docs/regras/copilot.md:84-96`; `apps/web/lib/copilot/executor.ts`; `apps/web/tests/copilot-executor.test.ts`
- Antes: KA-05, KC-03

**CO-06.** O Copilot consulta e grava agenda, clientes, catálogo, indicadores, financeiro, estoque e CRM.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/copilot.md:43-44`; `docs/revisao.md:1416-1417`
- Antes: KA-16, KC-06

**CO-07.** O Copilot acompanha o sistema. Ele conhece as telas que a pessoa abre, e tela ou aba nova entra sozinha. Toda mudança no que ele lê ou grava (o PDV e as comandas, o aceite do plano, contato e oportunidade, a ficha de saúde, as unidades da pessoa, o link único dos documentos, a Auditoria) muda o Copilot junto, e funcionalidade nova pergunta o que o Copilot precisa saber dela.
- Fonte: o Heitor, 2026-11-13: "Sim, copilot acompanha tudo e como ainda podemos precisar mudar outras coisas nessa revisão, melhor deixar copilot por último, mas a orientação é a mesma, acompanha as mudanças"
- Onde: `docs/regras/copilot.md:209-216`, `:537`, `:540`; `docs/revisao.md:1403-1409`, `:1428-1431`, `:2202`
- Antes: KA-31, KC-11

## A permissão e as unidades de quem pergunta (CW)

**CW-01.** Pelo Copilot, cada consulta e cada gravação pedem a mesma permissão que a ação pede na tela, nas unidades ao alcance da pessoa. Ele só oferece o que a pessoa pode fazer, e confere tudo de novo antes de agir. Pode ser mais estreito que a tela, nunca mais largo. Exemplos: confirmar um agendamento pede a Agenda em Gerenciar; dar baixa pede o PDV ou o Financeiro em Gerenciar.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:83-87`, `:113-122`; `docs/regras/atendimento.md:3415-3419`; `docs/revisao.md:2202` ("a permissão no lugar do cargo")
- Antes: KA-06, KC-10

**CW-02.** O Copilot não tem "só os meus": nenhuma ferramenta recorta por dono. Os indicadores dele seguem os módulos e as abas de Relatórios da pessoa, com os números e os registros de todos nas unidades ao alcance dela. Isso não é a vista pessoal dos dashboards.
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem, no crm acho que não se aplica diretamente e talvez o melhor caminho seja pelo filtro de dono da oportunidade…"
- Onde: `docs/regras/copilot.md:120-122`, `:270-276`; `docs/revisao.md:1293-1296`, `:2218` (SM5); `CLAUDE.md:602-606`; `docs/regras/indicadores.md:1095`, `:1212`
- Antes: KA-37, KC-14

**CW-03.** A unidade de que o Copilot fala segue a abrangência da pessoa. Quem tem "A rede inteira" escolhe qualquer unidade. Quem tem unidades escolhe entre as dela, e sem escolher fica na unidade da tela. Pedir uma unidade de fora é recusado com o motivo e a lista das dela ("fora do seu alcance. As suas: …"); o Copilot não troca calado pela unidade da tela. Ele sabe quais são as unidades da pessoa.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim, copilot acompanha tudo e como ainda podemos precisar mudar outras coisas nessa revisão, melhor deixar copilot por último, mas a orientação é a mesma, acompanha as mudanças" (CP1, "as unidades da pessoa")
- Onde: `docs/regras/copilot.md:123-129`, `:542`; `docs/revisao.md:1430`, `:2202`
- Antes: KA-21, KC-13

**CW-04.** Quando a pessoa não diz a unidade, as consultas de agendamentos, lançamentos e estoque procuram em todas as unidades dela, e a resposta diz onde procurou. Gravar (agendar e as outras) continua sendo na unidade da tela.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:130-136`
- Antes: KA-22, KC-13

**CW-05.** O Copilot fala em permissão, nunca em cargo como se fosse fixo ("o seu cargo…"), no que diz e nas mensagens.
- Fonte: o Heitor, 2026-11-13: "não quero mais tu falando nomes de cargos como se fossem cargos fixos, o que define quem gerencia é permissão, ponto."
- Onde: `docs/regras/copilot.md:543`; `CLAUDE.md` §1
- Antes: KB-29

## O cartão antes de gravar (CZ)

**CZ-01.** Consultar é livre, sem cartão. Toda gravação passa por um cartão com "Confirmar" e "Cancelar", e nada se grava antes do "Confirmar".
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/copilot.md:19`, `:88`, `:521`; `docs/revisao.md:1417-1418`
- Antes: KA-08, KC-07

**CZ-02.** O cartão é a confirmação. A resposta não pede "responda Confirmar" e não repete os dados que o cartão já mostra. Depois do cartão, a frase é: "Confira e confirme no cartão abaixo." — e ela só aparece quando o cartão apareceu; com o cartão na tela, o Copilot não pergunta se a pessoa quer gerar outro.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:20-23`, `:437-440`; `docs/revisao.md:1417-1418`
- Antes: KA-10, KB-25, KC-07

**CZ-03.** O cartão vale 15 minutos. No "Confirmar", o Copilot prepara tudo de novo e só grava se o resultado ainda for igual ao que o cartão mostrou. Um cartão se confirma uma vez só.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:88-91`
- Antes: KA-09

**CZ-04.** O cartão de uma gravação não mostra nada que mude sozinho até o "Confirmar" (um saldo, "daqui a 2h").
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:489-493`, `:525`
- Antes: KB-32

**CZ-05.** Quando a gravação tem uma pergunta a fazer, o cartão traz um botão por opção no lugar do "Confirmar" (o "Cancelar" fica), e só grava com uma das opções do cartão. Ex.: "Já existe a ficha de X" no cadastrar e no agendar com cliente novo: "Cadastrar mesmo assim" ou "Unificar com a ficha de X".
- Fonte: o Heitor, 2026-11-03: "no Copilot, o cartão de confirmação mostra a mesma pergunta"
- Onde: `docs/regras/copilot.md:302-310`
- Antes: KB-02

**CZ-06.** Os cartões de agendar, remarcar e cancelar dizem o aviso que de fato chega à cliente. Ou ela recebe o aviso no app ("Horário marcado", "Agendamento remarcado", "Agendamento cancelado"), ou o cartão diz "Nada é enviado a ela agora": ela não tem acesso ao app, ou o app da cliente não está no plano.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:23-29`
- Antes: KA-11

**CZ-07.** No cancelar, o agendamento que ainda não começou se cancela; o que já está Em atendimento é uma desistência, e o cartão diz "Desistir do atendimento" e avisa que a sessão paga conta como usada.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-23: "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/regras/copilot.md:116-119`; `docs/revisao.md:1309-1314`, `:1329-1330`, `:2229`
- Antes: KA-07

**CZ-08.** O cartão diz "Feito" assim que a gravação termina, sem esperar a tela de trás recarregar.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:474-481`
- Antes: KB-30

## O que ele consulta (CJ)

**CJ-01.** Todo número que o Copilot dá é o mesmo da tela, lido do mesmo jeito: os clientes novos do dashboard, o "sem visita" do "Reativar clientes" (sempre o da rede), o "a receber" do Financeiro (pelo vencimento, até o fim do período), a agenda até o fim do período como a aba Agenda, e o comercial como o painel da aba Comercial dos Relatórios.
- Fonte: o Heitor, 2026-11-03: "os dois têm de dar a mesma resposta"
- Onde: `docs/regras/copilot.md:225-234`, `:277-284`; `docs/regras/indicadores.md:1078-1087`, `:923-927`, `:1444-1448`
- Antes: KA-34, KC-15

**CJ-02.** Despesa e receita do período vêm dos indicadores, como a tela — o Copilot nunca soma as linhas dos lançamentos. O contra-lançamento do estorno aparece como "estorno", fora da despesa e da receita.
- Fonte: princípio 3
- Onde: `docs/regras/copilot.md:405-409`, `:544`
- Antes: KB-18, KC-15

**CJ-03.** Os números por unidade e por categoria dizem sempre se são receita ou despesa: receita por unidade, por forma de pagamento e por categoria; despesa por unidade e por categoria (sem o estorno), com os totais.
- Fonte: princípio 3
- Onde: `docs/regras/copilot.md:410-416`, `:545`
- Antes: KB-19

**CJ-04.** O Copilot nunca calcula uma taxa: as da agenda vão prontas e com o nome (a taxa de conclusão até o fim do período, a dos Relatórios; o aproveitamento até agora, o do dashboard; o comparecimento dos primeiros atendimentos, na aba comercial). Ele cita a que existe.
- Fonte: princípio 4
- Onde: `docs/regras/copilot.md:417-423`, `:546`
- Antes: KB-20, KC-15

**CJ-05.** As listas de clientes do Copilot são da rede: "novos", "por tag", "aniversariantes" e "sem visita" não se recortam por unidade, nem quando a pessoa pede uma unidade.
- Fonte: o Heitor (H5), 2026-11-01: "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/copilot.md:221-228`
- Antes: KA-33

**CJ-06.** O Copilot lê as vendas sem gravar nada: as comandas abertas do PDV (nas unidades da pessoa ou na pedida, e de uma cliente se ela pedir), para quem recebe ou vê o Fechamento do dia; os planos de tratamento de uma cliente (a situação e as sessões feitas, agendadas e a agendar), com o Atendimento em Ver e a funcionalidade no plano; e, na ficha da cliente, os planos e o que falta pagar em cada pacote e pré-pago. O valor só aparece a quem recebe ou vê o Fechamento. As vendas dos indicadores levam o número da comanda. A anotação do plano não sai.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:143-159`
- Antes: KA-25

**CJ-07.** O Copilot diz o gasto do mês na Meta de cada número oficial de WhatsApp, com a mesma trava da tela (Configurações em Gerenciar).
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:248-250`
- Antes: KA-36

**CJ-08.** "Os agendamentos da Fulana": o nome é procurado como quem atende e como cliente. Achado de um lado só, vale ele e a resposta diz como entendeu; dos dois lados, o Copilot pergunta qual. A cliente pode ser dada por nome, telefone ou id.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:363-368`
- Antes: KB-10

**CJ-09.** Agendamentos sem datas no pedido: com a cliente ou quem atende (ativo ou com o acesso desativado), de hoje a 30 dias à frente; sem nenhum dos dois, só hoje. A resposta diz o período lido, em dd/mm.
- Fonte: princípio 3
- Onde: `docs/regras/copilot.md:368-377`
- Antes: KB-11

**CJ-10.** Pedido sem data exata ("a semana", "o mês") é o período atual, sem perguntar; a resposta diz o período que leu.
- Fonte: princípio 7
- Onde: `docs/regras/copilot.md:390-393`
- Antes: KB-15

**CJ-11.** "Em aberto" são os agendados, confirmados, com chegada e em atendimento (fora o concluído, o cancelado e a falta). Sem dizer, a lista traz todos menos os cancelados.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:377-379`
- Antes: KB-12

**CJ-12.** Na lista de agendamentos do cartão, cada item diz o dia quando o período tem mais de um dia, e a unidade quando a pessoa alcança mais de uma. A lista traz também o atendimento que começou antes do período e ainda o ocupa (o que atravessa a meia-noite, o de vários dias), com o início real ("desde qua., 09/12 às 18:00"): nele a pessoa não está livre.
- Fonte: princípio 3; o que continua de antes: decisão do Claude, 25/11, pelo princípio 3
- Onde: `docs/regras/copilot.md:381-385`
- Antes: KB-13

**CJ-13.** A busca do Copilot recorta os agendamentos pela unidade da tela; a quem alcança mais de uma unidade, o título diz "· agendamentos só de <unidade>" (os das outras vêm pela consulta de agendamentos).
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:386-389`
- Antes: KB-14

**CJ-14.** Os agendamentos de quem teve o acesso desativado se listam, com "(acesso desativado)" no nome e o aviso de trocar quem atende em cada um. Só para ler: agendar e remarcar continuam só com quem atende.
- Fonte: princípio 3
- Onde: `docs/regras/copilot.md:400-404`
- Antes: KB-17

**CJ-15.** Quem atende se acha pelo nome direto no agendar, no remarcar e nos horários livres — não depende da Equipe. A busca só mostra membro a quem tem a Equipe e, vazia para quem não a tem, aponta o agendar e os horários livres.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:441-448`
- Antes: KB-26

**CJ-16.** Os horários livres são sugestão (de 30 em 30 min, dentro do horário da unidade e de quem atende): o Copilot tenta o horário pedido no agendar ou no remarcar, que conferem o conflito, e nunca conclui da grade que um horário está ocupado.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:449-455`
- Antes: KB-27

**CJ-17.** A quem tem só a vista pessoal, o Copilot responde por ela, com os limites da tela: a Minha agenda (quem atende e não tem a Agenda — os agendamentos dela nas unidades ao alcance) e as Minhas comissões (quem atende ou tem comissão no nome dela e não tem o Financeiro). Só leitura, só as DELA, pelo id dela e nunca por um nome do pedido.
- Fonte: a revisão de 24/11 (Q03 desta área), pela fala do Heitor de 2026-11-13: "copilot acompanha tudo"; a vista pessoal: CLAUDE.md §11 (SM2)
- Onde: `docs/regras/copilot.md:308-316`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**CJ-18.** O dinheiro dos Relatórios segue as abas do cargo, também no Copilot: a leitura dos indicadores recusa a aba que o cargo não tem antes de ler qualquer número, e com a aba lê o dinheiro dela, como a tela. A aba Financeiro só vale com o Financeiro em Ver — marcada sem ele, a recusa diz "pede o Financeiro em Ver", e as abas liberadas só listam as que valem; na Visão geral sem o Financeiro não saem o faturamento, o a receber, as despesas, o insumo, as taxas, as comissões nem o lucro. Os lançamentos seguem o Financeiro (a tela do Financeiro).
- Fonte: o Heitor, 2026-11-23: "financeiro é uma coisa, vendas é outra. financeiro ve entrada/saida/lucro, tudo. vendas é sobre performance de vendas" (`docs/revisao.md:2237`); as abas do cargo: CLAUDE.md §11 ("Relatórios tem um eixo a mais")
- Onde: `docs/regras/copilot.md:330-345`; `apps/web/tests/copilot-dinheiro-pelas-abas.test.ts`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## Como ele responde (CK)

**CK-01.** O "agora", o "hoje" e as horas que o Copilot lê e grava seguem o fuso da unidade da tela (no portal da rede, o da rede). Cada registro usa o fuso da unidade dele.
- Fonte: o Heitor, 2026-11-11: "Não, deixa a clinica configurar o seu fuso"
- Onde: `docs/regras/copilot.md:50-55`; `docs/regras/indicadores.md:50-54`, `:65-67`; `DEVLOG.md:13703`
- Antes: KA-19, KC-16

**CK-02.** Os anexos são lidos na hora do pedido e descartados; a conversa guarda só o nome e o tipo. Valem imagem de até 5 MB (a foto grande é reduzida antes de enviar), PDF, txt, csv, docx, xlsx e voz (transcrita). doc e xls antigos não.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:160-165`, `:527`
- Antes: KA-26

**CK-03.** A resposta do Copilot só traz link para uma tela do sistema, sempre com o nome da tela. Caminho solto ("/unidade/pdv", com ou sem id) sai do texto. Link cortado no fim da resposta fica só como texto. Datas e frações como "19/11", "1/5" e "e/ou" ficam.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:166-173`, `:526`, `:548`
- Antes: KA-27

**CK-04.** Quando a consulta mostra um cartão com uma lista (dois itens ou mais), o texto não repete a lista: diz o total, o período e o que pede atenção.
- Fonte: princípio 7
- Onde: `docs/regras/copilot.md:174-177`
- Antes: KA-28

**CK-05.** A resposta cortada (tempo, conexão) termina avisando: "(A resposta foi cortada. Peça a continuação, se precisar.)".
- Fonte: princípio 3
- Onde: `docs/regras/copilot.md:178-183`
- Antes: KA-29

**CK-06.** O Copilot diz a aba dos Relatórios pelo nome da tela ("Visão geral", "Financeiro"…), nunca pela chave interna ("overview"): na resposta, na recusa e na lista das abas liberadas.
- Fonte: princípio 7 (A2 da 27ª simulação)
- Onde: `docs/regras/copilot.md:493-497`; `apps/web/tests/copilot-sala-abas-e-comanda.test.ts`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## O que ele grava (CX)

**CX-01.** O Copilot age em nome de quem pediu. Nos eventos e no histórico aparece "Fulana (via Copilot)". Na Auditoria, a gravação é da pessoa, marcada "Fulana (pelo Copilot)". Consultas e cartões não confirmados não deixam marca.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim, copilot acompanha tudo e como ainda podemos precisar mudar outras coisas nessa revisão, melhor deixar copilot por último, mas a orientação é a mesma, acompanha as mudanças"
- Onde: `docs/regras/copilot.md:92-103`; `docs/revisao.md:1426-1432`, `:2202`; `docs/regras/plataforma.md:1221-1225`
- Antes: KA-20, KC-12

**CX-02.** O cadastro de cliente pelo Copilot termina em "Ficha de X criada".
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:29-30`
- Antes: KA-12

**CX-03.** O agendar do Copilot segue a janela "+ Agendar": o que a cliente já tem do mesmo procedimento (a sessão do plano, o pacote, o pré-pago) entra sozinho, e o cartão diz "Incluído: …" no lugar do valor; a sessão do plano usa a duração dela. Se outro agendamento pegou esse crédito entre o cartão e o "Confirmar", vira avulso e a mensagem diz.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:315-321`
- Antes: KB-04

**CX-04.** "Repassar" um atendimento é trocar quem atende, na mesma data e hora: o cartão é "Trocar quem atende" ("Quem atende: A → B" e a unidade, sem De/Para) e o resultado diz "Agora quem atende é B.". O mesmo horário com a mesma pessoa é recusado ("Nada muda").
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:394-399`
- Antes: KB-16

**CX-05.** O estoque no Copilot fala como as janelas do Estoque: o saldo é o da prateleira ("1 frasco fechado + 1 aberto com 50 UI"), com o mínimo na mesma medida — nunca a embalagem aberta contada inteira. A entrada leva fornecedor, marca e nota fiscal; o cartão diz "Não gera despesa", a quantidade em embalagens e na medida, e avisa a validade já vencida sem recusar; o resultado diz o "Saldo agora". O cartão do ajuste diz para onde vai a diferença (a menos é perda "Inventário"; a mais, um lote novo) e avisa a variação de mais da metade do saldo.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:326-337`
- Antes: KB-07

**CX-06.** A despesa nunca se grava com uma categoria escolhida calada: sem a categoria dita pela pessoa, o Copilot pergunta ou o cartão traz a lista "Categoria (sugerida)", com a sugerida primeiro e o aviso "A categoria foi sugerida pelo Copilot: confira ou troque antes de confirmar."; grava a escolhida, se for da lista. "Outro" só se a pessoa disser.
- Fonte: princípio 3
- Onde: `docs/regras/copilot.md:424-431`, `:464-473`
- Antes: KB-21

**CX-07.** O cartão da despesa em "Compra de estoque" avisa que ela "conta no caixa e fica fora do resultado".
- Fonte: princípio 3
- Onde: `docs/regras/copilot.md:464-470`
- Antes: KB-22

**CX-08.** O cartão da despesa paga diz "Pago em" (hoje, no fuso da unidade), e é esse o dia gravado.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:432-433`
- Antes: KB-23

**CX-09.** O Copilot dá baixa como o Financeiro, na receita ou na despesa lançada em aberto (com o boleto na despesa, como a tela). A parcela do crediário não: ela se recebe no PDV (CY-02).
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:139-143`
- Antes: KA-24

**CX-10.** Pelo Copilot se cria oportunidade com valor e responsável, e se troca o responsável. Escolher o responsável segue a mesma permissão da tela. A consulta da oportunidade diz se a pessoa já é cliente.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:235-238`
- Antes: KA-35

**CX-11.** O Copilot nunca cria tag nem põe tag sozinho. Ele marca numa cliente, a pedido, só as tags que a rede já tem, com o nome que a rede deu. A busca por tag não distingue maiúscula de minúscula ("VIP" = "vip"). Tag que não existe faz o Copilot dizer quais existem. Criar oportunidade pelo Copilot não põe tag. Criar tag é na tela.
- Fonte: o Heitor, 2026-11-13: "O sistema não coloca tag nenhuma automaticamente em ninguém por nenhum motivo, tá?"
- Onde: `docs/regras/copilot.md:217-220`, `:224`, `:538-539`
- Antes: KA-32

**CX-12.** No agendar pelo Copilot, a sala pedida ("agende na Sala 1") vai na sala do agendamento, não na observação: a sala ativa da unidade (o nome exato antes do parecido), conferida com as outras peças (a sala serve ao procedimento) e livre no horário; o cartão diz "Sala". Sem sala no pedido, nenhuma.
- Fonte: decisão do Claude, pelo princípio 3 (A1 da 27ª simulação)
- Onde: `docs/regras/copilot.md:371-378`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**CX-13.** O Copilot recusa o mesmo que a tela do mesmo gesto, nem mais nem menos, e diz o motivo em português. Lançar, a entrada e o ajuste de estoque e a oportunidade não têm teto de valor nem de quantidade; a oportunidade aceita o valor estimado zero e quantos procedimentos de interesse a pessoa disser, a entrada aceita o custo zero, e o marcar tags, quantas tags do vocabulário a pessoa pedir. Recusa só o impossível: o zero e o negativo onde a tela recusa, e o que o registro não guarda — R$ 99.999.999,99 no lançamento e no custo da entrada, R$ 9.999.999.999,99 no valor da oportunidade, 999.999,9999 na quantidade e no saldo do estoque (na unidade de consumo, quando o produto tem uma). O cartão da entrada diz o aviso do custo fora do comum que a janela de Entrada diz, sem recusar.
- Fonte: o Heitor, 2026-11-25: "Se não for impossível, ainda que improvável, pode ser feito."; o limite de cada campo (o tipo da coluna) é decisão do Claude, 25/11
- Onde: `docs/regras/copilot.md` ("O Copilot recusa o que a tela recusa"); os limites no núcleo (`apps/web/lib/financeiro/limites-do-registro.ts`, `apps/web/lib/estoque/limites-do-registro.ts`, `apps/web/lib/crm/valor-do-card.ts`), que `apps/web/lib/copilot/ferramentas/limites-do-registro.ts` reexporta
- Antes: os tetos só do Copilot (R$ 10.000.000, 100.000 embalagens, R$ 1.000.000 de custo, 1.000.000 no ajuste, 5 procedimentos, 10 tags)

**CX-14.** O horário que já passou, no agendar e no remarcar do Copilot, é o da tela: a mesma regra e a mesma mensagem ("Esse horário (…) já passou. Escolha a partir de …"), sem tolerância — o minuto de agora vale. No remarcar, só o horário NOVO se confere: trocar só quem atende (o mesmo horário) vale mesmo com o horário marcado já passado.
- Fonte: o Heitor, 2026-11-25: "recusa, não dá pra agendar no passado"; e "remarcar para o passado é possível desde que não tenha passado do horario já, o que tornaria impossível desse atendimento acontecer"
- Onde: `docs/regras/copilot.md` ("O Copilot recusa o que a tela recusa"); `apps/web/lib/appointments/horario-passado.ts`
- Antes: 5 minutos de tolerância e "Esse horário já passou." só no Copilot

**CX-15.** Os textos das gravações do Copilot seguem a tela do mesmo gesto: o que a tela grava sem teto (a observação do agendar, o motivo do cancelamento, a descrição do lançamento, o lote e a observação da entrada, o motivo do ajuste, a observação da oportunidade) não tem teto, e o mínimo é o da tela, com a frase dela; o que tem limite na tela ou no registro mantém o número (a marca e o fornecedor 120, a nota fiscal 60, a tag 60 e a origem 60; o nome e o e-mail da oportunidade, sem teto, como a janela — `leads.name` e `leads.email` viraram text em `20261208000001`). Os nomes que ele procura e os campos de formato mantêm o limite técnico. Toda recusa de tamanho é em português ("No máximo N caracteres.").
- Fonte: o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." (copilot.md: "recusa na mensagem padrão do zod, em inglês" é defeito); cada limite: decisão do Claude, 25/11
- Onde: `docs/regras/copilot.md` ("Os tamanhos de texto também"); `apps/web/lib/copilot/ferramentas/comum.ts` (`texto`)
- Antes: observação até 300, descrição e motivo até 200, nome até 120 e lote até 60, com o "Too big: expected string…" do zod

**CX-16.** O remarcar do Copilot recusa no preparo o agendamento Em atendimento, com a frase do núcleo da tela ("Este agendamento está em atendimento agora: não se remarca. Para desistir, use "Cancelar" no atendimento."): o cartão não aparece para algo que o Confirmar recusaria.
- Fonte: decisão do Claude, 25/11, pelo princípio 3
- Onde: `docs/regras/copilot.md` ("O remarcar recusa o Em atendimento no PREPARO"); `apps/web/lib/copilot/ferramentas/agenda-escrita.ts`
- Antes: a recusa só no Confirmar

## O que ele não faz (CY)

**CY-01.** Nada clínico vai ao Copilot. Nenhuma ferramenta lê prontuário, evolução, ficha de saúde, foto clínica nem a anotação clínica do plano. Quando pedem, o Copilot diz que isso fica na tela, e o painel avisa para não mandar material clínico.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/copilot.md:40-42`, `:520`; `docs/revisao.md:1419-1420`; `docs/regras/atendimento.md:1837-1839`
- Antes: KA-15, KC-08

**CY-02.** O Copilot não vende (pacote, pré-pago, produto, crédito interno), não recebe (nem a comanda, nem a parcela do crediário) e não aceita plano de tratamento: ele só lê e manda ao PDV, com o link. Pedido de receber um atendimento ("receba a massagem da Bruna") é respondido com o PDV, na comanda do atendimento, sem perguntar o caminho. O aceite do plano fica na tela do atendimento e no app da cliente.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — 17/11, registrada no DEVLOG entre as respostas dele, sem aspas
- Onde: `docs/regras/copilot.md:137-139`, `:154-158`, `:434-436`; `docs/revisao.md:1428-1430`; `DEVLOG.md:2201`
- Antes: KA-23, KB-24, KC-09

**CY-03.** Para o que não faz por conversa (importar, criar tag, mudar comissão, conectar o WhatsApp, colher assinatura), o Copilot explica em uma frase e indica a tela, entre as telas que a pessoa abre.
- Fonte: o Heitor, 2026-10-16: "o copilot a par de todas as mudanças"
- Onde: `docs/regras/copilot.md:209-216`, `:537`
- Antes: KA-31

**CY-04.** Para mudar algo que a permissão da pessoa não muda, o Copilot não indica a tela como caminho: diz que a permissão dela não muda isso e quem muda — quem tem o módulo em Gerenciar; na configuração da rede toda (importar, tags, integrações e WhatsApp, a configuração das comissões), a Admin da rede ("Esta configuração é só da Admin da rede."). Nas comissões, diz os nomes de quem muda: a comissão de cada pessoa, quem tem o Financeiro em Gerenciar; a configuração das comissões, a Admin da rede.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:456-463`; `CLAUDE.md` §11 (`:753-757`); `docs/catalogo/comissoes.md` (CM-03, CM-04)
- Antes: KB-28, KA-31

**CY-05.** O resumo do cartão volta ao modelo com o CPF mascarado; a pessoa vê inteiro no cartão. O que a equipe anexa vai inteiro à OpenAI — por isso o aviso fixo de não mandar material clínico, e a política de privacidade diz isso.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:482-485`, `:535`
- Antes: KB-31

**CY-06.** Mandar ao PDV é só para quem tem o PDV: a quem não tem, o Copilot diz que a permissão dela não recebe nem vende e que quem tem o PDV em Gerenciar faz, sem dar o link.
- Fonte: decisão do Claude (A29 da 26ª simulação), pela regra de que o botão que a pessoa não pode usar não aparece (CLAUDE.md §14)
- Onde: `docs/regras/copilot.md:155-160`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**CY-07.** Ao pedido de receber um atendimento, o link que o Copilot dá é o da comanda dele, achada entre as comandas abertas — sem comanda aberta, o do PDV. Ele nunca manda abrir comanda nova nem uma venda para o atendimento: a comanda dele já existe no PDV.
- Fonte: decisão do Claude, pelo princípio 3 (A3 da 27ª simulação: o Copilot ensinava "Nova comanda")
- Onde: `docs/regras/copilot.md:486-492`; `apps/web/tests/copilot-sala-abas-e-comanda.test.ts`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## O histórico, a cota e o botão (CH)

**CH-01.** As conversas do Copilot ficam 90 dias. A conversa parada há 90 dias sai inteira. Numa conversa em uso, saem as mensagens e os cartões com mais de 90 dias.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:184-187`, `:531`; `docs/regras/infra.md:243`
- Antes: KA-30, KC-17

**CH-02.** O painel vazio oferece primeiro, acima do "Olá", "Continuar a conversa anterior: <título>". Se há uma conversa com um cartão esperando o "Confirmar" (ainda no prazo), é ela que vem no lugar: "Continuar a conversa com um cartão a confirmar: <título>".
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:30-36`
- Antes: KA-13

**CH-03.** O painel vazio abre sozinho na conversa que tem um cartão a confirmar. Isso acontece uma vez por conversa, e não depois de "Nova conversa".
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:36-39`
- Antes: KA-14

**CH-04.** O uso do Copilot tem uma cota mensal por rede, que vem do plano (sem número, sem limite). O consumo aparece na Assinatura da rede. Passada a cota, o pedido é recusado.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/copilot.md:45-46`, `:78-79`; `docs/revisao.md:1424`, `:1591-1592`
- Antes: KA-17, KC-05

**CH-05.** A cota conta tudo o que a OpenAI cobra: cada resposta (também a que falha ou cai no meio depois de aceita) e a transcrição da voz. Pedido recusado antes de chegar à OpenAI não conta. O mês da cota é o de Brasília.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:54-55`, `:188-191`, `:533`; `docs/regras/indicadores.md:50-54`
- Antes: KA-18, KC-16

**CH-06.** O botão do Copilot não cobre a tela: no celular (abaixo de 1024 px) o fim da página fica acima dele; o que ganha o foco atrás dele sobe para cima dele (o modal fica de fora); na tela do atendimento no celular, ele sobe acima da barra do "Finalizar".
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:504-515`; `docs/regras/design.md:108-114`; `docs/regras/atendimento.md:3762-3768`
- Antes: KB-33, KC-19

**CH-07.** O "Olá" e os atalhos do painel vazio saem das ferramentas que o cargo libera, as mesmas que o Copilot recebe: o texto ("Posso consultar a agenda, achar um cliente…") e os botões só oferecem o que a pessoa pode fazer; "Toda gravação passa pela sua confirmação." só aparece com alguma ferramenta de escrita, e "Quanto faturamos este mês?" só com a aba Visão geral dos Relatórios.
- Fonte: decisão do Claude (A28 da 26ª simulação), pelo princípio 3
- Onde: `docs/regras/copilot.md:40-48`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**CH-08.** Cada chamada do Copilot tem o custo estimado em dólar pelo preço do modelo (entrada e saída), somado no uso do mês da rede com os tokens. O sistema (admin.bellarisos.com) mostra em Copilot o mês por rede, a cota, o custo (em US$ e em R$) e os últimos meses. O modelo fora da tabela de preços tem custo "—", nunca um número inventado.
- Fonte: princípio 4 (o modelo sem preço não ganha número); o custo estimado: decisão do Claude
- Onde: `docs/regras/copilot.md:223-230`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**CH-09.** Com a chave de administração da OpenAI no sistema, a aba Copilot mostra o custo REAL da OpenAI no destaque, com o estimado e a diferença. A OpenAI não separa por rede: o real é rateado na proporção do custo estimado de cada rede.
- Fonte: decisão do Claude
- Onde: `docs/regras/copilot.md:231-240`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Nenhuma pergunta fica na página. As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Estas regras são suas? Escritas como decisão sua, sem a sua fala.** `docs/regras/copilot.md:17-46` e `:72` as põem como "Decisões do Heitor (2026-10-08)" e "pedido do Heitor de 2026-10-08", sem as suas palavras: CZ-01 (toda gravação passa por um cartão e consultar é livre), CY-01 (nada clínico vai ao Copilot), CO-06 (os módulos que ele lê e grava), CH-04 (a cota mensal por rede, no plano) e CO-05 (o módulo Copilot com Ver = só consultas e Gerenciar = também gravações; a outra dúvida dela é a Q02). E CY-02 (o Copilot não vende, não recebe e não aceita plano): o DEVLOG a lista entre as suas respostas de 17–18/11 (`DEVLOG.md:2201`: "O Copilot (17/11): só lê e manda ao PDV; não vende, não recebe e não aceita o plano"), sem aspas. Ela é a mais nova e vale sobre a leitura do CP1 de 13/11 ("vender e receber pela comanda do PDV", que quer dizer que as ferramentas acompanham o PDV); e o "não recebe" vale também para a parcela do crediário, que se recebe no PDV (CR-06) — o que o código faz hoje está em "Divergências". Confirma as seis?

Q02. **Resolvida na revisão de 24/11:** A sua regra de 23/11 ("cada passo pertence a UM módulo, e nenhuma ação pede dois") decide: o Copilot liga a ferramenta, e o que ele faz pede só a permissão da ação, como na tela. Defeito a corrigir. — *Era:* **Gravar pelo Copilot pede dois módulos** (CO-05, CW-01). Hoje, gravar pede o Copilot em Gerenciar E a permissão da gravação (por exemplo, a Agenda em Gerenciar para agendar). A sua regra de 23/11 (`docs/revisao.md:1309`, aprovada em `:1329-1330`: "concordo, pode anotar, marcar as questões e ajustar o codigo") diz que "cada passo pertence a UM módulo, e nenhuma ação pede dois"; e a CW-01 diz que o Copilot pede a mesma permissão da tela. As duas puxam para lados diferentes: o Copilot é o canal, não o passo, mas hoje ele pede um módulo a mais que a tela. Qual fica?
- (a) O Copilot em Ver liga a ferramenta (consultar e agir), e o que ele faz pede só o módulo da ação, como na tela.
- (b) Fica como está: agir pede o Copilot em Gerenciar e o módulo da ação.

Q03. **Resolvida na revisão de 24/11:** A sua fala de 13/11 ("copilot acompanha tudo … acompanha as mudanças") decide: o Copilot responde pela Minha agenda e pelas Minhas comissões de quem só tem a vista pessoal, com os mesmos limites da tela. Defeito a corrigir. — *Era:* **Está no escopo? A vista pessoal no Copilot.** Quem atende sem a Agenda (ou sem o Financeiro) vê a Minha agenda e as Minhas comissões nas telas (SM2, `CLAUDE.md` §11), mas nada escrito diz o que o Copilot responde a ela ("meus horários de amanhã", "minha comissão do mês"); `docs/regras/copilot.md:274-275` só diz que os indicadores do Copilot não são a vista pessoal (CW-02). O Copilot deve responder pela vista pessoal?

## Divergências

O texto de `docs/regras/` (ou de outro catálogo), e onde se viu também o código, contra a decisão mais nova — para corrigir depois.

- CY-02, CX-09 (CÓDIGO): o Copilot dá baixa na parcela do crediário em aberto. `docs/regras/copilot.md:139-143` diz que "a parcela do crediário em aberto também se baixa por ele (VF2-05 da varredura de 18/11, decisão do Claude: o prompt mandava ao PDV o que a ferramenta faz)"; o prompt manda fazer (`apps/web/lib/copilot/prompt.ts:132`: "Dar baixa num lançamento em aberto do financeiro (o avulso, a parcela do crediário), você faz, com marcar_pago"), e a ferramenta `marcar_pago` não recusa a parcela (`apps/web/lib/copilot/ferramentas/gestao-escrita.ts:196-235`: a descrição em `:203` e o preparo em `:205-213` aceitam qualquer lançamento em aberto). A regra de 17/11 (CY-02, `DEVLOG.md:2201`: "não vende, não recebe e não aceita o plano") é a mais nova, e a parcela se recebe no PDV (CR-06, `docs/revisao.md:1992`, CX1). A correção: o `marcar_pago` recusa a parcela do crediário e indica o PDV, com o link; o texto de `copilot.md:139-143` muda junto.
- CY-02 (texto e outro catálogo): `docs/regras/vendas-financeiro.md:70-73` diz que a comanda da venda "vale em todo caminho que vende (tela, action, Copilot)", e o texto do CP1 em `docs/revisao.md:1428-1429` ("vender e receber pela comanda do PDV") se lê como se o Copilot vendesse — e o catálogo de Vendas leu assim: `docs/catalogo/vendas-financeiro.md:36` (PV-06, "a tela ou o Copilot") e `:1086` ("O Copilot vende e recebe pela comanda do PDV"). A decisão de 17/11 (`DEVLOG.md:2201`; `copilot.md:154-158`) é que o Copilot não vende nem recebe.
- CY-04 (CÓDIGO e texto): `docs/regras/copilot.md:460-463` dá como quem muda as comissões "o Financeiro em Gerenciar, na rede; a Admin da rede sempre", sem separar as duas coisas. O código junta do outro lado: `apps/web/lib/equipe/quem-desfaz.ts:100-103` (`quemMudaAsComissoes`) devolve só as Admins da rede, o prompt diz "Quem muda as comissões (a Admin da rede)" (`apps/web/lib/copilot/prompt.ts:154`) e que as comissões "são só da Admin da rede" (`:151`), e a rota só deixa de mandar os nomes a quem tem o Financeiro em Gerenciar E é a Admin da rede (`apps/web/app/api/copilot/route.ts:168`). A regra: a comissão de cada pessoa, na Equipe, não é configuração da rede toda e é de quem tem o Financeiro em Gerenciar (CM-04, `docs/catalogo/comissoes.md:22`); só a configuração das comissões (Comissões e taxas, o campo da comissão no procedimento, no pacote e no produto) é da Admin da rede (CM-03, `:17`). Hoje quem tem o Financeiro em Gerenciar sem ser a Admin ouve que não muda a comissão de ninguém, e quem não o tem ouve só os nomes das Admins.
- CY-03, CY-04 (CÓDIGO e texto): `docs/regras/copilot.md:211-216` e o prompt (`apps/web/lib/copilot/prompt.ts:149-151`) mandam indicar a tela para importar, criar tag, comissão e conectar o WhatsApp, e dizer que muda "quem tem o módulo em Gerenciar", sem distinguir a configuração da rede toda. Desde 18/11 (o Heitor: "Configuração da rede toda só pela conta admin"; `CLAUDE.md` §11) as importações, as tags, as integrações e a configuração das comissões são só da Admin da rede: a quem não é a Admin, o Copilot diz o que a tela diz ("Esta configuração é só da Admin da rede." e quem muda), e a comissão de cada pessoa segue o Financeiro em Gerenciar (CM-04).
- CO-04, CY-01 (texto, vocabulário): `docs/regras/copilot.md:12` ("a EQUIPE da clínica"), `:61` ("a quem administra a clínica"), `:67` ("O Copilot não faz parte do plano da clínica."), `:78` ("Origin da clínica"), `:256` ("o limite da clínica") e `:540` ("Funcionalidade nova na clínica") ainda dizem "clínica" (o Heitor, 13/11, CLAUDE.md §1: "'Clínica' é a mesma coisa que rede e não deve existir no sistema"; V1, `docs/revisao.md:2184`); a tela já diz "da rede" (`apps/web/components/copilot/copilot-fora-do-plano.tsx:56`). E `:41` e `:520` dizem "anamnese", que no texto é "Ficha de saúde" (FI-02).

## Ficou fora do catálogo

Nenhum número de rascunho ficou fora. Duas notas:
- O nome "secretária virtual" (`docs/regras/infra.md:64`, `CLAUDE.md:565`), que o rascunho KC dava como divergência de vocabulário: é o apelido do produto nos documentos internos, não nome de cargo nem texto de tela (a CO-02 é sobre a tela, e a tela a segue); não é regra de negócio.
- As linhas só de implementação de `docs/regras/copilot.md` (`:522`, `:523`, `:528`, `:530`, `:534`, `:536`, `:549`) e as seções "Ferramenta nova" e "O E2E" (`:487-502`) o rascunho KB já tinha deixado fora sem número; as outras do "O que nunca fazer aqui" repetem regras acima: `:520` (CY-01), `:521` (CZ-01), `:524` (CW-01), `:525` (CZ-04), `:526` (CK-03), `:527` (CK-02), `:529` (CO-03), `:531` (CH-01), `:532` (CO-05), `:533` (CH-05), `:535` (CY-05), `:537` (CY-03), `:538-539` (CX-11), `:540` (CO-07), `:541` (CX-01), `:542` (CW-03), `:543` (CW-05), `:544` (CJ-02), `:545` (CJ-03), `:546` (CJ-04), `:547` (CO-02), `:548` (CK-03).

## É de outra área

Os rascunhos também apontaram, sem número próprio, o que já está catalogado em outra área e o Copilot só aplica: na agenda, os horários livres sem o bloqueado (AG-02, AG-08), a ficha rápida e o "Agendar para a ficha de X" (AG-15), o procedimento que a unidade faz e quem atende nela (AG-16, PC-09), a origem comercial (AG-17), o bloqueio que só avisa (AG-20) e o bloquear, que é da Agenda em Gerenciar (AG-21), quem cancela, remarca e troca quem atende — a Agenda em Gerenciar (AG-32), a chegada só no dia (AG-33), o remarcar que volta a Agendado (AG-42), a sala (AG-43, AG-46), a desistência do Em atendimento (AT-20) e a sessão do atendimento iniciado e cancelado que conta como usada no plano (AT-21), "Ficha de saúde" no texto (FI-02), o estoque sem despesa, com marca e fornecedor (ES-13, ES-14) — `docs/catalogo/atendimento.md`; o documento e o CPF (CL-01), o telefone de outro país (CL-04), "Já existe a ficha de X" (CL-10), só a rede cria o acesso (PO-01), "contato" e "oportunidade", sem "lead" (IN-01), renomear a ficha (IN-06), a tag em todo filtro (TG-09), mover a pedido (OP-20), o mover que pergunta das automações (OP-22), a perda sem motivo (OP-26), as origens (OP-27) — `docs/catalogo/crm-inbox.md`; nenhum sinal de pontos com o programa desligado (PG-02) — `docs/catalogo/fidelidade.md`; a comanda por venda (PV-06, ver "Divergências"), a forma na baixa (FP-02), quem dá baixa (FN-06), as categorias da despesa e a "Compra de estoque" (FN-16), a parcela que se recebe no PDV (CR-06), a sessão do pacote em aberto (PA-13), a maquininha (MQ-15), a bandeira (MQ-16), as vezes no crédito (MQ-18) — `docs/catalogo/vendas-financeiro.md`; a comissão só a quem tem o Financeiro em Ver (QV-02) e quem muda as comissões (CM-03, CM-04) — `docs/catalogo/comissoes.md`; o cadastro que remonta os documentos (DD-03), quem vê os documentos (DQ-05), o Copilot que só consulta a situação dos documentos (DQ-09) — `docs/catalogo/documentos.md`; o gasto da Meta na linha do número (WM-05) — `docs/catalogo/whatsapp-push.md`; a definição de "cliente novo", das taxas da agenda, do ticket e do lucro, o "Já é cliente" só informativo e a aba Financeiro dos Relatórios, que pede o Financeiro em Ver (o Heitor, 23/11: "financeiro é uma coisa, vendas é outra…") — área Indicadores e Relatórios, sem catálogo ainda; o Copilot no plano, o teste grátis "tudo, menos o Copilot", o adicional, o valor da cota, quem abre Configurações → Assinatura e quem contrata o adicional, o "O que essa pessoa vai ver" pelo nível, o filtro "Só o que foi pelo Copilot" da Auditoria e o custo na tela do sistema — área Plataforma (catalogada em paralelo; a leitura do rascunho KC-04, que dava o aviso de fora do plano só à Admin da rede, não entrou na CO-04: ver o aviso não é mudar configuração, e quem abre a Assinatura é regra da Plataforma); o Copilot no site — área Site; sem a chave da OpenAI o Copilot não aparece — infra, técnico.

- KB-01: o dinheiro dos Relatórios no Copilot segue as abas de Relatórios da pessoa (sem a aba, recusa antes de ler qualquer número; com a aba, o mesmo dinheiro da tela), e os lançamentos seguem o Financeiro (recomendação do Claude aprovada pelo Heitor, 2026-11-01: "concordo"; `docs/regras/copilot.md:285-291`; `docs/regras/indicadores.md:1116-1118`, `:1242-1244`) — área: Indicadores e Relatórios (sem catálogo ainda); o Copilot só aplica (CW-01).
- KB-03: no agendar, quem não tem Clientes em Gerenciar recebe "Agendar para a ficha de X" no lugar de "Unificar"/"Reativar", e a ficha arquivada só oferece cadastrar mesmo assim (`docs/regras/copilot.md:310-314`) — área: Agenda, AG-15 ("O Copilot segue a mesma regra.").
- KB-05: quem atende fora de "Quem realiza" do procedimento é avisado no cartão, sem barrar (`docs/regras/copilot.md:321-322`) — área: Procedimentos, PC-14 (na agenda da equipe, escolher quem não realiza só avisa).
- KB-06: quem atende é procurado entre quem tem o "Atende" marcado na unidade do pedido, e quem não atende nela e o procedimento que a unidade não faz são recusados antes do cartão (`docs/regras/copilot.md:322-324`, `:357-362`) — área: Agenda e Procedimentos, AG-16 e PC-09 (e AG-61, o "Atende" só nas unidades da pessoa).
- KB-08: o cadastro pelo Copilot aceita passaporte ou RNE no lugar do CPF, e a senha inicial provisória é o número desse documento (`docs/regras/copilot.md:338-346`; `CLAUDE.md` §5) — área: Clientes, CL-01 e PO-01 (as duas já valem "no Copilot").
- KB-09: os horários livres sem o bloqueado, o encaixe avisado no cartão ("…O encaixe é permitido: confirme só se for isso mesmo.") e o bloquear e desfazer o bloqueio na tela da Agenda (`docs/regras/copilot.md:347-356`; `docs/regras/atendimento.md:176-184`) — área: Agenda, AG-08, AG-20 e AG-21.
