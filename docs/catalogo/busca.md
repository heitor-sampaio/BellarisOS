# Catálogo de regras — A busca

Este é o catálogo das regras da busca que valem HOJE: a busca da barra do topo (o que ela acha, quem acha o quê, como ela casa o termo, as páginas e as configurações, as ações) e a busca da lista de Planejamentos. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, ou "decisão do Claude". Na revisão de 13/11 o Heitor respondeu "Ok" ao bloco da Busca (`docs/revisao.md:1543`: "Ok" (BU1; o resto fica como está)), e o plano registra "Mantém: o que se acha, as outras ações, a regra de não abrir exceção" (`:2158`) — por isso o que o levantamento da revisão lista (`:1547-1556`) tem essa resposta como fonte. "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/busca.md` inteiro, conferido contra `docs/revisao.md` e o `DEVLOG.md`). A regra de um módulo que a busca só aplica (quem monta o funil, quem reativa a cliente, a venda que pergunta a unidade, o que o plano tira) fica no catálogo da área dona e está em "É de outra área". É um RASCUNHO para o Heitor revisar. Contagem: 30 regras (O que a busca é e o que ela acha 7, Quem acha o quê 4, Como a busca casa o termo 3, As páginas e as configurações 5, As ações 10, A busca da lista de Planejamentos 1), nenhuma pergunta e 6 divergências. Dos 42 números do rascunho, 4 ficaram fora do catálogo e 4 são de outra área (ver os apêndices); todos os outros estão num "Antes".

## O que a busca é e o que ela acha (BA)

**BA-01.** A busca é um campo no meio da barra do topo dos dois portais da equipe (o da rede e o da unidade), com os resultados num painel logo abaixo. Ela acha cliente (também a arquivada), conversa, oportunidade, contato do CRM sem oportunidade, o próximo agendamento, membro da equipe, procedimento, pacote, produto e as próprias páginas e abas de Configurações. A cliente final não usa a busca: o pedido dela é recusado.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:10-14`, `:22`; `docs/revisao.md:1543`, `:1547-1552`; `DEVLOG.md:7405-7410`, `:7440-7441`
- Antes: KA-01, KA-06

**BA-02.** Ctrl+K (⌘+K no Mac) e "/" põem o cursor na busca. No celular, a lupa abre a busca em tela cheia embaixo da barra do topo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:13-14`; `docs/revisao.md:1547-1548`
- Antes: KA-02

**BA-03.** O "próximo agendamento" é o que está em aberto — agendado, confirmado, chegou ou em atendimento —, de hoje em diante no dia da unidade. O de hoje fica até ser concluído, mesmo com o horário já passado; a falta, o concluído e o cancelado saem. É a mesma régua do "Próximo" do app da cliente.
- Fonte: princípio 3
- Onde: `docs/regras/busca.md:31-37`
- Antes: KA-10

**BA-04.** O procedimento só aparece onde a unidade o faz, e a oportunidade de funil arquivado não aparece.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:29-30`
- Antes: KA-09

**BA-05.** A pessoa do CRM sem oportunidade e sem conversa (o contato importado sem card) se acha no grupo "Contatos do CRM", só para quem cria oportunidade (o CRM em Gerenciar, com as oportunidades no plano). Abri-la leva ao quadro com a "Nova oportunidade" já aberta com o nome, o telefone e o e-mail dela, e a oportunidade nasce ligada a essa pessoa — também a que só tem e-mail. Quem tem oportunidade ou conversa se acha por elas, com o alcance delas.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:95-107`; `docs/revisao.md:1551`; `DEVLOG.md:12911-12912`
- Antes: KA-24, KA-25

**BA-06.** O contato do CRM que já tem ficha não entra em "Contatos do CRM": ele é achado como a cliente.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:107-109`
- Antes: KA-26

**BA-07.** O registro sem tela própria abre a lista da tela dele já filtrada pelo termo (Equipe, Procedimentos, Pacotes, Estoque). A oportunidade abre o card dela no quadro.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:69-72`; `DEVLOG.md:7429-7431`
- Antes: KA-19

## Quem acha o quê (AL)

**AL-01.** A busca não abre exceção: quem não acha um registro na tela dele não o acha aqui. Cada tipo de registro só aparece a quem tem o módulo da tela daquele tipo, e só nas unidades ao alcance da pessoa.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:16-20`, `:178`; `docs/revisao.md:1555-1556`, `:2158`
- Antes: KA-03

**AL-02.** Não há "só os meus" na busca: quem tem o módulo acha tudo das unidades ao seu alcance, de qualquer responsável.
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem, no crm acho que não se aplica diretamente e talvez o melhor caminho seja pelo filtro de dono da oportunidade"
- Onde: `docs/regras/busca.md:20-22`; `CLAUDE.md` §11
- Antes: KA-05

**AL-03.** A cliente é da rede: a busca acha as clientes da rede inteira em qualquer portal. Os registros de unidade (agendamentos, procedimentos, pacotes, produtos, membros) são, no portal da unidade, os daquela unidade; no portal da rede, os de todas.
- Fonte: o Heitor, 2026-11-01 (H5): "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/busca.md:19-20`; `CLAUDE.md` §5
- Antes: KA-42, KA-03

**AL-04.** As conversas que a busca acha são as mesmas que a lista do inbox mostra à pessoa (as caixas de WhatsApp que o cargo dela vê), sem conta à parte.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:23-25`; `DEVLOG.md:7415-7417`
- Antes: KA-07

## Como a busca casa o termo (TE)

**TE-01.** A busca ignora acento, acha com todas as palavras em qualquer ordem ("prado juliana" acha "Juliana Prado") e acha telefone e CPF pelos dígitos, com ou sem máscara.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:26-29`; `docs/revisao.md:1549-1550`; `DEVLOG.md:7418-7421`
- Antes: KA-08

**TE-02.** O telefone só se procura pelos dígitos quando o termo é um telefone, sem letra: "Maria 99" não acha todo telefone com 99. Vale na busca da barra do topo e na da fila do inbox.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:89-92`; `DEVLOG.md:6660-6666`
- Antes: KA-23

**TE-03.** A busca de cliente é uma regra só em todo lugar — a lista de Clientes, o "Agendar", o crédito interno e a busca da barra do topo (as arquivadas e os contatos do CRM incluídos): sem acento ("Zelia" acha "Zélia"), todas as palavras, e o telefone pelos dígitos, com o 55 do WhatsApp e o nono dígito do celular tolerados. Por isso a busca não oferece cadastrar quem já existe.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:76-88`, `:180`; `DEVLOG.md:13259-13265`, `:13341`
- Antes: KA-21

## As páginas e as configurações (PB)

**PB-01.** As páginas da busca vêm do menu e das abas de Configurações, com a mesma regra de quem vê cada uma (permissão e plano), nunca de uma lista escrita à mão: tela nova ou nome novo entra na busca sozinho. A página que não é entrada do menu só aparece com a entrada de que ela depende (por exemplo, "Automações → O que já aconteceu" só com as Automações no menu).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1)
- Onde: `docs/regras/busca.md:38-41`, `:46-48`, `:181`; `docs/revisao.md:1560-1562`, `:2157`
- Antes: KA-14, KA-11

**PB-02.** As páginas se acham também por apelidos: "negócio" acha Oportunidades, "usuário" acha Equipe.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:48-49`; `DEVLOG.md:7426-7428`
- Antes: KA-15

**PB-03.** As configurações se acham pelo nome que as pessoas usam: "funil", "etapas", "motivos de perda" e "origens" acham "Oportunidades → Configurar funis", que abre a janela de configurar os funis, com as oportunidades no plano. Aparece só para a Admin da rede, que é quem monta o funil (OP-11).
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:50-60`; `DEVLOG.md:13345`; `docs/catalogo/crm-inbox.md:630`
- Antes: KA-16

**PB-04.** Duas telas achadas pelo mesmo apelido dizem qual é qual: "Termos" acha "Os documentos emitidos e assinados" e "Os modelos de termo e contrato (a configuração)".
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:61-63`
- Antes: KA-17

**PB-05.** A Auditoria se acha por "auditoria", "quem fez" e "quem alterou" — para quem a tem no menu, a Admin da rede.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:41-43`; `docs/catalogo/plataforma.md:763`
- Antes: KA-12

## As ações (AO)

**AO-01.** Cada ação da busca é um atalho para a janela que já existe: a busca não grava nada, e a tela de destino confere tudo de novo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:113-114`, `:182`; `docs/revisao.md:1553-1554`, `:2158`; `DEVLOG.md:6471-6477`
- Antes: KA-27

**AO-02.** "Novo agendamento" e "Cadastrar cliente" aparecem no topo sem termo, ou com um termo que casa ("agend", "marcar horário"; "novo cliente", "cadastro"), e abrem a janela de agendar e o cadastro.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:118-119`; `DEVLOG.md:6472-6474`
- Antes: KA-28, KA-29

**AO-03.** Na linha da cliente achada, "Agendar" abre a janela de agendar já com ela.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:120`
- Antes: KA-30

**AO-04.** Na linha da cliente achada, "Vender" leva à Nova venda do PDV já com ela, no PDV de onde a pessoa está (o da rede ou o da unidade).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1)
- Onde: `docs/regras/busca.md:121`, `:149-151`; `docs/revisao.md:1560-1561`, `:2157`; `DEVLOG.md:3417-3419`
- Antes: KA-31

**AO-05.** Quando nenhuma cliente casou, o fim da lista oferece "Cadastrar «termo» como cliente", com o nome (ou o telefone) já preenchido. Fica no fim para o Enter abrir a conversa ou a oportunidade achada, não cadastrar.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:122`, `:142-143`
- Antes: KA-32

**AO-06.** A cliente arquivada vem depois das ativas, com "Arquivada" na linha e só a ação "Reativar" — nada de agendar nem vender. Ela conta como cliente achada: o "Cadastrar «termo»" não aparece (criaria a ficha em dobro).
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:123`, `:137-141`; `docs/catalogo/crm-inbox.md:148` (CL-26)
- Antes: KA-33

**AO-07.** Cada ação só aparece a quem a tela de destino libera: agendar, a quem tem a Agenda em Gerenciar; cadastrar, a quem tem Clientes em Gerenciar; vender, a quem tem o PDV em Gerenciar (PV-04).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Ok" (BU1; o resto fica como está)
- Onde: `docs/regras/busca.md:125-130`, `:182`; `docs/revisao.md:1556`, `:1309-1330`; `docs/catalogo/vendas-financeiro.md:24`
- Antes: KA-34

**AO-08.** A janela aberta pela busca abre uma vez: recarregar a página não a reabre. O nome da cliente que ela mostra vem da ficha da rede, nunca do endereço.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:131-136`, `:183`
- Antes: KA-35

**AO-09.** O PDV aberto pelo "Vender" confere a cliente do endereço: tem de ser uma ficha ativa da rede, e a unidade, uma ao alcance da pessoa. O que não passa abre a venda sem cliente, com a busca de cliente.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:152-159`; `DEVLOG.md:3420-3424`
- Antes: KA-39

**AO-10.** No teclado: ↑ e ↓ andam entre as linhas, → entra nas ações da linha (com o cursor no fim do texto), ← volta, Enter abre a escolhida e Esc limpa e fecha. Cada ação é uma opção da lista para o leitor de tela ("Agendar para Fulana").
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:144-146`; `DEVLOG.md:7434-7435`
- Antes: KA-36

## A busca da lista de Planejamentos (LP)

**LP-01.** A busca da lista de Planejamentos segue a regra da busca de cliente: o nome do plano e o da cliente sem acento ("Jose" acha o plano da "José"), o telefone pelos dígitos e o documento pelos dígitos.
- Fonte: decisão do Claude
- Onde: `docs/regras/busca.md:164-171`; `DEVLOG.md:14065`
- Antes: KA-41

## Perguntas ao Heitor

Nenhuma. O "Ok" de 13/11 (`docs/revisao.md:1543`; o plano, `:2158`: "Mantém: o que se acha, as outras ações, a regra de não abrir exceção") cobre o que o levantamento lista; quem vende pela busca é respondido pela regra de 23/11 ("cada passo pertence a UM módulo, e nenhuma ação pede dois", PV-04); a cliente se acha na rede inteira pela regra "A cliente é da clínica" (H5); e quem acha a configuração dos funis, pela de 18/11 ("Configuração da rede toda só pela conta admin", OP-11).

## Divergências

O texto de `docs/regras/` (ou de outro catálogo) contra a decisão mais nova — para corrigir depois.

- AO-07, AO-04 (quem vê o "Vender"): `docs/regras/busca.md:127-130` diz que vender é de quem "vende no PDV (`recebe`, `lib/menu.ts`: o PDV ou o Financeiro em Gerenciar — o `podeReceber` de `lib/auth`…)". A regra de 23/11 (`docs/revisao.md:1309-1330`, "concordo, pode anotar, marcar as questões e ajustar o codigo") diz "cada passo pertence a UM módulo, e nenhuma ação pede dois" e "PDV: receber, a comanda": vender é do PDV em Gerenciar (PV-04, `docs/catalogo/vendas-financeiro.md:24`, que já aponta o mesmo "ou o Financeiro" no código em `:997`). O "Vender" da busca segue a mesma trava; corrige junto.
- AO-07 (quem vê o "Agendar"): `docs/regras/busca.md:125-127` diz "agendar é `agenda: MANAGE` sem a agenda 'só a própria' (`agendaPropria`…)". Desde 23/11 não existe "só os meus" (CLAUDE.md §11): quem tem a Agenda em Gerenciar vê a agenda toda, e a Minha agenda é de quem NÃO tem a Agenda. O texto devia dizer só "quem tem a Agenda em Gerenciar".
- AL-01, AL-02 (o recorte por dono): `docs/regras/busca.md:178` diz "sem o recorte de dono/unidade"; desde 23/11 não há recorte por dono — só o módulo e a unidade.
- PB-01 (as abas da rede toda no portal da unidade): `docs/regras/busca.md:64-67` diz que quem é da rede acha as abas que só a rede tem ("as taxas e comissões, a fidelidade, as unidades…"). Desde 18/11 (o Heitor: "Configuração da rede toda só pela conta admin"), a busca não oferece as Configurações a quem só leria abas da rede toda (`docs/regras/plataforma.md:853-858`, CG-17), e mudar essas abas é só da Admin da rede. O catálogo da Fidelidade já apontou a mesma linha (`docs/catalogo/fidelidade.md:324`).
- PB-03 (quem acha a configuração dos funis): `docs/regras/busca.md:56-57` diz "a Admin da rede com Configurações em Gerenciar", como se fosse uma permissão a mais; a regra de 18/11 decide pelo cargo de Admin da rede, e só por ele (OP-11, `docs/catalogo/crm-inbox.md:630`).
- (outro catálogo, o telefone da ficha): `docs/regras/busca.md:86` diz "O telefone da ficha continua guardado como foi digitado", e `docs/regras/crm-inbox.md:824-825` diz que a ficha criada grava "(48) 99000-0011"; o catálogo de Clientes (`docs/catalogo/crm-inbox.md:19`, CL-03) diz "O telefone se grava no formato do WhatsApp (55 + DDD + número)" — que, pelo `docs/regras/crm-inbox.md:826-827`, é o que o CONTATO guarda, não a ficha. Já corrigido no catálogo de Clientes (24/11): a ficha grava o telefone formatado, e o formato do WhatsApp é o do contato.

## Ficou fora do catálogo

- KA-04: o navegador manda só o termo e o portal, e o servidor decide e filtra (`docs/regras/busca.md:17-18`, `:179`) — implementação; o CLAUDE.md §4 já diz que toda leitura é do servidor.
- KA-13: tipo novo de registro entra em três lugares do código (`docs/regras/busca.md:44-45`) — implementação.
- KA-20: a guarda da busca do inbox no navegador compara como o banco (`docs/regras/busca.md:73-75`) — implementação; o efeito para a pessoa está em TE-01 e TE-02.
- KA-22: o telefone da ficha continua guardado como foi digitado (`docs/regras/busca.md:85-86`) — implementação da busca; a dúvida com o catálogo de Clientes está em "Divergências".
- As linhas de "O que nunca fazer aqui" (`docs/regras/busca.md:178-183`) repetem regras acima: `:178` (AL-01), `:179` (KA-04), `:180` (TE-03), `:181` (PB-01), `:182` (AO-01, AO-07), `:183` (AO-08). As linhas de prova (`:36-37`, `:68`, `:87-88`, `:93-94`, `:107`, `:160-162`, `:170-171`) e a história ("Até 2026-10-07…", "Até a varredura de 18/11…") não são regra.

## É de outra área

- KA-18: no portal da unidade, quem tem "A rede inteira" acha também o que só a rede tem, com o endereço da rede; quem não tem, não (`docs/regras/busca.md:64-67`) — `docs/catalogo/plataforma.md`, CU-09 (ver também "Divergências").
- KA-37: o "+ Agendar" da ficha abre a janela de agendar já com a cliente (`docs/regras/busca.md:147-148`) — área: Agenda (`docs/catalogo/atendimento.md`), sem número lá ainda.
- KA-38: na rede com mais de uma unidade, a venda pergunta "Em qual unidade?" antes (`docs/regras/busca.md:151-152`) — `docs/catalogo/vendas-financeiro.md`, VD-03.
- KA-40: a ficha não tem mais o "Vender" (`docs/regras/busca.md:159-160`) — `docs/catalogo/vendas-financeiro.md`, VD-01.

Os rascunhos também apontaram, sem número próprio, o que já está catalogado em outra área e a busca só aplica: "Automações → O que já aconteceu" na busca (GT-02) — `docs/catalogo/automacoes.md`; montar o funil e o "Configurar funis" só da Admin da rede (OP-11), a arquivada com "Reativar" para quem tem Clientes em Gerenciar (CL-26), o contato importado em "Contatos do CRM" (IN-02, IM-18), a pessoa que veio da busca não é perguntada "É a mesma pessoa?" (OP-06), "Responsável", nunca "Dono" (OP-08), o "Vender" do inbox (IN-17), as caixas de WhatsApp que o cargo vê — `docs/catalogo/crm-inbox.md`; vender é do PDV em Gerenciar (PV-04) e o "Vender" da busca na Nova venda (VD-01) — `docs/catalogo/vendas-financeiro.md`; a busca sem conversa, oportunidade nem pacote fora do plano (PN-07, PN-09), a busca sem Configurações a quem só leria abas da rede toda (CG-17), a Auditoria só da Admin da rede — `docs/catalogo/plataforma.md`; o "Próximo" do app da cliente (AG-55) — `docs/catalogo/atendimento.md`.
