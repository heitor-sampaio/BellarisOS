# Catálogo de regras — Documentos

Este é o catálogo das regras dos Documentos que valem HOJE: os tipos, os modelos e o editor, as variáveis, onde o documento se liga, quando nasce e o que trava, o "faltam dados", o contrato e o pagamento, assinar, o link e o envio, o PDF e o `/verificar`, o documento no app da cliente, a tela de Documentos e quem vê e mexe. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, "decisão do Claude". "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/documentos.md:1-410`; KB: `docs/regras/documentos.md:408-843`; KC: as decisões de `docs/revisao.md`, do CLAUDE.md e dos outros arquivos de `docs/regras/`, que repetem várias de `documentos.md` — juntas aqui, com os dois "Onde"). É um RASCUNHO para o Heitor revisar. Contagem: 94 regras (Os tipos, os modelos e o editor 16, As variáveis 9, Onde se liga, quando nasce e o que trava 16, Faltam dados 8, O contrato e o pagamento 6, Assinar 13, O link e o envio 6, O PDF e o /verificar 2, No app da cliente 5, A tela de Documentos 4, Quem vê e quem mexe 9), 1 pergunta e 17 divergências. Dos 136 números do rascunho, nenhum ficou fora do catálogo e 9 são de outra área (ver os apêndices); todos os outros estão num "Antes". Das cinco perguntas dos rascunhos, duas viraram a Q01 (regras escritas como suas, sem a fala) e três tinham resposta numa regra que já existe (a de 18/11, com o módulo que ainda dispensa; e o "doc-02: fica" de 02/11): o motivo está em "Divergências".

## Os tipos, os modelos e o editor (DM)

**DM-01.** Os documentos têm cinco tipos: Termo de consentimento, Contrato do procedimento, Contrato de plano, Contrato de pacote e Documento (qualquer outro para a cliente assinar, como uma autorização de uso de imagem ou um regulamento). O tipo diz onde o documento se liga e quais variáveis ele usa. Configurações → Documentos mostra um grupo por tipo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC1)
- Onde: `docs/regras/documentos.md:18-24`; `docs/revisao.md:806-815`, `:2049`
- Antes: KA-01, KC-03

**DM-02.** O que era "Termos e contratos" se chama "Documentos": no menu, na aba de Configurações, nos tipos e no catálogo do plano da rede.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está" (CG2)
- Onde: `docs/revisao.md:1268`, `:2164`, `:2194`; `docs/regras/plataforma.md:347`
- Antes: KC-01

**DM-03.** Configurações → Documentos fica no grupo "Atendimento", ao lado das Fichas.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Concordo" (CF1)
- Onde: `docs/revisao.md:1386`, `:2128`
- Antes: KC-02

**DM-04.** A rede faz o modelo no editor, com variáveis, ou envia um PDF pronto, que é assinado do jeito que está.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC1: "no editor ou em PDF")
- Onde: `docs/regras/documentos.md:10-11`, `:32-33`; `docs/revisao.md:784`, `:810-815`, `:2055`
- Antes: KA-02, KC-05

**DM-05.** Há três contratos: o do procedimento, que só vale no atendimento avulso, o de plano e o de pacote. No pacote e no plano vale o contrato de pacote ou o de plano, porque ele precisa englobar os outros procedimentos. O de plano e o de pacote são modelos da rede, separados um do outro (a rede pode escrever um diferente do outro), e não se ligam a procedimento, porque pertencem à venda.
- Fonte: o Heitor, 2026-11-13: "vamos manter esse contrato do plano, tá? Ele é bom, ele já funciona bem. E vamos estender isso pro pacote também. Estender não, vamos criar um equivalente disso pro pacote. Tá? Então vai ter o contrato do plano, o contrato do pacote e os contratos avulsos dos procedimentos, tá?"
- Onde: `docs/regras/documentos.md:22-25`, `:34-35`, `:50-56`; `docs/revisao.md:302`, `:340-353`, `:767`, `:1938`, `:2049`
- Antes: KA-04, KC-07, KC-10

**DM-06.** A rede tem um só contrato de plano ativo e um só contrato de pacote ativo. O ativo é trocado, e não desativado antes: quando a rede já tem um ativo, o novo é salvo inativo, e assim nenhum texto se perde. "Tornar ativo" desliga o atual do mesmo tipo e liga o escolhido de uma vez.
- Fonte: o Heitor, 2026-10-29: "Fica o fluxo de trocar; sai o de criar outro e desativar o atual antes."
- Onde: `docs/regras/documentos.md:175-183`; `docs/revisao.md:2049`
- Antes: KA-20, KC-11

**DM-07.** Quando o contrato é salvo inativo, a tela avisa: "O contrato de plano “B” foi salvo inativo: a rede já tem um ativo, e só um vale por vez. Para usar este, clique em “Tornar ativo”…". O contrato de pacote tem o mesmo aviso. O aviso diz qual é o ativo e oferece ali mesmo "Usar este no lugar de “A”?", que faz a troca na hora.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:184-191`, `:196-197`
- Antes: KA-21

**DM-08.** O "Tornar ativo" da linha pede confirmação: "Trocar o contrato?", com "O contrato de pacote “Íris” passa a valer; “De fábrica” fica inativo."
- Fonte: decisão do Claude (A32 da 15ª, pelos princípios)
- Onde: `docs/regras/documentos.md:191-196`
- Antes: KA-22

**DM-09.** Toda rede nasce com um contrato de plano padrão ("Contrato de prestação de serviços") e um contrato de pacote padrão; semear de novo não duplica. O texto padrão não exige o CPF da cliente: a rede decide se o modelo dela exige. O modelo novo no editor nasce com o título do tipo ("# Contrato de pacote").
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC2)
- Onde: `docs/regras/documentos.md:554-568`; `docs/revisao.md:816-817`, `:2052`
- Antes: KB-15, KC-12

**DM-10.** O editor de modelo é completo: fonte, tamanho, negrito, itálico, sublinhado, tachado, cor, realce, alinhamento, entrelinhas, títulos, listas, tabelas, imagens, cabeçalho e rodapé e quebra de página. A tela e o PDF desenham o mesmo documento, com as mesmas medidas e as mesmas fontes.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele): "decisão do Heitor, 2026-09-29"
- Onde: `docs/regras/documentos.md:228-234`, `:269-271`
- Antes: KA-27

**DM-11.** O editor tem 12 famílias de fontes livres. O texto colado do Word é ajustado: a fonte do Office vira a fonte livre equivalente (Arial vira Arimo, Times vira Tinos, Calibri vira Carlito, Courier vira Cousine e Georgia vira Gelasio), o tamanho vai para o mais próximo da lista e a cor fica numa cor simples.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:237-239`, `:256-258`
- Antes: KA-28

**DM-12.** Na lista numerada, o número digitado no começo do item não sai duas vezes ("2. 2. Compreendi…"): o igual ao da lista some, o diferente fica como foi escrito, e o item vazio não entra no documento. O editor abre o modelo já assim: mostra o que vai ser salvo e assinado.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:732-735`, `:791-795`, `:839`
- Antes: KB-38

**DM-13.** A imagem do modelo sobe em PNG ou JPEG, com até 2 MB. Ela faz parte do que a assinatura cobre: se a imagem for trocada, o documento já não confere.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:263-266`, `:272-273`
- Antes: KA-30

**DM-14.** Sem o "Lugar da assinatura" no modelo, o editor avisa ("Sem o “Lugar da assinatura”: a assinatura da cliente vai no fim do documento…") e não bloqueia: a tela e o PDF põem a assinatura no fim.
- Fonte: princípio 2
- Onde: `docs/regras/documentos.md:787-790`
- Antes: KB-39

**DM-15.** Cada mudança no texto do modelo cria uma versão nova, e uma versão gravada não muda mais. Salvar sem mudar o texto não cria versão. O modelo não se apaga: se não serve mais, é desativado.
- Fonte: decisão do Claude ("Mantém: o editor e as versões, o PDF pronto")
- Onde: `docs/regras/documentos.md:281-283`; `docs/revisao.md:784`, `:2055`
- Antes: KA-31, KC-05

**DM-16.** O PDF enviado como modelo precisa ser de fato um PDF (o sistema confere o arquivo, não o tipo que o navegador informa). Ele não pode ter senha e tem limite de 10 MB e 50 páginas.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:332-334`
- Antes: KA-32

## As variáveis (DV)

**DV-01.** Cada tipo tem as suas variáveis, de uma lista fechada: o termo não usa as do agendamento, porque também serve ao plano; o Documento usa exatamente as do termo (cliente, responsável, procedimento, rede e unidade, data); o contrato do procedimento é o do avulso; só o contrato de plano usa as do plano, e só o de pacote usa as do pacote; as do pagamento valem nos três contratos. Uma variável que não é do tipo é recusada ao salvar.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC1: "O tipo diz em que campo o documento se liga e quais variáveis ele usa; o "Documento" usa as do termo")
- Onde: `docs/regras/documentos.md:222-227`; `docs/revisao.md:813-815`, `:2049`
- Antes: KA-26, KC-04

**DV-02.** As variáveis do contrato de pacote são as do contrato de plano, com as do pacote no lugar das do plano: nome, procedimentos, sessões, validade e total. Entram também as do pagamento. Esse contrato não tem variável de quem atende, porque o pacote vendido não tem quem atenda.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC1)
- Onde: `docs/regras/documentos.md:54-59`; `docs/revisao.md:814`, `:2049`
- Antes: KA-09, KC-04

**DV-03.** A validade do pacote nunca sai vazia no contrato. Sem prazo, o contrato diz "sem prazo de validade"; com prazo, diz "180 dias, até 13/05/2027", contado no fuso da unidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:60-62`
- Antes: KA-10

**DV-04.** "Profissional que atende" vale no termo, no Documento, no contrato do procedimento e no contrato de plano: no avulso, é quem atende o agendamento; no termo e no contrato do plano, o profissional do plano. Ela é obrigatória: sem ela, o documento fica em "faltam dados" (a exceção do pacote é a DV-05).
- Fonte: princípio 3
- Onde: `docs/regras/documentos.md:722-727`, `:779-781`
- Antes: KB-35

**DV-05.** No documento do pacote, os dados de quem atende saem vazios, sem travar nada. Vale para os documentos do pacote vendido e também para o contrato colhido antes da venda.
- Fonte: princípio 4
- Onde: `docs/regras/documentos.md:62-65`
- Antes: KA-11

**DV-06.** O cadastro da equipe tem "Registro no conselho (opcional)", e a variável do registro (opcional; sai vazia sem o registro) traz o do mesmo profissional de "Profissional que atende".
- Fonte: princípio 1
- Onde: `docs/regras/documentos.md:772-778`
- Antes: KB-36

**DV-07.** A variável digitada ou colada à mão, como "{{cliente.nome}}", com ou sem espaços dentro, vira variável na hora, com o estilo do texto em volta, e a prévia já mostra o valor de exemplo; "{{paciente.x}}" é o mesmo que "{{cliente.x}}". Chaves que não formam variável, como "{{ Nome }}" ou "{{}}", são recusadas ao salvar. Ao salvar, o editor diz de uma vez todas as variáveis erradas — as que não existem e as de outro tipo —, e a mensagem diz qual é cada uma.
- Fonte: princípio 3
- Onde: `docs/regras/documentos.md:242-251`, `:728-731`, `:782-786`
- Antes: KA-29, KB-37

**DV-08.** A variável opcional que pode sair vazia se diz: o menu "Inserir variável" diz, junto de cada opcional, quando ela sai vazia ("vazia sem entrada (à vista, cartão em vezes, a receber)"), e que a forma de pagamento já é a frase completa; no pagamento do plano, o contrato em aberto diz quais saem vazias nele ("Neste plano saem vazias: Valor da entrada e Primeiro vencimento. Confira se o texto do contrato fica certo sem elas…"). Nada se bloqueia.
- Fonte: princípio 3
- Onde: `docs/regras/documentos.md:753-770`
- Antes: KB-16

**DV-09.** O texto do documento concorda com o sexo da ficha. O par "a(o)"/"o(a)" no fim de uma palavra, ou sozinho como em "o(a) paciente", vira a forma do sexo cadastrado: "informada" e "a paciente" para F, "informado" e "o paciente" para M. Sem o dado, ou com "Outro", o texto fica como a rede escreveu. O ajuste vale só para o texto do modelo, não para o valor das variáveis. O que se assina é o texto já ajustado.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:371-379`
- Antes: KA-45

## Onde o documento se liga, quando nasce e o que trava (DE)

**DE-01.** Em "Outros documentos", o procedimento oferece todo modelo ativo da rede do tipo Documento, Termo ou Contrato do procedimento, o PDF enviado inclusive. O contrato de plano e o de pacote nunca aparecem ali (são da venda).
- Fonte: o Heitor, 2026-11-13: "qualquer documento que tenha sido criado ou anexado no sistema"
- Onde: `docs/regras/documentos.md:30-36`, `:40-43`; `docs/revisao.md:309-311`, `:2050`
- Antes: KA-05, KC-09

**DE-02.** O modelo que já está escolhido no campo "Termo de consentimento" ou "Contrato" não é oferecido de novo em "Outros documentos", e nada se repete na lista. O documento que já está marcado continua marcado, mesmo depois de desativado.
- Fonte: decisão do Claude (pelos princípios 3 e 7, 2026-11-18)
- Onde: `docs/regras/documentos.md:40-47`
- Antes: KA-06

**DE-03.** Em "Outros documentos", os do tipo Documento aparecem primeiro. O termo e o contrato vêm no fim, com o tipo entre parênteses: "Nome (termo)", "(contrato, inativo)".
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:37-39`
- Antes: KA-07

**DE-04.** O pacote e o plano puxam, de cada procedimento diferente deles, o termo e os outros documentos, uma vez cada; o contrato do procedimento nunca é puxado (no plano vale o contrato de plano, no pacote o de pacote). Os puxados aparecem na criação do pacote e do plano, logo abaixo da escolha do termo e do contrato, e cada um — o termo também — tem "Excluir" e "Incluir de novo".
- Fonte: o Heitor, 2026-11-13: "quando for montar um plano ou um pacote, quando puxar os documentos, ele vai puxar os termos dos procedimentos e vai puxar também os outros documentos que tiver. Ele só não puxa o contrato. Tá? E aí esses documentos que ele vai puxar todos, deve dar para poder excluir o qual quiser, né?"
- Onde: `docs/regras/documentos.md:50-52`, `:98`, `:107-114`, `:127-139`; `docs/revisao.md:354-373`, `:1940`, `:2051`
- Antes: KA-13, KA-15, KC-13, KC-14

**DE-05.** A janela do pacote mostra o que vai ser emitido na venda: o contrato de pacote da rede e os documentos puxados que ficaram. O pacote guarda só o que a rede excluiu: se depois a rede liga um documento novo a um procedimento do pacote, ele entra sozinho. O que a janela mostra é o que é emitido na venda.
- Fonte: princípio 3
- Onde: `docs/regras/documentos.md:107-114`
- Antes: KA-13, KA-14

**DE-06.** A página do plano e a ficha mostram o bloco "Documentos" do plano, com o contrato de plano ("nasce no PDV, com a forma de pagamento") e os puxados. A lista acompanha as sessões do editor enquanto o plano é montado, e, antes do aceite, quem monta o plano (o Atendimento em Gerenciar, PL-02 do catálogo do Atendimento) usa "Excluir" e "Incluir de novo" em cada um.
- Fonte: o Heitor, 2026-11-13: "quando for montar um plano ou um pacote, quando puxar os documentos, ele vai puxar os termos dos procedimentos e vai puxar também os outros documentos que tiver. Ele só não puxa o contrato."
- Onde: `docs/regras/documentos.md:127-139`; `docs/revisao.md:359-373`, `:2051`
- Antes: KA-15

**DE-07.** Não existe "quando nasce" no modelo. Todo documento do atendimento avulso nasce ao agendar (AG-34 do catálogo do Atendimento); o do pacote, na venda (PA-10 do catálogo de Vendas e financeiro); o termo e os outros documentos do plano, na criação do plano, no primeiro "Salvar plano" com a cliente, e não no aceite; o contrato de plano, no PDV, junto com a forma de pagamento (PL-14 do catálogo do Atendimento).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC4: "o do pacote e o do plano, na venda/na criação")
- Onde: `docs/regras/documentos.md:140-149`, `:335`; `docs/revisao.md:822-823`, `:2054`
- Antes: KA-16, KC-16

**DE-08.** Cada atendimento avulso e cada plano pede documentos novos.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:52-53`
- Antes: KA-08

**DE-09.** Enquanto o plano está aberto (rascunho, proposto ou aceito), salvar de novo atualiza os documentos: o de um procedimento que saiu das sessões, ou que foi excluído, é cancelado e o link dele revogado; o de um procedimento que entrou é emitido. Quando o plano é cancelado ou recusado, os documentos abertos são cancelados ("Plano cancelado" / "Plano recusado").
- Fonte: decisão do Claude (pelo princípio 3, 2026-11-18)
- Onde: `docs/regras/documentos.md:148-154`
- Antes: KA-17

**DE-10.** No atendimento avulso, cancelar o agendamento ou marcar a falta cancela os documentos abertos dele e invalida os links; reabrir um agendamento cancelado, ou desfazer a falta, emite os documentos de novo; trocar o procedimento troca os documentos. Iniciar o atendimento não emite nada: tudo foi emitido ao agendar. (O cancelamento do pacote e o do plano: PA-10 do catálogo de Vendas e financeiro e DE-09.)
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:341-347`; `docs/revisao.md:790-791`, `:1819`; `docs/regras/atendimento.md:758`, `:2380`
- Antes: KA-41, KC-23

**DE-11.** Quando um agendamento comum é ligado a um pacote depois de agendado, os documentos abertos dele são cancelados, com o motivo "Sessão de pacote: os documentos são os do pacote". Desligar a sessão do pacote não emite os documentos de novo. O procedimento vendido antes (pré-pago) é avulso, e por isso emite.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:356-366`
- Antes: KA-42

**DE-12.** Os documentos só funcionam quando a rede tem o recurso Documentos no plano que contratou do BellarisOS. Sem ele, nenhum documento nasce, e o que estiver pendente não trava o atendimento nem o recebimento.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:313-314`; `docs/regras/plataforma.md:299`
- Antes: KA-39, KC-38

**DE-13.** Cada documento diz se trava o início do atendimento enquanto não for assinado ("Bloqueia") ou se só avisa. É escolha da rede, documento por documento.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC4: ""Bloqueia o início ou só avisa" fica, por documento (princípio 1)")
- Onde: `docs/regras/documentos.md:347-349`; `docs/revisao.md:826`, `:2054`
- Antes: KA-40, KC-17

**DE-14.** Um documento do plano que "Bloqueia" trava o início de cada sessão do plano enquanto estiver aberto, e um do pacote, o de cada sessão do pacote. A janela do agendamento e a tela do atendimento mostram esses documentos. A sessão não emite documento próprio.
- Fonte: decisão do Claude (D4 da 25ª, 2026-11-18; leva 2 de Documentos, 14/11)
- Onde: `docs/regras/documentos.md:119`, `:157-164`; `docs/revisao.md:1818`
- Antes: KA-18, KC-18

**DE-15.** Nenhum caminho do sistema inicia o atendimento com um documento que "Bloqueia" ainda aberto. O documento dispensado, com motivo, conta como cumprido e libera o início.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:395-396`; `docs/revisao.md:798`, `:1811`
- Antes: KA-50, KC-26

**DE-16.** A janela "+ Agendar" diz quais documentos do procedimento travam o início do atendimento: "Sem assinatura, o atendimento não se inicia: “X” e “Y”. O “Enviar link de assinatura” fica no card do agendamento."
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:387-391`
- Antes: KA-48

## Faltam dados (DD)

**DD-01.** Quando falta um dado obrigatório do cadastro (o CPF, por exemplo), o documento fica em "faltam dados" e não pode ser assinado.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:380-383`; `docs/revisao.md:792`, `:2055`
- Antes: KA-46, KC-21

**DD-02.** Onde um documento está em "faltam dados" (a janela do agendamento, a tela Documentos, a tela de assinar, a ficha), a tela diz o que falta ("Faltam dados: CPF · bloqueia o início"; "Falta: …"). "Completar o cadastro", que leva à aba Dados, aparece só a quem tem Clientes em Gerenciar; quem não edita lê o que falta e "Quem tem os Clientes em Gerenciar completa o cadastro (…)". (O aviso na Visão geral da ficha é a CL-25 do catálogo de Clientes, CRM e inbox.)
- Fonte: princípio 7
- Onde: `docs/regras/documentos.md:505-511`, `:612-617`, `:743-746`; `docs/regras/crm-inbox.md:573`
- Antes: KB-33, KC-21

**DD-03.** Salvar o cadastro da cliente (na ficha, no app ou pelo Copilot) monta de novo, na hora, os documentos dela em "faltam dados": completado o que faltava, eles ficam prontos para assinar. Se a montagem falhar, o cadastro fica salvo assim mesmo.
- Fonte: princípio 3
- Onde: `docs/regras/documentos.md:689-694`
- Antes: KB-32

**DD-04.** Abrir um documento que não mudou não grava nada: o código de verificação continua o mesmo, e a Auditoria não ganha um registro a cada abertura.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:383-386`
- Antes: KA-47

**DD-05.** No "+ Agendar", escolhidas a cliente e o procedimento, a janela avisa o que falta no cadastro para os documentos dele ("“Termo do peeling” pede no cadastro: Data de nascimento · sem isso, não se inicia o atendimento.", com "Completar o cadastro"). É só aviso: o agendamento segue.
- Fonte: princípio 2
- Onde: `docs/regras/documentos.md:796-803`
- Antes: KB-34

**DD-06.** Quando a cliente não tem CPF, o documento dela no texto é o passaporte ou o RNE, com o tipo escrito ("Passaporte CB1234567"). A variável do documento da cliente sempre diz o tipo ("CPF 123.456.789-01"). A evidência da assinatura guarda o mesmo, e o PDF o mostra mascarado ("Passaporte CB***67"). O termo da cliente estrangeira não fica em "faltam dados" por falta de CPF; fica só quando ela não tem nenhum dos três documentos.
- Fonte: o Heitor, 2026-11-02: "contrato sem documento da cliente vale menos"
- Onde: `docs/regras/documentos.md:198-205`
- Antes: KA-23

**DD-07.** As variáveis do responsável (nome, CPF, parentesco e telefone) valem em todo tipo e são opcionais, para a adulta e para a menor. Se a menor não tem responsável no cadastro, o documento não fica em "faltam dados" e o início do atendimento não é travado: a ficha avisa "sem responsável legal no cadastro", e os dados do responsável saem vazios.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-05: "concordo" (decisão 2 da 7ª simulação: "avisar, não barrar")
- Onde: `docs/regras/documentos.md:206-215`; `docs/revisao.md:797`, `:2055`; `docs/regras/crm-inbox.md:55`
- Antes: KA-25, KC-22

**DD-08.** Depois da venda do pacote, o aviso dos documentos diz o que falta no cadastro, com o mesmo texto da janela da agenda ("Falta no cadastro: Endereço (rua, número e bairro)."), e, a quem vê a ficha, onde eles estão: "Estão na ficha, em Documentos.". Quem vendeu colhe a assinatura ali mesmo ("Colher a assinatura agora"), sem permissão de documento, e o aviso não manda "falar com quem tem os Documentos".
- Fonte: princípio 3 (D1 da 15ª simulação); quem vendeu colhe: o Heitor, 2026-11-16: "É só uma questão de disponibilizar para o cliente assinar e isso não representa risco." (DQ-06)
- Onde: `docs/regras/documentos.md:714-721`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## O contrato e o pagamento (DG)

**DG-01.** O contrato que cita o pagamento (o do atendimento avulso, o de plano e o de pacote) precisa do "pagamento combinado" antes de ser assinado. Até lá, fica em "faltam dados": não se assina, não sai por link e, se "Bloqueia", trava o início do atendimento; a tela diz isso. Quem colhe a assinatura define o pagamento antes dela; "não combinado" é diferente de "pagar no atendimento". O pagamento troca até a assinatura; assinado, não muda.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC4: o contrato que cita o pagamento continua pedindo o "pagamento combinado" antes)
- Onde: `docs/regras/documentos.md:349-350`, `:512-522`; `docs/revisao.md:826-828`, `:2054`
- Antes: KA-43, KB-10, KC-19

**DG-02.** O que o contrato diz do pagamento é o que foi gravado. A forma é a frase inteira: no "entrada + parcelas", a entrada com o meio e as vezes dela, e as parcelas no crediário, cada uma com o valor gravado e a data ("entrada de R$ 1.000,00 no cartão de crédito em 3x + 2 parcelas de R$ 1.700,00 no crediário: R$ 1.700,00 em 04/12/2026 e R$ 1.700,00 em 04/01/2027"; diferentes: "3 parcelas (2x de R$ 890,66 + 1x de R$ 890,68) no crediário: …"), nunca a média. O valor da parcela diz a diferente ("R$ 890,66 (a última, R$ 890,68)"), também no cartão em N vezes. O meio de pagamento é o da entrada e, sem entrada, "Crediário" — nunca em branco.
- Fonte: o Heitor, 2026-11-13 (PDV8): "sempre tem que ter forma de pagamento, o crediario é uma forma de pagamento, não existe pagamento sem forma de pagamento"
- Onde: `docs/regras/documentos.md:525-546`; `docs/revisao.md:1982`
- Antes: KB-11, KC-20

**DG-03.** Mudar o pagamento (ou o desconto) de um contrato já assinado substitui o contrato, e a tela pergunta antes ("O contrato "X" já foi assinado para outro pagamento (à vista no Pix)"), com "Substituir o contrato" ou "Manter o pagamento combinado". Só confirmado, o assinado vira substituído e nasce um novo para a cliente assinar. Vale em todo caminho que recebe o combinado no contrato — o plano, o pacote e a comanda do atendimento no PDV: o PDV já abre com o combinado inteiro (a forma, as vezes do cartão, o crediário e o desconto), a pergunta vem antes de gravar qualquer coisa, e substituir o contrato vale junto do dinheiro, na mesma gravação.
- Fonte: decisão do Claude; a comanda do atendimento no PDV: decisão do Claude, 26/11 (33ª simulação, D1), pela própria DG-03 e pela VD-10 de Vendas
- Onde: `docs/regras/documentos.md:469-476`, `:545-568`
- Antes: KB-12; antes de 26/11: o PDV recebia com outro pagamento num contrato assinado sem perguntar, e do combinado só vinha o meio (o "crédito 3x" voltava em 1x)

**DG-04.** Reabrir o pagamento de um plano com o contrato já assinado parte do pagamento e do desconto assinados, e a tela diz: "O contrato “X” já foi assinado com este pagamento: À vista, no Pix. Mudar as condições pede um contrato novo: a cliente assina de novo." Assinar um documento ali não leva a tela de volta ao começo.
- Fonte: princípio 3
- Onde: `docs/regras/documentos.md:477-495`
- Antes: KB-13

**DG-05.** Com um contrato de plano ativo na rede e a ficha sem CPF, passaporte nem RNE, o pagamento do plano avisa ("O cadastro de Renata não tem CPF (nem passaporte ou RNE): o contrato do plano sai sem esse documento. Para incluir, complete o cadastro antes de ir para a documentação.") e segue.
- Fonte: o Heitor, 2026-11-02: "contrato sem documento da cliente vale menos"
- Onde: `docs/regras/documentos.md:496-504`
- Antes: KB-14

**DG-06.** Quando o contrato de pacote é colhido antes da venda (ele se assina antes do dinheiro: PA-08 do catálogo de Vendas e financeiro), ele é montado com o que foi combinado na venda e com os dados do catálogo (nome, preço de tabela, itens). A validade que ele cita conta a partir do dia em que é montado. Cada cliente tem um só contrato vivo por pacote antes da venda. Na venda, o pacote vendido adota esse contrato, e outro não é emitido.
- Fonte: decisão do Claude (a validade contada de hoje: princípio 4, 2026-11-18)
- Onde: `docs/regras/documentos.md:65-67`, `:76-78`, `:84-87`, `:92-95`
- Antes: KA-12

## Assinar (DA)

**DA-01.** A cliente assina de quatro jeitos: na tela, no aparelho que a equipe entrega a ela na unidade; no app; pelo link; ou no papel.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:10-12`; `docs/revisao.md:794-798`, `:2055`
- Antes: KA-03

**DA-02.** A cliente assina de uma vez todos os documentos abertos e prontos de um mesmo momento — o agendamento, o pacote vendido ou o plano, sempre de uma cliente só —, em todo canal: no link, no aparelho entregue na unidade ("Entregar ao cliente") e no app ("Assinar todos"; no app, só os da ficha dela). A tela lista os documentos; ela abre cada um ("Ler"), marca o aceite, que diz os títulos ("Eu, Ana, li e concordo com os documentos: A, B e C."), e assina uma vez. O botão diz o que falta, inclusive os documentos que ela ainda não abriu.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC3)
- Onde: `docs/regras/documentos.md:412-422`, `:429-431`; `docs/revisao.md:818-821`, `:2053`, `:2150`
- Antes: KB-01, KC-25

**DA-03.** Cada documento assinado junto guarda a sua própria prova: a mesma imagem da assinatura, mas o código, o PDF, o QR e a impressão digital daquele documento tal como ela o viu. O `/verificar` continua um documento por vez. O texto do aceite é montado pelo sistema com os títulos gravados, não pela tela.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC3)
- Onde: `docs/regras/documentos.md:418-425`, `:833`; `docs/revisao.md:820-821`
- Antes: KB-02, KC-25

**DA-04.** O documento em "faltam dados" fica de fora da assinatura conjunta e do link, e a tela diz qual e o que falta. Nunca entra documento de outra cliente nem de outro momento. Assinar no papel e dispensar com motivo continuam um documento por vez.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo" (DC3)
- Onde: `docs/regras/documentos.md:426-428`, `:834`; `docs/revisao.md:2053`
- Antes: KB-03, KC-26

**DA-05.** Assinados todos, a tela confirma "Documentos assinados" com os títulos, mesmo que a lista tenha ficado vazia; no app, quem chega sem nada para assinar lê "Nenhum documento esperando a sua assinatura."
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:432-438`
- Antes: KB-04

**DA-06.** Assinar é um gesto só: marcar "li e concordo", desenhar no quadro e "Assinar documento". Não há um "Confirmar assinatura" à parte ("Limpar" apaga o desenho). Com o botão apagado, a tela diz o que falta ("Para assinar, falta marcar que leu e concorda e assinar no quadro.").
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-02: "fica" (doc-02, o "Confirmar assinatura" que o J-62 tirou)
- Onde: `docs/regras/documentos.md:439-447`; `DEVLOG.md:5556-5557`, `:5578`, `:14605`, `:14615`
- Antes: KB-05

**DA-07.** A assinatura só vale se o que a cliente viu é o que está gravado. O aparelho em que ela assina calcula uma impressão digital (SHA-256) do texto que recebeu, e a assinatura é recusada se ela não for igual à do texto gravado.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:392-394`
- Antes: KA-49

**DA-08.** A assinatura grava, numa vez só, a prova e a nova situação do documento. A prova guarda quem assinou, quando, a imagem da assinatura e a impressão digital do texto, e nunca se altera nem se apaga.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:408-411`
- Antes: KA-52, KB-06

**DA-09.** "Entregar ao cliente" põe a tela da cliente (o documento, o aceite e a assinatura) por cima de tudo, na tela inteira: o menu, a busca e a pessoa logada ficam cobertos, e o Esc não a fecha. No fim, a tela diz "Devolva o aparelho à equipe".
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:448-454`
- Antes: KB-07

**DA-10.** Assinado no papel ("Confirmar: o cliente assinou o papel"), a tela fica com a equipe: diz "Assinatura no papel registrada.", sem a tela cheia da cliente e sem o "Devolva o aparelho".
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:455-460`
- Antes: KB-08

**DA-11.** Quando a cliente é menor e tem responsável legal no cadastro, quem assina o documento é o responsável. O nome dele aparece no aceite, no "Conferi o documento de identidade de", na tela de assinar e na evidência ("Marta Lima, responsável legal de Beatriz Lima", com o CPF dele). A adulta, e a menor que ainda não tem responsável no cadastro, assinam por si.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-05: "concordo" (decisão 2 da 7ª simulação: "termo assinado pelo responsável (avisar, não barrar)")
- Onde: `docs/regras/documentos.md:206-208`, `:215-221`; `docs/revisao.md:797`, `:2055`; `docs/regras/crm-inbox.md:55`
- Antes: KA-24, KC-22

**DA-12.** Na janela do agendamento, o termo que falta assinar tem "Colher assinatura". O botão abre a tela de assinar e, no fim, volta para a agenda. Aparece para quem abre a janela.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:367-370`
- Antes: KA-44

**DA-13.** O documento assinado mostra o nome com que a pessoa assinou (o que a prova da assinatura guarda), na linha de assinatura e no corpo — nunca o nome que a ficha tem hoje. Corrigir o nome da cliente depois da assinatura muda a ficha, não o documento: a tela, o PDF e o `/verificar` continuam batendo com a impressão digital gravada. O cabeçalho da tela pode mostrar o nome de hoje da ficha, com "assinado como <nome da assinatura>" quando os dois diferem. Na menor, o nome que vale é o do responsável, como ele assinou (DA-11).
- Fonte: decisão do Claude, 25/11 (o Heitor revisa), pela DA-07 (o que a cliente viu é o que está gravado), pela DA-08 (a prova nunca se altera) e pelo princípio 3 (D1 da 29ª simulação: o termo da C05 passou a mostrar o nome corrigido depois)
- Onde: a regra entra em `docs/regras/documentos.md` com a correção do D1 (25/11); `apps/web/components/shared/tela-de-assinatura.tsx` (`nomeDoAssinante`), `apps/web/lib/documentos/leitura.ts`
- Antes: (sem número: D1 da 29ª simulação)

## O link e o envio (DL)

**DL-01.** O link de assinatura é um por cliente e momento (o agendamento, o pacote vendido, o plano) e leva todos os documentos abertos e prontos desse momento: ela vê todos e assina uma vez, e a assinatura vale para todos — o link não assina só uma parte. Gerar outro revoga o anterior inteiro. A ficha diz o que vai no link e o que fica de fora. (AG-35 do catálogo do Atendimento.)
- Fonte: o Heitor, 2026-11-13: "vai sempre tudo no mesmo link, tá? Todos os documentos em um link único, a pessoa visualiza e assina uma vez só, a assinatura dela vale para todos os documentos do link."
- Onde: `docs/regras/documentos.md:412`, `:625-634`; `docs/revisao.md:467-469`, `:1941`, `:1958`, `:2053`
- Antes: KB-23, KC-24

**DL-02.** O link abre sem login, vale 7 dias e uma vez só, e aparece uma vez só (o sistema não o guarda): perdeu, gera outro. Antes de ver o documento, a cliente confirma o CPF ou, sem CPF no cadastro, a data de nascimento; sem nenhum dos dois, o link não é gerado. Até confirmar, a página mostra só a rede e "um documento". Cinco erros revogam o link; vinte erros numa hora param o aparelho. Assinar confere a identidade de novo.
- Fonte: decisão do Claude ("Mantém: … a segurança do link")
- Onde: `docs/regras/documentos.md:625-626`, `:635-646`, `:832`; `docs/revisao.md:795`, `:1812`, `:2055`; `CLAUDE.md:441`
- Antes: KB-24, KC-32

**DL-03.** O link vai pelo WhatsApp do aparelho de quem envia: uma mensagem pronta, genérica, que não depende de número conectado nem da janela de 24h. A mensagem saúda pelo nome sem o tratamento ("Dona Ivone Becker" é "Olá, Ivone!"; só o tratamento, "Olá!") e diz o que confirmar com a concordância certa ("o seu CPF", "a sua data de nascimento"). É o mesmo texto do link da Ficha de saúde.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:652-661`
- Antes: KB-25

**DL-04.** "Enviar link de assinatura" está onde a assinatura é pedida: na ficha, na janela do agendamento (no documento a assinar) e na documentação do pagamento do plano, para quem colhe (DQ-06).
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:736-742`
- Antes: KB-09

**DL-05.** Mandar o link pela conversa do inbox é uma opção da rede, em Configurações → Documentos, que nasce desligada. (Quem a liga e desliga: DQ-01.)
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele): "a chave é decisão do Heitor de 2026-09-30"
- Onde: `docs/regras/documentos.md:662-665`; `docs/revisao.md:796`, `:2055`; `docs/regras/atendimento.md:1881-1882`
- Antes: KB-26, KC-33

**DL-06.** Ligada a opção, a ficha tem "Enviar pela conversa": gera um link novo e o manda na conversa de WhatsApp aberta em que a cliente falou por último, pelo número DA conversa — nunca pelo de quem clicou. Não pede o CRM (quem manda não lê a conversa). Com a janela de 24h fechada, não sai, e o link volta para copiar; sem conversa, recusa antes de gerar, e o link que já existia continua valendo.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:665-672`
- Antes: KB-27

## O PDF e o /verificar (DF)

**DF-01.** O PDF assinado desenha o mesmo documento da tela (o PDF enviado pela rede sai como está), com o código de conferência no rodapé de toda página, o QR e uma página de evidências, com os mesmos rótulos da trilha da tela. Ele nasce logo depois da assinatura, e o sistema tenta de novo se falhar. O QR e o link impressos levam ao endereço público do sistema.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:572-578`, `:584-589`, `:703-704`, `:840`; `CLAUDE.md:440`; `docs/revisao.md:799`
- Antes: KB-17, KC-41

**DF-02.** O `/verificar` é público: qualquer pessoa, sem entrar no sistema, digita o código e vê a situação, a rede, a unidade, as iniciais de quem assinou e as impressões digitais (SHA-256) do documento e do PDF — nunca CPF, nome completo, IP ou o conteúdo. "Conferir um arquivo" confere o PDF no próprio navegador, sem enviá-lo.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:579-582`; `docs/revisao.md:799-800`, `:2055`; `CLAUDE.md:440`
- Antes: KB-18, KC-41

## No app da cliente (DC)

**DC-01.** No app, em Documentos, a cliente vê o que espera a assinatura dela e os assinados, e assina todos os abertos de uma vez, com a própria sessão — só documento dela. No Histórico, cada assinado abre o documento (só o dela). O assinado pelo app vai para a ficha ("A equipe já recebeu o documento assinado."), sem aviso no sino da equipe.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Concordo" (Portal e app da cliente: "O resto, como está"); o assinado pelo app sem aviso à equipe: decisão do Claude, 27/11 (36ª, Decisão D) — nenhuma regra pede o aviso (a NE-06 de WhatsApp e push lista os avisos da operação)
- Onde: `docs/regras/documentos.md:590-596`; `docs/revisao.md:1476`, `:1492`, `:1498`, `:2150`
- Antes: KB-20, KC-42

**DC-02.** "Pedir no portal" avisa a cliente no celular com texto genérico (o aviso aparece na tela de bloqueio). Ele só aparece se a cliente tem acesso ao app — sem acesso, a tela diz antes "Sem acesso ao app: colha na tela, por link ou no papel." — e se o plano da rede tem o portal da cliente. Sem o portal no plano, o pedido é recusado ("O plano desta rede não tem o portal da cliente…") e nada conta como enviado.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:592-611`, `:841`
- Antes: KB-21

**DC-03.** O pedido de assinatura pelo app abre o portal na unidade do documento (ou, sem ela, na de quem pediu).
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:981`
- Antes: KC-44

**DC-04.** Quem agenda pelo app e tem documento a assinar vai direto para ele. O detalhe do agendamento no app tem "Documentos deste atendimento", com o título e a situação: "Falta a sua assinatura" (com "Assinar"), "Assinado em …" (com "Ver"), "Em preparação pela equipe", "Dispensado pela equipe". O que falta no cadastro e o motivo da dispensa ficam só com a equipe.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:618-624`
- Antes: KB-22

**DC-05.** No app, o plano aceito ainda sem o contrato emitido diz "O contrato do plano se assina no pagamento, na unidade." no lugar de "Nenhum documento neste plano", quando o plano ainda não foi recebido e a rede tem um contrato de plano ativo. O "Plano aceito!" diz o mesmo ("…e o contrato do plano se assina lá, no pagamento."). Sem documento nenhum no app, a tela não promete assinatura por ali.
- Fonte: princípio 3
- Onde: `docs/regras/documentos.md:165-173`
- Antes: KA-19

## A tela de Documentos (DT)

**DT-01.** A tela Documentos (menu Atendimento, nos dois portais) lista todo termo e contrato emitido no período com a situação — faltam dados (e o quê), a enviar, enviado, assinado, dispensado, cancelado; o substituído só pelo filtro —, as contagens no topo e os filtros de período, situação, tipo, unidade e busca. "Enviado" é link gerado, pedido no app ou link pela conversa, e a linha mostra o envio mais recente, se o link vale ou venceu e se a cliente abriu.
- Fonte: o Heitor, 2026-10-14: "algum lugar para visualizar a lista de assinaturas com status — o que foi gerado, o que foi enviado, se já foi assinado"
- Onde: `docs/regras/documentos.md:675-683`, `:705-706`; `docs/revisao.md:801`, `:2055`; `DEVLOG.md:6208-6221`
- Antes: KB-28, KC-39

**DT-02.** A tela Documentos só lê: abre a quem tem Clientes em Ver, com os documentos das unidades ao alcance da pessoa. A janela do documento mostra a trilha (sem o CPF de quem assinou), o PDF e "Abrir na ficha"; as ações ficam na ficha.
- Fonte: decisão do Claude ("Mantém: … a tela Documentos só de leitura")
- Onde: `docs/regras/documentos.md:684-688`; `docs/revisao.md:801`, `:2055`
- Antes: KB-29, KC-39

**DT-03.** Os documentos não se recortam por quem atende: quem chega a eles vê os de todas as clientes das unidades ao seu alcance. Pelo endereço ou pelo id (abrir, colher, papel, link, conversa, revogar, pedir no app, dispensar, montar de novo, a trilha, a tela de assinar, o PDF), documento fora da abrangência responde como se não existisse.
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem, no crm acho que não se aplica diretamente e talvez o melhor caminho seja pelo filtro de dono da oportunidade, quem quer ver só as oportunidades que é dono, aplica o filtro"
- Onde: `docs/regras/documentos.md:708-716`; `docs/revisao.md:1293-1296`, `:2214`
- Antes: KB-30, KC-40

**DT-04.** Na linha do tempo da ficha, "Assinado: <título>" leva só o título do modelo e o canal, nada do conteúdo do documento.
- Fonte: o Heitor, 2026-11-02: "o histórico não é dado clínico, é o histórico de ações feitas no cliente dentro do sistema"
- Onde: `docs/regras/documentos.md:716-720`
- Antes: KB-31

## Quem vê e quem mexe (DQ)

**DQ-01.** Os modelos de documento — criar, editar e desativar, e trocar o contrato ativo — e a opção de mandar o link pela conversa (DL-05) são configuração da rede toda: só a Admin da rede mexe. Para os outros, a aba diz "Esta configuração é só da Admin da rede."
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `CLAUDE.md:752-757` (§11, com os modelos de documento na lista); `docs/regras/plataforma.md:742`; `docs/regras/documentos.md:291-302`, `:662-665`
- Antes: KA-33, KC-34, KB-26

**DQ-02.** O módulo Documentos ("Dispensar documentos" na tela de Cargos; o nome é do Heitor, 26/11, R19) tem dois níveis, "Sem acesso" e Gerenciar. Quem o tem em Gerenciar dispensa um documento obrigatório da cliente, sempre com um motivo, e a tela só mostra "Dispensar" a quem pode. Criar e mudar os modelos é da Admin da rede (DQ-01); ver e colher não pedem o módulo (DQ-05, DQ-06).
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:293-297`; `docs/revisao.md:54`
- Antes: KA-35, KC-35

**DQ-03.** Os cargos que a rede recebe como modelo nascem sem o "Dispensar documentos".
- Fonte: o Heitor, 2026-11-16: "Pode deixar sem"
- Onde: `docs/regras/documentos.md:300-302`, `:326-327`
- Antes: KA-34

**DQ-04.** Quem tem os Procedimentos em Gerenciar liga um modelo ao procedimento.
- Fonte: o Heitor, 2026-11-13: "sim, só quem tem permissão de gerenciar"
- Onde: `docs/regras/documentos.md:297`; `docs/revisao.md:241-242`
- Antes: KA-36

**DQ-05.** Quem tem Clientes em Ver vê os documentos da cliente: a aba Documentos da ficha, a tela Documentos com a entrada no menu, a trilha e o Copilot.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:303-305`
- Antes: KA-37, KC-36

**DQ-06.** Colher a assinatura não pede permissão de documento: colhe quem está com a cliente na tela em que a assinatura é pedida — a ficha (Clientes em Ver), a tela do atendimento (Atendimento em Ver), a janela do agendamento (quem a abre) e o PDV (o PDV em Gerenciar). Colher inclui a assinatura na tela, no papel, pelo link, pela conversa e pelo app; montar o documento de novo e revogar o link; e definir o pagamento do contrato. A tela de assinar e o PDF assinado que a equipe baixa seguem a mesma regra, e cada documento continua limitado à rede e às unidades ao alcance da pessoa.
- Fonte: o Heitor, 2026-11-16: "Um procedimento/plano/pacote que tenha documentos que precisam de assinatura, os documentos precisam ser assinados. É só uma questão de disponibilizar para o cliente assinar e isso não representa risco."
- Onde: `docs/regras/documentos.md:284-290`, `:306-315`, `:367-370`, `:582-583`; `docs/revisao.md:54`, `:2228` (UM1); `CLAUDE.md` §11 ("receber é do PDV")
- Antes: KA-38, KB-19, KC-36

**DQ-07.** A janela do agendamento lista os documentos dele com o título e a situação ("Assinado", "Falta assinar · bloqueia o início", "Faltam dados do cadastro", "Em preparação"), sem o conteúdo. A lista aparece para quem vê a agenda, ou para quem atende, na Minha agenda, no próprio agendamento, desde que o agendamento seja da rede e esteja numa unidade ao alcance.
- Fonte: decisão do Claude
- Onde: `docs/regras/documentos.md:397-407`
- Antes: KA-51

**DQ-08.** Na sessão de suporte nada vai à cliente: não se gera nem se manda link de assinatura, nem se pede a assinatura pelo app; e o suporte não colhe assinatura, não registra papel nem dispensa documento.
- Fonte: decisão do Claude
- Onde: `CLAUDE.md:904`; `docs/regras/plataforma.md:614`, `:641`
- Antes: KC-37

**DQ-09.** O Copilot consulta a situação de cada documento, sem o texto nem o motivo da dispensa; colher assinatura ele não faz — indica a tela.
- Fonte: decisão do Claude (CP1)
- Onde: `docs/revisao.md:1428`; `docs/regras/copilot.md:213`, `:245`
- Antes: KC-45

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Nenhuma pergunta fica na página. As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Estas regras são suas? Escritas como decisão sua, sem a sua fala.** DM-10 (o editor completo — fonte, cor, tabelas, imagens, cabeçalho e rodapé —, com a tela e o PDF desenhando o mesmo documento): `docs/regras/documentos.md:228-230` diz "decisão do Heitor, 2026-09-29" (ela substituiu a marcação leve). DL-05 (mandar o link de assinatura pela conversa do inbox é opção da rede, que nasce desligada): `docs/regras/atendimento.md:1881-1882` diz "a chave é decisão do Heitor de 2026-09-30". Confirma as duas?

## Divergências

O texto de `docs/regras/` (ou da própria revisão), e onde se viu também o código ou a tela, contra a decisão mais nova — para corrigir depois.

- DQ-01, DQ-02 (perguntas removidas: a P2 da KA e a primeira da KC): `docs/regras/documentos.md:291-302` diz "MANAGE cria, edita e desativa os modelos", "quem não tem “A rede inteira” não os cria nem muda (H7, 2026-11-01)" e "a rede dá a quem quiser"; `docs/revisao.md:2133`, "a configuração da rede toda só de quem é da rede (H7)"; e a fala de 16/11 ("A permissão de gerenciar documentos serve para alguém poder criar/editar/excluir os modelos de documentos", `documentos.md:284-290`) dava os modelos ao módulo. O Heitor, 18/11 (`CLAUDE.md` §11, `plataforma.md:742`): "Configuração da rede toda só pela conta admin", com os modelos de documento na lista — a mais nova vence. O módulo não ficou vazio (ainda dispensa, DQ-02), então não é pergunta: a regra diz o que cada nível faz. O código já segue a de 18/11 (`apps/web/actions/modelos-de-documento.ts`: `recusaDaConfigDaRede` em toda action dos modelos).
- DQ-02 (tela): resolvida em 26/11 — o módulo passou a se chamar "Dispensar documentos" (o Heitor, R19).
- DL-05, DQ-01: `docs/regras/documentos.md:663-665` diz que a opção "pela conversa" "muda só quem tem os Modelos de documento — `documents: MANAGE` — e abrangência de rede"; pela regra de 18/11 é só da Admin da rede. O código já segue a de 18/11 (`definirEnvioDoLinkPelaConversa`, com `recusaDaConfigDaRede`); só o texto está velho.
- DQ-06 (CÓDIGO): `docs/regras/documentos.md:306-307` e o código (`apps/web/lib/documentos/acesso.ts:35`, `colheOsDocumentos`) dão o colher a quem tem "Clientes, Agenda ou Prontuário em Ver, ou quem recebe". Falta o Atendimento: desde a UM1 (23/11, `docs/revisao.md:2228`) a tela do atendimento abre com o Atendimento em Ver, e quem só tem o Atendimento chega à tela e não colhe — contra a fala de 16/11 (colhe quem está com a cliente na tela). Também: o "Prontuário em Ver" da lista não corresponde a nenhuma das telas da regra (a conferir), e o "quem recebe" do código (`podeReceber`, `apps/web/lib/auth.ts:379`) aceita o Financeiro em Gerenciar, que a PV-04 do catálogo de Vendas e financeiro já trata como defeito (receber é só do PDV).
- DT-01 (TELA, pela regra das Tags): a tela Documentos tem filtros (período, situação, tipo, unidade, busca) e não tem o de Tags. A regra das Tags (o Heitor, 13/11, CLAUDE.md §1: "onde tiver for passível de filtro, um dos filtros que ela pode usar são as tags") responde: cada documento é de uma cliente, e a tag é da pessoa. Falta o filtro de Tags.
- DT-03, DQ-05: `docs/revisao.md:803-804` e `:2055` ("Mantém: … a tela Documentos só de leitura e o "só os meus"") ainda falam em "só os meus", que saiu em 23/11 (SM1, `docs/revisao.md:1293`, `:2214`). `docs/regras/documentos.md:708` já foi atualizado.
- DE-07: `docs/revisao.md:2054` (DC4 do Bloco: "os termos e os outros nascem no ACEITE do plano") e `:1856` ("os termos e os outros nascem no ACEITE") contrariam o DC4 aprovado (`docs/revisao.md:822-823`, "o do pacote e o do plano, na venda/na criação"); `docs/regras/documentos.md:140-147` e `docs/regras/vendas-financeiro.md:123` já foram corrigidos (auditoria de 18/11). O texto da revisão ficou velho.
- DV-02, DV-04: `docs/regras/documentos.md:776-781` (A13/A14 de 11/11) diz que "Profissional que atende" e o registro valem "em todo tipo"; o contrato de pacote (DC1, 14/11, mais novo, `:57-59`) não tem variável de quem atende ("o pacote vendido não tem quem atende"). O "todo tipo" foi escrito antes do contrato de pacote existir.
- DE-04, DE-05: `docs/regras/documentos.md:107` põe os pacotes em "Comercial → Pacotes"; `docs/revisao.md:298` e `:1942` dizem "Vendas → Pacotes".
- DG-02: `docs/regras/documentos.md:529-530` diz "`pagamento.metodo` é o meio da entrada (sem entrada, vazio)"; `docs/revisao.md:1982` (PDV8, o Heitor, 13/11: "sempre tem que ter forma de pagamento, o crediario é uma forma de pagamento, não existe pagamento sem forma de pagamento") tirou o vazio nos documentos, "que passa a dizer 'Crediário'".
- DG-03, DG-04, DG-05, DV-08: `docs/regras/documentos.md:465` diz "Checkout do plano: Plano → Pagamento → Documentação → Agendamento", e `:477-495`, `:547-553`, `:763` falam em "checkout" e "reabrir o checkout"; `docs/revisao.md:2070` (PT1a: "Sai o 'Fechar checkout'") e `:2072` (PT1c: o contrato e o pagamento andam juntos no PDV) tiraram o checkout de quatro passos, e as sessões se agendam à parte (DP-01 do catálogo de Vendas e financeiro: "Ali não se agendam as sessões"). As regras aqui foram escritas para o pagamento do plano no PDV.
- DG-01 (a conferir): `docs/regras/documentos.md:514-516` põe o "definir o pagamento do contrato" do avulso na ficha e no painel da sessão (a tela do atendimento), e o código ainda o tem lá (`components/branch/appointment-session.tsx` → `TermosDoCliente` → `DefinirPagamento`); a PV-13 do catálogo de Vendas e financeiro (13/11, "Blz pode ser assim") diz que a tela do atendimento não tem janela de pagamento e que "o combinado do contrato" é do PDV. Um dos dois textos precisa dizer o mesmo que o outro.
- PL-14 do Atendimento (KC-27, de outra área): `docs/revisao.md:1016` diz que "o PDV que recebe o plano sem o contrato assinado AVISA (…), não recusa", e `docs/regras/vendas-financeiro.md:2767` que, no contrato do plano, "a rede escolhe se ele “Bloqueia” o checkout ou “Só avisa”"; a revisão do aceite aprovada depois (`docs/revisao.md:1029`, "A assinatura continua antes do dinheiro") e o PT1c (`:2072`) decidiram que o PDV não recebe sem o contrato assinado ou dispensado.
- PA-08 de Vendas e financeiro (KC-30, de outra área): `docs/revisao.md:1939` ("não espera a assinatura…") e `:1816` ("NÃO espera a assinatura (… o 'assinatura antes do dinheiro' foi dito do plano)") contra a fala do PC2 ("o ideal era funcionar como no plano de tratamento"); a auditoria de 18/11 já corrigiu `documentos.md:68` e `vendas-financeiro.md:574`. O catálogo de Vendas e financeiro já lista esta.
- PA-09 de Vendas e financeiro (KC-30): `docs/regras/vendas-financeiro.md:313` diz, do contrato de pacote que pede dado que falta no cadastro, "Só avisa: a venda segue (princípio 2)", e a PA-09 daquele catálogo repete ("é só um aviso, e a venda segue"); pela regra do contrato antes do dinheiro (PA-08; `docs/regras/documentos.md:79-82`: "Aberto (a assinar, faltam dados): a venda … NÃO grava nada"), com o contrato em "faltam dados" a venda não grava (a não ser dispensado).
- DA-06 (pergunta removida: KB-05): o rascunho perguntava o que quer dizer o "**doc-02:** fica." (`DEVLOG.md:14605`). É a resposta do Heitor, em 02/11, à revisão das 113 decisões das frentes, e o doc-02 é o "Confirmar assinatura" (`DEVLOG.md:14615`): "fica" = a decisão do Claude fica, e o "Confirmar assinatura" continua fora (J-62). Não é pergunta.
- DA-13 (CÓDIGO, o D1 da 29ª): a tela do documento assinado monta o nome do assinante do nome de hoje da ficha — `apps/web/components/shared/tela-de-assinatura.tsx` passa `nomeDoAssinante` montado do `cliente.name` atual (`apps/web/lib/documentos/leitura.ts`), e o cabeçalho usa `doc.cliente.nome` —, em vez do `document_signatures.signer_name` gravado. A correção do D1 muda a tela e confere o PDF e o `/verificar` contra o hash gravado.

## Ficou fora do catálogo

Detalhe de implementação, ou linha que só repete uma regra acima.

- As linhas de implementação de `docs/regras/documentos.md:461-464`, `:569-571`, `:747-750`, `:805-806`, `:809-813`, `:830-831` (o rascunho KB as deixou fora por serem técnicas).
- As linhas do "O que nunca fazer aqui" de `docs/regras/documentos.md:820` (catálogo fechado de variáveis: DV-01), `:823` (versão não se altera, modelo não se apaga: DM-15), `:824` e `:837` (a menor: assina o responsável, avisa sem barrar: DA-11, DD-07), `:825`, `:828`, `:829`, `:836` (quando nasce cada documento; sessão de pacote e de plano não emite: DE-07, DE-14), `:835` (o contrato de pacote antes do dinheiro: PA-08 de Vendas e financeiro), `:838` (PC7, "Outros documentos": DE-01 a DE-03) e `:842` (ver e colher não pedem os Modelos de documento: DQ-05, DQ-06) — repetem regras acima.

## É de outra área

- KC-06: no cadastro do procedimento, o "Termo de consentimento" e o "Contrato" são opcionais (o Heitor, 13/11, PC8; `docs/revisao.md:326`, `:1937`; `docs/regras/documentos.md:25`) — área: Atendimento, PC-07.
- KC-08: o procedimento liga também "Outros documentos", quantos a rede quiser, de qualquer documento criado ou anexado (o Heitor, 13/11, PC7; `docs/revisao.md:309`, `:1937`, `:2050`) — área: Atendimento, PC-07. Aqui ficaram só o que "Outros documentos" oferece e em que ordem (DE-01 a DE-03).
- KC-15: a sessão de pacote e a de plano não pedem documento (o Heitor, 13/11, PC2; `docs/revisao.md:285`, `:458`, `:774`, `:2051`; `docs/regras/documentos.md:354`; `docs/regras/vendas-financeiro.md:568`) — área: Atendimento, AG-34, e Vendas e financeiro, PA-08.
- KC-27: no plano, a assinatura vem antes do dinheiro, e o PDV não recebe o plano sem o contrato assinado ou dispensado (o Heitor, 13/11: "primeiro colhe assinatura, depois paga"; `docs/revisao.md:1010`, `:1029`, `:2072`; `docs/regras/vendas-financeiro.md:162`; `docs/regras/documentos.md:145`) — área: Atendimento, PL-14 (e Vendas e financeiro, DP-01); as divergências do texto estão acima.
- KC-28: os termos e os outros documentos do plano a cliente assina quando quiser, e eles não seguram o aceite nem o pagamento (`docs/revisao.md:1025`, `:2072`; `docs/regras/documentos.md:155`) — área: Atendimento, PL-14.
- KC-29: no pacote, a cliente assina uma vez, na venda, o contrato de pacote e os puxados que ficaram (o Heitor, 13/11, PC2; `docs/revisao.md:1939`, `:2051`; `docs/regras/vendas-financeiro.md:582`) — área: Vendas e financeiro, PA-08 e PA-10.
- KC-30: o contrato de pacote se assina antes do dinheiro; com ele aberto, a venda não grava nada (o Heitor, 13/11, PC2; `docs/revisao.md:285`; `docs/regras/documentos.md:68`; `docs/regras/vendas-financeiro.md:574`) — área: Vendas e financeiro, PA-08; as divergências do texto estão acima.
- KC-31: os termos e os outros documentos do pacote não seguram a venda, e a tela da venda diz o que ficou para assinar (`docs/revisao.md:1815`; `docs/regras/documentos.md:115`; `docs/regras/vendas-financeiro.md:584`) — área: Vendas e financeiro, PA-10.
- KC-43: na página do plano no app, a cliente vê os documentos assinados do plano (o Heitor, 13/11, PT3; `docs/revisao.md:979`, `:2076`, `:2148`; `docs/regras/atendimento.md:1304`) — área: Atendimento, PL-19.
- O procedimento ligar um termo, um contrato (só no avulso) e outros documentos, todos opcionais (`docs/regras/documentos.md:25-37`) — área: Atendimento, PC-07.
- O contrato de pacote assinado antes do dinheiro, a venda que não grava enquanto ele está aberto e a pergunta antes de substituir o assinado com outro pagamento (`docs/regras/documentos.md:68-97`, `:88-91` com `:469-476`) — área: Vendas e financeiro, PA-08 e PA-09; a substituição em si é a DG-03, e o contrato montado antes da venda, a DG-06.
- A venda emitir os termos e os outros documentos do pacote, eles não segurarem o dinheiro, o "Bloqueia" deles travar cada sessão e o cancelamento do pacote cancelar os abertos (`docs/regras/documentos.md:98-106`, `:115-126`) — área: Vendas e financeiro, PA-10.
- O aviso depois da venda do pacote ("Falta no cadastro: …", "Estão na ficha, em Documentos.", "Colher a assinatura agora" a quem vendeu) e o "Colher a assinatura" na comanda (`docs/regras/documentos.md:695-702`; `docs/regras/vendas-financeiro.md:313`, `:448`) — área: Vendas e financeiro, PA-09 e PA-10.
- A cliente assinar os documentos do plano quando quiser, e o contrato e o pagamento andarem juntos no PDV (`docs/regras/documentos.md:144-147`, `:155-156`); o PDV não receber o plano com documento que "Bloqueia" aberto nem com o contrato assinado para outro pagamento (`:547-553`) — área: Atendimento, PL-14, e Vendas e financeiro, DP-01. O plano proposto cancelado derruba os documentos: PL-16.
- O recebimento no PDV já vem com o meio combinado no contrato, e só orienta (`docs/regras/documentos.md:523-524`) — área: Vendas e financeiro, FP-02.
- Os documentos do agendamento nascerem ao agendar, e a sessão de pacote e a de plano não emitirem (`docs/regras/documentos.md:336-358`) — área: Atendimento, AG-34. A falta cancelar os termos abertos: AG-36. O link único com uma assinatura para todos: AG-35 (aqui, DL-01).
- A página do plano com os passos (② Documentos leva à ficha; ③ Contrato e pagamento leva ao PDV) e a situação "Aceito (falta assinar)" em Tratamentos (`docs/regras/atendimento.md:2353`, `:2405`) — área: Atendimento, PL-12 e PL-20.
- O "Iniciar" que confere os documentos e o "Marcar chegada e iniciar" (`docs/regras/atendimento.md:497`) — área: Atendimento.
- O "Enviar à cliente" do anexo (e da foto do atendimento) some sem o portal no plano (`docs/regras/documentos.md:603-611`) — área: Atendimento, PT-09.
- A aba Documentos da ficha vazia diz "Nenhum anexo" (`docs/regras/documentos.md:510-511`) — área: Atendimento, PT-06, e Clientes.
- A mesma opção "pela conversa" vale para a Ficha de saúde ("Mandar pela conversa") (`docs/regras/documentos.md:673-674`) — área: Atendimento, FI-12.
- O termo da menor assinado pelo responsável, resumido na ficha — área: Clientes, CRM e inbox, CL-06; aqui ficou o lado do documento (DA-11, DD-07).
- O tipo do documento da cliente (CPF, passaporte, RNE) e o endereço opcional do cadastro de que o contrato do pacote precisa (`docs/regras/crm-inbox.md:10`, `:66`) — área: Clientes, CRM e inbox, CL-01.
- A Visão geral da ficha avisa o documento que o cadastro trava (`docs/regras/crm-inbox.md:573`) — área: Clientes, CRM e inbox, CL-25 (citada na DD-02).
- O texto do portal ("A equipe enviou um documento", a fala neutra da equipe na assinatura recebida) (`docs/revisao.md:2147`; `docs/regras/crm-inbox.md:234`) — área: Clientes, CRM e inbox, PO (PO-07).
- O export da LGPD com os documentos e os PDFs assinados (`docs/regras/documentos.md:807-808`) — área: Clientes, CRM e inbox (LG). O rascunho KB não achou regra no catálogo de lá que diga isto.
- Qual conversa leva o link de assinatura (a ligada à ficha, senão a do telefone; nunca a encerrada nem a de número removido) (`docs/regras/whatsapp-push.md:178`) — área: WhatsApp e push.
- Na Auditoria, o que a cliente fez pelo link aparece em nome dela ("…, pelo link"), as frases "Gerou/Cancelou/Dispensou o documento X", e abrir o documento sem mudar nada não grava (`docs/regras/plataforma.md:1299`, `:1306`, `:1405`) — área: Plataforma (Auditoria); aqui, DD-04.
- O passo "Documentos" no setup da rede (`docs/regras/plataforma.md:232`) — área: Plataforma.
- O texto do site ("Documentos", "assina tudo de uma vez") (`docs/revisao.md:2171`, `:2172`) — área: Site.
- O aviso da assinatura que falta fica à vista, não na dica (`docs/regras/design.md:223`) — área: Design.
