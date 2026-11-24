# Catálogo de regras — Plataforma, Equipe, Cargos e Configurações

Este é o catálogo das regras que valem HOJE para a plataforma (o app sistema e quem o opera, o suporte e os chamados), a assinatura e a rede bloqueada, o plano e os adicionais, a criação da rede e o /setup, as unidades, o login e a entrada no portal, a Equipe, os Cargos, as Configurações e a Auditoria. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta ou a escolha dele), um dos sete princípios de produto, "decisão do Claude". "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/plataforma.md:1-439`; KB: `:440-825`; KC: `:804-1187`; KD: `:1188-1524`, com o "O que nunca fazer aqui", que repete regras das seções de cima; KE: as decisões de `docs/revisao.md`, do CLAUDE.md e dos outros arquivos de `docs/regras/`, que repetem várias de `plataforma.md` — juntas aqui, com todos os "Onde"). É um RASCUNHO para o Heitor revisar. Contagem: 174 regras (O sistema 9, O suporte 16, A assinatura 20, O plano 22, A criação da rede 4, As unidades 14, O login e a entrada 6, A Equipe 18, Os Cargos 25, As Configurações 11, A Auditoria 29), 4 perguntas e 17 divergências. Dos 225 números do rascunho, nenhum ficou fora do catálogo e 17 são de outra área (ver os apêndices); todos os outros estão num "Antes". Das perguntas dos rascunhos: as "escritas como suas, sem a fala" viraram a Q01 (plataforma), a Q02 (assinatura) e a Q03 (equipe e cargos); a de quem vê a fatura e o "Pagar" (KA-15) e a da aba Assinatura e do aviso (Q2 da KB) tinham resposta na regra de 18/11 — a aba Assinatura é aba da rede toda e o adicional está na lista dela —, e o que ainda dá isso a quem tem "A rede inteira" com as Configurações em Gerenciar está em "Divergências"; a do "Atende" na unidade nova (KC-20) tinha resposta na caixa única do "Atende" (EQ1) e na regra de 23/11 (UN-12); a da entrada da cliente na Auditoria (KD-05) tinha resposta no CF3 aprovado, que diz "entradas no sistema (login)" sem recorte (AD-04); a dos modelos de cargo (KC-15) continua, porque a revisão não traz a fala (Q03); e só os chamados dos colegas ficaram como pergunta de verdade (Q04), porque a lista da configuração da rede toda não os cita.

## O app sistema e quem o opera (SI)

**SI-01.** A equipe do BellarisOS (a plataforma) trabalha fora do app da rede, em dois apps com endereço próprio: o sistema (admin.bellarisos.com: painel, redes, planos, cobrança, equipe e auditoria da plataforma, configurações) e o suporte (suporte.bellarisos.com: chamados, consulta e diagnóstico das redes, reenviar acesso, reativar membro e o "entrar como").
- Fonte: decisão do Claude (mantida na revisão: "Mantém: os dois apps…")
- Onde: `docs/regras/plataforma.md:10-17`; `docs/revisao.md:1572`, `:2165`
- Antes: KA-01

**SI-02.** Cada pessoa da plataforma tem um papel: o ADMIN administra o sistema (é o único que grava nele) e atende no suporte; o SUPORTE só atende no suporte. Papel novo não alcança nada até ser incluído na regra.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:30-37`
- Antes: KA-02

**SI-03.** O papel GERENTE da plataforma vê o sistema inteiro e não edita nada: as telas mostram o aviso "Só para ver", com os controles travados, sem "Nova rede" nem o link para o suporte. O GERENTE não entra no suporte nem abre sessão de suporte numa rede.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "pedido do Heitor, 2026-10-07"
- Onde: `docs/regras/plataforma.md:38-44`, `:1500-1502`
- Antes: KA-03, KD-39

**SI-04.** Quem é da plataforma não é membro de rede, e cada endereço só aceita os seus: a sessão de quem não é daquele app (membro de rede, cliente, SUPORTE no sistema) é desfeita e volta ao login. O app da rede recusa a pessoa da plataforma e diz que a equipe da plataforma entra pelo endereço dela.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:24-29`, `:45-51`, `:63-67`
- Antes: KA-04

**SI-05.** A verificação em duas etapas da plataforma é uma opção do ADMIN em Configurações do sistema, e nasce desligada. Ligada, todos verificam; desligada, quem já cadastrou um autenticador verifica mesmo assim, e quem não tem entra só com a senha (pode cadastrar quando quiser; "Agora não" volta ao painel). Se o sistema não consegue ler a opção, exige. Mudar a opção fica na auditoria da plataforma.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "decisão do Heitor, 2026-10-06"
- Onde: `docs/regras/plataforma.md:83-96`
- Antes: KA-07

**SI-06.** Cada app da plataforma tem a sua sessão: o ADMIN entra nos dois, com uma sessão (e, com autenticador, um código) em cada, e não há atalho de um para o outro — cada um se abre pelo seu endereço.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "o seletor saiu em 2026-10-06, a pedido do Heitor"
- Onde: `docs/regras/plataforma.md:97-100`
- Antes: KA-08

**SI-07.** Tudo o que a plataforma faz fica registrado na auditoria da plataforma, que só acrescenta — inclusive abrir o painel de uma rede ou um chamado. O que ela fez numa rede, a rede vê (SU-11).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:115-119`
- Antes: KA-09

**SI-08.** O primeiro ADMIN da plataforma nasce pelo e-mail configurado no ambiente, só pelo login do sistema e só com o e-mail confirmado; sem conta ainda, o "Esqueci minha senha" do sistema cria o login. O app da rede não promove ninguém, e membro de rede com esse e-mail não é promovido. As pessoas seguintes (SUPORTE, GERENTE ou ADMIN), o ADMIN cadastra na Equipe do sistema; e-mail de membro de rede é recusado.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:126-133`
- Antes: KA-12

**SI-09.** Ninguém digita senha ao cadastrar uma pessoa da plataforma: o login nasce sem senha, e o convite (o e-mail de definir senha) leva ao app do papel dela. E-mail que não saiu (o convite, o reenviar acesso) nunca aparece como "enviado": a tela avisa e o cadastro fica. O "Reenviar convite" da linha (só o ADMIN, só para pessoa ativa) manda de novo e fica na auditoria.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:134-140`, `:1491`
- Antes: KA-13, KD-34

## O suporte: entrar como, a sessão e os chamados (SU)

**SU-01.** O suporte só entra na conta de um membro com a autorização da rede ainda válida para aquela conta: por 24 h, 72 h ou 7 dias, uma por pessoa. Quem autoriza é só a Admin da rede, para qualquer membro (ela mesma e outra Admin, inclusive), em Configurações → Suporte ou pelo chamado, e ela escolhe se inclui os dados clínicos.
- Fonte: decisão do Claude (2026-11-18), aplicando a regra do Heitor de 18/11: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/plataforma.md:537-544`, `:553-554`, `:1004-1009`, `:1493`, `:1498-1499`; `docs/revisao.md:1582-1586`; CLAUDE.md §11 (`:759-761`)
- Antes: KB-18, KD-35, KD-36, KE-29, KE-54

**SU-02.** Autorizar pelo chamado é só da Admin da rede: o "Autorizo o suporte…" ao abrir aparece só para ela, e a outra pessoa lê "Se o suporte precisar entrar na sua conta, quem autoriza é a Admin da rede.". Na conversa, o "Autorizar por 72 h" autoriza a conta de quem abriu o chamado; revogar ali é de quem abriu e da Admin da rede.
- Fonte: decisão do Claude, aplicando a regra do Heitor de 18/11: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/plataforma.md:678-685`
- Antes: KB-30

**SU-03.** O suporte nunca se autoriza: "Pedir autorização" manda uma mensagem do sistema na conversa e um aviso no sino, e quem decide é a rede.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:686-687`, `:1498-1499`
- Antes: KB-31, KD-36

**SU-04.** Revogam a autorização a própria pessoa (a conta é dela) e a Admin da rede. A pessoa vê e revoga a autorização da conta dela na Ajuda da topbar, no topo da lista dos chamados ("O suporte está autorizado a entrar na sua conta até …" e "Revogar") — também a que a Admin deu em Configurações → Suporte.
- Fonte: decisão do Claude (PLAT-05, varredura de 18/11)
- Onde: `docs/regras/plataforma.md:545-555`, `:1498-1499`
- Antes: KB-19, KD-36

**SU-05.** A sessão de suporte dura no máximo 60 minutos e nunca passa do fim da autorização. Revogar ou trocar a autorização (por exemplo, re-autorizar sem os dados clínicos) derruba a sessão que corria nela já na próxima tela; desativar o atendente derruba a dele.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:556-558`, `:601-606`, `:647-648`
- Antes: KB-20

**SU-06.** Na sessão de suporte, tudo o que fica gravado leva o nome do membro com a marca do suporte ("Ana (via suporte: Heitor)"), e cada tela aberta e cada ação ficam registradas.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:576-582`
- Antes: KB-21

**SU-07.** Sem os dados clínicos na autorização, o suporte não vê o prontuário nem os anexos clínicos da cliente.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:579-580`, `:583-587`; `docs/revisao.md:1585`
- Antes: KB-22, KE-54

**SU-08.** Durante a sessão de suporte, a senha, o e-mail, o telefone e os fatores de acesso do membro não mudam, e o suporte não registra aparelho para os avisos no celular.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:586-591`, `:624`
- Antes: KB-23

**SU-09.** Na conta da rede, o suporte não faz o que fica valendo depois do prazo da autorização: não cadastra membro, não muda cargo, abrangência ou a matriz de um cargo, não desativa nem reativa membro, não apaga cargo e não mexe na assinatura (nem contrata adicional). O que ele não faz com os documentos (colher, marcar no papel, dispensar) é a DQ-08 (Documentos).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:406-407`, `:630-643`, `:1494`
- Antes: KB-25, KD-37

**SU-10.** O "Sair" do aviso do suporte encerra a sessão, tira o atendente da conta do membro e o leva de volta ao painel do suporte, onde ele segue logado. Um link de outro site não tira o membro da conta dele.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:644-650`
- Antes: KB-26

**SU-11.** O suporte entrar e sair de uma conta avisa no sino a pessoa da conta e a Admin da rede, e a Admin vê em Configurações → Suporte (aba da rede toda) cada sessão, o que foi aberto e feito nela e o que a plataforma fez na rede.
- Fonte: decisão do Claude (a aba Suporte é da rede toda: a regra do Heitor de 18/11, "Configuração da rede toda só pela conta admin")
- Onde: `docs/regras/plataforma.md:115-119`, `:551-552`, `:658-660`
- Antes: KB-27, KA-09

**SU-12.** O diagnóstico de uma rede no suporte não mostra segredo nem dado de cliente: das caixas e integrações, só o estado; dos fatos do sistema, só o nome, o registro, quem fez e a hora.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:123-125`
- Antes: KA-11

**SU-13.** O membro da rede abre o chamado pela Ajuda da topbar; o suporte atende em Chamados, a primeira aba do app do suporte, com o número de abertos, e a fila se atualiza sozinha.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:670-672`, `:695-699`; `docs/revisao.md:1582-1583`
- Antes: KB-28

**SU-14.** O chamado já leva quem abriu, o cargo, a unidade e a rede (pela sessão), mais a tela, o tamanho da janela e o navegador. O print anexado é PNG ou JPEG de até 5 MB.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:673-677`
- Antes: KB-29

**SU-15.** A nota interna do suporte nunca aparece para a rede. A resposta do suporte assume o chamado e avisa no sino com um texto genérico; o "Ver a resposta" do sino abre a Ajuda naquele chamado.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:688-691`, `:1498`
- Antes: KB-32, KD-38

**SU-16.** O chamado é visto por quem o abriu e por quem responde pela conta da rede (quem é: Q04); o colega recebe "não encontrado", e a cliente nunca o alcança.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:692-694`
- Antes: KB-33

## A assinatura, as faturas e a rede bloqueada (AS)

**AS-01.** A mensalidade é o total — o plano e os adicionais, cada um já com a sua cortesia ou o seu desconto —, e o Asaas recebe esse total ao ligar a cobrança e a cada mudança; a fatura em aberto muda junto.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:419-428`, `:1485`
- Antes: KA-51, KD-32

**AS-02.** A assinatura no Asaas é mensal, e a rede escolhe pagar por Pix, boleto ou cartão. O teste grátis não passa pelo Asaas: a primeira cobrança vence no fim dele.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:505-509`
- Antes: KB-13

**AS-03.** A mensalidade da rede é zero ou pelo menos R$ 5,00 (o mínimo do Asaas); um valor entre os dois é recusado, venha de onde vier a mudança.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:445-446`, `:471-473`
- Antes: KB-04

**AS-04.** Se a mudança feita pela rede não chega à cobrança na hora, a rede é avisada ("chega à cobrança em até uma hora") e o sistema leva o valor depois, sozinho.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:429-434`
- Antes: KA-52

**AS-05.** A equipe da plataforma, no sistema, dá cortesia (de graça) ou desconto a qualquer item da assinatura da rede (o plano, as conexões de WhatsApp extras, o Copilot avulso). O desconto é em percentual (de 1 a 100) ou em reais, e a data de fim é opcional (vale até o fim daquele dia).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/plataforma.md:440-449`
- Antes: KB-01

**AS-06.** A rede que tem plano e nada a pagar — por cortesia, por 100% de desconto, por desconto do tamanho do preço ou por preço zero — fica ativa e sem cobrança, nunca suspensa: o atraso que havia é perdoado e a cobrança que estava ligada é pausada (não conta como cancelamento).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "ativa, sem cobrança, nunca suspensa" é dado como dele; contar o 100% e o preço zero como cortesia é decisão do Claude (verificação de 2026-10-07)
- Onde: `docs/regras/plataforma.md:442-447`, `:456-464`
- Antes: KB-02

**AS-07.** Quando a rede volta a ter o que pagar (a cortesia acabou, ela contratou algo pago, o plano mudou), a cobrança religa sozinha, com o primeiro vencimento em 3 dias. Se não der para religar (falta CPF/CNPJ, o Asaas recusou), a rede fica "sem cobrança", o caso fica registrado e quem pediu a mudança vê o erro.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:444-447`, `:465-470`
- Antes: KB-03

**AS-08.** Trocar de plano tira a condição (cortesia ou desconto) do plano — a cortesia num plano não deixa o outro de graça —; as condições dos adicionais ficam. Tirar um adicional tira a condição dele, e a rede sem plano não tem condição nenhuma.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:446-447`, `:474-475`, `:480-481`
- Antes: KB-05

**AS-09.** No dia seguinte à data de fim, a condição sai sozinha, fica registrada, e a cobrança passa ao preço normal na mesma passagem.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:476-479`
- Antes: KB-06

**AS-10.** A rede vê cada condição na aba Assinatura, em "Condições do BellarisOS", com o preço cheio riscado e o que fica a pagar.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "a rede vendo a condição"
- Onde: `docs/regras/plataforma.md:443-444`, `:482-483`
- Antes: KB-08

**AS-11.** A rede fica em atraso quando tem fatura em aberto com o vencimento passado. Só pagar (ou o Asaas remover a cobrança vencida) tira do atraso; a fatura paga não volta a vencida por um aviso atrasado do Asaas; a assinatura cancelada não volta sozinha. O dia do pagamento é o de São Paulo.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:486-497`
- Antes: KB-09

**AS-12.** Estorno e contestação de uma fatura ficam registrados, mas não mudam a situação da rede sozinhos: quem decide é a equipe da plataforma.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:491-492`, `:498-500`
- Antes: KB-10

**AS-13.** No sistema, "Marcar em dia" e "Estender teste" perdoam o atraso até o dia escolhido: um aviso do Asaas que chegue depois não traz o atraso antigo de volta nem suspende a rede.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:494-496`
- Antes: KB-11

**AS-14.** O teste vencido sem pagamento põe a rede em atraso, contado do fim do teste; em atraso por mais dias que a carência da plataforma, a rede é suspensa.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:501-504`; `docs/revisao.md:1593-1594`
- Antes: KB-12

**AS-15.** A assinatura, na rede, é só da Admin da rede: Configurações → Assinatura (aba da rede toda) mostra a ela o plano — cada funcionalidade, dentro ou fora, e o uso de cada limite ("2 de 3") —, as condições, as faturas e o "Pagar"; para os outros, a aba diz "Esta configuração é só da Admin da rede.". Na sessão de suporte o "Pagar" some.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin" (a aba Assinatura é uma das abas da rede toda, e o adicional da assinatura está na lista)
- Onde: `docs/regras/plataforma.md:329-330`, `:517-519`, `:750-757`; CLAUDE.md §11 (`:753-760`); `apps/web/lib/configuracoes/abas.ts:132-133`, `:238`
- Antes: KA-39, KB-16

**AS-16.** A Admin da rede vê um aviso no topo do portal quando o teste acaba em 7 dias ou menos, e, com a rede em atraso, a data da suspensão e o link da fatura. A sessão de suporte não vê o aviso.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin" (é o aviso da assinatura, AS-15)
- Onde: `docs/regras/plataforma.md:517-520`
- Antes: KB-15

**AS-17.** Toda mudança na situação da assinatura (em atraso, suspensa, paga de novo) avisa no sino a Admin da rede, e a mudança automática (do Asaas ou das regras de tempo) fica na auditoria da plataforma, sem pessoa.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin" (é o aviso da assinatura, AS-15)
- Onde: `docs/regras/plataforma.md:514-516`
- Antes: KB-14

**AS-18.** No teste grátis, a aba Assinatura e o aviso do topo dizem quantos dias faltam: "Período de teste até 18/12/2026 — termina em 30 dias"; no penúltimo dia, "termina amanhã"; no último, "termina hoje"; depois dele, nada. A conta é em dias de calendário no horário de Brasília (a hora do dia não muda o número), o último dia conta inteiro, e a aba e o aviso usam a mesma conta.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-18 (A30 da 25ª simulação): "Mostra" — usar o horário de Brasília e não o da unidade é decisão do Claude pelo princípio 3
- Onde: `docs/regras/plataforma.md:521-533`
- Antes: KB-17

**AS-19.** A rede fica bloqueada quando o ADMIN do sistema a desliga à mão (abuso, pedido) ou quando a assinatura está suspensa ou cancelada. A desligada à mão só a plataforma religa: a cobrança nunca a religa.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:148-151`, `:1510`
- Antes: KA-14, KD-41

**AS-20.** Com a rede bloqueada, toda página e ação da equipe e o portal da cliente levam à tela "conta suspensa": a Admin da rede vê a fatura em aberto e o "Pagar" (fora da sessão de suporte); os outros membros, o aviso para falar com quem administra a rede; a cliente, "Portal indisponível".
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin" (o "Pagar" é o da aba Assinatura, AS-15)
- Onde: `docs/regras/plataforma.md:152-158`
- Antes: KA-15

## O plano, as funcionalidades, os limites e os adicionais (PN)

**PN-01.** O plano define o que a rede usa: as funcionalidades (cada uma ligada ou desligada) e os limites (unidades, membros, números de WhatsApp, a cota do Copilot; de 1 a 10 ou ilimitado). O teste grátis tem tudo, menos o Copilot.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "2026-10-06, decisão do Heitor"; e "Fica como está", revisão de 13/11, fora das aspas
- Onde: `docs/regras/plataforma.md:273-278`; `docs/revisao.md:1572`, `:1587-1594`, `:2165`
- Antes: KA-28, KE-53

**PN-02.** Os planos ficam num catálogo do sistema que não se apaga (o plano se desativa). A rede guarda o retrato do valor que assinou: pode ter preço especial, e o catálogo novo não muda o valor de quem já assina.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:269-272`
- Antes: KA-27

**PN-03.** O que o plano dá à rede é um retrato, que só muda quando o plano da rede muda ou quando o sistema usa "Aplicar a versão atual do plano"; trocar só o valor não traz a versão nova do plano.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:283-286`
- Antes: KA-30

**PN-04.** A rede sem plano tem tudo liberado.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:279-282`
- Antes: KA-29

**PN-05.** O PDV e a Auditoria são de todo plano: nenhuma funcionalidade do plano os liga ou desliga — nem o teste grátis, nem o retrato da rede bloqueada que volta, os tira. (O PDV em todo plano está também na PV-05, Vendas e financeiro.)
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim" (PL1)
- Onde: `docs/regras/plataforma.md:338-346`, `:1243-1244`, `:1480`; `docs/revisao.md:1572`, `:1596-1600`, `:2164`
- Antes: KA-40, KD-04, KE-52

**PN-06.** A funcionalidade fora do plano que é um módulo inteiro fica "Sem acesso" para todos, inclusive a Admin da rede; somem também as abas de Relatórios dele e a linha dele na tela de Cargos.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:287-291`
- Antes: KA-31

**PN-07.** A funcionalidade fora do plano que é parte de um módulo (pacotes, pré-pago, planos de tratamento, inbox, oportunidades, templates, campanhas, anúncios, comissões, o planejador de injetáveis, as fichas de atendimento personalizadas) some do menu, das abas de Configurações e da busca, e criar ou alterar é recusado. O que roda sem tela (automações, campanhas, avisos no celular da cliente, API de Conversões) também respeita o plano.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:292-301`
- Antes: KA-32

**PN-08.** Sem o portal da cliente no plano, a cliente vê "Portal indisponível".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:298`
- Antes: KA-33

**PN-09.** O que está fora do plano some também de dentro das outras telas: no inbox, o painel da conversa esconde as oportunidades (sem oportunidades) e o "Agendar" (sem agenda); a busca não traz conversa, oportunidade nem pacote fora do plano; o atendimento não oferece montar plano de tratamento sem os planos de tratamento; sem os injetáveis, o construtor de fichas não oferece o campo do planejador, e esse campo nas fichas que já o têm fica só para ver; sem as fichas de atendimento personalizadas, a aba Fichas some e criar ou editar ficha é recusado (as que já existem seguem no atendimento).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:304-311`
- Antes: KA-34, KA-35

**PN-10.** O plano trava criar e alterar, não ler nem o que já foi vendido: a ficha da cliente continua mostrando os pacotes e planos que existem, e a sessão de um pacote vendido continua se agendando.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:334-336`
- Antes: KA-37

**PN-11.** Os limites do plano contam os ativos e valem ao criar e ao reativar unidade, membro e número de WhatsApp (também quando há dois cliques ao mesmo tempo); a tela diz o limite. O que já está acima do limite não é apagado, só não cresce; editar o que existe não confere o limite. A Admin da rede conta como membro. (Os caminhos de ligar um número: WN-08.)
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:312-328`
- Antes: KA-38

**PN-12.** As funcionalidades do plano têm os nomes da revisão — "Documentos (assinatura eletrônica)", "Fichas de atendimento personalizadas", "Portal e app da cliente" —, os mesmos no sistema, na aba Assinatura, no comparativo e no site.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim" (PL1)
- Onde: `docs/regras/plataforma.md:347-352`; `docs/revisao.md:2164`
- Antes: KA-41

**PN-13.** No topo da tela de Planos do sistema, o comparativo mostra lado a lado tudo o que cada plano inclui — preço, funcionalidades por grupo, limites e adicionais à venda —; item novo do catálogo aparece sozinho. Só lê (o GERENTE vê). No celular é um bloco por linha, sem rolagem lateral; no computador, os nomes dos planos ficam presos no topo.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:363-371`
- Antes: KA-42

**PN-14.** Os adicionais são as conexões de WhatsApp além do limite e o Copilot avulso, somados à mensalidade numa assinatura só. O preço de cada adicional mora no plano, e contratam tanto o sistema quanto a rede.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "Do Heitor: o preço de cada adicional mora no plano, contratam o sistema E a rede, o valor soma na mensalidade e o Copilot avulso já se vende"
- Onde: `docs/regras/plataforma.md:372-376`
- Antes: KA-43

**PN-15.** Cada plano oferece ou não cada adicional (sem preço = não oferece). A oferta vale pelo plano do catálogo: oferecer depois vale para quem já o assina. WhatsApp extra só em plano com limite de números; Copilot avulso só em plano que não inclui o Copilot.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:380-387`
- Antes: KA-44

**PN-16.** As quantidades: conexões de WhatsApp extras, de 0 para cima, sem teto; Copilot avulso, 0 ou 1. Tirar uma conexão só se os números ativos ainda cabem.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:392-395`
- Antes: KA-45

**PN-17.** No app da rede, só a Admin da rede contrata adicional; a sessão de suporte não contrata, e a rede cancelada também não. Cada mudança vai à auditoria da plataforma, com a origem.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/plataforma.md:403-408`, `:750-757`; CLAUDE.md §11 (`:753-760`)
- Antes: KA-46

**PN-18.** O preço do adicional é retratado ao contratar: aumentar a quantidade mantém o preço contratado, e mudar o preço no catálogo vale só para quem contratar depois. A rede contrata sempre pelo preço do plano; o sistema pode dar preço especial (cortesia, desconto).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:388-397`
- Antes: KA-47

**PN-19.** O item com preço especial dado pela plataforma (cortesia ou desconto, no plano ou num adicional) a rede pode cancelar, mas não aumentar a quantidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:398-402`, `:480-481`, `:1484`
- Antes: KA-47, KB-07, KD-33

**PN-20.** Com a cobrança ligada, nenhum adicional deixa a mensalidade em R$ 0: encerrar a cobrança é com o BellarisOS.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:400-402`
- Antes: KA-48

**PN-21.** O que a rede usa é o efetivo: o plano MAIS o que ela contratou — as conexões de WhatsApp extras somam no limite de números, e o Copilot avulso libera o Copilot.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:409-413`, `:1489`
- Antes: KA-49, KD-31

**PN-22.** Trocar de plano (ou aplicar a versão nova dele) tira o adicional que o plano novo já inclui; o resto fica, com o preço contratado. Sem plano, saem todos.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:414-418`
- Antes: KA-50

## A criação da rede e o /setup (RB)

**RB-01.** A rede nasce por um caminho só, igual pelos dois: o cadastro público ou o "Nova rede" do sistema, que cria o login do responsável e manda o e-mail de definir senha (a unidade fica para o /setup).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:169-172`, `:1513`
- Antes: KA-16, KD-43

**RB-02.** O /setup retoma de onde parou: os dados já gravados da rede vêm preenchidos, a rede que já tem unidade ativa vai direto ao "Tudo pronto!", e o passo da unidade tem "Voltar".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:173-177`
- Antes: KA-17

**RB-03.** O setup está concluído quando a rede tem uma unidade ativa: só a rede sem unidade ativa é levada ao /setup, e o "Tudo pronto!" aparece só a quem abre o /setup.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:178-182`
- Antes: KA-18

**RB-04.** O fim do /setup tem o "Acessar o painel →" como botão principal, logo abaixo do "Tudo pronto!", e depois "Ou comece pelos próximos passos", nesta ordem, cada um com o porquê: Outra unidade (se houver) → Equipe → Salas → Estoque → Fichas → Documentos → Procedimentos → Taxas da maquininha → Fidelidade → Funil de oportunidades. Cada passo é um link que conclui o setup e leva à tela (o clique do meio abre em outra aba); o passo de uma funcionalidade fora do plano da rede não aparece.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:226-249`
- Antes: KA-19

## As unidades e o endereço (UN)

**UN-01.** O endereço de cada unidade é único no sistema inteiro e nunca é o nome de uma rota. Ao criar a unidade, o sistema escolhe sozinho: o nome dela; se já estiver ocupado, o nome com o da rede no fim; se ainda estiver ocupado, numerado.
- Fonte: decisão do Claude
- Onde: CLAUDE.md §5 (`:361-368`)
- Antes: KE-55

**UN-02.** O endereço que se dá à cliente é o do app da cliente, inteiro: Configurações → Geral mostra o de cada unidade ativa (com "Qualquer unidade abre a mesma ficha" quando há mais de uma) e para que serve, e o cartão de cada unidade em Unidades mostra o dela.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:216-225`
- Antes: KA-24

**UN-03.** A unidade nova não herda o CNPJ da rede calada: o /setup e o "Nova unidade" já trazem o CNPJ da rede preenchido, à vista; apagado, a tela avisa "A unidade vai ficar sem CNPJ…" e pergunta: "Usar o CNPJ da rede (…)" ou "Criar sem CNPJ". Duas unidades podem ter o mesmo CNPJ.
- Fonte: o Heitor, 2026-11-02: "se em branco, avisa e confirma decisão. Talvez uma clínica possa ter 2 unidades físicas operando no mesmo CNPJ. Uma unidade física não precisa necessariamente de um novo CNPJ. Flexibilidade é a palavra"
- Onde: `docs/regras/plataforma.md:250-262`, `:1514`
- Antes: KA-25, KD-44

**UN-04.** A inscrição estadual da unidade é opcional: o campo diz "Inscrição Estadual (opcional)" no criar e no editar, e nada a exige.
- Fonte: o Heitor, 2026-11-03: "manter, mas opcional"
- Onde: `docs/regras/plataforma.md:263-268`
- Antes: KA-26

**UN-05.** No passo da unidade do /setup (e no "Nova unidade"), o endereço tem o campo "Número", que entra depois do logradouro ("Rua Padre Chagas, 123 — Moinhos de Vento"), e a tela diz que o domingo vem fechado e que, se a unidade abre aos domingos (ou 24 horas), é preciso marcá-lo.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:182-188`, `:238-241`
- Antes: KA-20

**UN-06.** O editor de horário (no /setup, em Unidades e na Equipe) tem "Repetir o horário de segunda em todos os dias (domingo incluído)" e "Aberta 24 horas, todos os dias", que preenche os 7 dias de 00:00 a 24:00; o dia inteiro aparece como "24 horas", com "Escolher o horário". Ligado, o atalho fica marcado e diz "Ligado. Toque de novo para voltar ao horário de antes."; o segundo toque devolve o horário de antes.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:183-185`, `:203-215`
- Antes: KA-21

**UN-07.** O bairro que veio da busca do CEP e entrou no logradouro gera o aviso "O bairro “…” veio da busca do CEP e entrou no logradouro: confira.", até a pessoa mexer no campo. Só avisa.
- Fonte: princípio 2
- Onde: `docs/regras/plataforma.md:190-196`
- Antes: KA-22

**UN-08.** O endereço incompleto da unidade avisa e não é recusado, no /setup, no "Nova unidade" e na edição: o CEP que não traz a cidade a pede ali ("CEP não encontrado: escreva a cidade e a UF abaixo."; com o CEP e sem a cidade, "Escreva a cidade e a UF: o CEP não as trouxe.", dizendo também a UF que falta); na aba Unidades, a unidade sem cidade diz "Sem cidade: complete o endereço."; com cidade e sem UF, "Falta a UF: os documentos da unidade saem sem ela.".
- Fonte: princípio 2
- Onde: `docs/regras/plataforma.md:196-202`, `:1121-1122`, `:1128-1131`
- Antes: KA-23, KC-33

**UN-09.** Desativar uma unidade mostra o que fica e oferece resolver, sem impedir ("A unidade Jardins tem 2 pessoas da equipe só nela e 14 agendamentos marcados. [Mudar a equipe de unidade] [Ver os agendamentos] [Desativar mesmo assim]"), com confirmação, na lista e no detalhe da unidade. Criar, desativar e reativar unidade é só da Admin da rede (CU-02).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-11: opção a (H6)
- Onde: `docs/regras/plataforma.md:953-964`
- Antes: KC-19

**UN-10.** A janela diz tudo o que fica na unidade — a equipe só dela, os agendamentos futuros, o estoque com saldo (valor e itens), o a receber e a comissão a pagar —, cada número igual ao da tela que o mostra, e leva a resolver cada um na tela que já existe (a agenda dela no dia do primeiro, a transferência de estoque saindo dela, o a receber dela, o fechamento das comissões dela). Não há repasse em lote novo. Depois de desativada, o cartão e o detalhe dela continuam dizendo o que ficou, com os mesmos caminhos.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:965-976`
- Antes: KC-21

**UN-11.** "Mudar a equipe de unidade" leva quem é só da unidade que sai para outra unidade ATIVA, nunca para "A rede inteira" (que daria mais acesso).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:960-963`
- Antes: KC-20

**UN-12.** Quem muda de unidade (por "Mudar a equipe de unidade" ou na Equipe) leva o "Atende" junto, porque ele só vale nas unidades da pessoa: com a caixa marcada para todas as unidades dela, ela passa a atender nas novas; com a escolha feita à mão ("Escolher em quais unidades atende"), a unidade que saiu sai do "Atende" e a nova não entra sozinha.
- Fonte: decisão do Claude, aplicando a regra do Heitor de 2026-11-23: "uma pessoa só pode atender nas unidades que faz parte, isso é obvio" (a caixa única que vale em todas as unidades dela é o EQ1, AG-61; a escolha à mão que fica como está é a mesma regra da AG-62)
- Onde: `docs/regras/plataforma.md:960-963`, `:1153-1160`; `docs/revisao.md:1189-1199`, `:2236`
- Antes: KC-20

**UN-13.** A unidade desativada continua contada e alcançável, com o selo "Unidade desativada", enquanto tiver o que ficou (agenda futura, estoque com saldo, a receber, comissão a pagar) ou movimento no período da tela: o dashboard, os Relatórios, a agenda, o estoque, o Financeiro, as Comissões, o Fechamento e os Documentos da rede a contam e o filtro de unidade a alcança. Com dado dela, a rede de uma unidade ativa não é "uma unidade só" nos números.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:977-992`, `:1001-1003`
- Antes: KC-22

**UN-14.** Para criar, só as unidades ativas: os seletores de agendar, de dar entrada e transferir para, de vender, de lançar, de cadastrar, de campanha, de equipe e o trocador de unidade do portal mostram só as ativas, e o servidor recusa agendamento novo ou horário novo na desativada e entrada, estoque inicial ou transferência para ela. Tirar dela (transferir, ajustar, registrar perda) continua. (O estoque da desativada: ES-22.)
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:990-997`
- Antes: KC-23

## O login e a entrada no portal (LO)

**LO-01.** Nenhum login do app da rede existe sem vínculo: todo login é membro de uma rede ou cliente com ficha. Se gravar o vínculo de um login novo falha, o login novo é desfeito; o login sem vínculo que sobrar não entra, e a tela diz "Esta conta não tem acesso a nenhuma rede."
- Fonte: o Heitor, 2026-11-01: "não deve ter como ter um login sem vínculo, ou é rede ou é unidade"
- Onde: `docs/regras/plataforma.md:68-82`; CLAUDE.md §11 (`:727-731`)
- Antes: KA-05, KE-16

**LO-02.** O membro criado pela Equipe nasce com senha provisória e tem de trocá-la no primeiro acesso, antes de usar o sistema. (A senha inicial da cliente é a PO-01.)
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "2026-10-21, decisão do Heitor"
- Onde: CLAUDE.md §5 (`:315-320`); `docs/revisao.md:1178`, `:2115`
- Antes: KE-15

**LO-03.** Depois do login, quem tem "A rede inteira" entra no portal da rede. Quem tem unidades entra no portal da unidade: a última que usou (se ainda é dela e está ativa), senão a principal. No topo, "Unidade: X ▾" lista só as dela, e trocar leva à MESMA tela na outra (o registro de uma unidade volta à lista).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim" (PO1)
- Onde: `docs/regras/plataforma.md:1039-1046`; `docs/revisao.md:1442`, `:1460-1462`, `:2139`; CLAUDE.md §6 (`:391-395`)
- Antes: KC-28, KE-03

**LO-04.** Quem abre pelo endereço uma unidade que não é dela, ou o portal da rede sem ter "A rede inteira", é levado ao portal dela com o motivo na tela ("Essa unidade não está entre as suas.").
- Fonte: decisão do Claude
- Onde: CLAUDE.md §6 (`:433-436`); `docs/regras/plataforma.md:838-846`, `:1044-1045`
- Antes: KE-04, KC-28

**LO-05.** Com a sessão já aberta, a tela de login leva direto ao destino da pessoa.
- Fonte: decisão do Claude
- Onde: CLAUDE.md §6 (`:397-400`)
- Antes: KE-05

**LO-06.** Mudar a unidade ou o cargo de alguém que está com a sessão aberta vale na próxima tela que ela abre, sem precisar sair e entrar de novo (o sistema renova a sessão dela e volta ao mesmo lugar).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1171-1186`
- Antes: KC-34

## A Equipe (EQ)

**EQ-01.** O cadastro do membro tem nome completo, e-mail, cargo, "Unidades", "Atende", horário de atendimento, registro no conselho (opcional) e a senha temporária. A lista mostra nome, cargo, unidades e situação, com filtros por unidade, cargo e situação. (A comissão de cada pessoa na Equipe: CM-04 a CM-08.)
- Fonte: decisão do Claude (levantamento mantido no Bloco: Equipe)
- Onde: `docs/revisao.md:1173-1179`, `:2115`
- Antes: KE-14

**EQ-02.** O cadastro da Equipe tem "Unidades": "A rede inteira" (todas, inclusive as que vierem) ou as unidades marcadas, uma ou mais. A pessoa vê e opera só nas unidades dela (e é membro de cada uma delas, também da que não é a principal).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13/14 (EQ1): "Concord."
- Onde: `docs/regras/plataforma.md:1011-1025`; `docs/revisao.md:1165-1167`, `:1185-1193`, `:2111`; CLAUDE.md §11 (`:620`); `docs/regras/vendas-financeiro.md:3265`
- Antes: KC-24, KE-01

**EQ-03.** "Da rede" é só quem tem "A rede inteira": quem tem duas ou mais unidades marcadas não abre o portal da rede nem vê a lista de quem abriu o prontuário.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13/14 (EQ1): "Concord."
- Onde: `docs/regras/plataforma.md:1026-1028`; `docs/revisao.md:1191-1193`, `:2112`; CLAUDE.md §11 (`:627-628`)
- Antes: KC-25, KE-02

**EQ-04.** Quem dá as unidades: "A rede inteira" só quem a tem; quem tem unidades marca só as dela, e a unidade que o membro já tinha fora do alcance dela fica como estava. A Admin da rede tem sempre "A rede inteira".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1029-1031`, `:1038`
- Antes: KC-26

**EQ-05.** Para editar um membro basta alcançar ALGUMA unidade dele; para trocar o cargo, desativar e reativar, é preciso alcançar TODAS. Na Equipe da unidade, a pessoa com outra unidade fora do alcance aparece sem Desativar/Reativar e com o cargo travado (a dica diz por quê), e o servidor diz "Essa pessoa também está numa unidade fora do seu alcance: …".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1031-1038`
- Antes: KC-27

**EQ-06.** Com mais de uma unidade marcada, a Equipe diz qual é a principal: no cadastro ("Principal: X") e na linha ("Derby (principal) e Casa Forte"); com uma só, só o nome.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:1048-1052`
- Antes: KC-29

**EQ-07.** A Equipe da unidade lista também quem é da rede e atende ali, com o selo "Da rede", só o nome e o cargo e sem ações, e diz esse recorte na tela.
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:458-468`
- Antes: KE-13

**EQ-08.** Quem tem a Equipe só em Ver lê, nos dois portais, "Você vê a equipe. Cadastrar e editar é de quem tem a Equipe em Gerenciar no cargo."
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:836-838`
- Antes: KC-04

**EQ-09.** No seletor de cargo da Equipe, o Admin da rede vem primeiro, como na tela de Cargos.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:863-864`
- Antes: KC-08

**EQ-10.** Só quem tem o cargo de sistema Admin da rede promove alguém a Admin e altera outra Admin: cargo, "Atende", horário, comissão, desativar, reativar. Mais ninguém pode, nem quem tem a Equipe em Gerenciar. Na linha de uma Admin, a tela não mostra o que a pessoa não pode mexer.
- Fonte: o Heitor, 2026-10-29: "somente um admin pode promover alguém a admin" e "somente admin pode alterar admin"
- Onde: CLAUDE.md §11 (`:732-752`); `docs/revisao.md:1180-1181`; `docs/regras/atendimento.md:454-461`
- Antes: KE-21

**EQ-11.** No "Adicionar membro", a Admin da rede pode cadastrar outra Admin direto, e a tela não pergunta as unidades, porque a Admin é sempre da rede toda. Quem gere a equipe sem ser Admin não vê esse cargo.
- Fonte: o Heitor, 2026-11-02 (eq-01): "oferecer no cadastro; o caminho em dois passos não protege nada"
- Onde: `docs/regras/atendimento.md:469-475`; `docs/regras/plataforma.md:1038`
- Antes: KE-23

**EQ-12.** Trocar o cargo de uma Admin da rede pergunta antes ("com o cargo novo, deixa de ter acesso total…"), com "Trocar o cargo mesmo assim" e "Manter como Admin".
- Fonte: princípio 2
- Onde: `docs/regras/atendimento.md:476-484`
- Antes: KE-24

**EQ-13.** A Admin da rede não muda o próprio cargo (edita em si o "Atende" e o horário, com o cargo travado — AG-65), e a última Admin ativa não pode ser rebaixada nem desativada.
- Fonte: decisão do Claude
- Onde: CLAUDE.md §11 (`:760-763`); `docs/regras/atendimento.md:454-457`; `docs/revisao.md:1181`
- Antes: KE-22

**EQ-14.** Não se apaga membro nem rede: o membro se desativa (o login fica bloqueado e o registro fica) e a rede se cancela.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:76-78`, `:172`
- Antes: KA-06

**EQ-15.** Ninguém desativa a si mesmo. O membro desativado não entra nem opera, na hora. O login diz "Seu acesso foi desativado. Fale com quem administra a rede." com qualquer senha. (O repasse ao desativar: AG-66, AG-67, OP-10.)
- Fonte: decisão do Claude
- Onde: CLAUDE.md §11 (`:714-723`); `docs/revisao.md:1183`
- Antes: KE-20

**EQ-16.** O botão de desativar diz quantos agendamentos vão ser repassados quando não são todos ("Desativar e repassar 1 de 5"). Desativar quem não atende não diz "e sai da agenda", e o selo "Atende em …" sai da linha de quem está desativado.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:1073-1075`, `:1119-1120`, `:1126-1127`
- Antes: KC-30

**EQ-17.** No repasse do Desativar, quando ninguém mais atende o agendamento na unidade dele, a linha oferece a quem tem a Equipe em Gerenciar "Marcar <unidade> no Atende de X", só para quem tem aquela unidade entre as suas; a marcação passa pelas mesmas regras da Equipe e, feita, a pessoa aparece no repasse.
- Fonte: decisão do Claude (a oferta só a quem tem a unidade: o Heitor, 2026-11-23: "uma pessoa só pode atender nas unidades que faz parte, isso é obvio")
- Onde: `docs/regras/plataforma.md:1106-1113`; `docs/revisao.md:2236`
- Antes: KC-31

**EQ-18.** Reativar confirma o que volta e o que não volta: "X voltou: entra no sistema e atende como antes. O que foi repassado ao desativar continua com quem recebeu."
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1057-1059`
- Antes: KC-32

## Os Cargos (CG)

**CG-01.** O cargo serve só para juntar um conjunto de permissões e aplicá-lo a quem o recebe. O sistema nunca decide nada pelo nome do cargo.
- Fonte: o Heitor, 2026-11-13: "o que define quem gerencia é permissão, ponto … a aba cargos é apenas para definir um conjunto de permissões para aplicar a um usuário"
- Onde: `docs/revisao.md:1242-1244`; CLAUDE.md §1, §11 (`:680-681`)
- Antes: KE-33

**CG-02.** A autorização tem dois eixos: o nível de cada módulo vem do cargo, e as unidades vêm do membro. Um mesmo cargo serve para quem é de uma unidade e para quem é da rede.
- Fonte: decisão do Claude
- Onde: CLAUDE.md §11 (`:593-600`)
- Antes: KE-37

**CG-03.** Não existe "só os meus": quem tem o módulo em Ver vê tudo, e em Gerenciar mexe em tudo, sempre nas unidades ao alcance. Quem quer ver só as suas oportunidades usa o filtro de responsável.
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem, no crm acho que não se aplica diretamente e talvez o melhor caminho seja pelo filtro de dono da oportunidade, quem quer ver só as oportunidades que é dono, aplica o filtro"
- Onde: `docs/revisao.md:1293-1296`, `:2214`, `:2216`; CLAUDE.md §11 (`:602-609`)
- Antes: KE-38

**CG-04.** As vistas pessoais (a Minha agenda e as Minhas comissões) abrem o que é da pessoa sem o módulo, mas só MOSTRAM: qualquer ação continua pedindo a permissão do módulo. (Cada vista: AG-23 e MC-01.)
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem"
- Onde: `docs/revisao.md:1287-1289`, `:2215`; CLAUDE.md §11 (`:611-618`)
- Antes: KE-39

**CG-05.** A Admin da rede tem acesso a tudo, na rede inteira. Vale o cargo gravado: rebaixada, ela perde o acesso total na hora, sem esperar renovar a sessão.
- Fonte: decisão do Claude
- Onde: CLAUDE.md §11 (`:680-685`)
- Antes: KE-25

**CG-06.** Ninguém dá um cargo com mais acesso que o próprio, nas duas Equipes (a da rede e a da unidade): o cargo acima aparece desligado na lista ("Financeiro (tem módulos que você não tem)", com a nota "Só quem tem esses módulos pode dar este cargo.") e o servidor recusa. "Acima" é ter, em algum módulo, um nível maior, ou uma aba de Relatórios que a pessoa não vê. Manter o cargo que o membro já tem não é dar. A Admin da rede dá qualquer cargo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-11: opção (b) (H7 do levantamento das regras)
- Onde: `docs/regras/plataforma.md:932-944`; CLAUDE.md §11 (`:686-689`); `docs/revisao.md:1180`, `:1262`, `:2115`
- Antes: KC-17, KE-26

**CG-07.** A rede cria os cargos que quiser. Nasce com quatro modelos editáveis (Gerente, Recepcionista, Profissional, Financeiro) e com os cargos de sistema "Admin da rede" e "Não definido".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/revisao.md:1248-1250`; CLAUDE.md §11 (`:588-592`)
- Antes: KE-34

**CG-08.** O modelo de cargo "Gerente" nasce com Configurações em Gerenciar (para chegar à aba Unidade sem a Admin da rede precisar liberar). As redes que já existiam não ganharam isso sozinhas.
- Fonte: princípio 1
- Onde: `docs/regras/plataforma.md:910-915`
- Antes: KC-14

**CG-09.** Sem o "só os meus", nenhum modelo de cargo nasce com o Financeiro, e o modelo "Profissional" nasce sem a Agenda (o que eles viam está nas vistas pessoais: as Minhas comissões e a Minha agenda). Nos cargos que já existiam, o Financeiro e a Agenda que eram "só os meus" viraram "Sem acesso", e o resto ficou com o nível.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "o Heitor, 23/11, à pergunta do Claude"
- Onde: `docs/regras/plataforma.md:916-925`; `docs/revisao.md:2206-2210`
- Antes: KC-15, KE-35

**CG-10.** O modelo "Profissional" nasce com o Atendimento e o Prontuário em Gerenciar.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:920-921`; `docs/revisao.md:2207-2210`
- Antes: KC-16, KE-35

**CG-11.** Na matriz, cada módulo tem Nenhum, Ver ou Gerenciar (só os níveis que o módulo aceita), com o texto do que cada nível libera, e os módulos ficam em grupos, os mesmos do menu (Comercial — o CRM e os Procedimentos — separado de Marketing; "Vendas" é só a aba dos Relatórios).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/revisao.md:1251-1253`; CLAUDE.md §11 (`:648-658`); `docs/regras/vendas-financeiro.md:636-643`
- Antes: KE-36

**CG-12.** O Atendimento é um módulo da matriz, no grupo Atendimento logo depois da Agenda, com Ver e Gerenciar. O resumo diz, para o Ver, "Vê os atendimentos, sem iniciar nem concluir: iniciar e concluir pedem o Atendimento em Gerenciar."; para o Gerenciar sem o Prontuário em Gerenciar, "Inicia e conclui os atendimentos. A evolução, as fotos e a ficha de saúde pedem o Prontuário em Gerenciar.". A Agenda não fala de concluir.
- Fonte: o Heitor, 2026-11-18: "Agenda é agenda e atendimento é atendimento. Só inicia e conclui atendimento quem tem gerenciar no atendimento."
- Onde: `docs/regras/plataforma.md:1085-1105`; `docs/revisao.md:1302-1337`, `:2228-2232`
- Antes: KC-11

**CG-13.** A linha de Configurações na matriz de Cargos diz o que o nível dá a quem não é a Admin da rede: a aba Unidade (os dados, o horário e as salas das unidades dela); as integrações, os funis, as fichas, os documentos e o resto da configuração da rede toda são só da Admin da rede.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/plataforma.md:866-874`; CLAUDE.md §11
- Antes: KC-09

**CG-14.** O texto de cada linha da matriz e o resumo do cargo descrevem o sistema depois da revisão: o PDV, "oportunidade", a aba "Oportunidades", a Ficha de saúde e as fotos no Prontuário, "as unidades dela". Nenhuma permissão muda por causa do texto.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13 (CG3): "concordo, o resto fica como está"
- Onde: `docs/revisao.md:1270-1275`, `:2195`
- Antes: KE-45

**CG-15.** A tela de Cargos mostra o resumo "O que essa pessoa vai ver" do cargo escolhido.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/revisao.md:1260`, `:2195`
- Antes: KE-43

**CG-16.** O resumo do cargo diz o que cada módulo abre e de onde vem o que não tem linha própria: o PDV em Gerenciar dá a venda e o "Fechamento do dia"; o Financeiro em "Sem acesso" avisa que quem atende ou tem comissão no nome vê as Minhas comissões; o Copilot aparece pelo nível; Documentos vem de Clientes em Ver; Tratamentos vem do Atendimento em Ver.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:879-885`, `:894-895`, `:1063-1064`, `:1093-1094`, `:1115-1116`
- Antes: KC-10

**CG-17.** O resumo do cargo diz QUAIS abas de Configurações a pessoa usa, sem contar as da rede toda (que são só da Admin da rede); a quem só leria abas da rede toda, o menu das duas barras e a busca não oferecem Configurações.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:848-858`
- Antes: KC-05

**CG-18.** Em Relatórios, o cargo escolhe quais abas a pessoa vê. Cargo sem nenhuma aba que valha fica sem Relatórios: a entrada some do menu, e o resumo do cargo diz por quê.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/revisao.md:1257`, `:2217`; CLAUDE.md §11 (`:659-668`); `docs/regras/plataforma.md:906-909`
- Antes: KE-40, KC-13

**CG-19.** A aba Financeiro dos Relatórios só vale com o Financeiro pelo menos em Ver; a aba Vendas e as outras valem pela marca. Sem o Financeiro, a pílula "Financeiro" de "Relatórios liberados" fica desligada, com o cadeado e "· pede o Financeiro"; o que se grava, o "falta escolher" e a prévia contam só as abas que valem.
- Fonte: o Heitor, 2026-11-23: "financeiro é uma coisa, vendas é outra. financeiro ve entrada/saida/lucro, tudo. vendas é sobre performance de vendas."
- Onde: `docs/regras/plataforma.md:896-909`; `docs/revisao.md:2237`; CLAUDE.md §11 (`:666-668`)
- Antes: KC-13, KE-42

**CG-20.** Os números dos Relatórios são os das unidades ao alcance da pessoa, e o cargo não tem mais "a minha unidade × a rede inteira".
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem"
- Onde: `docs/revisao.md:2217`; `docs/regras/indicadores.md:1091-1094`
- Antes: KE-41

**CG-21.** O que falta escolher no cargo (as abas de Relatórios) aparece junto do "Salvar acessos" enquanto falta, com "Ir até lá", que rola até a primeira linha pendente; clicar em salvar com algo faltando vira alerta e leva ao módulo.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:886-892`, `:1064-1065`
- Antes: KC-12

**CG-22.** O cartão de cada cargo diz quantas áreas ele abre ("3 áreas"), e o cargo recém-salvo já diz o que abre, sem recarregar; salvar confirma ("Cargo “X” salvo.") e voltar ao cargo mostra o que foi salvo.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:860-863`, `:892-894`, `:1115-1116`
- Antes: KC-06

**CG-23.** A tela de Cargos guarda a escolha: o cargo escolhido fica no endereço, o recém-criado continua escolhido ao recarregar, e a lista de cargos não muda de ordem ao salvar (com a mesma data de criação, o nome desempata).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:874-876`, `:1124-1125`
- Antes: KC-07

**CG-24.** "Duplicar" um cargo cria "Cópia de X" (ou "Cópia de X (2)", se o nome existe) com a matriz, as abas de Relatórios e as caixas do inbox do original. Só a Admin da rede duplica (cargo é configuração da rede toda); o suporte não duplica; o cargo de sistema não se duplica.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/plataforma.md:945-952`; CLAUDE.md §11
- Antes: KC-18

**CG-25.** Na rede de uma unidade, o cargo de sistema aparece como "Admin". Os rótulos que são só a rede ("Rede", "Da rede", o grupo "A rede" das Configurações) mostram o nome da rede, e "A rede inteira" continua com esse nome.
- Fonte: decisão do Claude (o PO2, aprovado com "Sim", trocou "clínica" pelo nome da rede)
- Onde: `docs/regras/design.md:160-169`; `docs/revisao.md:1463-1466`, `:2140`
- Antes: KE-46

## As Configurações (CU)

**CU-01.** A configuração da rede toda é só da Admin da rede (o cargo de sistema gravado): nem quem tem "A rede inteira" com tudo em Gerenciar a muda. São as tags, os funis, os cargos, as fichas, os modelos de documento, as integrações, as automações, as campanhas, os templates, as Importações, a comissão do procedimento e a configuração das comissões, a fidelidade, as maquininhas e o Pix, os adicionais do plano e os dados da rede. Para os outros, a aba diz "Esta configuração é só da Admin da rede." sem o editor, e o sistema recusa a gravação.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/plataforma.md:703-717`, `:734-760`; CLAUDE.md §11 (`:753-760`)
- Antes: KB-34, KE-27

**CU-02.** Nesta área, ficam só com a Admin da rede: os cargos e a matriz de permissões, quais caixas de WhatsApp cada cargo vê no inbox, os dados da rede e o setup (para os outros, a aba Geral é só para ler), a assinatura e os adicionais (AS-15, PN-17), e criar, desativar e reativar unidade (o detalhe da unidade só mostra "Desativar"/"Reativar" a ela).
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/plataforma.md:739-742`, `:750-757`; CLAUDE.md §11
- Antes: KB-35

**CU-03.** A aba da rede toda diz quem muda: depois de "Esta configuração é só da Admin da rede.", "Quem muda: …" com o nome das Admins da rede ativas.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:731-733`
- Antes: KB-36

**CU-04.** Fica com a unidade, para quem tem a permissão e só nas unidades da pessoa: a aba Unidade do portal da unidade (os dados, o horário e as salas da unidade do endereço; pede as Configurações em Gerenciar), o estoque dela, a equipe dela, os cadastros e a operação do dia.
- Fonte: o Heitor (H7, 2026-11-01): "gerente de uma unidade só mexe no que é da unidade"
- Onde: `docs/regras/plataforma.md:765-769`; `docs/revisao.md:1376-1378`, `:2128`, `:2133`; CLAUDE.md §11 (`:761-762`)
- Antes: KB-38, KE-28

**CU-05.** Cada aba de Configurações pede o módulo dela em Gerenciar (e, se é da rede toda, ser a Admin da rede). No portal da unidade há também a aba Unidade.
- Fonte: decisão do Claude (levantamento mantido no Bloco: Configurações)
- Onde: `docs/revisao.md:1373-1378`, `:2133`
- Antes: KE-32

**CU-06.** As abas de Configurações ficam em grupos: A rede (Geral, Unidades, Assinatura), Equipe e acesso (Cargos, Suporte), Atendimento (Fichas, Documentos), Clientes (Tags, Fidelidade, Importações, LGPD), Dinheiro (Comissões e taxas), Conexões (Integrações) e Avançado (Ações em lote). Nenhuma aba sai. (Os "Eventos" foram para as Automações: GT-02.)
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13 (CF1): "Concordo"
- Onde: `docs/revisao.md:1386-1390`, `:2128`
- Antes: KE-30

**CU-07.** Quem não é a Admin da rede e abre Configurações sem pedir uma aba cai na primeira aba que é dela (no portal da unidade, a aba Unidade).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:826-827`
- Antes: KC-02

**CU-08.** A aba pedida que a pessoa não alcança não abre em silêncio: a tela abre a primeira aba que ela alcança e diz por quê ("A aba Cargos pede Cargos e permissões em Gerenciar no cargo, e o seu não tem. Abrimos Tags.", ou que é da rede toda, que fica nas Configurações da rede, que não está no plano, que não existe). Link antigo com o nome da aba em inglês vale pela aba.
- Fonte: princípio 3
- Onde: `docs/regras/plataforma.md:828-835`
- Antes: KC-03

**CU-09.** Quem tem "A rede inteira" e entra pelo portal da unidade chega a tudo o que só a rede tem: o menu da unidade mostra essas entradas (levando ao portal da rede), a busca da topbar as acha, e as Configurações da unidade mostram as abas da rede toda numa linha "Nas Configurações da rede: …" (a aba pedida que só a rede tem vira um link). Quem não tem "A rede inteira" não vê nada disso.
- Fonte: decisão do Claude (A1 da 14ª simulação, pela rede de uma unidade do CLAUDE.md §1)
- Onde: `docs/regras/plataforma.md:718-730`
- Antes: KB-37

**CU-10.** As respostas rápidas são de cada pessoa: cada membro com o CRM (em Ver já basta) cria, edita, apaga e vê só as suas, e o nome de uma resposta não se repete entre as dela. Não existe biblioteca de respostas da rede. (O uso no inbox: IN-12.)
- Fonte: o Heitor, 2026-11-11: "Respostas rápidas, na verdade, o mais certo seria ser de cada usuário, cada usuário poder configurar as suas." — bastar o CRM em Ver é decisão do Claude (auditoria das regras, 18/11)
- Onde: `docs/regras/plataforma.md:770-772`, `:804-813`
- Antes: KB-39, KC-01

**CU-11.** As respostas rápidas têm um lugar fixo: o botão "Minhas respostas rápidas", no topo da lista do inbox, nos dois portais, lista, cria, edita e apaga as da pessoa, sem precisar de conversa aberta nem de canal ligado. Dentro da conversa elas se usam pelo ⚡ ou pelo "/".
- Fonte: decisão do Claude (A8 da 14ª simulação)
- Onde: `docs/regras/plataforma.md:813-819`
- Antes: KB-40, KC-01

## A Auditoria (AD)

**AD-01.** A rede tem uma Auditoria: um lugar só de leitura onde se vê tudo o que aconteceu na rede.
- Fonte: o Heitor, 2026-11-13: "queria um lugar para auditoria, acho que como dos eventos, onde o admin pudesse ver tudo o que aconteceu"
- Onde: `docs/regras/plataforma.md:1188-1195`; `docs/revisao.md:1343-1355`, `:2130`
- Antes: KD-01, KE-47

**AD-02.** A Auditoria fica no menu, em Gestão, ao lado de Relatórios, no portal da rede e no da unidade. Mostra quando, quem (com "via suporte" quando foi o suporte), o quê em português, o link do registro e a unidade; filtra por período, pessoa, tipo de ação, unidade e cliente; e baixa em CSV.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode ser no menu" (CF3)
- Onde: `docs/regras/plataforma.md:1190-1195`; `docs/revisao.md:1353-1359`, `:2130`
- Antes: KD-02, KE-49

**AD-03.** A Auditoria é só da Admin da rede: não é linha da matriz de Cargos e não se dá a cargo nenhum. A Admin da rede lê tudo da rede, em qualquer portal, e o filtro "Quem" mostra todos os membros.
- Fonte: o Heitor, 2026-11-16: "Auditoria é só admin"
- Onde: `docs/regras/plataforma.md:1242-1263`, `:1481`; `docs/revisao.md:1366-1369`, `:2132`; CLAUDE.md §11 (`:648-652`)
- Antes: KD-03, KE-48

**AD-04.** Entra na Auditoria toda gravação que muda o que alguém FAZ no sistema (criar, editar, cancelar, estornar, arquivar ou apagar, mudar permissão ou configuração), cada abertura do prontuário, cada entrada no sistema — de quem é da equipe e da cliente no portal e no app — e o que o suporte fez. O que só registra andamento (filas, sinais, cache, logs) não entra.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode ser no menu" (CF3: "entradas no sistema (login)", sem recorte; e a fala do Heitor, "onde o admin pudesse ver tudo o que aconteceu")
- Onde: `docs/regras/plataforma.md:1197-1206`; `docs/revisao.md:1360-1363`, `:2131`
- Antes: KD-05, KE-50

**AD-05.** Quem agiu é a pessoa que fez a gravação, nunca um nome mandado pela tela. O que ninguém fez (rotina automática, webhook) aparece como "O sistema". O que o suporte fez aparece como "Fulana (via suporte: Atendente)".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode ser no menu" (CF3: "QUEM (o nome, com a marca 'via suporte')")
- Onde: `docs/regras/plataforma.md:1212-1221`, `:1523`; `docs/revisao.md:1356-1357`
- Antes: KD-06

**AD-06.** O que se gravou pelo Copilot é de quem pediu, com a marca "Fulana (pelo Copilot)", e o filtro "Quem" tem a opção "Só o que foi pelo Copilot".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim, copilot acompanha tudo" (CP1: "A gravação do Copilot entra na Auditoria como a de quem pediu, com a marca 'pelo Copilot'")
- Onde: `docs/regras/plataforma.md:1221-1225`, `:1345-1346`; `docs/revisao.md:1403`, `:1428-1432`
- Antes: KD-07

**AD-07.** A Auditoria nunca guarda o conteúdo: do que é clínico (prontuário, evolução, anotação, injetáveis, ficha de saúde, documentos e termos da cliente) e das credenciais (integrações, números de WhatsApp, links de assinatura) vão só os nomes dos campos que mudaram ("abriu o prontuário de X"); do resto, os nomes e poucos valores sem dado pessoal (situação, datas, valores, o nome da sala ou da tag). Texto livre (como o motivo) não é guardado.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode ser no menu" (CF3: "Nunca o conteúdo clínico (só 'abriu o prontuário de X')"); a extensão às credenciais e ao dado pessoal é decisão do Claude
- Onde: `docs/regras/plataforma.md:1226-1233`, `:1275`, `:1522`; `docs/revisao.md:1362-1363`
- Antes: KD-08, KE-50

**AD-08.** Os nomes (da cliente, do membro, da oportunidade, do contato, do produto, do cargo, do procedimento) e o motivo se leem na hora de mostrar. A cliente anonimizada pela LGPD aparece anonimizada também na Auditoria.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1231-1233`, `:1323-1328`, `:1380-1382`
- Antes: KD-09

**AD-09.** O registro da Auditoria não se altera nem se apaga, por ninguém; ele dura enquanto a rede existir.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode ser no menu" (CF3: "não se apaga nem se altera, enquanto a rede existir")
- Onde: `docs/regras/plataforma.md:1234-1238`; `docs/revisao.md:1364-1365`, `:2131`
- Antes: KD-10, KE-51

**AD-10.** Se o registro da Auditoria falhar, a gravação da pessoa vale mesmo assim (a venda não trava), e a Auditoria mostra a linha "(registro incompleto)".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1463-1466`
- Antes: KD-11

**AD-11.** Só abrir um documento, sem mudar nada nele, não aparece na Auditoria (DD-04, Documentos).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1306-1310`
- Antes: KD-12

**AD-12.** A tela mostra cada GRAVAÇÃO como uma linha só (o que a pessoa fez de uma vez), com "Ver as N mudanças desta gravação" para o detalhe. Nada deixa de ser gravado: muda só a leitura.
- Fonte: princípio 7
- Onde: `docs/regras/plataforma.md:1264-1273`
- Antes: KD-13

**AD-13.** A gravação se lê pelo FATO, com a unidade e o link dele: a venda ("Vendeu o pacote X (R$ …) — cliente"), o início e a conclusão do atendimento (na unidade do agendamento, não na do pacote usado), o recebimento. Recebido é o lançamento que ficou pago naquela gravação.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1274-1292`
- Antes: KD-14

**AD-14.** Todo campo aparece pelo nome em português ("percentual da comissão de venda", "maquininha"), nunca pelo nome técnico, e toda coisa tem o seu plural ("Criou 2 links de assinatura").
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1293-1298`, `:1376-1379`, `:1395-1396`, `:1413`, `:1419-1420`
- Antes: KD-15

**AD-15.** Na agenda, a frase diz o fato: "Agendou X para (data e hora) — procedimento, com quem atende"; "Remarcou o agendamento de X para (data e hora)" (", com Fulano" se quem atende mudou junto); "Repassou o agendamento de X a Fulano"; "Cancelou o agendamento de X (motivo: …)".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1321-1322`, `:1380-1382`, `:1401-1404`, `:1424-1426`
- Antes: KD-16

**AD-16.** No dinheiro, a frase diz quanto, como e de quem: a venda (com o crediário: entrada e parcelas), o recebimento (a forma, a parcela, as vezes no crédito, quanto em cada forma quando são duas, o voucher e os pontos usados), a despesa criada com o valor, o lançamento editado "de quanto para quanto" (valor, datas, pago, forma, descrição, parcela, fornecedor, nota; o texto livre só pelo nome) e o estorno com a forma e a parcela do que foi estornado e o que voltou (o produto ao estoque, o voucher a ativo).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1274-1276`, `:1286-1298`, `:1311-1320`, `:1347-1357`, `:1397-1398`, `:1444-1448`, `:1456-1458`
- Antes: KD-17

**AD-17.** Na comissão, a frase diz de quem e de qual: "Pagou a comissão de X (R$ …, forma)", "Marcou como paga a comissão do atendimento de X (procedimento)" / "da venda a X", "Estornou o fechamento da comissão de X (R$ …)".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1313-1314`, `:1383-1385`, `:1430-1431`
- Antes: KD-18

**AD-18.** No caixa e nos pontos, a frase diz o fato: "Pôs 1 Sérum na comanda", "Pôs mais 1 … (agora 2)", "Tirou 1 … (agora 2)", "Tirou … da comanda"; "Fechou o dia …" e "Fechou de novo o dia …" com o conferido em cada forma; "Creditou N pontos a X" / "Debitou N pontos de X"; "Devolveu o Voucher … (voltou a ativo)".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1315-1320`, `:1397-1400`, `:1459-1461`
- Antes: KD-19

**AD-19.** No estoque, a frase diz o fato na medida em que o produto se consome: "Deu entrada em N X (R$ …)" com o custo, "Desfez a entrada de N X", "Transferiu N X de A para B", "Registrou a perda de N X", "Corrigiu o custo do lote de X: de R$ … para R$ … por (medida)" e "Ajustou o estoque (correção de cadastro): …".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1276-1277`, `:1357-1361`, `:1421-1423`, `:1439-1441`
- Antes: KD-20

**AD-20.** Nos documentos, nos pacotes e nas importações, a frase diz o fato: "Gerou o documento X" (o contrato gerado na venda entra na gravação da venda); "Cancelou / Dispensou / Substituiu o documento X (motivo: …)"; "Criou a ficha de X"; "Cancelou / Usou / Devolveu a sessão N do pacote X"; "Cancelou o pacote X" (", e estornou R$ …"); "Criou a importação (arquivo) (N linhas, para …)", "Concluiu a importação … (novas, completadas, com erro)", "A importação … falhou".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1405-1407`, `:1411-1420`
- Antes: KD-21

**AD-21.** Na equipe, nos cargos e no comercial, a frase diz o fato: "Desativou / Reativou Fulana"; "Criou o cargo X (N permissões)", "Criou a permissão de (módulo) do cargo X", "Criou a aba de relatório (aba) do cargo X", "Mudou os acessos do cargo X (…)"; "Criou o contato e a oportunidade X", "Mudou a etapa da oportunidade X" ("de A para B" quando a etapa está no registro).
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1271-1279`, `:1323-1328`, `:1435-1438`
- Antes: KD-22

**AD-22.** O que a cliente fez pelo link (a ficha de saúde, a assinatura, o documento) aparece como dela: "Dona Cida, pelo link" ("Respondeu a ficha de saúde"); o link em si segue de quem o criou. Quando é a equipe que preenche: "Preencheu a ficha de saúde de X".
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1299-1305`
- Antes: KD-23

**AD-23.** O filtro de unidade é pela unidade da GRAVAÇÃO: aparece o que foi feito naquela unidade, não o que só tocou um registro dela (a sessão do pacote da unidade A usada na conclusão da unidade B não aparece na A). A abertura do prontuário leva a unidade em que foi aberto (no portal da rede, "Da rede").
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1329-1335`, `:1390-1393`
- Antes: KD-24

**AD-24.** A ficha da cliente é da rede: a mudança na ficha diz "Da rede" na coluna Unidade e o filtro de unidade não a esconde.
- Fonte: o Heitor, 2026-11-13 (H16): "o cliente não é da unidade, o cliente é da rede"
- Onde: `docs/regras/plataforma.md:1336-1344`; `docs/regras/crm-inbox.md:309-313`
- Antes: KD-25

**AD-25.** O que não tem unidade diz "Da rede" na coluna Unidade (menos a entrada no sistema, que fica sem). O registro clínico sem unidade própria (a evolução, o termo, o mapa) leva a unidade da gravação, na tela, no detalhe e no CSV.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1408-1409`, `:1427-1428`, `:1442-1443`
- Antes: KD-26

**AD-26.** A hora da coluna "Quando" (na tela e no CSV) vai no fuso da leitura, com a nota do fuso; a hora que a frase cita ("Agendou … para", "Remarcou … para") vai no fuso da unidade do registro.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1451-1455`
- Antes: KD-27

**AD-27.** O filtro de ação sempre traz "Abriu o prontuário", em qualquer portal.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1370-1373`; `docs/revisao.md:2132`
- Antes: KD-28

**AD-28.** A tela anda por páginas sem partir uma gravação entre duas, e numa página antiga "Voltar às mais recentes" fica no topo e no fim.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1362-1365`
- Antes: KD-29

**AD-29.** O CSV traz uma linha por registro, e cada linha leva a frase da gravação dela na coluna "Gravação" (vazia quando a linha já diz a mesma frase; na gravação de um registro só, a frase da tela vai no "O quê"). O CSV não parte uma gravação e avisa quando chega ao limite de linhas.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:1240-1241`, `:1365-1369`, `:1432-1434`
- Antes: KD-30

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Nenhuma pergunta fica na página. As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Estas regras são suas? Plataforma — escritas como decisão sua, sem a sua fala.** SI-03 (o papel GERENTE da plataforma vê tudo, não edita e não entra no suporte; "pedido do Heitor, 2026-10-07", `docs/regras/plataforma.md:38`); SI-05 (a verificação em duas etapas como opção do ADMIN, nascendo desligada; "decisão do Heitor, 2026-10-06", `:83-85`); SI-06 (uma sessão em cada app, sem atalho entre o sistema e o suporte; "a pedido do Heitor", `:99`); PN-01 (o plano define as funcionalidades e os limites, e o teste grátis tem tudo menos o Copilot; "decisão do Heitor", `:273`, e o "Fica como está" de `docs/revisao.md:1572`, fora das aspas — o único "Sim" ali é o do PL1); PN-14 (os adicionais: o preço no plano, o sistema e a rede contratam, soma na mensalidade, o Copilot avulso; "Do Heitor", `:374-376`). Confirma as cinco?

Q02. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Estas regras são suas? Assinatura — escritas como suas, sem a sua fala.** AS-05 (cortesia ou desconto em qualquer item, em percentual OU em reais, com data de fim opcional), AS-06 (a rede com nada a pagar fica ativa e sem cobrança, nunca suspensa) e AS-10 (a rede vê a condição na aba Assinatura, com o preço cheio riscado): `docs/regras/plataforma.md:441-444` dá as três como "Do Heitor". O resto do bloco o texto diz que é decisão do Claude (a cobrança que religa em 3 dias, o mínimo de R$ 5,00, trocar de plano tirar a condição). Confirma as três?

Q03. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Estas regras são suas? Equipe e cargos — escritas como suas, sem a sua fala.** LO-02 (o membro criado pela Equipe troca a senha no primeiro acesso; CLAUDE.md §5, `:315`: "2026-10-21, decisão do Heitor"); CG-09 (os modelos de cargo nascem sem o Financeiro e o Profissional sem a Agenda, e nos cargos que já existiam o Financeiro e a Agenda "só os meus" viraram "Sem acesso" em vez de "Ver"; `docs/revisao.md:2207-2210` e `docs/regras/plataforma.md:916-918`: "o Heitor, 23/11, à pergunta do Claude" — a sua fala de 23/11 que está registrada é "pode tirar, as vistas pessoais resolvem", que não diz qual nível o cargo antigo recebe). Confirma as duas?

Q04. **Resolvida na revisão de 24/11:** "A rede inteira com Configurações em Gerenciar" é o critério de antes de 18/11, que nas outras coisas da conta com a plataforma (a assinatura, autorizar o suporte, a aba Suporte) virou só a Admin da rede: os chamados dos colegas, também. Defeito a corrigir. — *Era:* **SU-16 — os chamados dos colegas: quem os vê além de quem abriu?** O texto (`docs/regras/plataforma.md:692-694`) e o código (`apps/web/actions/chamados.ts:30-32`, `veARede`) dão os chamados da rede inteira a "quem administra a rede" — quem tem "A rede inteira" com as Configurações em Gerenciar, o critério de antes de 18/11. A assinatura (AS-15), a autorização do suporte (SU-01) e a aba Suporte (SU-11) já são só da Admin da rede pela sua regra de 18/11, mas a lista da configuração da rede toda não cita os chamados, e ler o chamado de um colega não é configuração. Os chamados dos colegas ficam só com a Admin da rede (como o resto da conta com o BellarisOS), ou com quem tem "A rede inteira" e as Configurações em Gerenciar?

## Divergências

O texto de `docs/regras/` (ou da própria revisão e do CLAUDE.md), e onde se viu também o código ou a tela, contra a decisão mais nova — para corrigir depois.

- CU-01, CU-02, EQ-03, CG-13, CG-17 (TEXTO): a configuração da rede toda dada a "quem é da rede" / "A rede inteira" (H7), de antes de 18/11 — `docs/revisao.md:1192-1193`, `:1378`, `:2112`, `:2133`, `:1215` (Fichas, "e é da rede"), `:782` (Documentos, "e é da rede"); `docs/regras/plataforma.md:1026-1027` ("duas unidades marcadas… não gravam a configuração da rede toda (H7)", como se "A rede inteira" gravasse), `:867-873` (o Gerenciar de Configurações "cita as integrações…", e sem "A rede inteira" elas "são da rede toda"), `:850-852` (o exemplo "Configurações (só Comissões e taxas)" do resumo, que é aba da rede toda); `docs/regras/design.md:181-183` ("quem muda é quem administra a rede", também nos pacotes, que são de quem tem Procedimentos em Gerenciar, PC-01). O Heitor, 18/11 (CLAUDE.md §11): "Configuração da rede toda só pela conta admin". `docs/regras/plataforma.md:703-760` já segue a de 18/11.
- AS-15, AS-16, AS-17, AS-20, PN-17, SU-11 (CÓDIGO e TEXTO): "quem administra a rede" ainda é quem tem "A rede inteira" com as Configurações em Gerenciar. Texto: `docs/regras/plataforma.md:157` ("Quem administra a rede"), `:514-520` (o sino, a aba "rede + `settings: MANAGE`" e o aviso do topo). Código: `apps/web/lib/redes/aviso.ts:19-22` (`administraARede`, usada em `:25`: o aviso do topo); `apps/web/app/conta-suspensa/page.tsx:47-53` (a fatura e o "Pagar" também para "rede + configurações MANAGE"); `packages/nucleo/src/lib/suporte/avisos.ts:12-24` (`quemAvisar`: o sino das mudanças da assinatura, `:30-36`, e o do suporte entrando e saindo, `:43-55`, vão a quem tem as Configurações em Gerenciar sem ser a Admin); `apps/web/lib/copilot/disponivel.ts:46-49` (o convite a contratar o Copilot avulso aparece a quem "pode contratar" pela regra antiga, e contratar é só da Admin, PN-17). A aba Assinatura em si já segue a regra (`apps/web/lib/configuracoes/abas.ts:132-133`, `:238`).
- AD-04 (CÓDIGO e TEXTO): a entrada da cliente no portal e no app não entra na Auditoria. `docs/regras/plataforma.md:1200-1201` grava a entrada "só membro"; o código pula a cliente em `apps/web/actions/auth.ts:122` (`if (user && !clienteId)`) e em `apps/web/app/api/auth/session/route.ts:77` (`if (!claims.client_id)`). O CF3 aprovado (`docs/revisao.md:1361`) diz "entradas no sistema (login)", sem recorte, e o Heitor pediu "ver tudo o que aconteceu".
- UN-12 (CÓDIGO e TEXTO): `docs/regras/plataforma.md:961-962` diz que, ao "Mudar a equipe de unidade", "o “Atende” de cada pessoa não muda"; o código muda só a unidade (`apps/web/actions/branches.ts:271-272`) e o gatilho do "Atende" (`supabase/migrations/20261115800001_membro_em_varias_unidades.sql:171-181`) leva o "Atende" às unidades novas só quando ele seguia todas as de antes — a escolha feita à mão que incluía a unidade que saiu fica com ela, fora das unidades da pessoa, contra a regra de 23/11 ("uma pessoa só pode atender nas unidades que faz parte, isso é obvio").
- UN-11 (CÓDIGO): `apps/web/actions/branches.ts:253-255` (`moverEquipeDaUnidade`) pede as Configurações E a Equipe em Gerenciar, e ainda "é de quem é da rede" — "nenhuma ação pede dois" (`docs/revisao.md:1309`, 23/11); mudar a pessoa de unidade é da Equipe (CU-04).
- CG-16 (CÓDIGO e TEXTO; o mesmo da PV-04 de Vendas e financeiro): `docs/regras/plataforma.md:1061-1062`, `:1066-1069`, `:1082-1084` dizem que o PDV fica "Aberto pelo Financeiro em Gerenciar" na matriz e que a venda e o Fechamento do dia vêm "do PDV, ou do Financeiro em Gerenciar"; a tela de Cargos diz isso em `apps/web/lib/permissions-copy.ts:254`, `:261` e `:304`. "Cada passo pertence a UM módulo, e nenhuma ação pede dois" (`docs/revisao.md:1309`, `:1317`, 23/11) e CLAUDE.md §11 ("receber é do PDV"): vender e receber são do PDV, e só dele.
- CG-16 (TEXTO): `docs/regras/plataforma.md:1069-1072` diz que Tratamentos aparece "a quem tem a Agenda" ("Tratamentos vem da Agenda em “Ver”"); `:1093-1094` e `docs/revisao.md:2228` (UM1, 23/11) decidiram o Atendimento em Ver (o código já diz isso, `apps/web/lib/permissions-copy.ts:326`).
- CG-12 (TEXTO): `docs/regras/plataforma.md:1076-1081` (a 24ª: "Não conclui atendimentos: concluir pede o Prontuário em Gerenciar.", "Concluir também pede o Prontuário em Gerenciar") continua escrito como regra, contra `:1100-1104` e o Heitor, 18/11 ("Só inicia e conclui atendimento quem tem gerenciar no atendimento"); e `:1094-1096` põe os injetáveis no Prontuário em Gerenciar, e `docs/revisao.md:2235`, `:2242` (23/11) os deram ao Atendimento em Gerenciar (PT-16, Atendimento).
- CG-18 (CÓDIGO): `apps/web/lib/auth.ts:139` (e `:154`, `:163`) zera os Relatórios só sem nenhuma aba MARCADA, não sem aba que VALHA: o cargo gravado com só a aba Financeiro e sem o Financeiro ainda vê Relatórios no menu e a tela "Nenhum relatório liberado" (`docs/regras/plataforma.md:906-908` registra). CLAUDE.md §11 (A5): sem aba que valha, a entrada some do menu.
- CG-24 (TEXTO): `docs/regras/plataforma.md:950-951` diz "quem não é a Admin da rede não duplica um cargo com módulo que ela não tem", como se outra pessoa duplicasse; cargo é configuração da rede toda (18/11): só a Admin duplica.
- UN-10 (TEXTO): `docs/regras/plataforma.md:967-968` conta "os atendimentos concluídos sem pagamento, à parte"; `docs/revisao.md:1994` (CX3, 16/11) fez deles as comandas abertas do PDV.
- EQ-06, LO-03 (TELA e TEXTO): `docs/regras/plataforma.md:1048-1049` e a tela (`apps/web/components/shared/unidades-do-membro.tsx:96`) dizem "Principal: X — o login abre nela."; o PO1 aprovado (`docs/revisao.md:2139`; `docs/regras/plataforma.md:1040-1041`) diz que a pessoa entra na última unidade usada, e só sem ela na principal. CLAUDE.md §11 também chama a principal de "o destino do login".
- LO-03 (TEXTO): CLAUDE.md §6 (`:391-395`) decide o destino do login pela claim `NETWORK_ADMIN` × "outros"; a regra (PO1, EQ1b) decide pelas unidades. O código já decide pelas unidades.
- EQ-17 (TEXTO e TELA): `docs/regras/plataforma.md:1107-1109` oferece "Marcar <unidade> no Atende de X" a qualquer pessoa "da equipe [que] atende em outra"; desde 23/11 só a quem tem a unidade entre as suas (o código já filtra, `apps/web/lib/equipe/repasse.ts:216`). A mesma janela ainda chama o "Atende" de "Atende clientes em" (`apps/web/components/admin/desativar-membro.tsx:306-307`), o nome da lista que virou UMA caixa no EQ1 (`docs/revisao.md:2113`) — a mesma divergência de `CLAUDE.md:691-693` e `docs/regras/atendimento.md:279-286`, `:427-429`, `:624-625` (AG-61, Atendimento).
- SI-08 (TEXTO): `docs/regras/plataforma.md:131-132` diz "Os seguintes, o ADMIN cadastra em Equipe (SUPORTE ou ADMIN)"; o papel GERENTE (07/10, `:38-44`) também se cadastra ali.
- CG-03 (TEXTO): `docs/revisao.md:1254-1259` (levantamento de Cargos) e a linha "Mantém" do Bloco: Cargos (`:2196`: "os escopos… o refino do inbox") ainda contam com o "só os meus"; a troca de 23/11 está em `:1298-1300`, mas a linha do bloco continua velha.
- PN-05, PN-12 (TEXTO, só a data): `docs/regras/plataforma.md:338-339` data o "Sim" do PL1 em 2026-11-16; `docs/revisao.md:1570-1572` o registra sob "O que devia fazer (o Heitor, 2026-11-13)" (16/11 é a data em que ficou pronto, `:2164`).

De outra área, vistas no texto desta: `docs/regras/plataforma.md:820-822` diz que "a importação escolhe a que unidade os registros pertencem (a ficha da cliente, os produtos)" — a ficha é da rede e nasce sem unidade (IM-03, Clientes); `:770-774` e `:780-792` ainda descrevem no presente a configuração "Quem cadastra e edita os produtos" e a fala H8 de 11/11, que saíram com a E13 (ES-02, Atendimento: "é só quem tem permissão de gerenciar"); `docs/regras/atendimento.md:410-411` ("Repassar pede a Agenda em Gerenciar de todos") ainda traz o "de todos" do escopo que saiu em 23/11 (AG-67, Atendimento).

## Ficou fora do catálogo

Nenhum número de rascunho ficou fora. O que os rascunhos já tinham deixado fora sem número, por ser implementação e não regra (fica em `docs/regras/plataforma.md`): o redirecionamento 303 e o "Entrar" desligado até a página carregar (`:52-62`), os endereços entre os apps, o cache entre processos, a CSP e a lista de IPs (`:101-114`), as tabelas da plataforma e dos chamados sem política (`:141`, `:700-701`), a RLS da rede bloqueada (`:159-162`), o catálogo fechado e as migrations de chave nova (`:353-361`, `:435-436`), o webhook e a chave do Asaas (`:510-513`), a trava de "Ligar a cobrança" (`:498-499`), o código de entrada entre os hosts (`:559-575`), o `session_id` e a RLS da sessão de suporte (`:576-600`, `:607-613`), o hook de token opcional (`:661-664`) e o recorte da leitura da Auditoria "de quem tem unidades" (`:1257-1261`, `:1386-1389`), que com a Auditoria só da Admin da rede não alcança ninguém. As regras do sistema inteiro já no CLAUDE.md (a configuração da rede toda, `:1519`; nenhum login sem vínculo, `:1515`) estão aqui só na aplicação a esta área (CU-01, LO-01).

## É de outra área

Os rascunhos também apontaram, sem número próprio, o que já está catalogado em outra área e aqui só se cita: na lista da configuração da rede toda, as tags (TG-06), os funis, as etapas, os motivos e as origens (OP-11), as fichas (FI-05), os modelos de documento (DQ-01), as integrações e as caixas de WhatsApp e o inbox vazio (IG-02, IG-03), as Importações (IM-02, IM-03), as automações, as campanhas e os templates (QM-02), a configuração de comissões (CM-03), a comissão do procedimento (PC-03), o máximo de parcelas do crediário (CR-02), a fidelidade (PG-03), as maquininhas e a taxa do Pix (MQ-07), o catálogo de procedimentos e os pacotes (PC-01) e o cadastro de produtos e as categorias, marcas e fornecedores do estoque (ES-02); o suporte que não liga automação (QM-05); o registro de quem viu dado clínico com a marca "via suporte" (PT-04); quais números de WhatsApp o cargo vê no inbox (IN-15); a comissão de cada pessoa na Equipe e da Admin da rede (CM-04 a CM-08); as Minhas comissões (MC-01 a MC-03) e a Minha agenda (AG-23); quem inicia, conclui e monta o plano, e os injetáveis (AT-01, AT-02, PL-02, PT-16); a Admin da rede que atende (AG-65); vender e receber só pelo PDV (PV-04, PV-05); a comissão e o estoque da unidade desativada (CM, ES-22) e o app da cliente com agendamento numa unidade desativada (PO); o acesso e o login da cliente, um login para várias redes (PO-01 a PO-05); os templates, a comissão e os documentos fora do plano (WT-10, CM-02, DE-12); o limite de números em todos os caminhos de ligar (WN-08); as oportunidades fora do plano nas ações de fora do CRM (OP-04, AG-17); arquivar a ficha da cliente em vez de apagar (CL-26); a anonimização pela LGPD (LG); a gravação do Copilot pelo cartão Confirmar (área Copilot, catalogada em paralelo; aqui só como a Auditoria a mostra, AD-06); a receita dos atendimentos e o Ticket médio sem o Financeiro (indicadores, em aberto em `docs/revisao.md:2244`); e o que só o portal da rede tem e o drill-down `?unidade=` (Portais, sem área no catálogo — com a ressalva de que "Produtos só na rede", `docs/revisao.md:1453-1454`, precisa ser conferido contra a E13).

- KA-10: o que a plataforma registra na rede não dispara automação da rede — área: Automações, GT-06.
- KA-36: sem a fidelidade no plano, não se dão pontos nem bônus — área: Fidelidade, PG-02.
- KB-24: na sessão de suporte nada sai para a cliente (mensagem, template, mídia, campanha, link de assinatura, aviso no celular) — área: WhatsApp e push, WE-01 (e Documentos, DQ-08).
- KD-40: o que a plataforma grava na rede não dispara automação — área: Automações, GT-06.
- KD-42: com a rede bloqueada nada sai para o paciente e o que chega continua gravado — área: Automações, EV-12, e WhatsApp e push, WE-02.
- KE-06: o "Atende" é UMA caixa, que vale em todas as unidades da pessoa — área: Atendimento, AG-61.
- KE-07: o "Escolher em quais unidades atende", fechado por padrão — área: Atendimento, AG-61.
- KE-08: o "Atende" só nas unidades da pessoa, e o servidor recusa as outras — área: Atendimento, AG-61.
- KE-09: o "Atende" não dá permissão nenhuma — área: Comissões, CA-06.
- KE-10: a unidade aberta ou reaberta entra no "Atende" de quem tem "A rede inteira" e atende em todas — área: Atendimento, AG-62.
- KE-11: quem não tem "A rede inteira" marca o "Atende" só nas unidades dela — área: Atendimento, AG-63.
- KE-12: tirar uma unidade do "Atende" com agendamentos em aberto passa pelo repasse, e a coluna "Não atende mais nesta unidade" — área: Atendimento, AG-68.
- KE-17: desativar oferece repassar os agendamentos e as oportunidades, caso a caso ou todos — área: Atendimento, AG-66, e Clientes, OP-10.
- KE-18: a quem o agendamento e a oportunidade se repassam, e o que falha volta à tela — área: Atendimento, AG-67.
- KE-19: a janela de desativar mostra os futuros e os passados sem fechar dos últimos 30 dias — área: Atendimento, AG-66.
- KE-31: "Eventos" sai de Configurações e vai para as Automações como "O que já aconteceu" — área: Automações, GT-02.
- KE-44: na matriz, "PDV" (era "Recebimentos") e "Documentos" (era "Termos e contratos") — área: Vendas e financeiro, PV-05, e Documentos, DM-02.
