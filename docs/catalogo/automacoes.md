# Catálogo de regras — Automações (eventos, automações e campanhas)

Este é o catálogo das regras das Automações que valem HOJE: o princípio, os fatos do sistema e os gatilhos, os modelos prontos, o editor do fluxo, o que cada passo faz, a espera, os limites e a fila, ligar, ensaiar e acompanhar, as campanhas, o público da campanha e quem vê e mexe. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta ou a escolha dele), um dos sete princípios de produto, "decisão do Claude". "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/automacoes.md:1-331`; KB: `docs/regras/automacoes.md:332-655`; KC: as decisões de `docs/revisao.md`, do CLAUDE.md e dos outros arquivos de `docs/regras/`, que repetem várias de `automacoes.md` — juntas aqui, com os dois "Onde"). É um RASCUNHO para o Heitor revisar. Contagem: 84 regras (O princípio 2, Os fatos e os gatilhos 11, Os modelos prontos 7, O editor do fluxo 10, Os passos 12, A espera, os limites e a fila 12, Ligar, ensaiar e acompanhar 8, As campanhas 9, O público da campanha 7, Quem vê e quem mexe 6), 2 perguntas e 6 divergências. Dos 105 números do rascunho, nenhum ficou fora do catálogo e 1 é de outra área (ver os apêndices); todos os outros estão num "Antes". Das seis perguntas dos rascunhos, as duas de "regras escritas como suas" viraram a Q01 (a de KA-39 a KA-41 saiu: a sua escolha "opção d, com a a valendo já" está registrada, e é a fonte delas); as três sobre o Gerenciar das Automações e do Marketing viraram a Q02, depois de conferido no código o que esse nível ainda dá; e a do teto de 200 "Clientes específicas" tinha resposta no princípio 2: está em "Divergências".

## O princípio (AU)

**AU-01.** Toda automação passa pelo módulo de Automações. Nenhum aviso, lembrete ou movimento da rede roda sozinho numa rotina ligada para todas as redes: o que o sistema fazia assim vira um modelo das Automações, que nasce rascunho, e a rede liga se quiser.
- Fonte: o Heitor, 2026-11-03: "nenhum card se movimenta sozinho, toda e qualquer automação deve ser feita através dos módulos de automações"
- Onde: `docs/regras/automacoes.md:75`, `:649`; `docs/regras/crm-inbox.md:1394-1396`, `:1596-1599`
- Antes: KC-02, KB-38

**AU-02.** Toda automação tem um gatilho e uma sequência de passos. O gatilho é um fato do sistema (agendou, não compareceu, pagamento recebido, ficha respondida…) ou o tempo (GT-11; e "N horas antes de cada agendamento"). Os passos são: "Se" (condições), mandar mensagem (WhatsApp numa conversa já aberta, ou aviso no celular), avisar a equipe, a tag (Clientes, TG-04), mudar a etapa da oportunidade, definir o responsável, anotar, buscar clientes e esperar.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/revisao.md:1092-1098`, `:2093`; `docs/regras/automacoes.md:163-169`
- Antes: KC-09

## Os fatos e os gatilhos (GT)

**GT-01.** Toda ação relevante do sistema vira um FATO, com nome pela intenção ("agendamento.nao_compareceu"), e as automações reagem a esses fatos. Todo fato oferecido como gatilho é de fato emitido pelo sistema: não há gatilho que nunca dispara.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:10-12`, `:18-20`
- Antes: KA-04

**GT-02.** "O que já aconteceu" fica nas Automações, ao lado da lista e das execuções, com a mesma permissão delas: a corrente dos fatos e o catálogo (quantas vezes cada fato ocorreu e os que nunca ocorreram). Serve para quem monta uma automação conferir se o gatilho já disparou. O caminho antigo (a aba Eventos de Configurações) leva para lá, e a busca acha "Automações → O que já aconteceu".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Concordo [CF1 e CF2]"
- Onde: `docs/regras/automacoes.md:21-33`; `docs/revisao.md:1342`, `:1379-1380`, `:1391-1393`, `:2129`
- Antes: KA-05, KC-19

**GT-03.** Os fatos do sistema ficam guardados por 30 dias, para as automações: é uma janela, não um arquivo, e não é a Auditoria (que guarda tudo enquanto a rede existir). Automação que precise olhar mais para trás consulta o dado de negócio.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode ser no menu" (CF3: "os 30 dias dos eventos são das automações")
- Onde: `docs/regras/automacoes.md:48-49`; `docs/revisao.md:1346-1348`, `:1365`
- Antes: KA-06, KC-20

**GT-04.** Fato clínico não carrega conteúdo clínico, e a automação não lê o prontuário: ela avisa que a ficha chegou; quem precisa do conteúdo abre o prontuário com a permissão que ele exige.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:50-52`
- Antes: KA-07

**GT-05.** Os fatos de pagamento, de estoque, de comissão liberada e paga e o "cliente comprou" nascem no banco, em todo caminho que os produz, e não dizem quem fez.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:53-55`; `docs/revisao.md:1347`
- Antes: KA-08

**GT-06.** O que o suporte grava na rede não dispara automação, e o fato que a plataforma grava na rede também não. O que a equipe ou a cliente faz no mesmo período dispara normalmente.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:98-111`; `docs/regras/plataforma.md:120-122`, `:616-623`
- Antes: KA-10, KC-14

**GT-07.** A sessão de pacote gasta gera o fato "sessão usada" uma vez por atendimento, tanto ao concluir quanto ao desistir no meio (a desistência gasta a sessão), com os mesmos dados — um atendimento nunca conta dois consumos.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:56-63`
- Antes: KA-11

**GT-08.** O fato "a cliente comprou" (da oportunidade) sai quando a cliente ligada a uma oportunidade ABERTA, criada antes da compra, compra: o pacote vendido (o trazido de fora não é venda), o pré-pago, ou o plano no PRIMEIRO recebimento pago (a parcela a receber e o estorno não contam). Uma vez por oportunidade e por compra, com o nome, a etapa, o funil, quem cuida, o que comprou e quando. O card não anda.
- Fonte: o Heitor, 2026-11-18: "Uma coisa só foi vendida se foi paga."
- Onde: `docs/regras/automacoes.md:64-76`
- Antes: KA-12

**GT-09.** O fato "pagamento estornado" só sai do que estava PAGO: a parcela nunca paga que cai como estornada (o crediário derrubado pelo cancelamento do pacote, a venda toda a receber cancelada) não o emite.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:112-117`
- Antes: KA-13

**GT-10.** Não existe gatilho "Retorno vencendo": o retorno é um agendamento novo, e quem quer avisar usa o gatilho do próprio agendamento.
- Fonte: o Heitor, 2026-11-02: "não tem necessidade real de um 'retorno em x dias', isso é basicamente só um novo agendamento com motivo específico, não tem necessidade de ter uma regra de negócio para isso"
- Onde: `docs/regras/automacoes.md:125-128`; `docs/regras/atendimento.md:3742-3745`
- Antes: KA-14

**GT-11.** O gatilho de tempo tem dois jeitos: de N em N minutos ou horas (a partir do último disparo) ou num horário do dia (todo dia, toda semana, todo mês). O menor intervalo é 5 minutos, o ritmo do relógio do sistema.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:163-169`
- Antes: KA-19

## Os modelos prontos (MO)

**MO-01.** "Nova automação" começa vazia; "Usar um modelo" é um botão ao lado, com os modelos prontos.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/regras/automacoes.md:259-262`; `docs/revisao.md:1099-1101`, `:2093`
- Antes: KA-32, KC-08

**MO-02.** No modelo, o procedimento fica no passo "Se", nunca no gatilho.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/automacoes.md:259-261`, `:273-274`
- Antes: KA-32

**MO-03.** Todo modelo nasce em RASCUNHO, desligado, para a rede revisar, e só existe quando alguém escolhe "Usar um modelo": a rede nova não nasce com automação nenhuma, e só a rede liga. O fluxo do modelo vem do sistema (não do navegador) e usa só fatos e passos do catálogo.
- Fonte: o Heitor, 2026-11-03: "pode manter o modelo, desativado, rede usa se quiser"
- Onde: `docs/regras/automacoes.md:235-243`, `:272-275`; `CLAUDE.md:97-98`; `docs/revisao.md:1070-1071`, `:1115`
- Antes: KA-34, KC-01, KC-07, KC-08

**MO-04.** Os modelos são: aniversário, retorno depois do atendimento, lembrete antes do agendamento, reativação, "Agendou: o card muda de etapa", vencimento de pacote (todo dia às 09:00, quem tem o pacote vencendo daqui a 7 dias), confirmação do agendamento, cancelamento, pontos de fidelidade (com os pontos e o saldo) e "Marque o ganho". Os que vieram da campanha automática mandam pelo canal que a rede tem: WhatsApp na conversa aberta ou aviso no celular.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/regras/automacoes.md:262-275`; `docs/revisao.md:1086`, `:1099-1101`, `:1112-1116`, `:1866-1868`, `:2091`
- Antes: KA-33, KC-07

**MO-05.** O modelo "Agendou: o card muda de etapa" nasce com a etapa vazia, e não liga até a rede escolher a etapa do funil dela.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:234-236`
- Antes: KA-35

**MO-06.** O lembrete antes do agendamento lembra o agendado E o confirmado; só não sai se o agendamento foi cancelado, faltou ou já foi concluído — e a descrição do modelo diz "se ele não tiver sido cancelado".
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:322-331`
- Antes: KA-36

**MO-07.** O modelo "Reativação de quem sumiu" roda todo mês, no dia 1 às 9h: busca quem está sem atendimento há mais de 60 dias e manda o convite. Quem continua sumida recebe de novo no mês seguinte, e a descrição do modelo avisa isso.
- Fonte: decisão do Claude (A19 da 11ª simulação)
- Onde: `docs/regras/automacoes.md:576-580`
- Antes: KB-31

## O editor do fluxo (ED)

**ED-01.** Tudo se propaga: cada passo lê os dados do fato e o que cada passo anterior deixou, em condição ou como variável no texto. A lista de campos mostra o que cada fato e cada passo trazem, mais os campos vistos no último fato real.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:178-190`
- Antes: KA-23

**ED-02.** O nome do passo é único no fluxo: o validador recusa nome repetido e a citação de um passo que não vem antes. Renomear um passo reescreve quem o cita, pelo nome inteiro ("Mandar mensagem" não mexe em "Mandar mensagem 2").
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:181-184`, `:191-193`
- Antes: KA-24

**ED-03.** O campo da condição aceita, além da lista de campos (o caminho normal), uma EXPRESSÃO, para o que a lista não cobre.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/automacoes.md:194-197`
- Antes: KA-25

**ED-04.** Expressão com erro não derruba a execução: vale vazio. Quem reclama é o validador, antes de ligar.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:203-205`
- Antes: KA-26

**ED-05.** O "Se" com uma regra que compara sem valor ("Procedimento é ___") não deixa ligar: só "está vazio" e "está preenchido" dispensam o valor.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:276-279`
- Antes: KA-27

**ED-06.** Nas condições de procedimento com "é" / "não é", o valor se escolhe na lista dos procedimentos ativos da rede. Um valor salvo que saiu da lista aparece como "(fora da lista)".
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:490-492`
- Antes: KB-21

**ED-07.** O "Se" que tem um caminho só e termina de propósito (os modelos de lembrete e de retorno; no painel, "o outro caminho termina aqui de propósito") não mostra o aviso "Só um lado da condição está ligado". O "Se" montado à mão continua avisando.
- Fonte: decisão do Claude (A18 da 11ª simulação)
- Onde: `docs/regras/automacoes.md:563-564`, `:572-575`
- Antes: KB-22

**ED-08.** O editor fala português. Os campos aparecem pelo nome e o mesmo rótulo não se repete ("Situação do agendamento", "Procedimento (do gatilho)"). O card escreve "Procedimento é Botox" e "1 dia antes de “Data e hora do agendamento”". As situações aparecem pelo nome ("Cancelado, Não compareceu, Concluído") e o relógio diz o dia ("Todo mês, dia 1, às 09:00"). O painel explica que o nome do passo "aparece na lista de campos dos passos seguintes" e o que acontece com o momento que já passou ("Marcado com menos de 1 dia de antecedência: sai na hora"). A expressão escrita à mão aparece como foi escrita.
- Fonte: princípio 7
- Onde: `docs/regras/automacoes.md:485-489`, `:563-572`, `:606-611`
- Antes: KB-20

**ED-09.** O passo novo já nasce ligado ao anterior, que é o passo aberto no painel ou, se não houver, o último que entrou — o gatilho também. A ligação sai da primeira saída livre do anterior (no "Se", primeiro o Sim, depois o Não), e o passo nasce na altura dela. Nasce solto, sem desfazer nada, quando não há como ligar: o passo novo é um gatilho (que não tem entrada), ou a saída do anterior já está usada.
- Fonte: decisão do Claude (J-14)
- Onde: `docs/regras/automacoes.md:494-505`; `apps/web/lib/automacoes/encaixe.ts:57-70`; `apps/web/tests/automacoes-encaixe.test.ts`
- Antes: KB-23

**ED-10.** O botão "Salvar" fica sempre na barra, desligado quando não há o que salvar, com "Salvo" ou "Não salvo" ao lado. Sair do editor com alteração não salva pergunta "Sair sem salvar?", com "Sair sem salvar", "Continuar editando" e "Salvar e sair". Fechar a aba ou recarregar usa o aviso do navegador.
- Fonte: decisão do Claude (A12 da 7ª simulação)
- Onde: `docs/regras/automacoes.md:502-509`
- Antes: KB-24

## Os passos (AX)

**AX-01.** O seletor de canal do "Mandar mensagem" mostra o que está gravado: o passo novo nasce com o WhatsApp gravado, e o salvo sem canal mostra "Escolha o canal…" — nunca um canal que não está lá. Sem canal, não liga.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:255-258`
- Antes: KA-28

**AX-02.** Na rede sem WhatsApp conectado (sem número ativo), a mensagem vai como aviso no celular: a janela de modelos avisa, o modelo nasce no canal "Aviso no celular (push)", e o passo em WhatsApp numa rede sem número mostra o aviso com "Mandar como aviso no celular". O aviso no celular chega ao sino do portal, ao app e ao navegador da cliente, com o nome da rede no título, e não abre conversa (a resposta não chega ao inbox).
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:280-288`
- Antes: KA-37

**AX-03.** No aviso no celular, o texto não pede resposta: o modelo e o "Mandar como aviso no celular" tiram o "É só responder esta mensagem".
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:289-292`
- Antes: KA-38

**AX-04.** Um aviso no celular para uma cliente sem acesso ao app não conta como "enviado": ele fica guardado no sino, e o passo diz "Guardado no sino do app: a cliente não tem acesso ao app.".
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:348-350`
- Antes: KB-05

**AX-05.** A automação nunca abre conversa de WhatsApp sozinha: o "Mandar mensagem" em WhatsApp só fala numa conversa já aberta e ligada à ficha (na API oficial, com a janela de 24 h aberta). O número padrão da rede não abre conversa pela automação.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-11: escolheu "opção d, com a a valendo já" (H1)
- Onde: `docs/regras/automacoes.md:293-297`, `:319-321`
- Antes: KA-39

**AX-06.** O "Mandar mensagem" ganha "Para quem não tem conversa aberta", desligado por padrão: Não mandar · Abrir pelo número padrão · Mandar como aviso no celular. Abrir pelo número padrão é a rede escolhendo correr o risco de banimento do WhatsApp Web; na API oficial pede um modelo aprovado.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-11: escolheu "opção d, com a a valendo já" (H1)
- Onde: `docs/regras/automacoes.md:299-304`
- Estado: decidida, ainda não implementada (`docs/regras/automacoes.md:318-319`: "o 'Depois' segue em aberto"; o envio de modelo aprovado na automação ainda precisa ser construído, `:303-304`)
- Antes: KA-41

**AX-07.** Num fato de CONVERSA, a oportunidade do fluxo é a ligada à conversa; sem ela, a aberta mais recente da pessoa. Num fato de CLIENTE sem oportunidade no fato e sem conversa, é a oportunidade ABERTA mais recente da cliente (ganha e perdida não entram). O "agendamento criado" leva a oportunidade pela qual se agendou.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:220-232`
- Antes: KA-29

**AX-08.** Mover o card de etapa por um fato (agendou, concluiu) é a rede montando a automação dela; o sistema não move card sozinho.
- Fonte: o Heitor, 2026-11-02: "não existe movimento automático padrão nos funis; caso queiram, podem fazer isso através do módulo de automações com as regras que quiserem"
- Onde: `docs/regras/automacoes.md:230-233`; `docs/regras/atendimento.md:868-870`
- Antes: KA-30

**AX-09.** "Avisar a equipe" pode avisar "Quem cuida da oportunidade" (o responsável do card do fato). Sem responsável, não avisa ninguém, e o histórico diz "A oportunidade não tem responsável." O aviso abre o card, no portal da pessoa.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:244-248`
- Antes: KA-31

**AX-10.** "Buscar clientes" busca na rede inteira e não tem filtro de unidade. O aniversário, o "sem retorno desde" e o "cliente desde antes de" contam o dia no fuso da rede, nunca no da unidade em que a ficha nasceu.
- Fonte: o Heitor (H5), 2026-11-01: "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/automacoes.md:442-451`, `:652`; `CLAUDE.md:349-350`; `docs/revisao.md:1107`, `:1747-1748`, `:1948`
- Antes: KB-18, KC-24

**AX-11.** "Buscar clientes" acha quem tem pacote vencendo: o campo "Pacote vence daqui a (dias)" busca quem tem um pacote não cancelado vencendo naquele dia, no relógio da rede. É a base do modelo de vencimento de pacote.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está" (AU1)
- Onde: `docs/regras/automacoes.md:430-436`; `docs/revisao.md:1086`, `:1112-1116`
- Antes: KB-17

**AX-12.** O passo "Buscar clientes" diz "Hoje, a busca acharia N clientes", e essa conta não grava nada.
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:581-586`
- Antes: KB-32

## A espera, os limites e a fila (EV)

**EV-01.** A automação dispara na hora do fato; o que espera, o que falhou e o que é de tempo segue pelo relógio de 5 em 5 minutos. A mesma execução nunca roda duas vezes — a cliente não recebe a mesma mensagem em dobro.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:148-162`
- Antes: KA-18

**EV-02.** Os fatos que nascem no banco (GT-05) disparam as automações em até 5 minutos, cada um uma vez só, por maior que seja a fila (ela se esvazia a cada passagem, não fica parada).
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:77-97`
- Antes: KA-09

**EV-03.** Remarcar o agendamento reprograma a automação que está esperando por ele: o texto e as conferências passam a usar o horário novo, e o "1 dia antes" é refeito sobre esse horário. Se o novo horário está a menos de um dia, a mensagem sai na próxima passagem. A espera por duração ("30 dias depois") não muda. O passo a passo mostra a espera nova.
- Fonte: decisão do Claude (D1 da 20ª simulação, pelos princípios 3 e 6)
- Onde: `docs/regras/automacoes.md:332-342`, `:654`
- Antes: KB-03

**EV-04.** O relógio das automações e das campanhas é o da rede: a hora digitada (o "Às" do gatilho de horário, os modelos, a campanha agendada) é a do relógio da rede, e a tela sempre diz qual relógio é ("No horário de Brasília.").
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:42`, `:84-89`
- Antes: KC-25

**EV-05.** Os limites da automação (silêncio noturno e teto) só valem no "Mandar mensagem" para a cliente, seja mensagem ou aviso no celular. Avisar a equipe e anotar não têm limite.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-11: escolheu "(a)" (D16)
- Onde: `docs/regras/automacoes.md:351-354`
- Antes: KB-06

**EV-06.** No silêncio noturno, a mensagem espera o fim do silêncio e não é descartada. Na automação nova, o silêncio vai de 21:00 a 08:00. Vale o relógio da unidade da mensagem; sem agendamento, o da rede.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/regras/automacoes.md:355-357`, `:450-451`; `docs/revisao.md:1103-1104`
- Antes: KB-07, KC-11

**EV-07.** O teto é de 3 mensagens por cliente por dia, por automação, na automação nova. Quando passa do teto, a execução para. O ensaio não conta, e o teto não tem máximo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/regras/automacoes.md:358-359`, `:369`; `docs/revisao.md:1103-1104`
- Antes: KB-08, KC-11

**EV-08.** A rede desliga o silêncio ou o teto deixando o campo vazio, e a tela diz "Sem silêncio: a mensagem sai a qualquer hora" ou "Sem teto". O vazio continua vazio ao reabrir. O padrão (21:00–08:00 e 3) só entra na automação nova.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-11: escolheu "(a)" (D16)
- Onde: `docs/regras/automacoes.md:363-370`, `:647`; `docs/revisao.md:1103-1104`
- Antes: KB-09, KC-11

**EV-09.** A mensagem segurada pelo silêncio espera no próprio passo e é conferida de novo antes de sair: o sistema relê o agendamento e a oportunidade e refaz cada "Se"/"Escolher" do caminho. Se a resposta mudou (concluído, cancelado, falta), a mensagem não sai, e o passo diz qual condição a barrou. Uma mensagem "antes de" um momento que passou durante o silêncio também não sai.
- Fonte: decisão do Claude (D2 da 19ª simulação, pelos princípios 3 e 6)
- Onde: `docs/regras/automacoes.md:371-381`
- Antes: KB-10

**EV-10.** Nos limites existe a opção "Se cair de madrugada, mandar na véspera às 20:00". Ela nasce desligada e só aparece com o silêncio preenchido. Ligada, a espera "antes de" (o "1 dia antes", o "2 horas antes") que cairia no silêncio sai às 20:00 da véspera, no fuso da unidade, em vez de esperar o fim do silêncio.
- Fonte: o Heitor, 2026-11-11: "a + c opcional"
- Onde: `docs/regras/automacoes.md:360-362`, `:406-416`, `:651`; `DEVLOG.md:14131`
- Antes: KB-14

**EV-11.** O "mandar na véspera" não vale se as 20:00 da véspera já passaram ou se as próprias 20:00 caem no silêncio escolhido pela rede: nesses casos fica a espera normal. Remarcar o agendamento refaz a conta.
- Fonte: decisão do Claude (pelos princípios 2 e 3: o silêncio é da rede, e a opção não passa por cima dele)
- Onde: `docs/regras/automacoes.md:417-422`, `:651`
- Antes: KB-15

**EV-12.** Com a rede bloqueada, nada sai para a cliente: a automação e a campanha param. A automação que estava esperando ("esperar 3 dias") não perde a espera, e a campanha agendada não é dada como concluída.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:163-167`
- Antes: KC-15

## Ligar, ensaiar e acompanhar (RX)

**RX-01.** Antes de ligar um fluxo que chega à cliente (o "Mandar mensagem" por qualquer canal, o aviso no celular incluído), a janela "Ligar a automação?" diz quantas clientes a busca acharia hoje e quantas RECEBEM ("Hoje a busca acharia 40 clientes, e 12 têm conversa aberta no WhatsApp."; no push, quantas têm o aparelho). Sem o passo de busca, conta as clientes ativas da rede. "Agora não" não liga. Avisar a equipe, tag, etapa e anotar não chegam à cliente e ligam direto.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/regras/automacoes.md:293-318`; `docs/revisao.md:1102-1103`
- Antes: KA-40, KC-10

**RX-02.** A janela "Ligar a automação?" mostra os limites ("Entre 21:00 e 08:00 a mensagem espera e sai às 08:00 (silêncio noturno). No máximo 3 por cliente por dia.") e tem o "Ajustar os limites". Ela avisa quando uma unidade atende durante o silêncio e diz a opção "mandar na véspera" quando está ligada. O silêncio é um só para a rede inteira.
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:382-391`, `:421`
- Antes: KB-11

**RX-03.** A automação tem o ensaio — um teste com um fato que aconteceu de verdade, que não grava nem manda nada — e a lista das execuções.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/revisao.md:1104-1105`, `:2093`
- Antes: KC-12

**RX-04.** Cada salvamento guarda uma versão (as últimas 30). Voltar para uma versão só a carrega no editor, sem gravar — salvar continua explícito —, e o histórico nunca se apaga: restaurar vira a versão seguinte.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/regras/automacoes.md:170-173`; `docs/revisao.md:1104-1105`
- Antes: KA-20, KC-12

**RX-05.** Na lista de execuções, a que está esperando diz quando segue ("Segue em 22/11 às 09:00"). Se o agendamento dela caiu, diz "Vai reconferir em 18/11 às 09:00: o agendamento foi cancelado.". O passo "Esperar" diz "Esperando até 22/11 às 09:00".
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:343-347`
- Antes: KB-04

**RX-06.** Quando o fato aponta para um registro (agendamento, cliente, oportunidade…) que não se consegue ler, o passo e a execução FALHAM, com o motivo ("Não consegui carregar o agendamento do fato: …"), e a mensagem não sai. A regra sobre um dado ausente só vale para "está vazio": o agendamento sem situação não passa em "não está em".
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:209-219`
- Antes: KA-22

**RX-07.** Uma automação disparada por outra para na terceira volta, e o mesmo fato não dispara a mesma automação duas vezes: um fluxo em anel não manda mensagem à cliente em laço.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:174-177`
- Antes: KA-21

**RX-08.** A lista de automações diz a situação de cada uma em palavra, ao lado do nome: "Rascunho", "Desligada" ou "Ligada".
- Fonte: princípio 7
- Onde: `docs/regras/automacoes.md:509-512`
- Antes: KB-25

## As campanhas (CP)

**CP-01.** Campanha e automação são dois produtos: campanha é um aviso a um público, de uma vez; automação é a reação a um fato de cada cliente (o agendamento de amanhã, a visita de ontem, o aniversário dela). As duas telas dizem quando usar uma e quando usar a outra ("Campanha é um aviso a um público de uma vez…; para reagir a um fato de cada cliente…, use as Automações"), e o link para a outra tela só aparece a quem tem acesso a ela.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "mk1 ok"
- Onde: `docs/regras/automacoes.md:129-130`, `:600-605`; `docs/revisao.md:1041`, `:1064-1071`, `:2083`
- Antes: KA-15, KC-03, KB-36

**CP-02.** A campanha é Imediata ou Agendada. A Agendada sai numa data e hora (uma vez) ou TODO ANO numa data (o Dia das Mães): no dia, a partir das 09:00 no relógio da rede, e continua ativa para o ano seguinte.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "mk1 ok"
- Onde: `docs/regras/automacoes.md:131-136`, `:553-559`; `docs/revisao.md:1069-1072`, `:1862-1864`, `:2083`
- Antes: KA-16, KC-04, KC-05

**CP-03.** O tipo de campanha "Automática" não existe: cada gatilho dela (aniversário, lembrete N horas antes do agendamento, pós-visita, vencimento de pacote, confirmação, cancelamento, pontos de fidelidade) é um modelo nas Automações, que nasce desligado, com o mesmo aviso no celular. Nada se perde. A tela da campanha diz onde eles estão (com o link a quem vê as Automações). O lembrete antes do agendamento e a confirmação só saem se a rede ligar o modelo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "mk1 ok"
- Onde: `docs/regras/automacoes.md:136-147`; `docs/revisao.md:1069-1071`, `:1864-1866`, `:2083`; `docs/regras/whatsapp-push.md:40-43`
- Antes: KA-16, KC-06

**CP-04.** A campanha é aviso no celular (push), e a tela diz isso: chega a quem tem o app ou o navegador registrado e fica no sino do portal; não vai pelo WhatsApp. A lista, a criação e o detalhe dizem "não vai pelo WhatsApp", e o público mostra dois números: quantas estão no público e quantas RECEBEM.
- Fonte: o Heitor, 2026-10-29: "O WhatsApp fica para o futuro."
- Onde: `docs/regras/automacoes.md:118-124`; `docs/revisao.md:1048-1050`, `:2085`
- Antes: KA-17, KC-21

**CP-05.** A campanha (imediata, agendada ou de todo ano) chega aos aparelhos de todas as fichas do login da cliente. Ela sai no máximo uma vez por campanha, por cliente e por dia, mesmo com duas passagens do envio ao mesmo tempo.
- Fonte: decisão do Claude (C51/C56 do levantamento)
- Onde: `docs/regras/automacoes.md:476-484`, `:646`
- Antes: KB-19

**CP-06.** A campanha de todo ano diz quando sai ("Dispara: todo ano em 08/03, a partir das 09:00") e sai mesmo no dia, a partir das 09:00 da rede, nunca de madrugada. A campanha "Agendada" sem data não avança.
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:553-562`
- Antes: KB-30

**CP-07.** Na campanha de todo ano, o "Quem receberia hoje" diz se hoje é a data ("Hoje é a data: N clientes no público · M vão receber o aviso no celular" ou "Hoje não é 08/03: a campanha não sai hoje."), e o público inteiro fica na linha "Público da campanha".
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:588-595`
- Antes: KB-34

**CP-08.** O título da campanha explica o que o `{{first_name}}` faz, e a prévia do título avisa que "Ana" é só um nome de exemplo.
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:586-587`, `:606`
- Antes: KB-33

**CP-09.** A campanha se ativa, se pausa e se arquiva; na lista, os botões de ação têm o nome escrito: "Ver", "Ativar", "Pausar", "Arquivar".
- Fonte: princípio 7
- Onde: `docs/regras/automacoes.md:596-599`; `docs/revisao.md:1053-1056`
- Antes: KB-35, KC-23

## O público da campanha (PU)

**PU-01.** O público da campanha se filtra por gênero, tags, procedimentos que a cliente já fez e "sem visita há mais de N dias" (e também pelos filtros de PU-03 e PU-05).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/revisao.md:1042`, `:1053-1056`, `:2085`
- Antes: KC-23

**PU-02.** O público da campanha não tem filtro de unidade, e o filtro de tags se chama "Tags" (as da rede, de Configurações → Tags). Um filtro de unidade gravado numa campanha antiga não recorta mais nada e não aparece no detalhe.
- Fonte: o Heitor, 2026-11-13: "mk2 remove filtro de unidade, as tags e filtro de tag já cobrem o caso."
- Onde: `docs/regras/automacoes.md:518-526`, `:652`; `docs/revisao.md:1041-1042`, `:1073-1076`, `:2084`
- Antes: KB-27, KC-22

**PU-03.** Cada filtro gravado no público vale igual na prévia e no envio, seja a campanha imediata, agendada ou de todo ano: a campanha nunca vai a todas porque um filtro ficou sem efeito. "Com ao menos N visitas" conta os atendimentos concluídos.
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:527-544`, `:638`
- Antes: KB-28

**PU-04.** "Sem visita há mais de N dias" (no público da campanha e no "Buscar clientes") é quem não tem atendimento concluído nos últimos N dias e já era cliente antes disso. A data de "cliente desde" é a informada ou, se não houver, a do cadastro. Quem se cadastrou ontem não entra como "sumida".
- Fonte: decisão do Claude (C53 do levantamento; D1 da 9ª simulação)
- Onde: `docs/regras/automacoes.md:423-429`, `:535-539`
- Antes: KB-16

**PU-05.** O público também pode ser de clientes escolhidas uma a uma pela busca, quantas a rede quiser, sem teto. Elas valem junto com os outros filtros, e o "Revisar" e o detalhe mostram os nomes ("Clientes: Ana, Bia").
- Fonte: princípio 2 (a escolha uma a uma é o princípio 1); o teto de 200 saiu na revisão de 24/11 (ele cortava em silêncio — princípio 3)
- Onde: `docs/regras/automacoes.md:549-556`
- Antes: KB-29

**PU-06.** O "Revisar" da campanha diz os filtros do público ("Filtros do público: Tags: VIP · Só quem tem o app"). Sem filtro nenhum, diz "todas as clientes ativas".
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:513-517`
- Antes: KB-26

**PU-07.** O detalhe da campanha (rascunho, ativa ou pausada) mostra, a quem vê a campanha, o público e quantas pessoas recebem hoje, com a mesma conta do envio.
- Fonte: princípio 3
- Onde: `docs/regras/automacoes.md:581-586`
- Antes: KB-32

## Quem vê e quem mexe (QM)

**QM-01.** Automações e campanhas são da rede e ficam só no portal da rede: as automações em Gestão → Automações, as campanhas em Marketing → Notificações. O portal da unidade não tem tela delas, e quem não tem "A rede inteira" não as alcança, tenha o módulo que tiver. A tela de Cargos avisa isso nas linhas de Marketing e de Automações.
- Fonte: o Heitor, 2026-10-29: "a automação é da clínica, mesmo que o alvo seja a unidade"
- Onde: `docs/regras/automacoes.md:25-27`, `:612-619`; `docs/revisao.md:1047`, `:1090-1091`, `:1453`, `:2085`, `:2093`
- Antes: KA-01, KB-01, KC-16

**QM-02.** Mexer em automação e campanha é configuração da rede toda, só da Admin da rede (pelo cargo de sistema gravado): criar, editar, salvar, voltar versão, ligar, pausar e excluir a automação (o ensaio também, hoje); criar, editar, ativar, pausar, arquivar e excluir a campanha; e os templates (área WhatsApp e push). Ter as Automações ou o Marketing em Gerenciar, com "A rede inteira", não basta: para os outros a tela só mostra e diz "Esta configuração é só da Admin da rede."
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `CLAUDE.md` §11 (`:753-757`); `docs/regras/plataforma.md:703-709`, `:734-748`; `docs/regras/automacoes.md:28-30`, `:612`
- Antes: KA-02, KB-02, KC-18

**QM-03.** Quem tem as Automações em Ver (com "A rede inteira", e as automações no plano da rede) abre a lista, o editor só para ler, as Execuções, as Versões e os Limites, e "O que já aconteceu". Sem as Automações em Ver, não se vê nada delas: nem a corrente dos fatos nem as execuções — inclusive o texto das mensagens recebidas que vai dentro delas, para quem não tem o CRM.
- Fonte: decisão do Claude
- Onde: `docs/regras/automacoes.md:21-30`, `:34-47`; `CLAUDE.md:243-245`
- Antes: KA-03, KC-17

**QM-04.** Automações e campanhas fazem parte do plano da rede. Se o plano não tem uma delas, ela some do menu e também não roda por trás.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim"
- Onde: `docs/revisao.md:1587-1591`; `docs/regras/plataforma.md:286-300`; `CLAUDE.md:244`
- Antes: KC-26

**QM-05.** Na sessão de suporte, ninguém liga automação nem muda os limites dela.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-11: escolheu "(a)" (D18: "o suporte não liga automação nem muda os limites")
- Onde: `docs/regras/automacoes.md:392-394`; `docs/regras/plataforma.md:636`; `docs/revisao.md:1105`; `DEVLOG.md:14130`
- Antes: KB-12, KC-13

**QM-06.** Na sessão de suporte, a automação só se pausa: o suporte não cria, não edita (ligada ou não) e não exclui. O ensaio continua liberado, na action e na tela ("Ensaiar com o último fato"), porque não grava nem manda nada. O editor abre só para leitura e, com a automação ligada, mostra "Desligar".
- Fonte: o Heitor, 2026-11-11 (D18 do levantamento das regras, opção a: "o suporte não liga automação nem muda os limites"); o "só pausa": decisão do Claude (auditoria das regras, 2026-11-18, pela regra do CLAUDE.md §14 de que nada que chega à cliente sai pela sessão de suporte)
- Onde: `docs/regras/automacoes.md:394-406`, `:650`; `docs/revisao.md:1105`; `apps/web/app/admin/automacoes/[id]/page.tsx:31-33`; `apps/web/tests/automacoes-suporte-ensaia.test.ts`
- Antes: KB-13, KC-13

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Nenhuma pergunta fica na página. As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Estas regras são suas? Escritas como decisão sua, sem a sua fala.** MO-02 (no modelo, o procedimento fica no "Se", nunca no gatilho): `docs/regras/automacoes.md:259-261` diz "D-4, decisão do Heitor, 2026-10-29", e o DEVLOG registra a resposta sem as suas palavras (a outra metade da D-4 — "Nova automação" vazia e os modelos ao lado — já tem fonte: o AU1, MO-01). ED-03 (a condição aceita uma expressão, além da lista de campos): `:194` diz "decisão do Heitor em 2026-09-24". PU-01 e CP-09 (os filtros do público — gênero, tags, procedimentos já feitos, "sem visita há N dias" — e o ativar, pausar e arquivar da campanha): `docs/revisao.md:1042` tem "O resto fica como está" escrito como fala sua, mas fora das aspas; a sua fala entre aspas cobre só o MK1 e o MK2. Confirma as três?

Q02. **Resolvida na revisão de 24/11:** Um nível que não dá nada contraria os princípios 3 e 7, e o sistema já declara os níveis de cada módulo: as Automações e o Marketing ficam com "Sem acesso" e "Ver" (o Gerenciar sai, sem tirar nada de ninguém). Defeito a corrigir. — *Era:* **O Gerenciar das Automações e do Marketing não dá nada a quem não é a Admin da rede** (QM-02, QM-03). Conferido no código: nas Automações, toda action que grava e também o ensaio pedem a Admin da rede (`recusaDaConfigDaRede` em `apps/web/actions/automacoes.ts:215`, `:255`, `:298`, `:489`, `:538`, `:821`), e a tela, para quem tem o Gerenciar sem ser a Admin, só mostra o aviso "Esta configuração é só da Admin da rede." (`apps/web/app/admin/automacoes/page.tsx:36-39`) — o Gerenciar dá o mesmo que o Ver. No Marketing (campanhas e templates), igual (`apps/web/actions/notification-campaigns.ts:141`, `:192`, `:257`, `:303`, `:325`, `:345`; `apps/web/actions/message-templates.ts:116`, `:235`, `:303`, `:353`); a única diferença que sobra é o "Quem receberia hoje" no detalhe da campanha, que é só leitura e pela regra de 23/11 é do Ver (divergência de PU-07). A tela de Cargos oferece os três níveis aos dois módulos (`apps/web/lib/permissions.ts:94`, `:100`), e um nível que não dá nada contraria os princípios 3 e 7. Tira-se o Gerenciar desses dois módulos (ficam Sem acesso e Ver), ou ele ganha uma ação que não é configuração? As candidatas que o texto já ligou ao Gerenciar: o ensaio (não grava nem manda nada; `docs/regras/automacoes.md:29-30`) e o pausar (para a automação que está mandando errado — é o que o suporte pode, QM-06).

## Divergências

O texto de `docs/regras/` (ou da própria revisão), e onde se viu também o código ou a tela, contra a decisão mais nova — para corrigir depois.

- QM-02, QM-03 (texto velho; o código já segue a regra de 18/11): `docs/regras/automacoes.md:28-30` diz "o ensaio, o voltar versão, salvar e ligar são de Gerenciar" (AUT-03); `:612-618` (D-2) diz só que quem não tem "A rede inteira" não alcança as automações, sem dizer que mexer nelas é só da Admin da rede; `:584` ainda fala em "quem tem o Marketing em Gerenciar"; e os textos da revisão que dão a configuração da rede toda a "quem é da rede (H7)" (`docs/revisao.md:1378`, `:2131`) e as notas "só funciona para quem é da rede" da tela de Cargos (`docs/revisao.md:1260-1261`) são de antes de 18/11. O Heitor, 18/11 (`CLAUDE.md` §11; `docs/regras/plataforma.md:703-709`, `:747-748`, com "as automações, as campanhas e os templates" na lista): "Configuração da rede toda só pela conta admin". O que o Gerenciar ainda dá está na Q02.
- CP-01, CP-03: `docs/regras/automacoes.md:129-130` diz "São dois produtos, e nada migra de um para o outro"; o MK1 (`docs/revisao.md:1064-1071`, "mk1 ok") levou os gatilhos da campanha "Automática" para modelos das Automações ("Nada se perde, muda de lugar"). A frase deveria dizer que a campanha automática saiu e os gatilhos dela são modelos.
- MO-03: `docs/regras/automacoes.md:275` diz que o modelo novo "nasce com tudo ligado" — quer dizer os passos conectados, mas lê-se como "a automação nasce ligada", o contrário do princípio 6 e da linha 273 ("em RASCUNHO"). Trocar a palavra (por exemplo, "com todos os passos conectados").
- PU-07 (CÓDIGO): `docs/regras/automacoes.md:584` e o código (`apps/web/app/admin/notificacoes/[id]/page.tsx:60`, `mostraQuemReceberia = can(ctx, 'marketing', 'MANAGE')`) mostram o "Quem receberia hoje" da campanha só a quem tem o Marketing em Gerenciar. É só leitura, e pelo CLAUDE.md §11 (23/11, "Quem tem o módulo em Ver vê tudo") vale para quem tem o Marketing em Ver.
- PU-05 (CÓDIGO, princípio 2; pergunta removida: a segunda da KB) — **resolvida**: o teto saiu (`docs/regras/automacoes.md:549-552`, "sem teto"); o texto abaixo é o que se viu antes: `docs/regras/automacoes.md:547` põe o teto de 200 nas "Clientes específicas", e o código o aplica (`apps/web/lib/notifications/filtros-da-campanha.ts:7`, `MAXIMO_DE_CLIENTES_ESPECIFICAS = 200`; `:30`, o `.slice` que corta em silêncio o que passar de 200 — contra o princípio 3 também; `apps/web/components/admin/notification-campaign-form.tsx:394`). Nenhum documento diz que é impossível passar de 200: o motivo escrito é só "é escolha uma a uma, não lista de importação" (comentário em `filtros-da-campanha.ts:6`). Pelo princípio 2, o sistema não recusa o valor que a rede escolheu; o teto sai.
- QM-06 (TELA) — **resolvida**: a tela passa `podeEnsaiar={gerencia}` (`apps/web/app/admin/automacoes/[id]/page.tsx:33`), e `apps/web/tests/automacoes-suporte-ensaia.test.ts` trava; o texto abaixo é o que se viu antes: `docs/regras/automacoes.md:401-402` diz que na sessão de suporte "O ensaio continua (não grava nem manda nada)", e a action deixa (`ensaiarAutomacao`, `apps/web/actions/automacoes.ts:814-822`, sem `bloqueioDoSuporte`); mas a tela esconde o botão "Ensaiar com o último fato" na sessão de suporte: `apps/web/app/admin/automacoes/[id]/page.tsx:26-31` passa `podeEditar = gerencia && !ctx.suporte`, e `apps/web/components/admin/automacoes/painel-de-execucoes.tsx:121` só mostra o ensaio com `podeEditar`.

## Ficou fora do catálogo

Nenhum número de rascunho ficou fora. As linhas só de implementação de `docs/regras/automacoes.md` (`:619`, `:636`, `:639`, `:640`, `:642`, `:643`, `:653`) o rascunho KB já tinha deixado fora sem número; as do "O que nunca fazer aqui" repetem regras acima: `:637` (RX-06), `:641` (CP-03), `:644` (GT-06), `:645` (RX-01), `:646` (CP-05), `:647` (EV-08), `:648` (a tag: Clientes, TG-04), `:649` (AU-01), `:650` (QM-06), `:651` (EV-10, EV-11), `:652` (AX-10, PU-02) e `:654` (EV-03).

## É de outra área

Os rascunhos também apontaram, sem número próprio, o que já está catalogado em outra área e aqui só se cita: a tag — o "Adicionar tag" e o "Remover tag" da automação (a regra de hoje é a da auditoria de 18/11, `docs/regras/automacoes.md:452-461`: as duas existem), em Clientes, TG-04 (com a Q12); a tag ser da pessoa, TG-02 e TG-09; o filtro de Tags ser E no "Buscar clientes" e no público (`:437-441`), TG-12 —; o "Definir responsável" (`:249-252`), OP-09; o modelo "Marque o ganho" (`:73-76`, `:269-271`), OP-31; o card que não anda sozinho (`:230-233`), OP-20 e AG-18; a pergunta "Mover dispara a automação…? Disparar?" (`:624-631`), OP-21, OP-22, OP-23 e OP-26; o aviso do retorno do card, que ainda sai de uma rotina para todas as redes, contra a AU-01, OP-33 e a Q14 do catálogo de Clientes; a importação que não dispara automação, IM-17; o "Unificar" sem mudança que não dispara, CL-08; a desistência que gasta a sessão, AT-21; o "Retorno em N dias" do atendimento (`docs/regras/atendimento.md:3742`), área Atendimento; o envio da ficha de saúde ao agendar, que nasce desligado (`docs/revisao.md:723`, `:1226`), área Atendimento; os opcionais da fidelidade e o aviso de pontos (`docs/catalogo/fidelidade.md:341`, que manda o modelo para cá: MO-04); o canal da mensagem (o aviso no celular em si, os aparelhos de todas as fichas do login, o número padrão da rede, por qual número sai, os templates, "não há WhatsApp no lugar do push", o histórico do WhatsApp importado que não emite fato) e a contradição do aviso no celular à cliente ("nada sai sozinho", `docs/revisao.md:1531-1533`, × os avisos do próprio fato, `docs/regras/whatsapp-push.md:38-53`), área WhatsApp e push; a marca do suporte nas gravações e a Auditoria (CF3, só da Admin da rede), área Plataforma.

- KB-37: no menu e no título, a tela dos anúncios (Meta e Google) se chama "Anúncios", e "Marketing" é só o nome do grupo (`docs/regras/automacoes.md:604-606`; princípio 7) — área: WhatsApp e push (os Anúncios e a API de Conversões, `docs/revisao.md:1057-1058`), catalogada em paralelo.
