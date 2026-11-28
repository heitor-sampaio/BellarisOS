# Catálogo de regras — WhatsApp e push

Este é o catálogo das regras de WhatsApp e push que valem HOJE: os números de WhatsApp da rede, como cada um se conecta, quem fala por cada número e por onde a mensagem sai, os templates e a janela de 24 h, o que chega e o histórico, o que a Meta cobra, quando nada sai para a cliente, os avisos no celular (os canais, o sino, a equipe e a cliente) e as integrações com a credencial. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, "decisão do Claude". O bloco "WhatsApp e avisos (push)" da revisão foi fechado com "Pode fechar" (13/11, `docs/revisao.md:1513`): a regra que está no levantamento dele (`docs/revisao.md:1517-1533`) tem essa aprovação como fonte. "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/whatsapp-push.md:1-261`; KB: `docs/regras/whatsapp-push.md:260-560`; KC: as decisões de `docs/revisao.md`, do CLAUDE.md e dos outros arquivos de `docs/regras/`, que repetem várias de `whatsapp-push.md` — juntas aqui, com os dois "Onde"). É um RASCUNHO para o Heitor revisar. Contagem: 79 regras (Os números 13, Conectar um número 9, Quem fala e por onde sai 7, Os templates e a janela de 24 h 12, O que chega e o histórico 9, O que a Meta cobra 6, Quando nada sai 2, Os canais, os aparelhos e o sino 4, Os avisos à equipe 6, Os avisos à cliente 6, As integrações e a credencial 5), 3 perguntas e 11 divergências. Dos 103 números do rascunho, 1 ficou fora do catálogo e 4 são de outra área (ver os apêndices); todos os outros estão num "Antes". Das seis perguntas dos rascunhos: as duas sobre o aviso do próprio fato à cliente (KA e KC) viraram a Q01; a dos templates (KB) e a lista de regras sem a fala (KC) viraram a Q02 e a Q03 — menos a WT-04, que tem resposta no levantamento aprovado, a automação só na conversa aberta, que foi para as Automações com as regras dela, e a credencial cifrada, que ficou fora do catálogo; a de quem fala por cada número (KA) é decisão do Claude, não pergunta; e a da credencial (KB) é a da regra que ficou fora (os motivos estão em "Divergências" e em "Ficou fora do catálogo").

## Os números de WhatsApp da rede (WN)

**WN-01.** A rede tem quantos números de WhatsApp quiser, cada um com um nome e as pessoas que falam por ele; não existe "o WhatsApp da rede". Toda vez que o sistema escolhe um número, ele sabe qual e por quê — nunca pega um qualquer.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:82-86`; `docs/revisao.md:1513`, `:1519-1520`
- Antes: KA-16, KC-01

**WN-02.** Cada número tem o seu tipo de conexão: o não oficial (WhatsApp Web, ligado pelo QR Code) e o oficial da Meta convivem na mesma rede, e ligar um não derruba o outro.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:116-117`; `docs/revisao.md:1520-1523`
- Antes: KA-21, KC-01

**WN-03.** Ao ligar um número oficial, a rede escolhe o modo: a **coexistência** (o aplicativo WhatsApp Business continua funcionando no celular com o mesmo número, e as conversas e os contatos que já existem são trazidos) ou a **Cloud API** (o número passa só para o sistema, o aplicativo para de funcionar com ele, o histórico não vem, e só dá para voltar atrás desfazendo a migração na Meta).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:376-393`; `docs/revisao.md:1521-1523`
- Antes: KB-16, KC-02

**WN-04.** O aviso das consequências da Cloud API aparece na tela, em vermelho, antes de a pessoa escolher — não fica escondido atrás de um link —, porque ela não se desfaz pelo sistema.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:392`
- Antes: KB-17, KC-02

**WN-05.** A rede tem no máximo um número padrão.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:91-94`
- Antes: KA-17

**WN-06.** O nome do número se escolhe ao conectar ("Nome do número"), em qualquer dos quatro caminhos (a conexão gerenciada, o WhatsApp Web com conta própria, o cadastro pela Meta, a credencial colada). Sem escolha, fica o nome que a conexão já tem (reconectar ou salvar a credencial não renomeia) e, sem nenhum, o da conta na Meta ("nome verificado · telefone") — nunca o código técnico do número. Renomear depois é o "Nome da conexão" da lista. O nome tem no máximo 60 caracteres em todo caminho: ao conectar e ao renomear, o campo para em 60, e o nome da conta na Meta é cortado nesse tamanho (o Heitor, 25/11: "60 pra tudo").
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:102-110`
- Antes: KA-19

**WN-07.** A unidade marcada no número é só um rótulo: não limita quem vê as conversas nem por onde a mensagem sai, a conversa não nasce presa a uma unidade, e a unidade não vira tag.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:111-115`; `docs/revisao.md:1523-1524`
- Antes: KA-20, KC-03

**WN-08.** O plano limita quantos números de WhatsApp a rede tem ativos: ligar um número além do limite é recusado em todos os caminhos (o formulário, o WhatsApp Web, o cadastro pela Meta). O que já está acima do limite não é apagado, só não cresce, e editar um número não confere o limite.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — ver a Q02
- Onde: `docs/regras/plataforma.md:273-276`, `:314-327`; `docs/revisao.md:1590-1592`
- Antes: KC-11

**WN-09.** Remover um número não junta as conversas dele com as de outro número: elas ficam no inbox como estavam, cada uma com as mensagens e o card dela. O número removido sai das Configurações e da escolha de por onde enviar, deixa de ser o padrão, perde a credencial e as pessoas ligadas, e pode ser conectado de novo como número novo.
- Fonte: o Heitor, 2026-11-03: "não tem como juntar duas conversas em uma só e manter alguma coerência, ela estava falando com pessoas diferentes … mantém as duas conversas no inbox, porque o inbox é uma visualização unificada de todos os inbox; se a pessoa quiser, existem os filtros para isso"
- Onde: `docs/regras/whatsapp-push.md:118-136`; `docs/revisao.md:1524`
- Antes: KA-22, KC-04

**WN-10.** A conversa de um número removido continua abrindo e aparece na lista como "Nome · número removido"; o filtro "Número" do inbox traz os números da rede e os removidos que têm conversa.
- Fonte: o Heitor, 2026-11-03: "se a pessoa quiser, existem os filtros para isso"
- Onde: `docs/regras/whatsapp-push.md:137-141`
- Antes: KA-23

**WN-11.** Pelo número removido não sai mais nada: texto, modelo e mídia são recusados com a explicação ("O número desta conversa (X) foi removido da rede: por ele não sai mais nada…"), e o campo de escrever mostra o mesmo texto.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:142-145`; `docs/revisao.md:1524`
- Antes: KA-24, KC-04

**WN-12.** Na conversa de número removido, "Responder pelo X" oferece os números ativos que a pessoa alcança (o dela primeiro, "(o seu)"; com um só, só o botão). Ele abre a conversa do mesmo contato naquele número — a que já existe, sem criar outra; senão uma nova, com o card, a ficha e a unidade da conversa de origem — e leva até ela com o campo de escrever pronto.
- Fonte: o Heitor, 2026-11-03: "Um botão 'Responder pelo número X' com uma seleção dos números possíveis, na própria conversa, que abre a conversa nova no número atual"
- Onde: `docs/regras/whatsapp-push.md:146-156`
- Antes: KA-25

**WN-13.** "Responder pelo X" pede o CRM em Gerenciar e recusa, sem criar nada, o número removido, fora do ar, de outra rede ou fora das caixas do cargo, e a conversa que não é de número removido. O envio segue as regras de sempre (a janela de 24 h, o bloqueio no modo suporte, o alcance da conversa).
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:156-161`
- Antes: KA-26

## Conectar um número (WC)

**WC-01.** O número oficial se conecta pelo botão "Conectar pela Meta", que abre a janela da Meta. O formulário de colar a credencial à mão fica recolhido em "avançado" e serve à rede que tem um app próprio na Meta.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:395`, `:442`
- Antes: KB-18

**WC-02.** O código da Meta só carrega na tela de conectar pela Meta. Nenhuma outra tela avisa a Meta da visita: nem o portal da cliente, nem os links públicos.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:401`
- Antes: KB-19

**WC-03.** Reconectar um número que já está no ar não o tira do ar: ele segue atendendo, e a credencial nova só passa a valer depois que a Meta aceita. Se a reconexão falhar, tudo fica como estava.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:419`
- Antes: KB-20

**WC-04.** A conexão pela Meta que falha no meio diz o que aconteceu, e a tela não recarrega sozinha. Se a página ficou desatualizada, a tela diz que o número não foi conectado e que nada foi gravado nem ligado na Meta, e oferece "Recarregar a página". Com outro erro, diz que não dá para saber se gravou e pede para conferir a lista.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:425`
- Antes: KB-21

**WC-05.** Quando o número foi conectado pela Meta, a tela não mostra o token nem o PIN dele. O formulário manual só liga e desliga esse número, sem gravar credencial por cima. Para trocar de conta, conecta-se de novo.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:438`
- Antes: KB-22

**WC-06.** Ligar um número oficial pelo formulário manual já inscreve a conta para o sistema receber as mensagens. Se a inscrição falhar, ou se faltar o ID da conta, o número é salvo mesmo assim e a tela avisa que, sem a inscrição, nenhuma mensagem chega. O salvar sempre mostra os erros e os avisos.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:444`
- Antes: KB-23

**WC-07.** "Testar conexão" testa o número que está na tela e diz qual número respondeu (por exemplo "Conectado · +55 48 3333-0202 · Nome verificado"). Testar salva sem ligar — quem liga é a caixa "Ativar" — e salva no mesmo número: repetir o teste não cria outro.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:455`
- Antes: KB-24

**WC-08.** "Adicionar número" sempre começa uma conexão nova; nunca reabre um número já conectado.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:548`
- Antes: KB-35

**WC-09.** A rede nunca vê o nome "uazapi" em tela, aviso ou erro: o WhatsApp não oficial aparece como "WhatsApp Web".
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:549`
- Antes: KB-36

## Quem fala por cada número e por onde a mensagem sai (WL)

**WL-01.** Cada número tem as pessoas que falam por ele, quantas forem (ex.: um número de atendimento e três pessoas respondendo); cada pessoa fala por no máximo um número, e só números e pessoas da mesma rede se ligam. ("Uma pessoa, um número só" é decisão do Claude; o resto está no levantamento aprovado.)
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:91-101`; `docs/revisao.md:1519-1520`
- Antes: KA-18

**WL-02.** A mensagem sai, nesta ordem: pelo número de quem está enviando, sempre que a pessoa tem um (mesmo respondendo uma conversa que chegou por outro número); senão, pelo número da conversa; senão, pelo padrão da rede — que é por onde sai o que o sistema inicia.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:166-172`
- Antes: KA-28

**WL-03.** Rede com números e nenhum padrão: o sistema não escolhe um no lugar, nada sai pelo padrão e a tela avisa.
- Fonte: princípio 4
- Onde: `docs/regras/whatsapp-push.md:188-190`
- Antes: KA-30

**WL-04.** Se o número da pessoa é diferente do número da conversa, a tela de responder avisa ANTES de ela digitar, com o nome dos dois números, e oferece um clique para responder pelo número da conversa. Sem esse clique, a mensagem sai pelo número da pessoa. A escolha vale só para aquela conversa: ao trocar de conversa, volta ao número da pessoa.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:278-286`
- Antes: KB-05

**WL-05.** A conversa de WhatsApp de uma cliente, para o sistema, é uma só: a ligada à ficha; sem ela, a do telefone do cadastro (com e sem o 9 do celular); nunca a encerrada nem a de número removido; entre várias, aquela em que a cliente falou por último. É essa que usam a automação, o link de assinatura, o da ficha de saúde e a conta de quantas recebem antes de ligar uma automação.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:177-186`
- Antes: KA-29

**WL-06.** O histórico mostra por qual número cada mensagem saiu, e a conversa não troca de número por isso: ela só ganha número no primeiro envio que dá certo, se ainda não tinha.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:200-203`
- Antes: KA-32

**WL-07.** Editar uma mensagem sai pelo número que a enviou.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:204-205`
- Antes: KA-33

## Os templates e a janela de 24 h (WT)

**WT-01.** Os templates (os modelos do WhatsApp oficial: escrever e mandar à Meta para aprovação) ficam em Marketing, só no portal da rede.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim" (PO1 e PO2; o resto fica como está — o levantamento põe os Templates "Só na rede")
- Onde: `docs/revisao.md:1442`, `:1453`, `:1046-1047`, `:1059-1060`, `:2085`
- Antes: KB-02, KC-09

**WT-02.** O template é da conta da Meta (a conta de negócio do WhatsApp), não de um número. Dois números da mesma conta usam os mesmos templates, e o envio só oferece os templates da conta do número que vai enviar. Template de outra conta nunca aparece, nem que a lista fique vazia.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:292-296`
- Antes: KB-06

**WT-03.** Os templates seguem os números oficiais ligados: sem nenhum número oficial ligado, a tela de templates não mostra nada, não edita e não cria, e só manda conectar um. A lista traz apenas os templates das contas que têm número ligado.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — ver a Q02
- Onde: `docs/regras/whatsapp-push.md:298-301`
- Antes: KB-07

**WT-04.** Ligar um número oficial, ou trocar a conta dele, traz da Meta todos os templates daquela conta, com o conteúdo. Se a Meta falhar nisso, o número continua conectado e a tela mostra um aviso. O "Sincronizar" da tela de templates faz o mesmo: atualiza a situação dos templates e traz os criados no painel da Meta.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:302-306`; `docs/revisao.md:1524-1525`, `:1381-1382`
- Antes: KB-08, KC-05

**WT-05.** Desligar ou remover um número tira do sistema os templates da conta que ficou sem nenhum número ligado. Na Meta nada é apagado, e religar o número os traz de volta; se outro número da mesma conta continua ligado, nada sai. Na Meta, só o botão "Apagar" de um template apaga.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — ver a Q02
- Onde: `docs/regras/whatsapp-push.md:307-310`
- Antes: KB-09

**WT-06.** Os rascunhos de template não são apagados quando o número é desligado: ficam escondidos enquanto a conta não tem número ligado e voltam quando ela é religada.
- Fonte: decisão do Claude (2026-11-18, a opção menos destrutiva)
- Onde: `docs/regras/whatsapp-push.md:311`
- Antes: KB-10

**WT-07.** Cada template mostra de qual número ele é (os números ligados da conta dele), e a lista filtra por número. O template novo nasce na conta do número escolhido; com um número só, na conta dele.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:315`
- Antes: KB-11

**WT-08.** O template trazido da Meta que o sistema não consegue enviar entra marcado, com o motivo (cabeçalho de mídia, variáveis numeradas, botão de telefone, de código ou de link com variável, autenticação, carrossel). A tela o mostra só para leitura (pode ser apagado, não editado), e o envio pelo inbox não o oferece nem o envia.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:320`
- Antes: KB-12

**WT-09.** O template só aceita variáveis que o sistema preenche, escritas pelo nome (`{{nome}}`). A variável numerada da Meta (`{{1}}`) é recusada antes de gravar, porque a cliente receberia as chaves no texto.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:367`
- Antes: KB-13

**WT-10.** Com os templates fora do plano, some só a tela de criar e editar modelos: o inbox continua respondendo fora das 24 horas com o modelo aprovado que já existe.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:331-333`
- Antes: KC-10

**WT-11.** A janela de 24 h é medida no número que vai enviar, não na conversa; quando não dá para enviar, a mensagem de erro diz qual número e por quê.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:192-199`
- Antes: KA-31

**WT-12.** Quando a rede tem números de provedores diferentes, cada conversa segue o provedor do número dela: a janela de 24 h (que só o oficial tem) e o botão de editar mensagem valem conversa a conversa, nunca por um "provedor da rede". A janela só vale quando o número que vai enviar é da API oficial (Cloud API, WT-11): pelo WhatsApp Web não há janela, e o inbox envia, sem aviso nem recusa de janela, também quando a pessoa responde por outro número.
- Fonte: decisão do Claude; a janela só no número oficial que envia: decisão do Claude, 27/11 (D5 da 38ª), pela própria WT-12 ("que só o oficial tem")
- Onde: `docs/regras/whatsapp-push.md:273`
- Antes: KB-04

## O que chega e o histórico (WH)

**WH-01.** A mensagem que chega entra pelo número que a recebeu (nunca se perde de qual número veio), e a entrega da Meta sem assinatura válida é recusada.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:207-216`
- Antes: KA-34

**WH-02.** A mesma mensagem aparece uma vez só, na conversa do número certo, mesmo que o provedor a entregue de novo ou a mande duas vezes ao mesmo tempo — também nos canais sem número (Instagram, Messenger, manual) e no histórico da coexistência, que chega em pedaços.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:256-263`
- Antes: KA-35, KB-03

**WH-03.** Ao conectar um número pelo WhatsApp Web, o sistema traz o histórico recente que o WhatsApp entrega: até 180 dias, 500 conversas e 300 mensagens por conversa; grupos, status e canais ficam de fora.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:225-233`; `docs/revisao.md:1524-1525`
- Antes: KA-36, KC-05

**WH-04.** O histórico (do WhatsApp Web e o da coexistência, de até 180 dias) entra como importado e já lido: não vira a última mensagem da conversa, não conta como não lida, não mexe no "aguardando", não dispara nada (nenhum evento, nenhuma automação), não traz a origem de anúncio nem baixa mídia; as mensagens enviadas pela rede entram como saída.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:234-238`, `:468`
- Antes: KA-37, KB-26

**WH-05.** O histórico vem sozinho logo depois de conectar; a tela do número conectado acompanha e permite trazer de novo, sem duplicar o que já veio.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:239-245`; `docs/revisao.md:1524-1525`
- Antes: KA-38, KC-05

**WH-06.** O andamento aparece em Configurações → Ações em lote: a etapa (esperando o WhatsApp × importando), "12 de 80 conversas" e o sinal de vida. Parada há 15 minutos, vira falha "Interrompida", e dá para tentar de novo.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:246-254`
- Antes: KA-39

**WH-07.** Na coexistência, o que a rede manda pelo aplicativo do celular entra na conversa do sistema como mensagem enviada, na hora, e tira a conversa do "aguardando".
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:466`
- Antes: KB-25

**WH-08.** Na coexistência, a agenda do celular dá nome à pessoa que está sem nome ou que tem o próprio número como nome. O nome escrito pela equipe nunca é trocado.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:471`
- Antes: KB-27

**WH-09.** Nada do que vem pela coexistência dispara automação: nem o histórico, nem o que foi mandado pelo celular, nem a agenda. A automação de boas-vindas não sai para conversas de meses atrás.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:473`
- Antes: KB-28

## O que a Meta cobra (WM)

**WM-01.** Quem paga a Meta é a rede, na conta de WhatsApp dela; o sistema não cobra, só informa. Sem forma de pagamento na conta, a Meta recusa os templates, e a conversa livre continua funcionando.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:483`; `docs/revisao.md:1525-1526`
- Antes: KB-29, KC-06

**WM-02.** Os preços da Meta mostrados em qualquer tela saem de uma tabela só: a da Meta para o Brasil, em reais, vigente desde 01/10/2026. Marketing custa R$ 0,3217; utilidade, autenticação e resposta, R$ 0,035; as primeiras 1.000 respostas digitadas por número no mês são grátis.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:487`
- Antes: KB-30

**WM-03.** O custo aparece antes de enviar: o seletor de template mostra a categoria e o preço, e um template de marketing com a janela aberta vira alerta (a resposta digitada diria o mesmo mais barato); a tela de templates mostra o preço da categoria e avisa que a Meta reclassifica como marketing a utilidade com cara de promoção; conectar um número oficial mostra o aviso de cobrança.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:492`; `docs/revisao.md:1525-1526`
- Antes: KB-31, KC-06

**WM-04.** Uma mensagem conta como cobrada quando a Meta a marcou como cobrada, nunca por uma regra do sistema. Só o valor em reais é estimado, pela tabela.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:497`
- Antes: KB-32

**WM-05.** Cada número oficial mostra, na linha dele, o gasto do mês na Meta (contando só o que foi entregue) e o aviso de pagamento recusado — quando houve recusa por falta de pagamento nos últimos 7 dias e nenhum template foi entregue depois —, com o link para o Gerenciador do WhatsApp da Meta.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:504`; `docs/revisao.md:1525-1526`
- Antes: KB-33, KC-06

**WM-06.** O motivo de uma falha de envio é decidido pelo código do erro da Meta, fica guardado na mensagem e aparece no balão dela. Falta de pagamento não manda a rede reconectar o número.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:509`
- Antes: KB-34

## Quando nada sai para a cliente (WE)

**WE-01.** Na sessão de suporte nada sai para a cliente: nem mensagem do inbox (texto, template, mídia), nem campanha, nem pedido ou link de assinatura, nem aviso no celular; o que o suporte faz não dispara automação, e ele não registra aparelho. O que a equipe e a cliente fazem no mesmo período segue normal.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:614-624`; `CLAUDE.md:904`; `docs/revisao.md:1584-1586`
- Antes: KC-27

**WE-02.** Com a rede bloqueada, a saída para a cliente pausa — automação, campanha, lembrete e todo aviso no celular — sem se perder (a espera da automação continua, a campanha agendada não é dada como feita). O que chega pelo WhatsApp continua sendo gravado.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:163-168`, `:1518`
- Antes: KC-28

## Os canais, os aparelhos e o sino (NA)

**NA-01.** O aviso chega por três caminhos: o app Android, o navegador (Web Push) e o sino do portal.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:9-10`; `docs/revisao.md:1527`
- Antes: KA-01, KC-14

**NA-02.** Cada aparelho registrado é de UMA pessoa da equipe ou de UMA cliente, nunca dos dois — senão o aviso da equipe iria à cliente e o da cliente à equipe.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:11`, `:69-71`
- Antes: KA-02

**NA-03.** No sino do app da cliente, o aviso aberto continua na lista, esmaecido; clicar só marca como lido. "Em dia" aparece quando todos estão lidos. O sino da equipe não segue esta regra: o aviso lido sai da lista dele (mantê-lo, esmaecido, é a sugestão nº 178).
- Fonte: decisão do Claude; só o sino da cliente: decisão do Claude, 28/11 (41ª simulação, Decisão 7), pela própria NA-03 (`getClientNotifications`)
- Onde: `docs/regras/whatsapp-push.md:64-68`
- Antes: KA-14

**NA-04.** Nenhum aviso no celular diz "clínica": fala o nome da rede (o título do aviso da automação é o nome da rede), da unidade ou "a equipe".
- Fonte: o Heitor, 2026-11-13: "Clinica é a mesma coisa que rede e não deve existir no sistema."
- Onde: `docs/revisao.md:32`, `:1537`, `:2147` (CA1), `:2184` (V1); `docs/regras/automacoes.md:286-287`
- Antes: KC-20

## Os avisos à equipe (NE)

**NE-01.** O aviso de um fato da operação vai às partes interessadas nele: quem está envolvido diretamente (o profissional do agendamento recebe porque a agenda é dele, com permissão ou sem) e quem responde pelo fato — quem tem o módulo daquele fato em Gerenciar e alcança a unidade onde ele aconteceu. A Admin da rede responde por todo módulo do plano e recebe os avisos de todos eles. Na remarcação para outra unidade, a unidade do fato é a nova, onde o atendimento passa a acontecer: avisa quem responde por ela, não quem só responde pela de antes.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"; a remarcação para outra unidade: decisão do Claude, 28/11 (41ª simulação, Decisão 5), pela própria NE-01
- Onde: `docs/regras/whatsapp-push.md:12-24`; `docs/revisao.md:1527-1530`
- Antes: KA-03, KA-04, KC-14

**NE-02.** Quem só tem o módulo em Ver não recebe o aviso: ver é poder consultar, não responder pelo que acontece.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:25-26`; `docs/revisao.md:1529`
- Antes: KA-05, KC-14

**NE-03.** Para receber como responsável basta o módulo em Gerenciar, dentro da abrangência, em todo módulo (não existe "só os meus"). Quem atende sem ter o módulo recebe só o aviso do registro dela, como envolvida direta.
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem, no crm acho que não se aplica diretamente e talvez o melhor caminho seja pelo filtro de dono da oportunidade"
- Onde: `docs/regras/whatsapp-push.md:27-29`; `docs/revisao.md:2214`
- Antes: KA-06

**NE-04.** Quem causou o fato não recebe o aviso dele. No aviso do estoque no mínimo ou abaixo (NE-06), quem causou é quem gravou o movimento que cruzou o mínimo (a transferência, a entrada, a saída avulsa; no atendimento concluído, quem concluiu); o cruzamento que nasce da rotina, sem autor, avisa todos. O "Lote vencendo" não é causado pela entrada do lote: o fato é o lote a 30 dias da validade, que nasce na rotina, e quem deu a entrada também recebe.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"; o aviso do mínimo: decisão do Claude, 28/11 (41ª simulação, D3), pela própria NE-04; o lote vencendo: decisão do Claude, 28/11 (41ª simulação, Decisão 5), pela própria NE-04 e pela ES-30 do Atendimento
- Onde: `docs/regras/whatsapp-push.md:30-31`; `docs/revisao.md:1529-1530`
- Antes: KA-07, KC-14

**NE-05.** A chegada da cliente (check-in) avisa só quem vai atender — não quem responde pela Agenda.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/regras/whatsapp-push.md:32-34`; `docs/revisao.md:1530-1531`
- Antes: KA-08, KC-15

**NE-06.** Os avisos da operação à equipe são: agendamento novo, cancelamento, remarcação, chegada da cliente e produto no estoque mínimo ou abaixo (pelo mínimo que a tela mostra, uma vez a cada vez que cruza, logo depois do movimento — ES-30 do Atendimento). Fora desta lista, só avisam os fatos com regra própria: a ficha de saúde respondida (FI-11 do Atendimento), o pedido LGPD pelo app (LG-09 de Clientes, CRM e inbox), o plano aceito pelo app (PL-07 do Atendimento) e o lote que vence em 30 dias (ES-30 do Atendimento).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Pode fechar"; os avisos com regra própria: decisão do Claude, 28/11 (41ª simulação, Decisão 5), pela própria NE-06
- Onde: `docs/regras/whatsapp-push.md:35-37`; `docs/revisao.md:1530-1531`
- Antes: KA-09, KC-15

## Os avisos à cliente (NC)

**NC-01.** A cliente recebe no celular o aviso do próprio fato, sem a rede ligar nada: o horário marcado, remarcado, cancelado e concluído, e o pagamento. É a confirmação do que aconteceu, não automação: o lembrete antes do agendamento e a confirmação de presença são modelos das Automações, desligados até a rede ligar (NC-03).
- Fonte: decisão do Claude (a Q01, decidida em 25/11: fica)
- Onde: `docs/regras/whatsapp-push.md:38-44`
- Antes: KA-10, KC-16

**NC-02.** Quando a unidade propõe um plano de tratamento, a cliente recebe "Plano novo" — "<unidade> preparou um plano de tratamento para você." —, com o link para o plano no app. Vai uma vez por plano, mesmo que o plano da avaliação seja salvo de novo.
- Fonte: decisão do Claude (a Q01, decidida em 25/11: fica — é o aviso do próprio fato, a proposta)
- Onde: `docs/regras/whatsapp-push.md:46-53`
- Antes: KA-12

**NC-03.** Fora o aviso do próprio fato (NC-01, NC-02), nada vai à cliente sem a rede ligar: o lembrete antes do agendamento e a confirmação são modelos das Automações, que nascem desligados e a rede liga se quiser; as promoções são campanhas; os bônus da fidelidade só avisam se a rede ligou.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "mk1 ok"
- Onde: `docs/regras/whatsapp-push.md:40-45`; `docs/revisao.md:1041`, `:1064-1072`, `:1531-1533`, `:2083`
- Antes: KA-11, KC-17

**NC-04.** O aviso da cliente vai aos aparelhos de todas as fichas do login dela (ela pode ser cliente de várias redes com uma conta só), também os registrados quando ela estava em outra rede, e só dele. O aviso fica registrado na ficha da rede de que ele trata, e o link leva ao portal dessa rede. A campanha segue a mesma regra, e o "vai receber no celular" conta do mesmo jeito.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — ver a Q03
- Onde: `docs/regras/whatsapp-push.md:54-63`; `CLAUDE.md:322`, `:344-345` (§5)
- Antes: KA-13, KC-18

**NC-05.** O aviso no celular aparece na tela de bloqueio, então o aviso do que é clínico não diz o procedimento nem nada de saúde: o texto é genérico, e o detalhe fica do outro lado do link (o plano novo, o pedido de assinatura, a ficha de saúde, a resposta do chamado). Os avisos do agendamento (marcado, remarcado, cancelado, concluído, o pagamento) dizem o próprio fato, com o procedimento, o dia e, quando a rede tem mais de uma unidade, a unidade ("Novo horário: Limpeza de pele em …, na unidade …").
- Fonte: decisão do Claude, 25/11 (o Heitor revisa): o texto do aviso do agendamento é o fato que a própria cliente marcou, e é o que o sistema manda (`docs/regras/whatsapp-push.md:38-40`); o recorte do genérico ao que é clínico, pelo princípio 3; a unidade só quando a rede tem mais de uma: decisão do Claude, 27/11 (36ª, Decisão D), pela A28 da 6ª simulação (`textoDoHorarioMarcado`), o §1 e o princípio 7
- Onde: `docs/regras/whatsapp-push.md:38-53`; `docs/regras/documentos.md:593-594`; `docs/regras/atendimento.md:1740-1741`; `docs/regras/plataforma.md:689-690`; `apps/web/lib/appointments/texto-do-aviso.ts`
- Antes: KC-19

**NC-06.** O WhatsApp não substitui o aviso no celular: a campanha vai como aviso no celular (o app, o navegador e o sino do portal), e a lista, a criação e o detalhe dela dizem que não vai pelo WhatsApp; a cliente sem aparelho registrado fica com o aviso guardado no sino do app, e a automação diz "Guardado no sino do app: a cliente não tem acesso ao app." — não conta como enviada. Na campanha também: o "Enviadas" (na lista e no detalhe) conta só o aviso que saiu para um aparelho; o guardado no sino fica como "Guardada no sino" e fica fora dessa conta, então a campanha que só guardou mostra "Enviadas 0". Mandar pelo WhatsApp é uma automação que a rede monta e liga.
- Fonte: o Heitor, 2026-10-29: "O WhatsApp fica para o futuro."
- Onde: `docs/regras/whatsapp-push.md:72-78`; `docs/regras/automacoes.md:118-124`, `:348-350`; `docs/revisao.md:1048-1050`, `:2085`; `apps/web/lib/notifications/envio-da-campanha.ts` (o "Enviadas" da campanha, D9 da 28ª)
- Antes: KA-15, KC-21, KC-22

## As integrações e a credencial (IG)

**IG-01.** Os números de WhatsApp e as contas de anúncio se ligam em Configurações → Integrações, no grupo "Conexões".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Concordo [CF1 e CF2] e queria um lugar para auditoria…" (CF1)
- Onde: `docs/revisao.md:1343`, `:1517-1518`, `:2128`
- Antes: KC-07

**IG-02.** É configuração da rede toda, só da Admin da rede: ligar, reconectar, testar, renomear, desligar e remover um número de WhatsApp; escolher o padrão; ligar as pessoas a cada número; as Ações em lote (inclusive trazer o histórico de novo); as contas de anúncio; e criar, editar, apagar, sincronizar e mandar à Meta os templates. Para os outros, a aba diz "Esta configuração é só da Admin da rede." e quem muda.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `CLAUDE.md:753-760` (§11); `docs/regras/plataforma.md:731-735`, `:744-748`; `docs/regras/crm-inbox.md:376`
- Antes: KA-27, KB-01, KC-07, KC-09

**IG-03.** Sem WhatsApp conectado, o inbox vazio diz que a rede não tem WhatsApp conectado. O atalho para ligar (Configurações → Integrações) aparece só para a Admin da rede; os outros leem que é a Admin da rede quem conecta. (O "Ir para a conversa" sem WhatsApp é a OP-36 do catálogo de Clientes.)
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/crm-inbox.md:1531-1533`, `:1621-1626`; `docs/regras/plataforma.md:745-746`
- Antes: KC-08

**IG-04.** A credencial de uma integração (o token da Meta, o da conexão do WhatsApp Web, o das contas de anúncio, a senha) nunca vai à tela, nem a quem configura: o que já está guardado aparece só como guardado, e salvar sem digitar o segredo de novo mantém o que estava.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:327-333`; `CLAUDE.md:213-221` (§4), `:902`
- Antes: KB-14, KC-12

**IG-05.** Na integração, o sistema grava só os campos daquele provedor. O endereço do provedor que a rede informa tem de ser `https` e público: um endereço interno é recusado.
- Fonte: decisão do Claude
- Onde: `docs/regras/whatsapp-push.md:357-361`
- Antes: KB-15

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Fica na página só a Q01 (o aviso do próprio fato à cliente sai sozinho?). As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo. Revisão de 25/11 (o Heitor, 24/11: "Em teoria não é pra ter pergunta de regra e de escopo, as regras já foram definidas e o escopo também."): a Q01 foi decidida pelo Claude, pelos princípios, para o Heitor revisar.

Q01. **Decidida pelo Claude, 25/11 (o Heitor revisa):** (a) Fica. O aviso do próprio fato não é automação: ele não decide nada nem manda nada novo — confirma à cliente o que a equipe (ou ela mesma) acabou de fazer, como o recibo de um pagamento (princípio 3: o que aconteceu com ela, ela vê). O princípio 6 ("Nada se move sozinho: automação nasce como modelo desligado") vale para o que o sistema faria por conta própria, e é o que o MK1 de 14/11 seguiu: o lembrete antes do agendamento e a confirmação viraram modelos desligados (NC-03). O "nada sai sozinho" do levantamento (`docs/revisao.md:1531-1533`) deve dizer isso; o texto do levantamento não é deste catálogo. Nada muda no código. — *Era:* **NC-01, NC-02 — o aviso do próprio fato à cliente sai sozinho?** O levantamento que você fechou com "Pode fechar" (13/11, `docs/revisao.md:1513`) diz: "À CLIENTE só vai o que a rede liga (automações, campanhas, o documento enviado, os bônus da fidelidade) — nada sai sozinho." (`docs/revisao.md:1531-1533`). Mas `docs/regras/whatsapp-push.md:38-53` (auditoria de 18/11; A12 de 17/11) e o código (`apps/web/lib/appointments/avisos.ts`, `apps/web/lib/plano-de-tratamento/aviso-do-proposto.ts`) mandam sem ninguém ligar: o horário marcado, remarcado, cancelado e concluído, o pagamento e o "Plano novo" (e, no Atendimento, a "Foto nova" do "Enviar à cliente", PT-09 — esta sai de um clique da equipe, como "o documento enviado" do levantamento). E você disse em 03/11: "toda e qualquer automação deve ser feita através dos módulos de automações" (`docs/regras/crm-inbox.md:1395-1396`). Nenhuma regra sua decide: o princípio 6 fala de automação, e não diz se o aviso do fato é uma. O catálogo escreveu o que o sistema faz hoje. Duas saídas: (a) **fica** — é o aviso do próprio fato (a confirmação do que aconteceu), não automação; o levantamento passa a dizer isso; (b) **vira modelo das Automações, desligado até a rede ligar**, como o lembrete e a confirmação viraram (MK1, NC-03). Qual?

Q02. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Os números e os templates — escritas como decisão sua, sem a sua fala: confirma?** WN-08, o limite de números de WhatsApp no plano, recusado em todos os caminhos de ligar (`docs/regras/plataforma.md:273`: "2026-10-06, decisão do Heitor"); WT-03 e WT-05, os templates que seguem os números oficiais ligados — sem número a tela não mostra nada, e desligar o último número da conta tira os templates dela do sistema (`docs/regras/whatsapp-push.md:298`: "2026-10-09, pedido do Heitor"; o DEVLOG de 2026-10-09 também, sem a fala). Ligar o número trazer os templates (WT-04) está no levantamento que você aprovou e não entra aqui.

Q03. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **NC-04 — escrita como decisão sua, sem a sua fala: confirma?** O aviso da cliente ir aos aparelhos de todas as fichas do login dela, ficar registrado na ficha da rede de que fala e levar ao portal dessa rede, também na campanha (`CLAUDE.md:322`: "Um login por pessoa, uma ficha em cada rede (decisão do Heitor)", e `:344-345`; `docs/regras/whatsapp-push.md:54-63`).

## Divergências

O texto de `docs/regras/` (ou da própria revisão), e onde se viu também o código ou a tela, contra a decisão mais nova — para corrigir depois.

- NE-03 (KA-06, KC-14): `docs/revisao.md:1529` (o levantamento de 13/11) diz que o aviso não vai a "quem está em "só os meus""; o "só os meus" saiu em 23/11 (SM1, `docs/revisao.md:2214`; CLAUDE.md §11). `docs/regras/whatsapp-push.md:27-29` já está certo; o texto velho é o da revisão.
- NE-01 (KA-04): `docs/regras/whatsapp-push.md:22-24` conta história ("a leitura antiga não a achava, e ela nunca recebia"). Não é regra diferente, só texto a enxugar.
- WN-07 (KA-20): `docs/regras/whatsapp-push.md:111-112` cita "decisão do Heitor, 2026-09-25" sem a fala. A regra está no levantamento que você aprovou (`docs/revisao.md:1523-1524`), por isso a fonte é a aprovação, e não é pergunta.
- WT-04 (KB-08; pergunta reduzida: a primeira da KB): `docs/regras/whatsapp-push.md:298` diz "pedido do Heitor" sem a fala para o catálogo de templates inteiro. Ligar o número trazer os modelos aprovados está no levantamento aprovado (`docs/revisao.md:1524-1525`): a fonte é a aprovação. O que o levantamento não cobre (WT-03, WT-05) ficou na Q02.
- IG-02 (KB-01, KC-07): `docs/regras/whatsapp-push.md:360-361` fala da integração como coisa de "quem tem `settings: MANAGE`", e `docs/regras/plataforma.md:867-873` (o texto da linha de Configurações na matriz de Cargos) diz que o Gerenciar de Configurações "cita as integrações (o WhatsApp e as contas de anúncio, na aba Integrações)", com a nota sobre quem tem "A rede inteira". Desde 18/11 as integrações são só da Admin da rede (CLAUDE.md §11).
- IG-02 (TELA): a tela de Cargos ainda diz, no Gerenciar de Configurações, "Cadastra e edita unidades e salas, as integrações (conecta o WhatsApp e as contas de anúncio, na aba Integrações)…" (`apps/web/lib/permissions-copy.ts:174`). Esse nível não conecta mais WhatsApp nem conta de anúncio (só a Admin da rede): a tela diz o que o nível não dá (princípio 3).
- IG-02 (CÓDIGO, a conferir): `testWhatsAppConnection` (`apps/web/actions/integrations.ts:355-365`) e `testAdsConnection` (`:439-444`) pedem só Configurações em Gerenciar, sem `recusaDaConfigDaRede`; todas as outras actions de número, de conexão, de anúncio, de templates e de Ações em lote a têm. Quem tem Configurações em Gerenciar e não é a Admin da rede consegue testar a conexão chamando a action direto (a tela não mostra o botão, e nada se grava — só se chama o provedor). A IG-02 põe o testar entre o que é só da Admin da rede.
- IG-01, WC-01, WM-05 (KB-18, KB-33, KC-07): `docs/regras/whatsapp-push.md:397` diz "Configurações → WhatsApp → Oficial" e `:504` "Configurações → WhatsApp"; a aba é Configurações → Integrações, no grupo "Conexões" (`docs/revisao.md:1517-1518`, `:2128`, CF1; a lista das abas em `:1374-1376`). É o caminho da tela, não a regra.
- IG-03 (KC-08): `docs/regras/crm-inbox.md:1531-1533` diz que o inbox vazio dá o atalho de ligar o WhatsApp "só para quem tem Configurações em Gerenciar" e manda os outros pedir "a quem tem as Configurações em Gerenciar"; desde 18/11 é só a Admin da rede. O código já segue a de 18/11 (`apps/web/app/admin/inbox/page.tsx:83` e `apps/web/app/[slug]/inbox/page.tsx:97` pedem também `mexeNaConfigDaRede`; `apps/web/components/admin/crm-inbox.tsx:1765`: "Peça à Admin da rede para conectar o WhatsApp."); só o texto está velho.
- WT-01 (KC-09; com a KC-24, de outra área): `docs/revisao.md:1059-1060` (o levantamento de Marketing) diz que os templates são "usados no inbox fora das 24 h e nas automações"; `docs/regras/automacoes.md:302-304` diz que "o envio de template na automação ainda precisa ser construído". Hoje o template só sai pelo inbox.
- WL-01, WL-02 (pergunta removida: a segunda da KA): o rascunho perguntava se "um número, várias pessoas", "cada pessoa fala por um número só" e a ordem de saída (o número da pessoa vence o da conversa) eram seus. O texto não as atribui a você: são decisão do Claude (fonte 3), e "um número, várias pessoas" está no levantamento aprovado. Pelo formato, não é pergunta; se quiser outra ordem de saída, é "está no escopo?".

## Ficou fora do catálogo

- KC-13: a credencial guardada cifrada, com a chave fora do banco (no Railway, não no Vault; `docs/regras/whatsapp-push.md:335-345`; `CLAUDE.md:903`) — é segurança técnica que o CLAUDE.md §14 já trava para o sistema inteiro ("Gravar config de integração sem cifrarSegredos"), e a pessoa não a percebe na tela; o que ela percebe está na IG-04. Por isso a pergunta "foi sua?" (a segunda da KB e parte da primeira da KC) não entrou.

## É de outra área

- KC-23: o "Mandar mensagem" da automação pelo WhatsApp só fala numa conversa já aberta e ligada à ficha (no oficial, com a janela de 24 h aberta no número que envia) e nunca abre conversa nova sozinho, nem pelo número padrão (`docs/regras/automacoes.md:293-297`, `:318-320`; `docs/regras/whatsapp-push.md:172-175`, `:196-198`; atribuída ao Heitor sem a fala, "H1 do levantamento das regras, 2026-11-11") — área: Automações (catalogada em paralelo, ainda sem número). Daqui ficou a conversa que o sistema usa (WL-05) e a janela no número que envia (WT-11).
- KC-24: o "Para quem não tem conversa aberta" do "Mandar mensagem" (Não mandar · Abrir pelo número padrão · Mandar como aviso no celular), desligado por padrão, decidido e ainda não implementado (`docs/regras/automacoes.md:297-304`, `:315-316`; atribuída ao Heitor sem a fala) — área: Automações (catalogada em paralelo, ainda sem número).
- KC-25: o canal "Aviso no celular" do "Mandar mensagem" (vai ao sino, ao app e ao navegador da cliente, sem conversa; o texto não pede resposta) (`docs/regras/automacoes.md:284-292`) — área: Automações (catalogada em paralelo, ainda sem número).
- KC-26: na rede sem número de WhatsApp ativo, os modelos de automação nascem como aviso no celular, e o passo em WhatsApp avisa e oferece "Mandar como aviso no celular" (`docs/regras/automacoes.md:280-288`) — área: Automações (catalogada em paralelo, ainda sem número).

### Sem número de rascunho (o que os rascunhos já mandaram a outra área)

- (sem número) O inbox em si: a fila, o filtro "Número", quais caixas o cargo VÊ (`inbox_caixas`), responder com template fora das 24 h, o "Abrir a conversa" do card e o "Ir para a conversa" sem WhatsApp (`docs/regras/crm-inbox.md:1204-1210`, `:1621-1626`; `docs/revisao.md:852-856`, `:1258`) — área: Clientes, CRM e inbox, IN-11, IN-12, IN-15, OP-36.
- (sem número) O WhatsApp do cartão "A unidade" e o "Falar com a equipe" do portal (`docs/regras/crm-inbox.md:236-248`) — área: Clientes, CRM e inbox, PO-09, PO-10.
- (sem número) O retorno do card no sino (`docs/regras/crm-inbox.md:1583-1611`) — área: Clientes, CRM e inbox, OP-33; o pedido LGPD no sino (`:638-644`) — LG-09.
- (sem número) O link da ficha de saúde pelo "WhatsApp do aparelho" e o aviso a quem atende quando a cliente responde (`docs/regras/atendimento.md:1736-1750`) — área: Atendimento, FI-11, FI-12, FI-14; o estoque no mínimo e o lote vencendo no sino (`atendimento.md:2964-2987`, A48) — Atendimento, ES-30 (aqui só que o aviso existe, NE-06); a "Foto nova" do "Enviar à cliente" — Atendimento, PT-09 (citada na Q01).
- (sem número) O link de assinatura pela conversa ou pelo WhatsApp do aparelho e o "Pedir no portal" (`docs/regras/documentos.md:593-594`, `:652`, `:667`) — área: Documentos, DL-03, DL-05, DL-06, DC-02 (aqui só qual conversa, WL-05).
- (sem número) O aviso de vencimento dos pontos e os bônus no celular (`docs/regras/fidelidade.md:314-317`) — área: Fidelidade, SA-06, BO-03.
- (sem número) A equipe avisada quando a cliente aceita o plano (`docs/regras/vendas-financeiro.md:150-153`) — área: Atendimento (plano de tratamento).
- (sem número) O público da campanha, o "Quem receberia hoje", a janela "Ligar a automação?", o silêncio noturno e o teto, os modelos desligados (`docs/regras/automacoes.md:250-275`, `:305-316`, `:351-360`, `:580-595`) — área: Automações; os Anúncios (de onde veio o contato, a API de Conversões, `docs/revisao.md:1057-1058`) — Marketing.
- (sem número) O sino quando o suporte entra e sai, o pedido de autorização, a resposta do chamado, o aviso das mudanças da assinatura, os adicionais de conexão de WhatsApp e o WhatsApp extra, o diagnóstico sem segredo e a auditoria das tabelas de credencial (`docs/regras/plataforma.md:123-125`, `:372-415`, `:514-516`, `:658-660`, `:686-692`, `:1227-1230`) — área: Plataforma.
- (sem número) O Copilot indicar a tela para conectar o WhatsApp e ler o gasto na Meta (`docs/regras/copilot.md:214-216`, `:248-250`) — área: Copilot.
- (sem número) O endereço do webhook e dos links públicos, as ações de conexão que conferem o número da rede, o servidor que diz qual é o número da pessoa sem mandar a lista ao navegador, e o CSP do app da rede (`docs/regras/whatsapp-push.md:287-290`, `:371-374`, `:525`; CLAUDE.md §14) — implementação: `docs/regras/infra.md` e CLAUDE.md.
