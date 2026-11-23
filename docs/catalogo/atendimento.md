# Catálogo de regras — Atendimento

Este é o catálogo das regras da área de atendimento que valem HOJE: a agenda, o
atendimento (iniciar, concluir, desistir), o plano de tratamento, o prontuário,
as fichas, os procedimentos e o estoque. Cada regra diz a fonte: uma fala do
Heitor (copiada letra por letra do documento), uma recomendação do Claude que o
Heitor aprovou (com a resposta dele), um dos sete princípios de produto, ou
"decisão do Claude". "Atribuída ao Heitor sem a fala" quer dizer que o texto diz
que a decisão é dele, mas não traz a fala — está nas Perguntas. "Onde" aponta a
linha do documento; "Antes" lista os números do rascunho que a regra junta.
É um RASCUNHO para o Heitor revisar. Contagem: 190 regras (Agenda 68, das quais 8 em "Equipe, como aparece na agenda"; Atendimento 21; Plano de tratamento 23; Prontuário 18; Fichas 15; Procedimentos 15; Estoque 30), 33 perguntas e 19 divergências. Dos 440 números do rascunho, 37 ficaram fora do catálogo e 3 são de outra área (ver os apêndices); todos os outros estão num "Antes". A meta era ~180: passou 10, para não cortar decisão de produto. Em 23/11 saíram três (AT-06, PL-21, PT-03: só descreviam o "só os meus", SM1); os números ficam, com a linha "Saiu".

## Agenda (AG)

### Horário e encaixe

**AG-01.** O horário de funcionamento é da unidade e, dentro dele, de quem atende (por dia da semana, com pausa). Sem cadastro, a unidade abre de segunda a sábado, 08:00–20:00, e quem atende segue a unidade.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:9-13`
- Antes: AG-01

**AG-02.** Os horários livres que o app da cliente, o CRM e o Copilot oferecem ficam dentro do horário da unidade e do de quem atende, cabem inteiros num período (não atravessam a pausa) e, no dia de hoje, nunca começam antes de agora.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:15-17`
- Antes: AG-02

**AG-03.** A grade do dia abre e fecha no horário da unidade, estendida pelos agendamentos que caem fora dele. É a mesma regra na agenda da unidade, na "Minha agenda" e na agenda da rede (na rede, do horário mais cedo ao mais tarde entre as unidades).
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:18-21`
- Antes: AG-03

**AG-04.** A equipe pode agendar fora do horário de quem atende, e fora da grade de 30 em 30 minutos (encaixe): é permitido, e o modal avisa antes do Confirmar ("…O encaixe é permitido."). A grade sombreia o que está fora do horário de cada pessoa (na agenda da rede, o horário fechado de cada unidade, com a marca "Encaixe"), e clicar no sombreado continua agendando.
- Fonte: princípio 2
- Onde: `docs/regras/atendimento.md:32-44`, `:54-69`
- Antes: AG-05, AG-06, AG-07

**AG-05.** Agendar a mesma cliente no mesmo procedimento no mesmo dia avisa ("Helena já tem Avaliação neste dia, às 10:00."), contando só o que a pessoa alcança e fora os cancelados e as faltas. É só aviso: o agendamento segue.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:49-54`
- Antes: AG-08

**AG-06.** Não se agenda no passado: o Agendar recusa horário que já passou e diz a partir de quando se pode ("Escolha a partir de 01/11/2026 às 10:40."). No dia de hoje, a grade de horários começa em agora, no fuso da unidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:46-49`, `:103-108`
- Antes: AG-09, AG-15

**AG-07.** O choque com outro atendimento da mesma pessoa que atende não é encaixe: o servidor recusa. O modal avisa antes ("Não vai ser agendado: X já tem atendimento das…"), cita todos os atendimentos que bloqueiam o horário (e a unidade, quando é outra) e oferece "Usar o próximo livre".
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:36-37`, `:44-46`, `:207-215`, `:1153-1162`
- Antes: AG-10, AG-128

**AG-08.** Para a equipe, um horário de N minutos só está livre se o intervalo inteiro não bate em agendamento de quem atende (em qualquer unidade da rede) nem em bloqueio dela. Os livres do app da cliente, do Copilot, do CRM e do "próximo livre" não incluem o horário bloqueado de quem atende (o bloqueio de sala não muda esses livres). O atendimento concluído antes da hora ocupa só até a conclusão (o concluído antes de começar não ocupa nada). A ocupação e o "Horário livre" descontam o bloqueado.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:176-200`, `:1128-1152`
- Antes: AG-31, AG-33, AG-127

**AG-09.** O novo agendamento sugere o próximo horário livre de quem atende quando a hora não veio de um clique na grade; se a hora da tela não cabe, o campo vai ao próximo livre e a janela diz por quê. A hora escolhida pela pessoa nunca se troca sozinha. O "Agendar" do cabeçalho abre no dia da tela quando ele é depois de hoje (e o próximo livre é desse dia em diante); hoje e o passado, a partir de agora.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:235-240`, `:703-716`
- Antes: AG-21, AG-22

**AG-10.** O modal Agendar, depois de escolhidos quem atende e o dia, mostra a grade dos horários livres (com a sala escolhida, também os bloqueios da sala). Os seletores do checkout do plano, das sessões de plano e de pacote e do pré-pago mostram a janela da unidade naquele dia, de 30 em 30 minutos, sem a pausa: os horários de quem atende em destaque, os outros como encaixe que se escolhe, e o resto pelo "Outro horário (encaixe)".
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:91-102`, `:201-207`, `:225-234`
- Antes: AG-14, AG-18, AG-20

**AG-11.** O botão de confirmar (o "Confirmar agendamento" e o "Confirmar novo horário") espera as conferências do horário e das salas ("Conferindo o horário…", "Conferindo as salas…"): o aviso de bloqueio, de fora do expediente, de choque ou de sala está na tela antes de gravar. Se a conferência falhar, o botão libera e o servidor confere ao gravar.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:216-224`, `:1367-1375`, `:1400-1404`
- Antes: AG-19, AG-155

**AG-12.** Na agenda da rede, o novo agendamento nasce sem unidade: com várias, "Selecione a unidade…" (obrigatório); com uma, ela; com o filtro de unidade ou o clique numa coluna, a dela. A primeira escolha mantém o procedimento e quem atende pedidos, e cai o que a unidade não tem.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:126-133`
- Antes: AG-23

**AG-13.** O "Novo cliente" do agendar não pergunta nem mostra unidade: a ficha é da rede. Com várias unidades, o cadastro diz que a cliente aparece em todas as unidades e qualquer uma a atende.
- Fonte: o Heitor, 2026-11-13: "o cliente não pertence a unidade, pertence a rede"
- Onde: `docs/regras/atendimento.md:134-148`, `docs/revisao.md:483-484`
- Antes: AG-24

**AG-14.** O "Agendar" do inbox (e do card) escolhe a unidade numa caixa de seleção simples (só com mais de uma unidade); a tag não escolhe unidade.
- Fonte: o Heitor, 2026-11-13: "coloca uma caixa de seleção para a unidade, simples."
- Onde: `docs/revisao.md:472-473`, `docs/revisao.md:1901`, `docs/regras/crm-inbox.md:369-371`
- Antes: AG-25, AG-203

**AG-15.** Quem só agenda (sem Clientes em Gerenciar) cria a ficha rápida da cliente nova ao agendar, pela agenda ou pelo CRM. "Unificar com a ficha de X" e "Reativar a ficha de X" pedem Clientes em Gerenciar; sem ele, a pessoa escolhe "Agendar para a ficha de X" (nada se grava na ficha; a arquivada não aparece) ou "Cadastrar mesmo assim". O Copilot segue a mesma regra.
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — H4, opção b, do levantamento de 11/11
- Onde: `docs/regras/atendimento.md:1473-1485`
- Antes: AG-110

### Peças e origem do agendamento

**AG-16.** O agendamento só nasce com um procedimento que a unidade faz e com alguém que atende naquela unidade (todo agendamento tem procedimento; a avaliação é um procedimento como outro). Quem atende é marcado por unidade: nas marcadas, a pessoa aparece na agenda, no agendar (equipe, app e Copilot), no horário dos profissionais, na ocupação, no "próximo livre", no repasse, na comissão e nos relatórios. Agendar fora do horário dela continua permitido, com aviso.
- Fonte: o Heitor, 2026-11-06: "Inves de atende também em, o atende vira um checklist com todas as unidades, as que estiverem marcadas ficam disponiveis"
- Onde: `docs/regras/atendimento.md:283-297`, `:1328-1332`, `:1486-1491`, CLAUDE.md §11
- Antes: AG-47, AG-111, AG-112

**AG-17.** A origem do agendamento: feito pela equipe é "interno"; pela cliente no app, "app da cliente"; e é "comercial" quando a cliente tem uma oportunidade ABERTA, por qualquer porta da equipe e qualquer abrangência de quem agenda (pelo card, sempre). Fora do plano com oportunidades, nada se liga. O funil comercial (avaliações agendadas × comparecimento) se mede pelos agendamentos de origem comercial.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:855`, `:874-881`, `:1333-1334`
- Antes: AG-113, AG-115

**AG-18.** Agendar escreve "agendamento criado" na linha do tempo da oportunidade aberta, mas NÃO move o card de etapa. Mover só por automação que a rede montar.
- Fonte: o Heitor, 2026-11-02: "não existe movimento automático padrão nos funis; caso queiram, podem fazer isso através do módulo de automações com as regras que quiserem"
- Onde: `docs/regras/atendimento.md:882-888`
- Antes: AG-114

### O bloqueio pontual

**AG-19.** "Bloquear horário" fica no cabeçalho da agenda da unidade e da agenda da rede com uma unidade na tela; a "Minha agenda" (a vista pessoal) só mostra o bloqueio (SM2). Bloqueia-se uma pessoa que atende ou uma sala, com início e fim (até um ano; ou "Dia inteiro") e motivo obrigatório. O bloqueio aparece na grade e na Semana, e abre a janela "Horário bloqueado" com "Desfazer bloqueio".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-05: "concordo"
- Onde: `docs/regras/atendimento.md:149-160`, `:231-233`, `:241-247`
- Antes: AG-26, AG-34

**AG-20.** O bloqueio só avisa: agendar ou remarcar no horário bloqueado (de quem atende ou da sala) avisa e deixa, pela equipe e pelo Copilot ("…O encaixe é permitido: confirme só se for isso mesmo."); iniciar um atendimento dentro de um bloqueio avisa e segue; bloquear um período que já tem atendimento não mexe nele, e o aviso diz quantos continuam.
- Fonte: princípio 2
- Onde: `docs/regras/atendimento.md:169-175`, `:179-184`, `:248-253`
- Antes: AG-29, AG-30, AG-32, AG-35

**AG-21.** Bloqueia e desfaz o bloqueio quem tem a Agenda em Gerenciar, na unidade ao seu alcance (qualquer pessoa que atende ou sala dali; sem o "só os meus", SM1). Quem só vê a agenda (ou só tem a Minha agenda) vê o bloqueio e não bloqueia.
- Fonte: decisão do Claude; o recorte do "só os meus" (bloquear só o próprio horário) saiu: o Heitor, 2026-11-23 (docs/revisao.md, SM1): "pode tirar, as vistas pessoais resolvem"
- Onde: `docs/regras/atendimento.md:254-262`
- Antes: AG-36

### As vistas da agenda

**AG-22.** A vista da Semana tem os 7 dias, de segunda a domingo sempre (o domingo fechado também), e conta e agrupa os agendamentos pelo dia de Brasília, na unidade e na rede.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:271-281`
- Antes: AG-37

**AG-23.** A "Minha agenda" é a vista pessoal (SM2): abre a quem atende e não tem a Agenda, só com os horários dela, e só mostra (não agenda nem bloqueia). A grade do dia é o horário da unidade cruzado com o da pessoa (no dia em que ela não atende, "Você não atende neste dia"); o destaque do topo anda com o relógio e mostra antes o atendimento atrasado em aberto; tocar no cartão abre a tela do atendimento, só para ver (na agenda da unidade, abre a janela de ações); o atalho "Minhas comissões" fica no topo para quem tem o Financeiro em Ver (leva à aba Comissões) ou as Minhas comissões (a vista pessoal: quem atende ou tem comissão de venda e não tem o Financeiro, só as dela). Ela traz também os atendimentos da pessoa em outras unidades ("Na unidade Batel"), e a agenda inteira da unidade traz "Seus atendimentos em outras unidades"; abrir um deles leva ao endereço da unidade do agendamento.
- Fonte: decisão do Claude; a vista pessoal: o Heitor, 2026-11-23 (docs/revisao.md, SM2): "pode tirar, as vistas pessoais resolvem"
- Onde: `docs/regras/atendimento.md:22-30`, `:317-333`, `:636-638`, `:669-695`
- Antes: AG-04, AG-39, AG-40, AG-41, AG-50, AG-51

**AG-24.** O atendimento concluído mostra a hora real ao lado da agendada ("23:30 · concluído em 29/10 às 00:22"), na agenda da unidade e da rede, na janela, e no app da cliente (Agenda, Histórico, "Como foram os seus atendimentos?", "Confirmar e avaliar").
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:755-771`
- Antes: AG-44, AG-187

**AG-25.** Nada se fecha sozinho: o agendamento de hoje, Agendado ou Confirmado, com o fim já passado, ganha "· passou do horário", com a dica de marcar a falta, a chegada ou concluir. A agenda e os dashboards avisam os atendimentos de dias anteriores ainda abertos (últimos 30 dias), com o link para cada um, e os que passaram sem chegada vêm num grupo à parte; na Minha agenda (a vista pessoal, SM2), só os dela.
- Fonte: princípio 6
- Onde: `docs/regras/atendimento.md:718-742`
- Antes: AG-45, AG-46

**AG-26.** A agenda da unidade deixa o cancelado e a falta fora da grade; "Mostrar cancelados" os traz de volta, apagados, riscados e com o motivo. Eles não contam em nada (atendimentos, ocupação, contagem de quem atende) e não se arrastam. A agenda da rede sempre os mostra, apagados e com o motivo.
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — 2026-10-21
- Onde: `docs/regras/atendimento.md:1163-1171`
- Antes: AG-129

**AG-27.** A agenda da unidade e a da rede têm filtros de profissional, sala e tag, com "Limpar filtros"; o filtro vai ao servidor. Na agenda da rede, o filtro de sala só aparece com uma unidade escolhida. A "Minha agenda" (a vista pessoal, SM2) não tem filtros.
- Fonte: o Heitor, 18/11: "Então precisa arrumar"
- Onde: `docs/regras/atendimento.md:1172-1181`, `:1191-1194`, `:1202-1205`
- Antes: AG-130, AG-133, AG-135

**AG-28.** O filtro não vence a abrangência: só se filtra pelo que está nas opções da tela (quem atende nas unidades da tela, as salas da unidade, as tags ativas da rede). O filtro de tag é pela cliente: entra o agendamento cuja cliente tem TODAS as tags marcadas. Rede sem tag não vê o filtro de tag.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1182-1190`
- Antes: AG-131, AG-132

**AG-29.** Os números respeitam o filtro: o "N atendimentos" e os contadores contam o filtrado; com profissional, a ocupação é a dele; com sala ou tag, a ocupação não aparece e a dica explica. Agendar e bloquear continuam com todos. "Seus atendimentos em outras unidades" segue os filtros; o aviso dos abertos de dias anteriores, não.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:1195-1201`, `:1206-1208`
- Antes: AG-134, AG-136

**AG-30.** Marcar o "Atende" numa unidade não muda a abrangência: fora das unidades dela, a pessoa alcança só os agendamentos DELA (ver, marcar a chegada, iniciar, concluir, a evolução, o anexo e a comissão; "Minhas comissões" cobre também essas unidades, com o filtro de unidade). É alcance, não permissão: cada passo continua pedindo o módulo dele (UM5). A agenda, os clientes e o caixa daquela unidade seguem fora.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:308-317`, `:333-335`
- Antes: AG-49, AG-52

### Situações e quem faz o quê na agenda

**AG-31.** As situações são: Agendado → Confirmado → Chegou → Em atendimento → Concluído, ou Cancelado / Não compareceu, cada uma com um nome só, igual na agenda, no detalhe e no app. Confirmar ("confirmou presença") e Chegou (está na espera) são passos diferentes: a chegada vale de Agendado (e também confirma) ou de Confirmado. A linha do tempo da cliente registra a confirmação e a chegada.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:109-110`, `:463-472`, `:717`
- Antes: AG-16, AG-65, AG-82

**AG-32.** Quem tem a Agenda em Gerenciar agenda, confirma, marca a chegada, cancela (o que não está em andamento: esse é a desistência, AT-20), marca a falta, remarca e troca o profissional do agendamento, em todo agendamento das unidades ao alcance (sem o "só os meus", SM1). Quem atende sem a Agenda não faz nada disso: a Minha agenda só mostra (SM2). A janela do agendamento só mostra o que o cargo pode fazer.
- Fonte: o Heitor, 2026-10-28: "a profissional (no que é dela) ou quem gerencia a agenda cancela e passa o atendimento" (o "no que é dela" saiu com o "só os meus": o Heitor, 2026-11-23, docs/revisao.md, SM1: "pode tirar, as vistas pessoais resolvem"); agendar, confirmar, chegada, remarcar, cancelar e falta na Agenda: recomendação do Claude aprovada pelo Heitor, 2026-11-23 (docs/revisao.md, "Cada passo do atendimento, um módulo"): "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/regras/atendimento.md:479-482`, `:587-595`, `:601-602`, `:634-641`, `:1422-1424`, `:1438-1452`, `docs/revisao.md:455-457`, `docs/revisao.md:1902`
- Antes: AG-70, AG-83, AG-86, AG-87, AG-104, AG-105

**AG-33.** A chegada só se marca no dia do agendamento (Brasília), na agenda, no Copilot e no "Marcar chegada e iniciar".
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:577-586`
- Antes: AG-68

**AG-34.** Os documentos do agendamento nascem ao agendar; marcar a chegada não emite documento. A sessão de pacote e a de plano não emitem documento: a cliente assina na venda.
- Fonte: decisão do Claude (DC4; PC2/PC7)
- Onde: `docs/regras/atendimento.md:470-471`, `docs/revisao.md:458-459`, `docs/revisao.md:1902`
- Antes: AG-66, AG-148

**AG-35.** Todo envio de documentos à cliente (o atendimento avulso, o pacote, o plano) vai num link único: ela vê todos e assina uma vez só, e a assinatura vale para todos os documentos do link.
- Fonte: o Heitor, 2026-11-13: "vai sempre tudo no mesmo link, tá? Todos os documentos em um link único, a pessoa visualiza e assina uma vez só, a assinatura dela vale para todos os documentos do link."
- Onde: `docs/revisao.md:467-471`, `docs/revisao.md:1900`
- Antes: AG-67, AG-202

**AG-36.** A falta ("Não compareceu") só se marca a partir do horário marcado (antes, a janela diz que o caminho é "Cancelar"), só em Agendado, Confirmado ou Chegou, e nunca vira Cancelado. Antes de gravar, pergunta, dizendo que os termos em aberto do horário são cancelados e o que estava pago volta para a cliente.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:683-687`, `:772-777`, `:1438-1443`
- Antes: AG-81, AG-107, AG-120

**AG-37.** O motivo do cancelamento é obrigatório quando a equipe cancela e opcional no app (sem motivo, o registro diz "Pela cliente no app"). O motivo vai no aviso à cliente, e o campo diz isso.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:908`, `:917-919`, `:1024-1027`, `:1405`
- Antes: AG-117, AG-173, AG-186

**AG-38.** O cancelado e a falta têm "Reagendar" (para quem pode cancelar): o novo agendamento já vem com a cliente, o procedimento e quem atende, no próximo horário livre dele a partir de agora.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1097-1098`, `:1122-1127`
- Antes: AG-126

**AG-39.** A janela do agendamento tem "Trocar profissional" (quem tem a Agenda em Gerenciar; sem o "só os meus", SM1). Só se oferece quem atende na unidade do agendamento ("(ocupada)" na que tem atendimento no horário), e pergunta antes; arrastar para a coluna de outra pessoa também pergunta. O histórico grava a troca.
- Fonte: o Heitor, 2026-10-28: "a profissional (no que é dela) ou quem gerencia a agenda cancela e passa o atendimento" (o "no que é dela" saiu: o Heitor, 2026-11-23, docs/revisao.md, SM1: "pode tirar, as vistas pessoais resolvem")
- Onde: `docs/regras/atendimento.md:596-615`
- Antes: AG-84

**AG-40.** Na rede de duas ou mais unidades, quem tem a Agenda em Gerenciar muda a unidade de um agendamento Agendado ou Confirmado ("Mudar de unidade"): escolhe a unidade (das que alcança), quem atende lá e a sala (opcional); o horário fica, e confirma antes. O avulso ainda sem lançamento passa ao preço da unidade nova; o já pago fica com o dele. O histórico grava, e a cliente recebe o novo horário com a unidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:616-633`
- Antes: AG-85

**AG-41.** O remarcar avisa antes de confirmar e deixa remarcar: horário fora do expediente de quem atende, horário bloqueado, cliente arquivada e horário que já passou. O choque com outro atendimento de quem atende recusa ("Não vai ser remarcado: …"). O agendamento em atendimento não se remarca.
- Fonte: o Heitor, 2026-11-02: "avisar ao remarcar, sem recusar"
- Onde: `docs/regras/atendimento.md:212-214`, `:642-647`, `:654-657`, `:1462-1463`
- Antes: AG-88, AG-109

**AG-42.** Na remarcação, quando a cliente remarca pelo app, o horário novo já nasce Confirmado ("O horário novo fica confirmado."); quando a equipe ou o Copilot remarcam, volta a Agendado e a confirmação é pedida de novo.
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — H3, opção c, do levantamento de 11/11
- Onde: `docs/regras/atendimento.md:1464-1472`, `docs/revisao.md:462-463`, `docs/revisao.md:1902`
- Antes: AG-89, AG-179

### Salas

**AG-43.** A sala é opcional em todo agendamento e atendimento (app da cliente, checkout, sessões, Copilot); nada exige uma. Uma sala não tem dois agendamentos ao mesmo tempo: o servidor confere a sala escolhida em todo caminho (ativa na unidade, usada para o procedimento e livre no horário).
- Fonte: o Heitor, 2026-11-01: "não deve ser obrigatório selecionar sala"
- Onde: `docs/regras/atendimento.md:1336`, `:1379-1387`
- Antes: AG-149, AG-150

**AG-44.** As salas da unidade se criam, renomeiam, desativam e reativam, mas não se apagam; o nome é único entre as salas ativas da unidade. Mexe quem tem as Configurações em Gerenciar, na unidade ao seu alcance. Elas ficam na configuração da unidade (com uma unidade só, na própria aba Unidades).
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — D5, 2026-10-30
- Onde: `docs/regras/atendimento.md:1337-1352`
- Antes: AG-151, AG-152

**AG-45.** O procedimento pode se ligar às salas em que é feito, por unidade (opcional): sem sala ligada, qualquer sala ativa serve; com sala ligada, só as ligadas. Ao agendar, só aparecem as salas que servem ao procedimento, com "(ocupada)" na que tem atendimento no horário; a primeira livre só vem escolhida quando o procedimento é ligado a salas; a opção única (uma sala, um profissional) vem escolhida; com todas ocupadas, a janela avisa que vai sem sala.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1353-1378`
- Antes: AG-153, AG-154, AG-156

**AG-46.** O checkout do plano, a unidade pré-paga e o Copilot agendam sem escolher sala; as sessões de pacote e de plano oferecem a escolha (opcional), e a pré-paga segue só com o horário (o crédito decide o procedimento). Quando UMA sala só serve ao procedimento e está livre, o checkout do plano e o remarcar do app a gravam. No remarcar do app, a sala que o agendamento tinha fica se estiver livre; senão a única livre; senão sem sala. A cliente não escolhe sala.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:110-125`, `:1387-1400`
- Antes: AG-17, AG-157

### O app da cliente

**AG-47.** O agendar e o remarcar do app passam pelas mesmas conferências do agendar da equipe (peças da rede, cliente arquivada, conflito, preço, crédito pré-pago ou pacote, oportunidade aberta e o evento "agendamento criado", com a cliente como autora). A cliente pode mandar observações ao agendar.
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — por-05, revisão de 2026-11-02
- Onde: `docs/regras/atendimento.md:1028-1034`, `:1335`, `:1492-1502`
- Antes: AG-158, AG-168, AG-178

**AG-48.** A cliente arquivada não agenda pelo app: a tela diz "Fale com a equipe para agendar." com o cartão da unidade, e o servidor recusa com a mesma frase.
- Fonte: recomendação do Claude aprovada pelo Heitor (sem data): "concordo"
- Onde: `docs/regras/atendimento.md:1035-1038`
- Antes: AG-159

**AG-49.** A sessão já comprada (a sessão livre de um plano aceito, ou de um pacote) se agenda pelo app mesmo sem o procedimento marcado para o app; o pré-pago avulso segue a marca do procedimento; só o procedimento inativo fica com a equipe. O cartão do pacote no Início diz "N de M sessões realizadas · restam R" e "Agendar <procedimento>".
- Fonte: o Heitor, 2026-11-14: "se for uma sessão de plano ou pacote, pode agendar"
- Onde: `docs/regras/atendimento.md:1039-1051`, `:1305-1318`
- Antes: AG-161, AG-181

**AG-50.** Com mais de uma unidade, o agendar do app (e o cartão do pacote) começa por "Em qual unidade?", e procedimentos, profissionais e horários vêm da escolhida. O remarcar do app, com mais de uma unidade que faz o procedimento, também pergunta; noutra unidade, recalcula o preço, e o mesmo profissional só fica se atende lá. O histórico registra a troca, e o que a cliente faz aparece como "Fulana (app)".
- Fonte: o Heitor, 2026-11-01 (H5): "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/atendimento.md:764-766`, `:984-1004`, `:1039-1051`, `:1492-1502`
- Antes: AG-162, AG-178, AG-181

**AG-51.** Com duas ou mais unidades ativas, tudo diz a unidade: os cartões da Agenda do app, o "Horário marcado", os avisos de agendamento novo, remarcado e cancelado, e os próximos agendamentos da ficha.
- Fonte: princípio 7
- Onde: `docs/regras/atendimento.md:1010-1022`, `:1258-1261`
- Antes: AG-143, AG-165, AG-184

**AG-52.** No agendar do app, com mais de um profissional na unidade, há "Sem preferência": a data mostra os horários de todos juntos, e o servidor escolhe quem está livre, com menos atendimentos no dia (no empate, o primeiro pelo nome). A cliente só escolhe (e o "Sem preferência" só sorteia) entre quem realiza o procedimento; outra pessoa é recusada. Com um só profissional, o passo nem aparece. Confirmado, o app diz com quem ficou.
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — D-16, 2026-10-30
- Onde: `docs/regras/atendimento.md:962-983`, `:1651-1654`
- Antes: AG-164, AG-165, AG-166, PC-28

**AG-53.** A cliente cancela e remarca pelo app até o prazo da rede (24 horas antes, por padrão; Configurações → Geral), só os agendamentos dela, num dos horários livres do app. O prazo aparece em dia e hora com o dia da semana, e o cartão diz "Alterar até …" (com o "Remarcar" à mão). Passado o prazo, só "Falar com a equipe" (mensagem pronta) e "Ligar". O agendamento feito (ou remarcado) a menos do prazo avisa que nasce sem cancelar nem remarcar pelo app.
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — 2026-10-21
- Onde: `docs/regras/atendimento.md:889-908`, `:942-946`, `:957-961`, `:1093-1094`
- Antes: AG-169, AG-170, AG-171, AG-172, AG-174

**AG-54.** O remarcar do app pergunta "Com quem?" quando mais de uma pessoa realiza o procedimento e atende na unidade: "Só com X", "Sem preferência" ou outra pessoa. O agendamento feito em "Sem preferência" guarda isso e o remarcar começa por aí. Os dias com horário livre das próximas duas semanas aparecem em chips. Em "Sem preferência", o app diz quem vai atender ANTES de confirmar, e o próprio agendamento não conta como atendimento do dia de quem o tem.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:910-957`
- Antes: AG-175, AG-176, AG-177

**AG-55.** "Próximo" no portal é o agendamento em aberto de hoje em diante: o de hoje fica até a conclusão, e o de ontem em aberto vai ao histórico. O de hoje que passou da hora diz que a equipe registra quando terminar; o horário que acabou sem registro diz "Horário passou".
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1076-1094`
- Antes: AG-180

**AG-56.** O que já foi pago aparece como pago, não como valor a cobrar, na agenda e no app ("Pré-pago · 1 de 2", "Pacote X · sessão 1 de 2"). A sessão de plano aceito e ainda não recebido não parece paga ("a receber no PDV (R$ X)" na agenda, só a quem vê valores; "a pagar na unidade" no app). O pago com desconto mostra no app o valor COBRADO e o desconto (pontos usados são forma de pagamento, não desconto). A sessão já agendada não conta como "para agendar" ("2 para agendar · 1 agendada").
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:1210-1237`
- Antes: AG-137, AG-138, AG-139, AG-140

### A avaliação pela cliente

**AG-57.** A cliente avalia no app ao confirmar o atendimento concluído: estrelas opcionais e comentário, num botão só ("Confirmar que realizei o atendimento"). Só a cliente da ficha avalia, só o atendimento concluído e ainda não confirmado, e só o que a rede pede; procedimento que não foi feito naquele atendimento é recusado.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:799-808`, `:823-827`
- Antes: AG-189, AG-193

**AG-58.** O que a cliente avalia é escolha da rede (Configurações → Geral): "O atendimento e cada procedimento" (padrão), "Só o atendimento" ou "Só cada procedimento". Só a Admin da rede muda isso.
- Fonte: o Heitor (F17-3): "a ser configurado pela clínica, mas, a princípio, avaliação do atendimento e avaliação por procedimento também"; o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/atendimento.md:799-813`
- Antes: AG-190, AG-191

**AG-59.** A nota do atendimento vale para o atendimento e para quem atendeu; cada procedimento feito tem a sua (o mesmo duas vezes na sessão pede uma). No ranking por procedimento, o sem nota própria fica fora da média (não herda a do atendimento), e a tela diz isso; o ranking por profissional usa a nota do atendimento. Com "Só cada procedimento", quem atendeu fica com a média das notas dos procedimentos.
- Fonte: decisão do Claude (princípio 4)
- Onde: `docs/regras/atendimento.md:814-839`
- Antes: AG-192, AG-194, AG-195

**AG-60.** A equipe vê as notas na tela do atendimento e na linha do tempo da ficha; a cliente, no Histórico do app. No concluído, para cliente que tem o app, a tela diz "A cliente ainda não confirmou nem avaliou pelo app (opcional).", sem alerta; para quem não tem o app, diz que a confirmação não se aplica.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:794-797`, `:842-845`
- Antes: AG-196, AG-197

### Equipe, como aparece na agenda

**AG-61.** Na Equipe, o "Atende" é uma caixa só: marcada, a pessoa atende em todas as unidades dela (com "A rede inteira", nas ativas ao salvar). Com mais de uma unidade, "Escolher em quais unidades atende" (fechado por padrão) abre a lista. A Equipe diz que "Unidade" (o acesso) e "Atende" (onde agenda) são dois controles.
- Fonte: decisão do Claude (pelo princípio 7, EQ1c)
- Onde: `docs/regras/atendimento.md:298-307`, `:631-633`, `docs/revisao.md:1195-1199`, `docs/revisao.md:2055`
- Antes: AG-48

**AG-62.** A unidade que a rede abre (ou reabre) entra no "Atende" de quem tem "A rede inteira" e atende em todas as outras unidades ativas. Quem escolheu à mão algumas unidades fica como escolheu, e quem é de unidades não ganha a nova.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-14: "Concord."
- Onde: `docs/regras/atendimento.md:345-353`
- Antes: AG-53

**AG-63.** Quem não tem "A rede inteira" (com a Equipe em Gerenciar) marca e desmarca no "Atende" só as unidades dele; as outras aparecem travadas.
- Fonte: atribuída ao Heitor sem a fala (a confirmar) (H7)
- Onde: `docs/regras/atendimento.md:357-361`
- Antes: AG-55

**AG-64.** Desmarcar "Segue o horário da unidade" parte do horário da unidade da pessoa; quem é da rede parte da unidade quando a rede tem uma só e, com várias, da união dos horários delas.
- Fonte: princípio 4
- Onde: `docs/regras/atendimento.md:70-77`
- Antes: AG-11

**AG-65.** A Admin da rede que atende marca o "Atende", a comissão e o horário na Equipe da rede, com o cargo travado, e entra na agenda, no agendar e na comissão como qualquer pessoa da rede que atende.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:432-436`
- Antes: AG-61

**AG-66.** Desativar um membro oferece repassar os agendamentos em aberto e as oportunidades abertas dele, caso a caso ou todos de uma vez; a escolha padrão é deixar com ele. A lista inclui os agendamentos que já passaram sem fechar (últimos 30 dias), e cada um pode ser cancelado (um a um ou todos), com o motivo da desativação.
- Fonte: o Heitor, 2026-11-01: "os agendamentos e oportunidades de quem é desativado, no momento da desativação, [dar] a opção de repassar para outra pessoa, caso a caso ou todos de uma vez"
- Onde: `docs/regras/atendimento.md:377-410`
- Antes: AG-56, AG-58

**AG-67.** O agendamento só se repassa a quem atende na unidade dele, realiza o procedimento e está livre no horário (o servidor também só aceita esses). A oportunidade vai a quem tem o CRM, ou fica "Sem responsável". Repassar pede a Agenda em Gerenciar (os agendamentos) e a permissão de trocar o responsável (as oportunidades); sem isso, a janela só diz quantos ficam. O que falhar volta à tela e a pessoa segue ativa; o histórico grava o repasse.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:384-397`, `:1657`
- Antes: AG-57, PC-30

**AG-68.** Deixar de atender numa unidade (ou desmarcar o "Atende") com agendamentos em aberto ali passa antes pelo mesmo repasse do Desativar (repassar, cancelar ou deixar); a mudança vale na hora. A grade da unidade mantém a coluna de quem tem agendamento ali e não atende mais ("Não atende mais nesta unidade"), fora do agendar.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:411-430`
- Antes: AG-59, AG-60

## Atendimento — iniciar, concluir, desistir (AT)

### Quem inicia, conclui e desiste

**AT-01.** Só inicia e conclui o atendimento quem tem o Atendimento em Gerenciar — qualquer atendimento das unidades ao alcance (sem o "só os meus", SM1; UM2). O mesmo vale para baixar os insumos e desistir no meio. Nem a Agenda nem o Prontuário iniciam ou concluem, e o "Atende" não é trava (UM5). Vale na tela e no servidor.
- Fonte: o Heitor, 2026-11-18: "Agenda é agenda e atendimento é atendimento. Só inicia e conclui atendimento quem tem gerenciar no atendimento."; sem o "só os meus": o Heitor, 2026-11-23 (docs/revisao.md, SM1): "pode tirar, as vistas pessoais resolvem"
- Onde: `docs/regras/atendimento.md:479-482`, `:512-514`, `:1410-1416`, `:1428-1430`, `:1453-1456`, `:3309`, `:3917`, CLAUDE.md §11
- Antes: AT-01, AG-70, AG-101, AG-106

**AT-02.** O módulo Atendimento tem Ver e Gerenciar (sem o "só os meus", SM1). Ver abre a tela do atendimento — não a Agenda em Ver (UM1) — e Tratamentos (os planos). A quem atende e não tem o Atendimento, a tela abre só no agendamento dela, e só para ver (a vista pessoal, SM2); o de outra pessoa é recusado. O módulo vem junto com o recurso Agenda do plano da rede.
- Fonte: decisão do Claude (princípio 1); a tela com o Atendimento em Ver: recomendação do Claude aprovada pelo Heitor, 2026-11-23 (docs/revisao.md, UM1): "concordo, pode anotar, marcar as questões e ajustar o codigo"; a vista pessoal: o Heitor, 2026-11-23 (SM2): "pode tirar, as vistas pessoais resolvem"
- Onde: `docs/regras/atendimento.md:1425-1431`
- Antes: AG-103

**AT-03.** O registro clínico do atendimento (evolução, fotos, ficha de saúde, ficha de atendimento, dores, intercorrência) pede o Prontuário em Gerenciar, e só ele: sem precisar atender nem do Atendimento (UM4). Quem tem só o Atendimento em Gerenciar inicia e conclui, mas a tela não mostra os campos clínicos e nada clínico se grava; ela também não vê nem recebe a ficha de saúde. A obrigatória em branco a barra como a qualquer um, e a recusa diz quem pode responder (com os nomes) ou que a cliente responde pelo app ou pelo link.
- Fonte: decisão do Claude; o clínico só com o Prontuário em Gerenciar: recomendação do Claude aprovada pelo Heitor, 2026-11-23 (docs/revisao.md, UM4): "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/regras/atendimento.md:1416-1422`, `:1926`, `:3311`, `:3586`
- Antes: AT-03, AG-102, PT-03

**AT-04.** No agendamento da própria pessoa que ainda não chegou (Agendado ou Confirmado), a tela do atendimento e a janela da agenda oferecem "Marcar chegada e iniciar" num gesto, quando ela tem a Agenda e o Atendimento em Gerenciar. Sem o Atendimento em Gerenciar, nem esse nem o "Iniciar" aparecem. Fora do dia do agendamento, a trava da chegada vem antes da pergunta do início adiantado.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:473-495`, `:577-586`
- Antes: AG-71

**AT-05.** Quem não pode fazer o passo vê, já antes, um aviso que trava e diz quem faz, pela permissão e com os nomes: sem marcar a chegada, quem tem a Agenda em Gerenciar; sem iniciar nem concluir, "Você não inicia nem conclui este atendimento." e quem conclui — quem tem o Atendimento em Gerenciar (UM2).
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:482-487`, `:502-525`
- Antes: AG-72, AG-74, AG-75

**AT-06.** Saiu em 23/11 (SM1: sem o "só os meus").

**AT-07.** Iniciar antes do horário marcado pergunta, em qualquer quantidade de tempo antes ("…faltam 1 h 53 min. Iniciar mesmo assim?"); marcado para outro dia, a pergunta diz os dias e que o atendimento fica registrado como feito hoje. Na hora marcada ou depois, inicia direto. Vale em todo caminho de iniciar.
- Fonte: o Heitor, 2026-11-03: "confirma iniciar mesmo assim em qualquer período de tempo anterior ao horário marcado"
- Onde: `docs/regras/atendimento.md:554-576`
- Antes: AG-78, AG-79

**AT-08.** Só se inicia de Confirmado ou Chegou, e só se conclui o que foi iniciado: Agendado, Confirmado e Chegou não se concluem, nem pelo "Concluído" da agenda (quem esqueceu de iniciar clica em Iniciar e depois em Finalizar). O "Concluído" da agenda não conclui nada por fora: só aceita o que o "Finalizar" já concluiu. O concluído não volta: não se cancela, não vira falta; o que se desfaz é o pagamento (estorno).
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — H5 e C11 do levantamento de 11/11
- Onde: `docs/regras/atendimento.md:1457-1461`, `:3316`, `:3326-3328`, `:3360`, `:3832-3834`
- Antes: AT-04, AT-05, AT-06, AG-108

### O que a conclusão grava e o dinheiro

**AT-09.** O "Finalizar" grava tudo junto ou nada: a situação Concluído, o registro do prontuário, a comissão de cada procedimento, a baixa de cada insumo, a sessão do pacote e o histórico. Dois "Finalizar" ao mesmo tempo concluem uma vez só; os avisos saem só depois de gravar. Os pontos de fidelidade não nascem na conclusão: nascem quando o atendimento é pago.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1406`, `:3303`, `:3331`, `:3342-3349`, `:3806`
- Antes: AT-07, AT-08, AT-09, AG-119

**AT-10.** A cobrança não nasce no fechamento: a comanda do atendimento nasce quando ele é INICIADO, e é recebida no PDV. Pagar antes ou depois de concluir é só a ordem do trabalho, nada a configurar.
- Fonte: o Heitor, 2026-11-13: "Quando inicia o atendimento, gera a comanda. Aí fica a critério da clínica se precisa pagar primeiro ou se paga depois, que daí é só a ordem que eles vão fazer qualquer coisa."
- Onde: `docs/regras/atendimento.md:3357`, `docs/revisao.md:569`
- Antes: AT-10

**AT-11.** O atendimento concluído e não pago é uma comanda aberta no PDV: a agenda e a ficha levam a ela ("Receber no PDV"); não há lista à parte de "Concluídos a receber". A tela diz quem recebe NESTA unidade (quem tem o PDV ou o Financeiro em Gerenciar) ou, sem ninguém dali, quem recebe pela rede; com o concluído a receber, receber é o passo da vez.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/atendimento.md:525-529`, `:3707`, `docs/revisao.md:611`, `docs/revisao.md:1936`
- Antes: AT-12, AT-15, AG-76

**AT-12.** A janela do "Finalizar" diz de onde vem o pagamento: sessão do plano, sessão de pacote (a trazida de fora: "já paga antes do sistema"), pré-pago, sem cobrança, ou "O pagamento é recebido no PDV". O atendimento de R$ 0 não tem o que receber: nem conta a receber, nem "aguardando pagamento" ("Sem cobrança").
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:3362`, `:3639`, `:3802`
- Antes: AT-11, AT-14

**AT-13.** A sessão de plano e a de pacote não se cobram no atendimento (a tela não oferece receber e o servidor recusa): o plano se paga na comanda dele, no PDV, e a parcela vencida aparece no PDV da cliente. A tela da sessão de pacote diz que ela já está paga; com o pacote em crediário, "incluída no pacote", com o valor em aberto só a quem pode receber.
- Fonte: o Heitor, 13/11: "Então, ele é pago como esse valor, não por sessão individual."
- Onde: `docs/regras/atendimento.md:2410`, `:2460`, `:3800`, `:3855`, `docs/revisao.md:2016`
- Antes: AT-13, PL-19, PL-26

### Os insumos

**AT-14.** O insumo usado se lança na tela do atendimento, em todo formato dela: o cartão "Insumos utilizados" traz os do procedimento marcados e o "Adicionar insumo"; só o marcado baixa, e o mesmo insumo lançado duas vezes soma. Cada insumo marcado diz de qual lote vai sair (o que vence primeiro antes, os vencidos por último; a tela não escolhe o lote). No concluído, a tela mostra os insumos que de fato baixaram.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:3351`, `:3376`, `:3452`, `:3463`
- Antes: AT-16, AT-19, AT-20

**AT-15.** Insumo faltando não impede o fechamento: o saldo fica negativo, para a falta aparecer no estoque, e a tela mostra o que faltou.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:3797`
- Antes: AT-18

### O registro na tela

**AT-16.** O "Finalizar" leva o que está escrito NA TELA, sem precisar de "Salvar" antes: a evolução, a intercorrência, as dores, a ficha de saúde que alguém mexeu e a ficha de atendimento que alguém mexeu. A ficha de saúde que a cliente respondeu e ninguém mexeu não vira "respondida pela equipe". A conclusão nunca troca uma evolução ou intercorrência já gravada por vazio, e o escrito continua na tela depois de gerar o plano.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:3472`, `:3487`, `:3498`, `:3508`
- Antes: AT-21, AT-22, AT-25

**AT-17.** O que se digita no atendimento fica num rascunho só desta aba: recarregar não perde, fechar a aba apaga, e nada fica guardado no computador da unidade. Concluir, salvar ou gerar o plano apaga o rascunho; no cancelado e na falta ele não se grava. A tela avisa disso a quem escreve no prontuário.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:1462-1463`, `:3391`, `:3748`
- Antes: AT-26, AG-109

### Depois de concluído

**AT-18.** O atendimento concluído fica bloqueado: a evolução e a ficha de saúde só se leem. Desbloquear ("Editar registro") pede o Prontuário em Gerenciar, e só ele (UM4), e a tela diz isso a quem não pode. O cancelado e a falta dizem o que são, que não houve atendimento e não há registro a editar.
- Fonte: decisão do Claude; corrigir só com o Prontuário em Gerenciar: recomendação do Claude aprovada pelo Heitor, 2026-11-23 (docs/revisao.md, UM4; na proposta, nenhuma ação pede dois módulos): "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/regras/atendimento.md:1425-1431`, `:3681`, `:3689`, `:3851`
- Antes: AT-42, AT-43, AG-103

**AT-19.** Não existe "Retorno em N dias": a conclusão não pede retorno, e quem quer a revisão marca um agendamento novo.
- Fonte: o Heitor, 2026-11-02: "não tem necessidade real de um 'retorno em x dias', isso é basicamente só um novo agendamento com motivo específico, não tem necessidade de ter uma regra de negócio para isso"
- Onde: `docs/regras/atendimento.md:3764`, `:3913`
- Antes: AT-44

### A desistência no meio

**AT-20.** Cancelar o atendimento EM ANDAMENTO (a desistência) pede o motivo e oferece "Intercorrência (opcional)" (a quem tem o Prontuário em Gerenciar) e "Baixar do estoque o que já foi aplicado". Grava tudo junto ou nada; não há comissão nem pontos. A tela do cancelado mostra a intercorrência abaixo do motivo, só a quem vê o prontuário. Desistir pede o Atendimento em Gerenciar (UM2), não a Agenda; o agendado que não começou segue com a Agenda. A janela da agenda não oferece "Não compareceu" no Em atendimento. O Copilot segue a mesma regra.
- Fonte: decisão do Claude; desistir no Atendimento em Gerenciar: recomendação do Claude aprovada pelo Heitor, 2026-11-23 (docs/revisao.md, UM2): "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/regras/atendimento.md:3402`, `:3431`, `:3447`, `:3871`
- Antes: AT-46, AT-49, AT-50

**AT-21.** O atendimento INICIADO e cancelado gasta a sessão já paga: a sessão do pacote, a unidade do pré-pago e a sessão do plano contam como usadas (no app: "Usada em … (atendimento interrompido)"; para as automações, "Sessão de pacote usada"). Cancelar ANTES de iniciar, ou marcar a falta, devolve o que estava pago. A janela de cancelar avisa isso.
- Fonte: o Heitor, 2026-11-18: "Não existe isso de desistir no meio do atendimento. Se isso por ventura acontecer, problema de quem desistir."
- Onde: `docs/regras/atendimento.md:1299-1301`, `:3414`, `:3424`, `:3919`
- Antes: AT-47, AT-48, AG-118

## Plano de tratamento (PL)

**PL-01.** O plano de tratamento só existe para quem tem o Atendimento (Ver; sem o "só os meus", SM1: vê todos os planos das unidades ao alcance). Na ficha, sem o Atendimento e sem o Prontuário, a aba Planejamento some; com o Prontuário e sem o Atendimento, ela tem só os injetáveis.
- Fonte: o Heitor, 2026-11-18: "Agenda é agenda e atendimento é atendimento"
- Onde: `docs/regras/atendimento.md:2295`
- Antes: PL-01

**PL-02.** Monta o plano — na avaliação aberta, na concluída ou pelo "Novo plano", e edita, propõe, vincula, renomeia, gera os termos e cancela o proposto — quem tem o Atendimento em Gerenciar, com a unidade do plano ao alcance; a Admin da rede monta em qualquer uma (UM3). O "Atende" da Equipe não é trava (UM5). Quem não monta ali é recusado ("Montar o plano é de quem tem o Atendimento em Gerenciar na unidade dele."), e a tela sem o "Novo plano" diz quem monta.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-23 (docs/revisao.md, UM3, que revê a PT2): "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/regras/atendimento.md:2308`, `:2354`, `docs/revisao.md:986`, `docs/revisao.md:2011`
- Antes: PL-02, PL-04

**PL-03.** Na avaliação ABERTA, gerar e aceitar o plano é de quem monta (o Atendimento em Gerenciar, com a unidade da avaliação ao alcance — UM3), e não pede o Prontuário; a parte clínica da mesma gravação (dores, ficha, ficha de saúde, evolução) só vai com o Prontuário em Gerenciar (UM4). Com o Atendimento só em Ver, o cartão do plano some.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-23 (docs/revisao.md, UM3 e UM4): "concordo, pode anotar, marcar as questões e ajustar o codigo" (o cartão que some com o Atendimento só em Ver é decisão do Claude)
- Onde: `docs/regras/atendimento.md:2345-2350`, `:3696`, `:3852`, `:3917`
- Antes: AT-38, PL-06

**PL-04.** O plano se monta na avaliação (na própria tela do atendimento, o cartão "Tratamento") ou depois, com calma: "Novo plano" na ficha e no menu Tratamentos, e "Montar um plano" no atendimento concluído, ligado a ele. Na avaliação concluída se grava SÓ o plano: as dores, a evolução e as fichas daquele dia ficam como estão; as obrigatórias são conferidas no que ficou gravado, e as dores não são exigidas. No portal da rede, o "Novo plano" oferece as unidades em que a pessoa monta (UM3: as ao alcance dela; no portal da rede, que é de quem tem "A rede inteira", todas as ativas).
- Fonte: o Heitor, 13/11: "a dra pode realizar a avaliação e depois com calma montar o plano, mesmo com o atendimento de avaliação tendo sido concluido"
- Onde: `docs/regras/atendimento.md:2328`, `:2353`, `:2493`, `:3700`, `:3713`, `:3853`, `docs/revisao.md:1002`
- Antes: PL-03, PL-08, AT-39

**PL-05.** O plano é opcional: o formulário abre em todo atendimento avulso da rede que monta plano, com "Propor um plano (opcional)"; antes de iniciar, no avulso e na sessão de pacote, o "Aceitar plano" não é a ação principal.
- Fonte: princípio 7
- Onde: `docs/regras/atendimento.md:2332`, `:2335`, `:2469`, `:3648`
- Antes: AT-36, PL-07

**PL-06.** Gerar o plano na avaliação grava tudo junto ou nada (o plano e as sessões, a ficha de atendimento, as dores, a evolução, a ficha de saúde). Não se gera plano em agendamento cancelado nem sobre plano já fechado. Gerar o plano não conclui a avaliação: quem conclui é o "Finalizar", e a tela diz "Falta finalizar a avaliação" e onde está o botão.
- Fonte: atribuída ao Heitor sem a fala (a confirmar) — revisão de 2026-10-29
- Onde: `docs/regras/atendimento.md:3606`, `:3635`, `:3643`, `:3790`, `:3824`
- Antes: AT-33, AT-35

**PL-07.** "Aceitar plano" é só "quero fazer", sem pergunta de dinheiro — na unidade ou pelo app, em casa. A avaliação tem "Aceitar plano" (gera e aceita) e "Gerar plano · a cliente vai pensar" (fica proposto). Aceita quem monta ou quem recebe; os dois botões salvam antes o que está na tela. Aceito, os documentos ficam prontos e a comanda do plano nasce no PDV com o valor inteiro; a equipe é avisada do aceite pelo app. Não há cobrança do plano dentro do atendimento.
- Fonte: o Heitor, 13/11: "SIm, pode liberar o aceite pelo app. A cliente recebe o plano no app, analisa e aceita."
- Onde: `docs/regras/atendimento.md:2371`, `:2472`, `:3626`, `docs/revisao.md:1010`, `docs/revisao.md:1025`, `docs/revisao.md:2013`
- Antes: AT-34, PL-12, PL-14

**PL-08.** As "Queixas e dores" são obrigatórias para gerar o plano na avaliação aberta: o campo diz isso, a tela aponta antes das outras obrigatórias e o servidor recusa com a mesma frase; o envio do plano em rascunho aceita as dores OU a observação. As dores são do registro do prontuário do atendimento (não a observação do agendamento, que aparece à parte), nascem vazias, só aparecem a quem vê o prontuário e vão à aba Prontuário e ao pacote LGPD.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:2338`, `:2345`, `:3733`, `:3737`, `:3831`
- Antes: AT-40, AT-41, PL-09

**PL-09.** A anotação clínica dentro do plano ("Observações de quem atende") só escreve quem tem o Prontuário em Gerenciar (em todo plano das unidades ao alcance; sem o "só os meus", SM1). Para quem monta sem ele, o campo não aparece, e a anotação já gravada fica.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "faz sentido, pode fechar o plano de tratamento"
- Onde: `docs/regras/atendimento.md:2320`, `docs/revisao.md:2011`
- Antes: PL-05

**PL-10.** O desconto do plano se combina no editor, em R$ ou %, e o total mostra o subtotal riscado e o que fica. Enquanto proposto, as sessões ficam com o preço de tabela e as telas mostram o total combinado. No ACEITE (da equipe ou da cliente), o desconto se aplica aos preços das sessões, ao centavo, e daí em diante vale o preço vendido. Nunca se aplicam dois descontos.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:3654`
- Antes: AT-37

**PL-11.** "Novo plano" só grava ao "Salvar plano"; até lá, o plano fica guardado na aba ("Continuar o plano não salvo", com "Descartar"). "Aceitar plano" e "Cliente vai pensar" só aparecem depois de salvo.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:2478`
- Antes: PL-10

**PL-12.** A página do plano é o centro, com os passos ① Aceite ② Documentos ③ Contrato e pagamento ④ Sessões; cada passo diz o estado e leva aonde se faz. A ordem é aceitar → assinar → pagar → agendar.
- Fonte: o Heitor, 13/11: "faz sentido, pode fechar o plano de tratamento, só inverte uma ordem, primeiro colhe assinatura, depois paga"
- Onde: `docs/regras/atendimento.md:2362`, `docs/revisao.md:1010`, `docs/revisao.md:2012`
- Antes: PL-11

**PL-13.** O valor do plano é a soma das sessões, e ele se paga inteiro — à vista ou parcelado, como qualquer venda —, não por sessão.
- Fonte: o Heitor, 13/11: "Então, ele é pago como esse valor, não por sessão individual. Tá? Então, ele vai ser pago integralmente, podendo ser parcelado pela clínica como qualquer outro produto."
- Onde: `docs/revisao.md:903`, `docs/revisao.md:917`
- Antes: PL-13

**PL-14.** Os termos e os outros documentos do plano se assinam quando a cliente quiser (no app, por link ou no aparelho da unidade). O contrato e o pagamento andam juntos no PDV: escolhe-se a forma, o contrato sai com ela, a cliente assina e então se recebe; o PDV não confirma o recebimento sem o contrato assinado ou dispensado com motivo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "SIm, pode liberar o aceite pelo app. A cliente recebe o plano no app, analisa e aceita."
- Onde: `docs/revisao.md:1029`, `docs/revisao.md:2014`
- Antes: PL-15

**PL-15.** O plano fechado (aceito, concluído, cancelado ou recusado) não se altera nem volta a rascunho ("Este plano já foi fechado e não pode mais ser alterado."). O plano se grava inteiro ou nada.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1562-1572`
- Antes: PC-18

**PL-16.** O plano ainda não aceito (rascunho ou proposto) se cancela pelo "Cancelar plano", por quem o monta, com motivo obrigatório e sem conta de dinheiro: os documentos que esperavam assinatura caem, o app deixa de mostrá-lo e o aceite passa a ser recusado; a oportunidade não se move. O plano aceito se cancela por quem tem o Financeiro em Gerenciar, com a conta do dinheiro, como o pacote.
- Fonte: recomendação do Claude aprovada pelo Heitor, 18/11: "sim" (e "Uma coisa só foi vendida se foi paga."); o cancelar do plano aceito, aprovado em 13/11 (`docs/revisao.md:2019`)
- Onde: `docs/regras/atendimento.md:2372`, `:2382`, `:2434`, `docs/revisao.md:2019`
- Antes: PL-16, PL-17

**PL-17.** As sessões do plano se agendam a qualquer momento depois do aceite (antes, não; o proposto se agenda no checkout, o cancelado não agenda): [Agendar] em cada sessão e "Agendar todas". A sessão se agenda com o preço e a duração DELA: o procedimento é o primeiro da sessão, o preço é a soma dos procedimentos dela no plano (o preço vendido, que não muda ao agendar) e a duração é a soma das durações. Agendar é de quem tem a Agenda em Gerenciar.
- Fonte: o Heitor, 13/11: "a partir do momento que a cliente aceita o plano, ela precisa daí pagar e agendar as sessões, ou todas, ou uma de cada vez, como ela preferir, né?"
- Onde: `docs/regras/atendimento.md:1267-1283`, `:2402`, `docs/revisao.md:2015`
- Antes: PL-18, AG-145, AG-146

**PL-18.** O "+ Agendar" da ficha (e da agenda) oferece, além do pacote e do pré-pago, a próxima sessão livre de cada plano fechado; ela vem escolhida quando o procedimento bate ("Incluído no plano de tratamento (sessão 2 de 3)"). Um agendamento avulso já marcado não se liga depois a uma sessão de plano.
- Fonte: o Heitor (decisão 2, 9ª simulação): "os dois são, em essencia, conjuntos de procedimentos"
- Onde: `docs/regras/atendimento.md:1286-1298`, `:2402`
- Antes: AG-147

**PL-19.** No app, a cliente vê tudo do plano (só os dela; o proposto com as sessões, o valor, a validade e "Aceitar o plano"; o aceito com cada sessão e a situação, os pagamentos — "Pago R$ X", "A pagar R$ Y" — e os documentos) e agenda as sessões em aberto. O título é o nome que a rede deu ao plano. Nada clínico vai ao app, nem a anotação de quem atende.
- Fonte: o Heitor, 13/11: "pt3, a cliente ve tudo sobre o plano, o plano em si, pagamentos, sessoes abertas e realizadas, documentos assinados e também pode agendar sessões em aberto." e "PT3 isso, se for uma sessão de plano ou pacote, pode agendar."
- Onde: `docs/regras/atendimento.md:1052-1068`, `:1319-1327`, `docs/revisao.md:979`, `docs/revisao.md:1005`, `docs/revisao.md:2018`
- Antes: PL-20, AG-182, AG-183

**PL-20.** Nomes na tela dos planos: a tela se chama "Tratamentos", como o menu, no grupo "Planejamento" (Tratamentos e Injetáveis). A tela Tratamentos filtra pela situação: Rascunho, Proposto, Aceito (falta assinar), Falta pagar, Em andamento, Concluído, Cancelado; o dinheiro recebido vence o documento aberto ("Em andamento"); o proposto se chama "Proposto" em toda tela. A ficha de tratamento diz o andamento das sessões ("A começar · 0 de 2", "Em andamento · 1 de 2", "Concluído · 2 de 2").
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "faz sentido, pode fechar o plano de tratamento"
- Onde: `docs/regras/atendimento.md:1238-1245`, `:2415`, `:2453`, `docs/revisao.md:2017`
- Antes: PL-21, PL-25, AG-141

**PL-21.** Saiu em 23/11 (SM1: sem o "só os meus").

**PL-22.** Os gestos de quem recebe o plano (a comanda, o receber, cancelar o recebimento) pedem a permissão de receber (o PDV), não o Atendimento.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-23 (docs/revisao.md, "Cada passo do atendimento, um módulo", que põe receber e a comanda no PDV): "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/regras/atendimento.md:2447`
- Antes: PL-24

**PL-23.** O plano proposto mostra a validade da proposta (da rede), só como informação; o plano sugere o pacote equivalente, se houver; agendar avulso um procedimento que está num plano da cliente avisa ("Agendar pelo plano? Avulso, ele é cobrado à parte.").
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "faz sentido, pode fechar o plano de tratamento"
- Onde: `docs/revisao.md:941-944`, `docs/revisao.md:2019`
- Antes: PL-27, PL-28, PL-29

## Prontuário (PT)

### O registro, quem vê e quem abriu

**PT-01.** Cada cliente tem um prontuário, e cada atendimento concluído tem um registro nele: a evolução, a intercorrência e a ficha de atendimento. A aba Prontuário da ficha aparece a quem pode ver o clínico mesmo antes do primeiro atendimento (com a ficha de saúde) e lista todo atendimento com algo escrito e todo concluído mesmo sem nada ("Sem evolução registrada."), cada um com o dia do ATENDIMENTO.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "Concordo com tudo"
- Onde: `docs/regras/atendimento.md:781-783`, `:1690`, `:1930`, `:1939`, `docs/revisao.md:713`, `docs/revisao.md:1982`
- Antes: PT-01, PT-04, AG-198

**PT-02.** Dado clínico (evolução, anexos clínicos, a anotação clínica do plano, a ficha de saúde) só vai à tela de quem tem o Prontuário (Ver ou Gerenciar), venha da tela que vier. Na ficha da cliente, ele só vai à tela na aba Prontuário (a exceção é o texto da alergia, FI-06).
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1920`, `:1989`
- Antes: PT-02, PT-08

**PT-03.** Saiu em 23/11 (SM1: sem o "só os meus").

**PT-04.** Todo acesso a dado clínico fica registrado (a ficha com os anexos clínicos, a tela do atendimento, o plano com a anotação clínica ou a ficha de saúde, a liberação do prontuário no pacote LGPD, os mapas de injetáveis), só quando o dado vai à tela. A mesma pessoa relendo a mesma cliente no mesmo ponto em 30 minutos é um registro só; falha no registro não trava o atendimento. O registro não se altera, sobrevive ao membro desativado e guarda a marca "via suporte".
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:1976`, `:1985`, `:1996`, `:2012`
- Antes: PT-07, PT-09, PT-11

**PT-05.** A lista de quem abriu o prontuário aparece no fim da aba Prontuário a quem tem o Prontuário em Gerenciar e "A rede inteira". A cliente não a recebe no pacote LGPD.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:1999`, `docs/revisao.md:2054`
- Antes: PT-10

### Fotos, anexos e anotações

**PT-06.** As fotos e os anexos clínicos moram na aba Prontuário: a foto, no registro do atendimento dela; o exame, o laudo, a receita, a foto e o termo anexados sem atendimento, em "Anexos clínicos". A aba Documentos fica só com o anexo comum (RG, comprovante, "outro", contrato).
- Fonte: o Heitor, 2026-11-13: "pode trazer as fotos pro prontuário e aceito outras recomendações"
- Onde: `docs/regras/atendimento.md:2512`, `:2519`, `docs/revisao.md:741`, `docs/revisao.md:1976`
- Antes: PT-14

**PT-07.** Anexar e apagar anexo CLÍNICO pede o Prontuário em Gerenciar, com o alcance da ficha; o anexo comum pede as Clientes em Gerenciar. Cada pessoa vê só as categorias que pode anexar. Apagar anexo clínico só o marca, com quem e quando (some das telas; o pacote LGPD o lista); o comum se apaga de verdade.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:2017`, `:2024`
- Antes: PT-12, PT-13

**PT-08.** A foto clínica entra pela tela do atendimento ("Fotos do atendimento"), ligada a ele e à cliente (também no atendimento em outra unidade em que a pessoa atende). O cartão aparece a quem vê o prontuário, e anexar, a quem escreve nele. A foto diz o momento — Antes, Durante, Depois — e tem um nome editável que só a equipe lê. O histórico do atendimento registra a foto anexada, enviada à cliente, tirada do app e apagada ("Foto clínica apagada por <nome>"), com quem fez.
- Fonte: decisão do Claude (o rastro de apagar está atribuído ao Heitor sem a fala, a confirmar)
- Onde: `docs/regras/atendimento.md:1503-1508`, `:1953`, `:2033`, `:2048-2087`
- Antes: PT-15, PT-16, PT-17, PT-18, AG-201

**PT-09.** No app da cliente só aparece o arquivo que a equipe ENVIA: anexar nasce "Só a equipe vê"; "Enviar à cliente" a avisa com texto genérico, e "Tirar do app" desfaz. Envia quem pode mexer no anexo, com a unidade ao alcance; o suporte não envia. Com o app no plano, a foto pode ir já no anexar, como "Uma foto do seu atendimento". O termo e o contrato assinados continuam no app.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:2068`, `:2096`
- Antes: PT-19, PT-20

**PT-10.** No atendimento concluído, quem tem o Prontuário em Gerenciar, com o alcance de hoje, pode "Acrescentar anotação": um texto datado com o nome de quem escreveu, que não se edita nem se apaga, mostrado na ordem do tempo. Antes de concluir, escreve-se na evolução.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "Concordo com tudo"
- Onde: `docs/regras/atendimento.md:2528`, `docs/revisao.md:1978`
- Antes: PT-21

**PT-11.** Corrigir o registro concluído guarda a versão de antes, com quem corrigiu e quando ("Editado por X em dd/mm — ver a anterior"); sem mudança, nada se grava; a versão não se altera nem se apaga. Corrigir pede o Prontuário em Gerenciar, e só ele (UM4); a ficha do cancelado ou da falta não se preenche. O pacote LGPD leva as anotações e as versões anteriores.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "Concordo com tudo"
- Onde: `docs/regras/atendimento.md:2539`, `:2557`, `docs/revisao.md:1979-1980`
- Antes: PT-22, PT-23

**PT-12.** A cliente não vê o prontuário no app, só o histórico de procedimentos e o que a equipe enviar. A exceção é a ficha de saúde pendente: ali ela vê as perguntas e, dentro da validade, as próprias respostas de antes — nada de evolução, foto ou anotação da equipe.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1915`, `docs/revisao.md:736`
- Antes: PT-24

### Injetáveis

**PT-13.** A aplicação de injetáveis só se registra dentro de um atendimento ("Registrar aplicação"); fora dele, o mapa não oferece "Confirmar aplicação" e o registro é recusado. Há UMA aplicação por mapa por atendimento: registrada, o botão vira "Atualizar a aplicação registrada" enquanto o atendimento está aberto; encerrado, ela fica.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:2112`, `:2127`, `:2162`
- Antes: PT-25, PT-26

**PT-14.** O mapa se abre e se cria da tela do atendimento ("Mapa de injetáveis", a quem vê o clínico). O campo "Planejador de injetáveis" da ficha abre o planejamento DA CLIENTE (os dela, ou um novo ligado a ela; o vazio que ela já tem se reaproveita) — não há segundo planejador; as opções do campo são os "Produtos do mapa". Sem esse campo na ficha, o mapa é o do Planejamento.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:2120`, `:2140`, `:2170`, `:2177`, `:2234`
- Antes: PT-27, PT-28, PT-29

**PT-15.** A ficha guarda o planejamento escolhido e um retrato dos pontos gravados no "Salvar ficha" ou no "Finalizar" (a edição não salva não entra, e a tela diz); na leitura, o retrato aparece "como estava em…". A aplicação registrada pela sub-aba de injetáveis chega ao campo vazio da ficha. A ficha antiga de mapa solto só se lê.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:2184-2240`
- Antes: PT-30, PT-33

**PT-16.** Os mapas seguem o Prontuário: só existem para quem vê o clínico (nem pela URL), nas unidades ao alcance (sem o "só os meus", SM1). O planejamento da ficha tem de ser da cliente do atendimento e da unidade ao alcance; o atendimento usa os planejamentos da cliente, quem quer que os tenha desenhado.
- Fonte: o Heitor, 2026-11-23 (docs/revisao.md, SM1): "pode tirar, as vistas pessoais resolvem" (o resto é decisão do Claude)
- Onde: `docs/regras/atendimento.md:2146`, `:2192`, `:2273`, `:2286`
- Antes: PT-31, PT-37, PT-38

**PT-17.** O planejamento escolhido sem nenhum ponto pergunta no "Finalizar" e no gerar plano ("…não tem nenhum ponto. Continuar?") e só segue com "Continuar sem pontos".
- Fonte: o Heitor, 2026-11-02: "se o planejamento escolhido não tiver nenhum ponto, avisar e confirmar se deseja continuar"
- Onde: `docs/regras/atendimento.md:2200`
- Antes: PT-32

**PT-18.** O produto do ponto se escolhe numa lista do estoque (o que estava escrito fora dela fica, marcado "(fora do estoque)"). O "Finalizar" compara a dose do mapa com a baixa do insumo e AVISA a diferença, com atalho para ajustar; não recusa, e a baixa é a da tela. "U" e "UI" são a mesma unidade; ml e UI não.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:2252-2266`
- Antes: PT-35, PT-36

## Fichas (FI)

**FI-01.** Cada procedimento liga UMA "Ficha de atendimento", montada em Configurações → Fichas; a rede tem quantas quiser. Ela se preenche no atendimento, aparece em todo caminho da tela do atendimento (avaliação, plano gerado, sessão de plano, rede sem planos), só a quem vê o prontuário, e as respostas ficam no registro.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo, o resto fica como está"
- Onde: `docs/regras/atendimento.md:1692`, `:1700`, `docs/revisao.md:1220`
- Antes: FI-01, FI-04

**FI-02.** Nomes: "Fichas de atendimento" (as dos procedimentos) e "Ficha de saúde" (a da cliente), em toda tela, botão, mensagem, no app, no link e no Copilot; "pré-atendimento" e "anamnese" não aparecem no texto.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo, o resto fica como está" (FC1) e "Concordo com tudo" (PR3)
- Onde: `docs/revisao.md:1230`, `docs/revisao.md:1981`, `docs/revisao.md:2063`, `docs/regras/atendimento.md:2559`
- Antes: FI-02

**FI-03.** O construtor de fichas tem campos de texto, número, data, seleção, escolha única e múltipla, foto, planejador de injetáveis e título; cada campo pode ser obrigatório e pode "Mostrar só quando" outra resposta for X. Campo escondido não barra nem se grava; a condição que aponta para um campo que saiu não esconde nada. Vale nas duas fichas.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo, o resto fica como está"
- Onde: `docs/regras/atendimento.md:1883`, `docs/revisao.md:1216`
- Antes: FI-03

**FI-04.** A ficha de saúde é UMA por rede, sobre a pessoa, igual para qualquer atendimento, sem foto nem planejador. Nasce com a rede, com alergia, gestação ("Sim", "Não", "Não se aplica"), medicamentos e condições de saúde obrigatórias. "Acrescentar as perguntas de injetáveis" põe no fim um bloco pronto, sem duplicar, para a rede revisar. A resposta guarda o retrato das perguntas de quando foi respondida.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo, o resto fica como está"
- Onde: `docs/regras/atendimento.md:1715`, `:1728`, `:1843-1852`, `:1968`, `docs/revisao.md:1222`
- Antes: FI-06, FI-08, FI-10, FI-11

**FI-05.** Só a Admin da rede edita as fichas (a de saúde e as de atendimento), em Configurações → Fichas.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/atendimento.md:1721`
- Antes: FI-07

**FI-06.** A alergia é "Tem alguma alergia?" Sim/Não; no "Sim", "Quais alergias?", obrigatória. O alerta sai do "Sim"; o "Não" não avisa; o texto livre avisa como está escrito — o sistema não interpreta texto (as anotações da ficha da cliente aparecem no atendimento como estão, sem virar alerta). A alergia aparece em destaque na ficha (em qualquer aba, registrando o acesso) e no atendimento, só a quem vê o prontuário, e a faixa acompanha as respostas digitadas.
- Fonte: o Heitor, 2026-11-02: "…alergia: opção de sim ou não; se sim, campo texto livre para detalhamento e alerta"
- Onde: `docs/regras/atendimento.md:783-793`, `:1868`, `:1891`, `:1989`
- Antes: FI-09, FI-28, AG-199, AG-200, PT-08

**FI-07.** Tudo que é obrigatório barra: a pergunta obrigatória sem resposta (na ficha de saúde ou na de atendimento) barra o "Salvar ficha", o "Finalizar atendimento", o "Aceitar plano" e o "Gerar plano · a cliente vai pensar", no servidor e não só na tela; a ficha de saúde não se envia vazia nem com obrigatória em branco, pela cliente (app e link) ou pela equipe. Vale o que fica gravado: a resposta da cliente pelo app ou link conta, e contam as perguntas da ficha ATUAL. Sem ficha ligada, ou sem obrigatória, nada barra; a foto e o planejador não barram a ficha de saúde.
- Fonte: o Heitor, 2026-10-29: "tudo que for obrigatório é obrigatório e barra qualquer progressão se não for feito"
- Onde: `docs/regras/atendimento.md:1707`, `:1816`, `:1838`, `:1856`, `:3524`, `:3541`, `:3557`, `:3581`, `:3821`
- Antes: AT-27, AT-29, AT-32, FI-05, FI-26

**FI-08.** A ficha de saúde tem validade, da rede (padrão 6 meses). Dentro dela, a cliente só confirma ("algo mudou?"), e confirmar renova a data; fora dela, ou sem resposta, responde a ficha inteira. A ficha vencida continua valendo, e o atendimento avisa a quem vê o prontuário ("…está vencida… Ela continua valendo; peça a atualização."); a nunca respondida também avisa, com "Responder aqui" e "Enviar o link".
- Fonte: o Heitor, 2026-11-02: "mantém como está mas com aviso de que a ficha de saúde está vencida"
- Onde: `docs/regras/atendimento.md:1739`, `:1744`, `:3562`, `:3572`, `docs/revisao.md:1226`
- Antes: FI-12, AT-30, AT-31

**FI-09.** Mandar a ficha de saúde ao agendar é configuração da rede, desligada por padrão. Ligada, todo agendamento, por qualquer caminho, abre a ficha pendente da cliente (uma por cliente), menos quando ela respondeu ou confirmou há menos de 30 dias. Desligada, o Início do app oferece "Responda a sua ficha de saúde" à cliente com atendimento marcado e sem ficha válida.
- Fonte: princípio 6 (os 30 dias: atribuída ao Heitor sem a fala, a confirmar)
- Onde: `docs/regras/atendimento.md:1740`, `:1747`, `:1827`
- Antes: FI-13, FI-14, FI-25

**FI-10.** Quem respondeu na unidade não responde de novo no app: gravar a ficha fecha a pendente, e a equipe regravando as mesmas respostas não muda quem respondeu nem a data. A ficha gravada vazia não conta como respondida em lugar nenhum ("Ficha de saúde vazia").
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1733`, `:1859`
- Antes: FI-15, FI-27

**FI-11.** Quando a cliente responde (app ou link), o profissional do agendamento é avisado no sino e no celular; o aviso diz a alergia, se houver.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:1751`
- Antes: FI-16

**FI-12.** A cliente responde a ficha de saúde no app (tela própria e cartão do Início; o aviso no celular é genérico, sem nada de saúde) ou por um link; com a rede mandando assinatura pela conversa, a ficha também tem "Mandar pela conversa".
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1754`, `:1896`
- Antes: FI-17, FI-24

**FI-13.** O link da ficha pede CPF ou nascimento antes de mostrar qualquer pergunta; cinco tentativas erradas derrubam o link, vinte por hora param quem tenta, e o link morre com a ficha pendente. O link que ainda vale se mostra de novo; "Gerar outro" cancela o anterior. A ficha que a equipe preencheu se confere pelo link ("Está tudo certo" ou "Corrigir respostas") e passa a ser da cliente; a que ela mesma respondeu diz "já respondida", com o contato da unidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1757`, `:1776-1796`
- Antes: FI-18, FI-22, FI-23

**FI-14.** "Enviar a ficha" está sempre na janela do agendamento, para quem tem a Agenda em Gerenciar (copiar o link ou abrir no WhatsApp do aparelho); sem pendente, o botão abre uma para este agendamento, sem a regra dos 30 dias. Quem só vê a agenda não vê o bloco; o suporte não manda. Cliente sem CPF nem nascimento: a janela pede o nascimento a quem tem as Clientes e a Agenda em Gerenciar (só preenche o vazio).
- Fonte: princípio 1
- Onde: `docs/regras/atendimento.md:1761`, `:1767`, `:1807`
- Antes: FI-19, FI-21

**FI-15.** A janela do agendamento e o bloco na agenda mostram só o ESTADO da ficha de saúde (pendente ou respondida para este agendamento), nunca as respostas; a janela diz quando ela foi ao app da cliente.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:1766`, `:1819`, `:1824`, `:1904`
- Antes: FI-20, FI-29

## Procedimentos (PC)

**PC-01.** Criar, editar, ativar e desativar procedimento, e criar, renomear e arquivar categoria, é de quem tem Procedimentos em Gerenciar, e só isso: não precisa ter "A rede inteira".
- Fonte: o Heitor, 13/11 (PR6): "sim, só quem tem permissão de gerenciar"; o Heitor, 2026-11-13: "Para as categorias, vale a mesma regra do estoque, só quem tem permissão de gerenciar procedimentos."
- Onde: `docs/regras/atendimento.md:1519-1523`, `:1670-1671`, `docs/revisao.md:192-193`, `docs/revisao.md:241-242`, `docs/revisao.md:1866`
- Antes: PC-01, PC-02

**PC-02.** O catálogo é um só nos dois portais: o da rede sempre o mostra, e o da unidade o mostra para edição a quem tem Procedimentos em Gerenciar. Quem só vê lê o catálogo (na unidade, com o preço dela) e o aviso de quem muda.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1523-1529`
- Antes: PC-03

**PC-03.** A comissão do procedimento é só da Admin da rede (é configuração da rede toda).
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/atendimento.md:1530-1531`, CLAUDE.md §11
- Antes: PC-04

**PC-04.** O cadastro do procedimento fica como está: nome, categoria, duração, pontos de fidelidade, descrição, em quais unidades, salas, insumos, quem realiza e comissão.
- Fonte: o Heitor, 2026-11-13: "Parte de descrição, disponivel nas unidades, salas, insumos e o resto pode manter."
- Onde: `docs/revisao.md:201-202`, `docs/revisao.md:1871`
- Antes: PC-05

**PC-05.** Nomes no cadastro do procedimento: "Permitir auto agendamento" (era "Visível no app do cliente") e "Ficha de atendimento" (era "Ficha"), que continua sendo uma lista para escolher.
- Fonte: o Heitor, 2026-11-13: "No cadastro do procedimento, troque \"Visivel no app do cliente\" por \"Permitir auto agendamento\"." e "Em \"Ficha\" mude para \"Ficha de atendimento\" mantem o padrão lista."
- Onde: `docs/regras/atendimento.md:1534-1537`, `docs/revisao.md:193-196`, `docs/revisao.md:1867-1868`
- Antes: PC-06, PC-07

**PC-06.** A caixa "Permitir auto agendamento" decide se a cliente vê o procedimento no app e o agenda sozinha. O procedimento novo nasce sem ela marcada: só vai ao app o que a rede marca (a sessão já comprada é a exceção, AG-49).
- Fonte: decisão do Claude (2026-10-21)
- Onde: `docs/regras/atendimento.md:1302-1304`, `:1534-1537`
- Antes: PC-06, AG-160

**PC-07.** O procedimento pode ligar um "Termo de consentimento", um "Contrato" (que só vale no atendimento avulso) e "outros documentos", quantos quiser, de qualquer documento criado ou anexado no sistema. Os três são opcionais.
- Fonte: o Heitor, 13/11 (PC7): "…a gente vai poder listar um termo de consentimento do procedimento e vai poder adicionar um contrato para quando esse procedimento for realizado avulso. … E também nos procedimentos aí permite adicionar outros documentos que a rede queira que seja assinado, e aí qualquer documento que tenha sido criado ou anexado no sistema, tá?" (opcionais: PC8, "Não é obrigatório que aparece na tela do cadastro.")
- Onde: `docs/revisao.md:299-335`, `docs/revisao.md:1869`, `docs/revisao.md:1879`
- Antes: PC-08

**PC-08.** Preço vazio vale R$ 0,00: o procedimento é gratuito, e a tela diz que o atendimento não tem o que cobrar. Preço negativo ou ilegível é recusado.
- Fonte: princípio 4
- Onde: `docs/regras/atendimento.md:1573-1579`
- Antes: PC-09

**PC-09.** O catálogo da unidade é o da rede mais os procedimentos que são só dela. O procedimento marcado para algumas unidades só é feito nelas (sem nenhuma marcada, em todas); na unidade que não o faz, ele some de toda lista (agenda, app, Vender, plano, Copilot), e agendar ou vender é recusado ("X não é feito na unidade Y…").
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1518`, `:1538-1547`, `:1674-1685`
- Antes: PC-10, PC-11

**PC-10.** Onde a unidade tem preço próprio, vale o dela em todo caminho (listar, agendar, cobrar, vender, pacote, plano); onde não tem, o da rede; sem unidade (oportunidade, recompensa da fidelidade), o da rede. A comissão sai do preço gravado. A lista da rede mostra o preço próprio de cada unidade embaixo do preço. O histórico de preço é só o da rede.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:1580-1606`
- Antes: PC-12, PC-13, PC-14, PC-15

**PC-11.** O plano oferece o catálogo e o preço da unidade DO PLANO (a do plano aberto, a do atendimento ou, no novo, a do endereço); na ficha aberta pela rede com duas ou mais unidades, escolher a "Unidade do plano" é obrigatório — nunca vale a unidade de cadastro da cliente. O procedimento do plano que a unidade não faz fica à vista, marcado "(não é feito nesta unidade)", e o servidor recusa gravar o plano com ele.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1548-1560`, `:1597-1600`
- Antes: PC-16, PC-17

**PC-12.** Os insumos ligados ao procedimento são o que cada atendimento consome (deles sai a baixa). Com insumo no estoque, o catálogo avisa os procedimentos ativos sem insumo ligado (faixa no topo e selo na linha), só como aviso; a rede pode marcar "Este procedimento não usa insumo", e ele sai do aviso.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:1607-1624`
- Antes: PC-19, PC-20, PC-21

**PC-13.** A calculadora do procedimento usa o último custo de compra de cada insumo e diz isso, avisando que no atendimento a baixa sai ao custo do lote usado. Sem custo cadastrado, não mostra margem e diz que ela não se calcula.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:1628-1640`
- Antes: PC-23, PC-24

**PC-14.** O cadastro do procedimento, na criação e na edição, marca quem o realiza, entre quem atende na rede; sem ninguém marcado, todos que atendem realizam. Na agenda da equipe, escolher quem não realiza só avisa (o encaixe é decisão da rede); no app, é recusado (AG-52); no repasse, só entra quem realiza (AG-67).
- Fonte: o Heitor, 2026-11-02: "já deveria ter um cadastro das profissionais que podem realizar o procedimento. Isso já deve estar na hora da criação de um procedimento e disponível também na edição"
- Onde: `docs/regras/atendimento.md:1644-1657`
- Antes: PC-26, PC-27, PC-29

**PC-15.** Cada rede tem a sua lista de categorias; a rede nova nasce com dezesseis (entre elas "Avaliação"), e a categoria usada num procedimento entra na lista. Renomear troca o nome em todos os procedimentos (com nome que já existe, junta as duas); arquivar tira das opções, mas o cadastro sempre oferece a categoria atual do procedimento.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:1661-1670`
- Antes: PC-31, PC-32, PC-33

## Estoque (ES)

### O estoque e quem mexe

**ES-01.** O estoque tem entrada, saída no atendimento, transferência entre unidades, perda, ajuste (inventário), lotes, validade e aviso de mínimo. A tela geral do estoque fica como está.
- Fonte: o Heitor, 13/11: "a tela geral do estoque esta boa. … Mantem saída no atendimento, transferencia entre unidades, perda, ajuste, lotes, validade e aviso de mínimo."
- Onde: `docs/revisao.md:174`, `docs/revisao.md:1860`
- Antes: ES-01

**ES-02.** Cadastrar, editar e desativar produto, e criar, renomear e excluir categoria, marca e fornecedor, é de quem tem o Estoque em Gerenciar, e só disso, no portal da rede ou no da unidade. Ser da rede ou ser Admin da rede não conta. O catálogo de produtos é um só, da rede, e o produto aparece em todas as unidades.
- Fonte: o Heitor, 13/11: "Quem cadastra é só quem tem permissão de gerenciar." e "ta bem claro, é só quem tem permissão de gerenciar, mesma regra para categoria, marca e fornecedor"
- Onde: `docs/regras/atendimento.md:3102`, `:3149`, `docs/revisao.md:153`, `docs/revisao.md:157`, `docs/revisao.md:1852`, `docs/revisao.md:1859`
- Antes: ES-03, ES-08

### Categorias, marcas, fornecedores e o produto

**ES-03.** A rede tem três cadastros de texto livre: Categorias, Marcas e Fornecedores, lado a lado no cabeçalho do Estoque, nos dois portais. Nos formulários, eles se escolhem numa lista com busca e autocomplete (que ignora acentos), e o que não existe se cria ali mesmo.
- Fonte: o Heitor, 13/11: "Cadastrar categorias com texto livre … Cadastrar marcas com texto livre … Cadastrar fornecedor com texto livre"; e "Categoria, marca e fornecedor com lista e campo de busca com autocomplete."
- Onde: `docs/regras/atendimento.md:3142`, `:3161`, `docs/revisao.md:81`, `docs/revisao.md:145-146`, `docs/revisao.md:1851`
- Antes: ES-02, ES-07

**ES-04.** Na mesma lista não há dois itens com o mesmo nome (maiúsculas e espaços não contam). Renomear a categoria leva o nome aos produtos (o SKU não muda); renomear marca ou fornecedor deixa o nome antigo nas entradas gravadas. Excluir apaga de vez (não há arquivar): o produto fica sem categoria, e a entrada continua mostrando o nome.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:3145`, `:3156-3157`
- Antes: ES-04, ES-05, ES-06

**ES-05.** O produto tem: nome (obrigatório); SKU, gerado sozinho; código de barras (opcional, digitado ou lido); categoria (opcional); embalagem (obrigatória, numa lista fixa de 13 medidas, entre elas "Seringa"); conteúdo da embalagem (opcional); onde está disponível; estoque mínimo; e estoque inicial (opcional).
- Fonte: o Heitor, 13/11: "Cadastrar produto, com nome, código de barras opcional com ou sem leitor de codigo de barras, categoria, formato da embalagem, conteúdo da embalagem, … estoque minimo e possibilidade de já cadastrar um estoque inicial ao cadastrar o produto."
- Onde: `docs/regras/atendimento.md:1633-1635`, `docs/revisao.md:85`, `docs/revisao.md:147`, `docs/revisao.md:1860`
- Antes: ES-09, PC-25

**ES-06.** O SKU é gerado sozinho e não se edita: começa com as três letras da categoria (sem categoria, "OUT" no só Insumo e "REV" no de Venda direta) e não muda depois. Antes de salvar, a tela mostra "Gerado ao salvar (…)".
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:2841`, `docs/revisao.md:110`, `docs/revisao.md:148`
- Antes: ES-14, ES-15

**ES-07.** O produto não tem marca nem fornecedor, e não existe "fornecedor de costume": marca e fornecedor se escolhem só na entrada.
- Fonte: o Heitor, 13/11: "Não existe fornecedor de costume. Na entrada no estoque, escolhe fornecedor e marca."
- Onde: `docs/regras/atendimento.md:3169`, `docs/revisao.md:150`, `docs/revisao.md:162`
- Antes: ES-10

**ES-08.** "Onde o produto está disponível" tem dois checkboxes, Insumo e Venda direta (os dois juntos podem; nenhum é recusado; o novo vem com Insumo). O Insumo aparece nos insumos do procedimento, no "Adicionar insumo" do atendimento e no editor do plano (o já ligado a um procedimento continua lá); a Venda direta aparece na venda de produto, exige preço de venda e mostra a "Comissão na venda deste produto" a quem pode mudar comissão.
- Fonte: o Heitor, 13/11: "checkbox de onde o produto está disponivel(Insumo e Venda direta)"
- Onde: `docs/regras/atendimento.md:2817`, `:2830-2832`, `docs/revisao.md:137`, `docs/revisao.md:149`, `docs/revisao.md:1854`
- Antes: ES-11, ES-12, ES-13

**ES-09.** O estoque avisa e não recusa: o nome de produto repetido (mostra o SKU do outro e oferece "Cadastrar mesmo assim"), a validade que já passou na entrada (o lote entra vencido) e o custo fora do comum (acima de 10 vezes o do cadastro, ou do preço de venda, ou a partir de R$ 10.000 por embalagem sem nenhum dos dois), na Entrada, no estoque inicial e no "Corrigir custo".
- Fonte: princípio 2
- Onde: `docs/regras/atendimento.md:2679`, `:2742`, `:3091`, `docs/revisao.md:152`
- Antes: ES-16, ES-26, ES-27

**ES-10.** O mínimo do cadastro vale na unidade quando o produto entra nela pela primeira vez; depois, cada unidade tem o seu ("Salvar mínimo", mesmo 0), e mudar o do cadastro não muda o dela (o cadastro explica). O mínimo igual ao do cadastro e maior que zero aparece com "(do cadastro)". O mínimo não pode ser negativo.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:2962`, `:2979`, `:3211`, `:3220`, `:3266`
- Antes: ES-17, ES-18, ES-19

### Estoque inicial e entrada

**ES-11.** O estoque inicial do cadastro tem os dados de uma entrada (quantidade, custo, lote, validade, nota, observações, marca e fornecedor) e pode ser dividido entre unidades, uma linha por unidade (a mesma unidade não se repete). Grava tudo ou nada: se uma linha falha, nem o produto se grava.
- Fonte: o Heitor, 13/11: "ok, mantem como está, mas com possibilidade de dividir a entrada entre as unidades."
- Onde: `docs/regras/atendimento.md:3084`, `:3119`, `:3128`, `docs/revisao.md:151`, `docs/revisao.md:1856`
- Antes: ES-20, ES-21

**ES-12.** A unidade do estoque inicial depende das unidades da pessoa: de uma unidade só, vem escrita e travada; de mais de uma, a lista só com as dela, marcada na em que está; com a rede inteira, todas (no portal da rede com duas ou mais, nenhuma escolhida; no da unidade, a do endereço).
- Fonte: o Heitor, 13/11: "Se for pessoa de uma unidade especifica, unidade vem pré-preenchida e não pode ser mudada. Se a pessoa tiver mais de uma unidade, a lista mostra apenas as unidades dela."
- Onde: `docs/regras/atendimento.md:3079`, `:3111`
- Antes: ES-22

**ES-13.** Nenhuma movimentação de estoque gera despesa (entrada, estoque inicial, leitor, Copilot, ajuste, perda, transferência, consumo). O custo serve só para calcular insumos, custo, margem e lucro, e a tela diz "Não gera despesa". Para ter a compra no financeiro, a rede faz um lançamento manual "Compra de estoque", que conta no caixa e fica fora do lucro.
- Fonte: o Heitor, 2026-10-28: "tanto entrada quanto saída, não gera despesa. Os valores são informados apenas para base de cálculo de insumos, custo, margem e lucro"
- Onde: `docs/regras/atendimento.md:3056`, `:3251`
- Antes: ES-23

**ES-14.** A Entrada tem quantidade em embalagens, custo, lote, validade, marca, fornecedor, nota fiscal e observações; marca e fornecedor são opcionais e valem em todo caminho (manual, leitor, estoque inicial, Copilot), e o nome novo entra na lista. A entrada com validade e sem número de lote também cria o lote. Na lista, o leitor de código de barras acha o produto e abre a Entrada; sem achar, deixa ligar o código a um produto.
- Fonte: o Heitor, 13/11: "A entrada adapta para o novo formato de informar marca e fornecedor."
- Onde: `docs/regras/atendimento.md:2901`, `:3067`, `:3174`, `:3279`, `docs/revisao.md:129`, `docs/revisao.md:1857`
- Antes: ES-24, ES-25, ES-30

**ES-15.** A entrada errada se corrige de dois jeitos: "Corrigir custo", na linha do lote, enquanto nada saiu dele (não no lote que veio por transferência; se for a entrada mais recente, o custo do produto muda junto; a Auditoria registra); depois da primeira saída, o Ajuste "Correção de cadastro", que acerta o saldo e não conta como perda (fora de "Perdas no período", do consumo e do giro). Corrige quem tem o Estoque em Gerenciar e alcança a unidade.
- Fonte: o Heitor (A10 da 24ª, sem data no trecho): "As duas"
- Onde: `docs/regras/atendimento.md:2694`, `:2704`
- Antes: ES-32, ES-33

**ES-16.** Desfazer, sempre com motivo obrigatório e sem apagar nada (o original fica marcado "desfeito"), por quem tem o Estoque em Gerenciar e alcança a unidade: "Desfazer entrada", enquanto nada saiu do lote dela (cria "Entrada desfeita", que não é perda nem consumo; o último custo volta ao da entrada anterior); "Desfazer ajuste", enquanto nada saiu do lote que ele mexeu; "Desfazer perda", só na perda mais nova de cada unidade (volta ao mesmo lote). O desfeito sai de "Perdas no período". A entrega do brinde não se desfaz por aqui.
- Fonte: decisão do Claude (desfazer só a perda mais nova: atribuída ao Heitor sem a fala, H12, a confirmar)
- Onde: `docs/regras/atendimento.md:2663`, `:2709`, `:2765`, `:3207`, `:3254`
- Antes: ES-31, ES-57, ES-60

### Unidade de consumo, custo e saldo

**ES-17.** O produto com unidade de consumo (ml, UI, g…) registra todo movimento e todo custo nessa unidade (o custo por unidade é o preço da embalagem dividido pelo que ela rende, com até 4 casas). Continuam em embalagens o que se digita na entrada e na transferência, o preço, o saldo, o mínimo e os lotes. O insumo aparece na unidade de consumo em toda tela, e o cadastro do procedimento mostra quanto da embalagem é a dose; a quantidade do insumo no procedimento começa em branco e é obrigatória.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:2600`, `:2776`, `:2793-2808`
- Antes: ES-34, ES-35, ES-36, ES-37

**ES-18.** O consumo, a perda, a venda e o valor em estoque usam o custo do lote de onde a quantidade saiu; a parte que nenhum lote cobre usa o último custo; o lote transferido herda o custo do de origem. A margem do catálogo usa o custo atual. Editar o produto não muda o custo: ele vem das entradas.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:2633`, `:3266`, `:3276`
- Antes: ES-38, ES-17

**ES-19.** O saldo aparece na unidade de consumo com o equivalente exato em embalagens ("268 UI · 2,68 frascos"); o mínimo, como na prateleira ("10 refis fechados + 1 aberto com 840 g"). O Histórico mostra cada movimento na unidade dele e em embalagens.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:2735`, `:2757`, `:2884`
- Antes: ES-39

**ES-20.** A situação do produto compara o rendimento com o mínimo: "Abaixo do mínimo" e "No mínimo" contam como estoque baixo. "Sem estoque" é o produto sem saldo positivo no recorte (o negativo e o que nunca entrou na unidade contam), uma conta de produtos igual no Estoque e nos Relatórios.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:2889`, `:3032`, `:3044`
- Antes: ES-40, ES-41

**ES-21.** Quem tem o Estoque em Ver vê o Valor e o Giro nos dois portais (quem não deve ver custo não recebe o módulo). O giro conta só os insumos dos atendimentos, sem a venda de produto, e a tela diz isso.
- Fonte: princípio 1
- Onde: `docs/regras/atendimento.md:3013`, `:3239`
- Antes: ES-43, ES-44

**ES-22.** O desativado com saldo continua no valor em estoque: o produto com o selo "Inativo" (desativar avisa quanto fica, sem recusar) e a unidade desativada com o selo "Unidade desativada". A unidade desativada não recebe entrada nem transferência; transferir dela, ajustar e registrar perda continuam.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:3230-3242`
- Estado: o selo está feito; o aviso ao desativar produto está decidido e ainda não implementado, porque nenhuma tela desativa produto hoje (`docs/regras/atendimento.md:3235`).
- Antes: ES-45, ES-66

**ES-23.** A tela tem os filtros de categoria, marca e fornecedor, sempre à vista ao lado da busca. Os de marca e fornecedor mostram os produtos que têm alguma entrada, não desfeita, daquela marca ou daquele fornecedor.
- Fonte: o Heitor, 13/11: "Garanta que existam os 3 filtros: categorias, marca, fornecedores." e "o filtro de marca ou fornecedor mostra os produtos que tem alguma entrada dessa marca/fornecedor"
- Onde: `docs/regras/atendimento.md:3185`, `:3187`, `docs/revisao.md:185`, `docs/revisao.md:1858`
- Antes: ES-47, ES-48

### Lotes, ajuste, perda e transferência

**ES-24.** O lote é da unidade. A saída tira primeiro do lote válido que vence antes, e os vencidos só depois; a transferência leva o lote ao destino; o vencido é sinalizado, não bloqueado. A validade é um dia: no dia da validade o lote vale, e vencido é a partir do dia seguinte, pelo dia da unidade do lote.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:2591`, `:2911`
- Antes: ES-50, ES-51

**ES-25.** Para o recall, cada lote (inclusive o esgotado) tem "Aplicado em: ver clientes": cada saída do lote para uma cliente, com a hora da conclusão e quem atendeu (ou quem vendeu) e a quantidade daquele lote. Precisa do Estoque e das Clientes. Cada atendimento do prontuário diz o que se tirou de cada lote e, a quem tem os dois, leva ao "Aplicado em".
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:1944`, `:2925`, `:2938`
- Antes: ES-53, PT-05

**ES-26.** O Ajuste é a contagem da prateleira: mostra o saldo nas duas unidades, conta em embalagem (padrão) ou consumo, mostra a conta antes de aplicar e pede "Confirmo que contei na prateleira". A sobra entra num lote escolhido (ou "Um lote novo, sem número"), ao custo dele; a falta sai do lote escolhido ("O que vence primeiro" por padrão), ao custo dele, e entra em "Perdas no período" como "Inventário". A contagem que muda o saldo em mais de 50% avisa forte, sem recusar.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:2615`, `:2650`, `:2663`, `:2721`, `:2727`
- Antes: ES-54, ES-55, ES-56

**ES-27.** A perda (Movimentar → Perda) tem o lote (ou "sem lote", que tira do que vence antes), a quantidade em embalagem ou consumo, o motivo (Vencido, Quebrou, Amostra ou Uso interno) e uma observação; é recusada se pede mais do que o lote ou o saldo têm. A perda não é consumo: fica fora do giro e do lucro, sai ao custo do lote e aparece em "Perdas no período". Entregar o brinde de produto da fidelidade é perda com o motivo "Brinde da fidelidade" (o brinde sem produto não mexe no estoque).
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:2769`, `:2849-2864`
- Antes: ES-58, ES-59, ES-61

**ES-28.** O estorno de uma venda de produto pergunta se o produto voltou: se voltou, volta ao saldo e aos mesmos lotes como "Devolução de venda"; se não, o estoque fica e a venda vira perda "Venda estornada". Nenhum dos dois entra no giro.
- Fonte: atribuída ao Heitor sem a fala (a confirmar)
- Onde: `docs/regras/atendimento.md:2874`
- Antes: ES-62

**ES-29.** A transferência entre unidades é imediata, sem confirmação do destino, em embalagens; confere o que há de verdade (o frasco aberto pelo que sobra) e recusa o que passa disso. Quem tem a unidade de origem fixa pode mandar para qualquer unidade da rede, e a tela diz isso. A nota diz os nomes das unidades, e Relatórios → Estoque mostra "Transferências entre unidades", ao custo do lote que saiu.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:2570-2587`, `:3204`, `:3272`
- Antes: ES-63, ES-64, ES-65

### Avisos

**ES-30.** O dashboard da unidade tem "Estoque no mínimo ou abaixo" e o da rede "Estoque crítico"; quem tem o Estoque vê "Lotes vencendo em 30 dias" nos dois (até três lotes, depois "e mais N"). O sino avisa quem tem o Estoque em Gerenciar na unidade quando um produto chega ao mínimo ou abaixo (a mesma régua da tela, uma vez a cada cruzamento) e avisa uma vez cada lote que vence em 30 dias.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:2955`, `:2988-3019`, `:3289-3292`
- Antes: ES-67, ES-68

## Perguntas ao Heitor

Q01. **Agenda — escritas como decisão sua, sem a sua fala: confirma?** AG-01 e AG-02 (o horário da unidade e de quem atende, "decisão do Heitor, 2026-10-21", `atendimento.md:9-10`); AG-31 (Confirmar × Chegou, `:465`); AG-15 (ficha rápida, H4 opção b, `:1473-1485`); AG-26 ("Mostrar cancelados", 2026-10-21, `:1163`); AG-32 (D20: o que a Agenda em Gerenciar faz; a falta no próprio, "agenda-06" de 02/11, `:634-636`); AG-42 (H3 opção c, `:1464-1472`); AG-44 (salas, D5, `:1337`); AG-47 (por-05, `:1028`); AG-52 ("Sem preferência", D-16, `:962-963`); AG-53 (prazo do app, 2026-10-21, `:889-891`); AG-63 (H7, `:357`); AG-34 (sessão de pacote e de plano sem documento: `docs/revisao.md:285` tem uma fala no PC2, mas a linha não diz que é sua).

Q02. **Atendimento e plano — escritas como decisão sua, sem a sua fala: confirma?** AT-08 (só se conclui o iniciado, H5 opção a e C11 de 11/11, `atendimento.md:3316`, `:1457`); AT-15 (insumo faltando não impede, 2026-09-27, `:3797`); AT-16 (o "Finalizar" leva o que está na tela, D3 de 28/10, `:3498`; a parte da ficha de atendimento, D1 de 29/10, `:3508`, não diz de quem é); AT-17 (o rascunho morre com a aba, A31 de 27/10, `:3748`); AT-03 (salvar evolução, ficha e foto pede o Atendimento E o Prontuário, "o Heitor, 2026-11-18", `:1927` — a sua fala de 18/11 fala de iniciar e concluir); PL-06 (o plano da avaliação é uma gravação só, revisão de 29/10, `:3606`); PL-11 ("Novo plano" só grava ao salvar, `:2478`); PL-22 (os gestos de quem recebe fora do "só os meus", `:2449`).

Q03. **Prontuário e fichas — escritas como decisão sua, sem a sua fala: confirma?** PT-04 (todo acesso clínico registrado, 27/10, `atendimento.md:1976`); PT-05 (a lista de quem abriu, H13 opção a, `:2005`); PT-08 (apagar a foto deixa rastro, 02/11, `:2052`); PT-09 (no app só o que a equipe envia, 30/10, `:2096`); PT-13 (a aplicação de injetáveis só no atendimento, D14, `:2113`); PT-14 (o campo planejador abre o planejamento da cliente, 29/10, `:2171`); FI-09 (os 30 dias sem nova pendente, 21/10, `:1747`); FI-11 (o profissional é avisado quando a cliente responde, 21/10, `:1751`).

Q04. **Estoque — escritas como decisão sua, sem a sua fala: confirma?** ES-08 (onde Insumo e Venda direta aparecem, D-6 de 29/10, `atendimento.md:2828`; e o preço e a comissão de venda, E9 "Decidido: mantém", `revisao.md:149`); ES-06 (SKU automático, E8, `revisao.md:148`); ES-17 (tudo na unidade de consumo, D1 de 27/10, `atendimento.md:2600-2601`); ES-27 (a perda com os quatro motivos, D-7 de 29/10, `:2849`); ES-16 ("Desfazer perda" só na mais nova, H12 opção a, `:3138`, `:3254`); ES-28 (a devolução no estorno da venda, H2 de 01/11, `:2874`).

Q05. **Procedimentos — estas estão como decisão do Claude, mas vêm de decisões das simulações (D7 da 13ª, D4 da 14ª, A20d da 25ª) e da auditoria de 18/11, sem dizer de quem são: confirma?** PC-09, PC-11, PL-15, AG-52 (a parte do app recusar quem não realiza), AG-67 (o repasse só a quem realiza).

Q06. **Falas sem data:** AG-48 (o "concordo" sobre a cliente arquivada, `atendimento.md:1035`), AG-58 (F17-3, `:799-801`), AG-16 e PL-18 ("decisão 2" da 8ª e da 9ª simulação, CLAUDE.md §11, `:1287-1288`), ES-15 ("As duas", A10 da 24ª, que também não diz a que opções responde — cobre o "Corrigir custo" e a "Correção de cadastro"?). Pode dar as datas?

Q07. **AG-32 — o "só os meus" na confirmação e na chegada:** `atendimento.md:641` diz "Confirmar e 'Chegou' seguem com quem vê a agenda de todos", mas `:479` e `:483-486` dizem que com "só os meus" a pessoa marca a chegada dos próprios, e a D20 (`docs/revisao.md:455-457`) resolve por "Gerenciar nos próprios registros". Quem tem a Agenda em Gerenciar "só os meus" confirma e marca a chegada do próprio agendamento? E remarca o próprio (`:1449-1452` ainda diz que isso "segue aberta para confirmar")?

Q08. **AG-21 e AG-32 — o "só os meus" no que se FAZ:** o Claude decidiu (princípio 1) que o "só os meus" também recorta a ação (bloquear só o próprio horário, agendar só para si), lendo a sua fala de 28/10 como sendo sobre o que se vê (`atendimento.md:254-260`, `:592-594`). Confirma?

Q09. **AG-42 — a H3:** além de não ter a fala, `docs/revisao.md:462-463` não diz com clareza se "a cliente pelo app nasce Confirmada" é sobre o agendamento novo ou sobre a remarcação. Qual é a regra?

Q10. **AG-62 — a unidade nova no "Atende":** o seu "Concord." de 14/11 foi à definição de "A rede inteira (todas, inclusive as que vierem)"; pôr a unidade nova também no "Atende" saiu da auditoria de 18/11 (antes era "nasce sem ninguém marcado", princípio 6) (`atendimento.md:345-353`). Aprova a extensão?

Q11. **AG-06 × AG-41 — o passado:** o Agendar novo recusa horário no passado (`atendimento.md:46-49`), mas o remarcar para o passado avisa e deixa (`:654-657`). As duas regras ficam diferentes de propósito?

Q12. **AG-23 — de quem é a regra da "Minha agenda" com o horário da pessoa?** Ela vem marcada só como "Reforça", item 8 da 5ª simulação (`atendimento.md:22`); não fica claro se é fala sua.

Q13. **AT-02 — o Atendimento em Ver:** o texto diz que a tela do atendimento "abre também com a Agenda em Ver" (`atendimento.md:1427-1428`). Isso bate com "Agenda é agenda e atendimento é atendimento" (18/11)? Não entrou como regra.

Q14. **AG-45 — unidade sem sala:** `atendimento.md:1341-1342` diz que o Agendar mostra "Sem sala cadastrada nesta unidade"; `:1378-1379` diz que "o campo nem aparece". Qual vale? Não entrou como regra.

Q15. **AG-37 — o motivo do cancelamento:** é "obrigatório ao cancelar" (`atendimento.md:1405`), mas no app é "Motivo (opcional)" (`:908`). O obrigatório é só para a equipe?

Q16. **PL-02 × PL-03 × PL-01 — quem monta o plano:** na PT2 você disse "quem monta o plano é quem atende, nem precisa de permissão" (`docs/revisao.md:979-981`). O texto pede o Atendimento em Gerenciar para gerar e aceitar na avaliação ABERTA (`atendimento.md:2346-2350`, `:3696`, auditoria de 18/11, sem fala sua), basta atender na unidade na avaliação CONCLUÍDA (`:3700`, `:3853`), e pede o Atendimento em Ver para o plano existir (`:2299`). Quem tem o "Atende" marcado e não tem o Atendimento monta o plano ou não?

Q17. **AT-20 — quem desiste no meio:** o texto atribui a você, 18/11, que o Atendimento "desiste no meio" (`atendimento.md:3433-3435`), mas a sua fala fala só em iniciar e concluir. Desistir é mesmo do Atendimento em Gerenciar?

Q18. **AT-03 — quem responde a ficha de saúde no atendimento:** `atendimento.md:3589` diz "quem atende com o Prontuário em Gerenciar" e, logo depois (e em `:3314`), "quem tem o Prontuário". É preciso também atender, ou basta o Prontuário em Gerenciar?

Q19. **PL-10 — o desconto aplicado aos preços no aceite:** o texto diz "decisão do Claude pelo princípio 3, 2026-11-18, levada ao Heitor" (`atendimento.md:3665`), sem resposta registrada. Concorda?

Q20. **PL-22 — receber o plano no PDV, dentro ou fora do "só os meus"?** `atendimento.md:2432-2433` põe o "receber dele no PDV" DENTRO do "só os meus", e `:2447-2449` põe os gestos de quem recebe FORA. Qual vale?

Q21. **PL-14 — o contrato no recebimento do plano:** `docs/revisao.md:1016-1018` diz que o PDV que recebe o plano sem o contrato assinado "AVISA … não recusa" (princípio 2), e `:2014` (PT1c, mais novo) diz que "não confirma o recebimento". O catálogo seguiu o mais novo; confirma?

Q22. **AT-13 e PL-05 — a sessão de pacote:** a parte da sessão de pacote (a tela "já paga", o plano opcional na sessão de pacote) estava no trecho do Plano; talvez pertença a Vendas/Pacotes. Fica aqui?

Q23. **PC-09 — dois jeitos de "só nesta unidade":** o procedimento local da unidade (`atendimento.md:1518`, `:1674-1685`) e o "Em quais unidades" (`:1538-1547`). Os dois valem? A consulta descrita em `:1674-1685` não aplica nem "Em quais unidades" nem o preço da unidade.

Q24. **PC-11 — o plano antigo com procedimento que a unidade não faz:** ele fica à vista, mas o servidor recusa gravar o plano com ele (`atendimento.md:1557-1560`). Então ele só se salva tirando o item. Está certo assim?

Q25. **PC-03 — a comissão do procedimento:** a sua fala de 18/11 é geral ("Configuração da rede toda só pela conta admin"); que a comissão do procedimento é configuração da rede toda vem da lista do Claude no CLAUDE.md §11. Confirma?

Q26. **PC-14 × AG-52 — quem não realiza o procedimento:** na agenda da equipe só avisa; no app da cliente é recusado. A regra é sua ou do Claude?

Q27. **PC-07 — onde mora a regra dos documentos do procedimento:** ela não está em `docs/regras/atendimento.md` §9.3, só na revisão (e, presume-se, em `docs/regras/documentos.md`). A §9.3 deve apontar para ela?

Q28. **ES-05 — "Seringa" e o rótulo do Novo produto:** estão em §9.3 (Procedimentos, `atendimento.md:1633-1643`), mas são do Estoque. Mudam para §9.5?

Q29. **ES-27 — a perda fora do giro e do lucro:** `atendimento.md:2860-2861` diz "(decisão para o Heitor)". Você decidiu, ou a decisão ainda está com você?

Q30. **ES-02 e ES-22 — editar e desativar produto:** a sua fala de 13/11 diz "Quem cadastra é só quem tem permissão de gerenciar"; o texto (`atendimento.md:3102`) estendeu a mesma regra a editar e desativar. Confirma? E, como hoje nenhuma tela desativa produto (`:3235-3238`), desativar produto está no escopo da tela?

Q31. **ES-29 — transferir para fora das próprias unidades:** quem tem a unidade de origem fixa transfere para qualquer unidade da rede, inclusive fora das dela (`atendimento.md:3205-3206`, A12 da 15ª). Confirma?

Q32. **ES-30 — quem recebe o aviso do lote que vence:** quem tem o Estoque em Gerenciar, como no mínimo, ou quem tem o Estoque em Ver? (`atendimento.md:2994` contra `:3005`)

Q33. **Vocabulário nas telas:** os textos "Escolha a profissional e a data para ver os horários livres." (`atendimento.md:124`), "Trocar a profissional de A para B?" (`:606`), o motivo "Profissional desativada (Débora)" (`:404`) e "Esta profissional não realiza este procedimento." (`:1651-1654`) usam "a profissional" no feminino fixo, o que a A23 da 22ª corrigiu em outro texto (`:533-535`). Corrige-se?

## Divergências

O texto de `docs/regras/` (ou do CLAUDE.md) contra a decisão mais nova — para corrigir o texto depois.

- AG-16, AG-61: CLAUDE.md §11 ("O 'Atende' é por unidade") e `docs/regras/atendimento.md:283-297` descrevem o "Atende" como um checklist de unidades; `docs/revisao.md:1198-1199` e `:2055` (EQ1c, 14/11) decidiram "o 'Atende' é UMA caixa", com a lista só em "Escolher em quais unidades atende" (`atendimento.md:298-307` já diz a regra nova).
- AG-61: `docs/regras/atendimento.md:409`, `:416`, `:631-632` e `:1486-1491` chamam o controle de "Atende clientes em", e `:433` de "Atende clientes"; depois do EQ1c o controle é "Atende" + "Escolher em quais unidades atende".
- AG-41: `docs/regras/atendimento.md:642-647` (02/11) diz que o choque no remarcar é "Só aviso: o remarcar continua"; `:212-214` (06/11, mais nova) diz que o remarcar com choque é recusado. O catálogo usou a mais nova.
- AG-49: `docs/regras/atendimento.md:1042-1044` diz que o cartão do pacote manda "agende com a equipe" quando o procedimento está "fora do app, inativo ou de outra unidade"; `:1305-1315` (14/11) decidiu que a sessão comprada se agenda pelo app mesmo fora do app, e que só o procedimento inativo fica com a equipe.
- AG-32: `docs/regras/atendimento.md:1449-1452` diz que o "só os meus" + Gerenciar remarcando o próprio "segue aberta para confirmar"; `docs/revisao.md:455-457` e `:1902` a dão por resolvida pela regra das permissões (D20), com a Agenda aprovada em 13/11 ("a pagina da agenda ta boa e as funcoes me parecem boas").
- AT-11: `docs/regras/atendimento.md:3364` diz que o concluído a receber aparece "na agenda, no Fechamento do dia e na ficha"; `docs/revisao.md:1936` (CX3, 16/11) decidiu que os "Concluídos a receber" viram as comandas abertas do PDV (sai a lista à parte).
- AT-08: `docs/regras/atendimento.md:3327` e `:3360` dizem que o "Concluído" da agenda "só lança a conta a receber, se faltar"; pelo PDV3/PDV7/CX3 (`docs/revisao.md:1919`, `:1923`, `:1936`) a cobrança é a comanda nascida no início. O texto devia dizer o que o "Concluído" faz hoje com a comanda.
- PL-10: `docs/regras/atendimento.md:3672` e `:3677` ainda falam no "checkout do plano" (a dica diz que o desconto "vai pronto ao checkout do plano"); `docs/revisao.md:969-971` (PT1 revisto) e `:1920` (PDV4 revisto) tiraram o "Fechar checkout": o plano se recebe na comanda dele, no PDV.
- FI-02, FI-13: `docs/regras/atendimento.md:1781` cita o texto do link "X já preencheu a sua ficha de pré-atendimento. Confira as respostas."; `docs/revisao.md:1981` (PR3) tirou "pré-atendimento" de todo texto que se lê. Ou o texto da regra está velho, ou a tela ainda diz isso.
- PT-06, PT-09: `docs/regras/atendimento.md:2098` diz "Na aba Documentos da ficha, 'Enviar à cliente'…" para todo anexo; `docs/revisao.md:1977` (PR1b) e `atendimento.md:2519` põem o anexo clínico (e o enviar dele) em "Anexos clínicos" da aba Prontuário.
- PL-22: `docs/regras/atendimento.md:2449` diz que os gestos de quem recebe pedem o caixa "não a agenda"; desde 18/11 o plano é do Atendimento (`:2295`) — devia dizer "não o Atendimento".
- PT-05: `docs/regras/atendimento.md:2007` justifica a regra pela H7 (o controle da rede toda é de quem é da rede); a H7 foi trocada em 18/11 por "Configuração da rede toda só pela conta admin" (CLAUDE.md §11). A lista é leitura, então a regra pode continuar, mas a justificativa escrita está velha.
- PC-01: `docs/regras/atendimento.md:1520-1521` põe entre aspas, como fala do Heitor de 13/11, "Sai a exigência de ser da rede"; esse texto é do Claude (`docs/revisao.md:1866`). A fala do Heitor é "sim, só quem tem permissão de gerenciar" (`docs/revisao.md:241`).
- PC-07: a regra dos documentos do procedimento não está em `docs/regras/atendimento.md` §9.3 (ver Q27).
- ES-05: "Seringa" e o rótulo do Novo produto estão em §9.3 (`docs/regras/atendimento.md:1633-1643`), e são do Estoque (§9.5) (ver Q28).
- ES-14: `docs/regras/atendimento.md:3280` (C16) diz que a Entrada do leitor tem "fornecedor da lista", sem marca; `docs/revisao.md:1857` (E14) decidiu que toda entrada pede marca e fornecedor (a linha 3168 já põe os dois).
- ES-08: `docs/regras/atendimento.md:2838-2840` e `:2843-2844` ainda falam em "produto de revenda" e em "revenda e 'os dois'"; `docs/revisao.md:137` e `:1854` (E2) trocaram para os checkboxes "Insumo" e "Venda direta".
- ES-30: `docs/regras/atendimento.md:2994` diz que o lote vencendo avisa "a quem responde pelo Estoque na unidade", que não é uma permissão (CLAUDE.md §1, 13/11); a linha 3005 usa "quem tem o Estoque em Gerenciar" para o mínimo (ver Q32).
- ES-25: `docs/regras/atendimento.md:2931` diz "a profissional" (nome de cargo) e "o dia e a hora marcados", mas o próprio texto, em `:2943-2949`, mudou isso para a hora da conclusão.

## Ficou fora do catálogo

Detalhe de tela sem decisão de produto, texto exato, ou implementação.

- AG-12: o X do segundo período e o botão "Sem pausa" no editor de horário (detalhe do editor).
- AG-13: o editor de horário diz o horário em texto antes de salvar (texto da tela).
- AG-27: como o bloqueio se desenha na grade do dia e na agenda da rede (desenho).
- AG-28: como o bloqueio aparece na Semana e na "Minha agenda" (desenho).
- AG-38: para onde a grade do dia rola ao trocar de dia (rolagem).
- AG-42: a agenda e o Financeiro mostram o nome de quem é de outra unidade (correção de exibição).
- AG-43: a grade da rede desenha a duração e corta o texto (desenho).
- AG-54: o texto "Ninguém atende nesta unidade ainda" e a contagem no cartão da unidade (texto).
- AG-69: o cancelado mostra o motivo inteiro na janela e na dica (exibição).
- AG-73: qual botão é o principal na janela do agendamento (desenho).
- AG-80: o texto do atraso no início ("Atrasado: 57 min…"; nada se grava) (texto).
- AG-116: o agendamento novo aparece na ficha sem recarregar (implementação).
- AG-121: o dia no endereço da agenda e os avisos de resultado (implementação/tela).
- AG-122: o que a janela do agendamento mostra (duração, sala, unidade) (exibição).
- AG-123: a dica e as linhas do cartão da grade (desenho).
- AG-124: o desenho do cartão da "Minha agenda" e no celular (desenho).
- AG-125: clicar num espaço vazio da coluna já traz o profissional (atalho de tela).
- AG-142: a sessão com vários procedimentos lista todos, até três (exibição).
- AG-144: a duração prevista na tela é a do agendamento (exibição).
- AG-163: para qual unidade o app leva o pedido de assinatura e o aviso de pontos (roteamento).
- AG-167: o app agrupa os horários em Manhã/Tarde/Noite e diz quando cada um atende (exibição).
- AG-185: os avisos não decidem o gênero pelo nome do procedimento (texto).
- AG-188: o texto da seção "Como foram os seus atendimentos?" (texto).
- AT-17: o texto da busca de insumo sem resultado (texto).
- AT-23: o campo se chama "Evolução" em toda a tela do atendimento (nome de campo, decisão do Claude).
- AT-24: a janela do "Finalizar" não repete o que já está na tela (desenho).
- AT-28: como a tela aponta as obrigatórias vazias ("Faltam N respostas…") (desenho).
- AT-45: no celular, a ação principal fica numa barra no rodapé (desenho).
- PT-34: o primeiro ponto do mapa nasce sem produto; "Região (opcional)" (detalhe do mapa).
- PT-39: a linha que explica cada botão da folha de injetáveis (texto).
- PC-22: o nome do insumo aparece inteiro no seletor (exibição).
- ES-28: a Entrada lembra a nota e o fornecedor por 2 horas (conveniência de tela).
- ES-29: os textos de confirmação de entrada, perda e ajuste (texto).
- ES-42: as colunas "TOTAL REDE" e "ESTOQUE POR UNIDADE" (colunas da tabela).
- ES-46: a tela vazia "Nenhum produto cadastrado" (estado vazio).
- ES-49: o botão "Movimentar" e a unidade já marcada pelo filtro (nome de botão e atalho).
- ES-52: o que a linha aberta do produto lista dos lotes e "Ver lotes esgotados" (exibição).

## É de outra área

- AG-62: a Equipe da unidade lista quem é de fora e atende ali (é a tela da Equipe — `docs/regras/plataforma.md`).
- AG-63: a Admin da rede cadastra outra Admin direto pelo "Adicionar membro" (regra da Equipe/cargos — `docs/regras/plataforma.md`; fonte: o Heitor, 2026-11-02).
- AG-64: trocar o cargo de quem é Admin da rede pergunta antes; a própria e a última não são rebaixadas (regra da Equipe/cargos — `docs/regras/plataforma.md`).
