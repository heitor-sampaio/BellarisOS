# Catálogo de regras — Comissões

Este é o catálogo das regras das Comissões que valem HOJE: onde ficam e quem mexe, a comissão de quem atende, a comissão de venda, o pacote e o plano, a base da comissão, a taxa da maquininha na comissão, quando a comissão sai, o estorno e o cancelamento, o extrato e o fechamento, quem vê e as Minhas comissões. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, "decisão do Claude". "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/comissoes.md:1-400`; KB: `docs/regras/comissoes.md:400-779`; KC: as decisões de `docs/revisao.md`, do CLAUDE.md §11 e dos outros arquivos de `docs/regras/`). É um RASCUNHO para o Heitor revisar. Contagem: 93 regras (Onde fica e quem mexe 9, A comissão de quem atende 6, A comissão de venda 14, O pacote e o plano 13, A base da comissão 12, A taxa da maquininha na comissão 6, Quando a comissão sai 4, Estorno e cancelamento 5, O extrato e o fechamento 19, Quem vê 2, As Minhas comissões 3), 4 perguntas e 17 divergências. Dos 115 números do rascunho, 3 ficaram fora do catálogo e 3 são de outra área (ver os apêndices); todos os outros estão num "Antes". Das seis perguntas dos rascunhos, três tinham resposta numa regra que já existe (a resposta "ok, mantém"/"mantém" da revisão, o princípio 7 e a regra de 18/11): o motivo de cada uma está em "Divergências".

## Onde fica e quem mexe (CM)

**CM-01.** A configuração das comissões é a aba "Comissões e taxas" de Configurações, no grupo "Dinheiro", e todo texto que leva até ela diz "Configurações → Comissões e taxas".
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "Concordo"
- Onde: `docs/regras/comissoes.md:119-124`; `docs/revisao.md:1384-1390`, `:2128`

**CM-01a.** A aba começa pelas taxas da maquininha (o Pix, o cartão, cada maquininha); depois vêm a comissão de cada profissional, "Como a comissão acontece" e o crediário. A opção da comissão que desconta a taxa se chama "Taxa da maquininha do pagamento".
- Fonte: o Heitor, 26/11 (R21 da página): "Subir as taxas para o começo (a proposta)"
- Onde: `components/admin/settings-comissoes.tsx` (`SettingsComissoes`); `tests/comissoes-taxas-no-comeco.test.ts`
- Antes: KA-17, KC-03

**CM-02.** As comissões são uma funcionalidade do plano da assinatura. Se o plano da rede não tem essa funcionalidade, a aba Comissões some e a configuração, o fechamento e a mudança de comissão ficam travados. A comissão continua sendo calculada, e o que já foi vendido segue valendo.
- Fonte: decisão do Claude
- Onde: `docs/regras/plataforma.md:292-296`, `:334-337`; `docs/regras/vendas-financeiro.md:1423`; `docs/revisao.md:1587-1591`
- Antes: KC-02

**CM-03.** Só a Admin da rede muda a configuração das comissões em Configurações → Comissões e taxas: o que sai da base (a taxa da maquininha, os insumos), os pontos e o voucher na base ("Sobre o preço" ou "Sobre o valor pago"), o período do fechamento (mensal, quinzenal ou semanal) e as comissões da rede para a venda de produto e de plano. Quem cria ou edita o procedimento, o pacote ou o produto sem ser Admin da rede não vê o campo da comissão.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/comissoes.md:125-131`, `:240-242`; `CLAUDE.md:752-757` (§11); `docs/regras/plataforma.md:748-750`; `docs/regras/atendimento.md:1515-1516`
- Antes: KA-18, KC-11

**CM-04.** A comissão de cada pessoa (a padrão, a de venda e as exceções por procedimento) se define na Equipe, pelo chip "Comissão …" da linha, e não é configuração da rede toda: muda quem tem o Financeiro em Gerenciar, também sem a Equipe: a ela (com as comissões no plano) a Equipe abre só com o chip da comissão — sem o lápis, o cadastro nem o desativar —, e o menu mostra "Equipe" (EQ-01). Ter a Equipe em Gerenciar não dá acesso a quanto cada um ganha.
- Fonte: o Heitor, 2026-11-13 (sobre a comissão na Equipe): "esquece, deixa como está"; o "também sem a Equipe" é a leitura da própria CM-04 (40ª simulação, D5: quem tinha o Financeiro em Gerenciar sem a Equipe não chegava ao chip); a Equipe só com o chip: decisão do Claude, 27/11 (40ª simulação, D5), pelo princípio 7
- Onde: `docs/regras/comissoes.md:516-518`; `docs/revisao.md:1168`, `:1173-1179`, `:2115`; `docs/regras/plataforma.md:765-769`
- Antes: KB-15, KC-07, KC-09

**CM-05.** Quem não tem "A rede inteira" só mexe na comissão de quem é das unidades dela. Na Equipe da unidade, quem é da rede aparece sem o chip: a comissão dele se muda na Equipe da rede.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:518-520`; `docs/regras/plataforma.md:765-769`
- Antes: KB-16, KC-09

**CM-06.** A comissão de uma Admin da rede só outra Admin da rede muda: na Equipe e no valor dela num procedimento. Para quem não é Admin da rede, a linha de uma Admin na Equipe não mostra a comissão, e a recusa diz: "Só quem é Admin da rede altera a comissão de uma Admin da rede." A Admin da rede muda também a própria comissão: a linha dela tem o lápis, e na rede com uma Admin só ninguém mais a daria.
- Fonte: o Heitor, 2026-10-29: "somente admin pode alterar admin"; a própria comissão: decisão do Claude, 27/11 (38ª, Decisão 4), pela própria CM-06 e pela Admin da rede que atende (CLAUDE.md §11)
- Onde: `docs/regras/comissoes.md:95-106`; `CLAUDE.md:734-741` (§11)
- Antes: KA-14, KC-10

**CM-07.** O formulário de novo membro (na Equipe da rede e na da unidade) oferece "Comissão padrão (%)" — só o percentual padrão; as exceções ficam no chip. O campo fica à vista desde o início e só se libera quando "Atende clientes" é marcado. Ele só aparece e só vale para quem tem o Financeiro em Gerenciar, com comissões no plano da rede; sem isso, o servidor ignora o campo.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:511-515`, `:522-523`; `docs/regras/plataforma.md:1060-1061`
- Antes: KB-14, KC-08

**CM-08.** O chip da Equipe diz qual comissão a pessoa tem: quem atende sem padrão, "Sem comissão de atendimento"; quem não atende, "Venda 3%" ou "Venda: a do pacote, produto ou rede"; com padrão, "Comissão 25% · 2 exceções · venda 3%". O resumo da comissão aparece uma vez, só com a janela aberta. O campo do valor da regra mostra um exemplo ("Ex.: 10", "Ex.: 50,00"), não um 0.
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:525-533`; `docs/regras/plataforma.md:1125-1127`
- Antes: KB-18, KC-08

**CM-09.** Não existe marcar "sem comissão, de propósito" (nem na Equipe, nem na janela da comissão). Quem atende sem comissão padrão aparece no aviso de Configurações → Comissões e taxas e na pílula âmbar da Equipe; se ninguém tem o "Atende" marcado, a tela diz isso, e não "todos têm comissão".
- Fonte: o Heitor, 2026-11-13: "Só tira o \"de proposito\" na caixa tambem"
- Onde: `docs/regras/comissoes.md:437-444`, `:69-71`
- Antes: KB-04, KA-10

## A comissão de quem atende (CA)

**CA-01.** A comissão de execução é da PESSOA, na rede: um padrão (% ou R$ fixo) e exceções por procedimento; quem atende em mais de uma unidade tem a mesma comissão em todas. Vale a exceção do procedimento; sem ela, o padrão; sem os dois, o atendimento conclui sem comissão, e a tela avisa quem atende sem padrão. O valor da regra não tem teto além do registro (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."): o percentual vai até 100%, e o R$ fixo até R$ 999.999,99 — o maior valor que a comissão guarda ("No máximo R$ 999.999,99 (o limite do registro)."); vale também na comissão geral, no pacote e no produto, e não há limite de exceções nem de profissionais (o número é decisão do Claude). Com a regra igual, cada comissão é da unidade do atendimento: Financeiro → Comissões a mostra por pessoa e unidade (CF-09), e as Minhas comissões somam as unidades ("nas 2 unidades", VP-06 de Indicadores).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele): "Decisões do Heitor" no topo da seção; quem atende em duas unidades: decisão do Claude, 27/11 (38ª, Decisão 10), pela CF-09 e pela VP-06 de Indicadores
- Onde: `docs/regras/comissoes.md:10`, `:63-69`, `:520-522`
- Antes: KA-09, KB-17

**CA-02.** Cada procedimento tem a comissão "a mesma para todos" (a geral) ou "por profissional" (as exceções de cada pessoa; quem fica no "Padrão" segue o padrão dela). A geral vence a exceção e o padrão, e vale também para quem não tem regra nenhuma. O procedimento com a geral não tem exceção: a Equipe não o oferece como exceção, e o servidor recusa.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:72-83`
- Antes: KA-11

**CA-03.** Na Equipe, a comissão da pessoa diz quais procedimentos têm a geral, que vence o que ela tem: "Com comissão geral — vale para todas e vence a regra acima; muda em Procedimentos: Microagulhamento: 40%".
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:87-94`
- Antes: KA-13

**CA-04.** Quando a regra geral nova de um procedimento muda o que uma Admin da rede ganha, a janela avisa antes de salvar: "A mesma para todos: 20%. Vale também para a Dra. Ana (Admin da rede), que hoje recebe 40% pelo padrão dela." Isso vale no chip e no cadastro do procedimento.
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:108-114`
- Antes: KA-16

**CA-05.** A comissão do atendimento é do profissional do agendamento. Quem fez outro passo do atendimento (a chegada, o recebimento) fica registrado no histórico e na Auditoria, mas não ganha a comissão por isso.
- Fonte: recomendação do Claude aprovada pelo Heitor, 23/11: "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/revisao.md:1319-1322`, `:1329-1330`
- Antes: KC-19

**CA-06.** O "Atende" diz em quais unidades a pessoa aparece como profissional (e ganha a comissão de execução), e não dá permissão nenhuma: o único acesso que ele abre são as vistas pessoais.
- Fonte: recomendação do Claude aprovada pelo Heitor, 23/11: "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/revisao.md:2113`, `:2232`; `CLAUDE.md:645`, `:691` (§11); `docs/regras/plataforma.md:1139-1142`; `docs/regras/atendimento.md:286-289`
- Antes: KC-20

## A comissão de venda (CV)

**CV-01.** A comissão de venda (de produto, de pacote, de pré-pago e de plano) é de quem foi marcado em "Quem vendeu", não de quem registrou a venda. Com o campo vazio confirmado, ou num caminho que não manda o campo, ninguém recebe comissão de venda, e a venda fica fora do "Meu faturamento" de quem a registrou.
- Fonte: o Heitor, 2026-11-02 (com-06): "Campo vazio não gera comissão para ninguém"
- Onde: `docs/regras/comissoes.md:287-313`
- Antes: KA-34

**CV-02.** Em "Quem vendeu" só entra quem vende: quem atende nesta unidade, quem recebe (quem tem o PDV em Gerenciar) ou quem tem o Comercial no cargo (o CRM ou os Procedimentos abertos). A lista vem em três grupos ("Quem atende", "Quem recebe", "Quem tem o Comercial no cargo"), e o servidor recusa outra pessoa: "Quem vendeu: escolha quem vende — quem atende aqui, quem recebe ou quem tem o Comercial no cargo."
- Fonte: princípio 1 (a rede decide quem vende pelo cargo)
- Onde: `docs/regras/comissoes.md:314-327`; `docs/revisao.md:1317`; `CLAUDE.md` §11 ("receber é do PDV")
- Antes: KA-35

**CV-03.** Cada pessoa pode ter uma "Comissão de venda (%)" própria, no cadastro de comissão dela na Equipe, ao lado da de execução, vazia por padrão. Ela vale para a venda de pacote, plano, pré-pago e produto, sobre o vendido, para quem está em "Quem vendeu" — também para quem vende sem atender.
- Fonte: princípio 1
- Onde: `docs/regras/comissoes.md:445-453`
- Antes: KB-05

**CV-04.** Na comissão de venda, a regra do item vence a da pessoa, e a da pessoa vence a da rede: item = o "De venda" do pacote, ou a comissão do produto (só no modo "Por produto"); rede = o "Venda de plano" e a "Venda de produto" (a geral ou a regra sobre o total). O pacote e o pré-pago não têm regra da rede; o pré-pago só tem a da pessoa. No modo "Por produto", a geral é a da rede para o produto sem regra própria: quem tem comissão de venda própria ganha a dela nesse produto ("4% do vendido — de Rúbia", CF-05).
- Fonte: decisão do Claude; a geral do "Por produto": decisão do Claude, 27/11 (38ª, Decisão 2), pela própria CV-04
- Onde: `docs/regras/comissoes.md:454-461`, `:499-501`, `:775`
- Antes: KB-06

**CV-05.** A regra do item vence a da pessoa também quando é 0%: o zero é o valor que a rede escolheu.
- Fonte: princípio 2
- Onde: `docs/regras/comissoes.md:455-457`
- Antes: KB-07

**CV-06.** A Nova venda e o "Receber o plano" dizem a comissão de venda ANTES de vender: escolhido quem vendeu, aparece "Comissão de venda de Rita: 8% do vendido — de Rita. Sai quando a venda estiver paga inteira." (ou "— do pacote", "— da rede"; a da pessoa diz "— de <nome>" para todos; no kit, cada produto com a sua), pela mesma precedência da conta (CV-04). Mostra só a regra, não o valor em reais. A comissão de outra pessoa só aparece a quem tem o Financeiro em Ver; a regra do pacote, que vence, aparece sempre.
- Fonte: princípio 3; no "Receber o plano": decisão do Claude, 25/11 (a Q03, o Heitor revisa); o "— de <nome>" para todos: o Heitor, 26/11 (página de perguntas, R01): "'— de <nome>' para todos (a proposta)"
- Onde: `docs/regras/comissoes.md:543-557`, `:777`; `apps/web/components/shared/pergunta-da-venda.tsx`; `apps/web/e2e/plano-checkout-uma-transacao.spec.ts:122-131`
- Antes: KB-12

**CV-07.** A rede decide se a venda de produto tem comissão (Configurações → Comissões e taxas → "Venda de produto"; vazio = sem comissão). A comissão é de quem está em "Quem vendeu", sobre o valor vendido (já com o desconto), e o extrato mostra a cliente e o produto.
- Fonte: o Heitor, 2026-10-29 (D4): "é configurável pela clínica"
- Onde: `docs/regras/comissoes.md:239-245`, `:250-251`
- Antes: KA-29

**CV-08.** A rede escolhe como a venda de produto comissiona: "Uma regra sobre o total" (uma comissão sobre o vendido da venda inteira) ou "Por produto" (cada produto com "% do vendido" ou "R$ por unidade").
- Fonte: o Heitor, 2026-11-03 (r2-ven-10): "deixar a clínica decidir, flexibilidade"
- Onde: `docs/regras/comissoes.md:253-259`
- Antes: KA-30

**CV-09.** A comissão de cada produto se registra no cadastro dele ("Comissão na venda deste produto", no criar e no editar, só no produto marcado como Venda direta), ao lado do preço de venda. Só a Admin da rede vê e grava essa seção. Quem só tem o Estoque não a vê, e o servidor recusa: "Seu cargo não muda a comissão dos produtos."
- Fonte: o Heitor, 2026-11-03: "se cada produto pode ter uma comissão diferente, o que faz sentido é que em cada produto se possa registrar uma comissão diferente"
- Onde: `docs/regras/comissoes.md:260-272`; `docs/revisao.md:137`, `:149`, `:1918`; `docs/regras/atendimento.md:2812-2816`
- Antes: KA-31, KC-06, KC-11

**CV-10.** Com "Uma regra sobre o total", o cadastro do produto não oferece o campo: diz "A rede comissiona a venda de produto por uma regra sobre o total (5% do vendido)…" e mostra o caminho para Configurações. Configurações → Comissões e taxas tem a escolha, a regra geral e um resumo só de leitura da regra de cada produto ("10% do vendido", "R$ 3,00 por unidade", "regra geral"), com o caminho para o Estoque. Cada regra se edita num lugar só.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:272-279`
- Antes: KA-32

**CV-11.** No "Por produto", cada produto da venda tem a sua comissão, calculada sobre a parte dele no valor vendido (o desconto se reparte entre os produtos). O produto sem regra própria usa a regra geral ("Regra geral — o produto sem a sua"); sem nenhuma das duas, esse produto não gera comissão. O estorno da venda cancela as comissões de todos os produtos.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:279-286`
- Antes: KA-33

**CV-12.** A venda do procedimento pré-pago tem comissão de venda (a da pessoa em "Quem vendeu"), sobre o vendido, que cai na proporção das unidades canceladas; a de execução das unidades usadas continua. Libera e cai como as outras vendas (só com a venda paga inteira).
- Fonte: princípio 1
- Onde: `docs/regras/comissoes.md:462-467`
- Antes: KB-08

**CV-13.** O Crédito interno vendido (o "vale") não tem comissão de venda: a venda não pergunta "Quem vendeu" e nenhuma comissão nasce. Quem atende depois, pago com esse crédito, recebe a comissão de execução como sempre.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-07: "concordo"
- Onde: `docs/regras/comissoes.md:432-436`; `docs/regras/vendas-financeiro.md:1274-1279`
- Antes: KB-03

**CV-14.** A comissão de uma venda é da unidade da venda, que é a do PDV. No PDV da rede com duas ou mais unidades, a unidade é perguntada antes de vender.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:660-669`
- Antes: KC-22

## O pacote e o plano (CQ)

**CQ-01.** A comissão do pacote fica no cadastro de cada pacote (Comercial → Pacotes → o pacote → Comissão). São duas, a de venda e a de execução, cada uma ligada ou não. A venda guarda as regras que valiam naquele momento: mudar o pacote vale só para as próximas vendas.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13 (PC5): "ok, mantém"
- Onde: `docs/regras/comissoes.md:328-334`; `docs/revisao.md:293`, `:1942`
- Antes: KA-36, KC-05

**CQ-02.** Só a Admin da rede (com comissões no plano da rede) muda a comissão do pacote; o servidor recusa o campo de comissão de quem não pode, antes de gravar o pacote.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/comissoes.md:329-332`; `CLAUDE.md:752-757` (§11)
- Antes: KA-37, KC-11

**CQ-03.** A comissão de venda do pacote é de quem vendeu: % do vendido (com o desconto) ou valor fixo. Sai com o pacote pago inteiro: à vista ou no cartão em várias vezes, na hora; no crediário, com a última parcela (pacote de R$ 800 com 10%: os R$ 80 saem quando entra a segunda parcela de R$ 400). O estorno de um pagamento a devolve.
- Fonte: o Heitor, 2026-11-01 (H4): "comissão só paga com pagamento integral do cliente…"
- Onde: `docs/regras/comissoes.md:335-342`
- Antes: KA-38

**CQ-04.** A comissão de execução do pacote é de quem atende cada sessão, e o pacote escolhe qual vale: a regra da pessoa (o padrão), um % da parte da sessão no preço do pacote, um R$ fixo por sessão ou nenhuma. A regra do pacote vale também para quem não tem regra própria. Ela também só sai com o pacote pago inteiro. A comissão de execução da sessão é da unidade do atendimento, como o indicador de execução (princípio 5), mesmo com o pacote vendido em outra unidade; o dinheiro da venda fica na unidade da venda (PA-12 de Vendas e financeiro, CV-14). Na sessão do plano de tratamento é igual: a comissão de execução é da unidade do agendamento, não da unidade do plano.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13 (PC5): "ok, mantém"; a unidade da comissão da sessão: decisão do Claude, 27/11 (35ª, Decisão B2), pelo princípio 5; a sessão do plano: decisão do Claude, 28/11 (42ª, Decisão C-3)
- Onde: `docs/regras/comissoes.md:343-348`
- Antes: KA-39

**CQ-05.** A execução do pacote pode ser "Valor do pacote" (% ou R$ fixo): a venda pede a "Profissional responsável" (só quem atende na unidade), e essa pessoa recebe UMA comissão sobre o vendido, em vez de uma por sessão. Ela sai com o pacote pago inteiro (o crediário espera a última parcela; o cartão em várias vezes sai na hora) e cai na proporção do que for cancelado. O extrato diz "Pacote X (responsável)".
- Fonte: o Heitor, 2026-11-02 (com-04): "se foi vendido um pacote de 900, Renata recebe a comissão sobre o valor do pacote, no momento em que o pagamento integral do pacote foi realizado (...) mas devemos manter o sistema com a maior flexibilidade possível e a rede define como operar"
- Onde: `docs/regras/comissoes.md:349-370`
- Antes: KA-40

**CQ-06.** Se a venda de um pacote "Valor do pacote" fica sem responsável, a tela pergunta ("Ninguém foi marcado como responsável… Vender assim?"), e o servidor também. Confirmado, ninguém recebe essa comissão.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:363-366`
- Antes: KA-41

**CQ-07.** O pacote trazido de fora não tem comissão de venda (não é venda). A sessão dele dá comissão de execução pela regra de quem atende, calculada sobre a parte da sessão no valor de referência, e sai na conclusão (a cliente não deve nada à rede).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-06 (decisão 1 da 8ª simulação): "concordo"
- Onde: `docs/regras/comissoes.md:371-377`
- Antes: KA-42

**CQ-08.** Sem valor de referência, a comissão de execução em percentual do pacote trazido de fora é R$ 0, e a tela avisa. O sistema não chuta um valor.
- Fonte: princípio 4
- Onde: `docs/regras/comissoes.md:377-380`
- Antes: KA-43

**CQ-09.** No pacote trazido de fora, a comissão em R$ fixo por sessão é paga mesmo sem valor de referência, e sai na conclusão. A janela de trazer o pacote, o cartão da ficha, a ficha de tratamento e a importação dizem: "a comissão de execução em percentual é R$ 0 (a de R$ fixo por sessão é paga)".
- Fonte: decisão do Claude (pelo princípio 2, 2026-11-18)
- Onde: `docs/regras/comissoes.md:380-387`
- Antes: KA-44

**CQ-10.** O "Abater do pacote" segue a comissão de execução do pacote. Se ela é a regra da pessoa, a comissão do avulso passa a ser a da sessão de pacote, com a mesma regra. Se o pacote tem regra própria, a do avulso é cancelada e nasce uma com a regra do pacote (ou nenhuma).
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:388-390`
- Antes: KA-45

**CQ-11.** O cadastro do pacote diz que o "De venda" vence: "Vale no lugar da comissão de venda de cada pessoa (Equipe → Comissão)"; sem regra no pacote, a opção é "A de quem vendeu" e a ajuda diz que vale a comissão de venda de quem vendeu (o resumo da lista diz "Venda: a de quem vendeu").
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:474-481`
- Antes: KB-10

**CQ-12.** Em Configurações → Comissões e taxas, o bloco "Venda de pacote" diz onde está essa comissão: no próprio pacote (Pacotes → o pacote → Comissão), e, sem ela, vale a de quem vendeu (Equipe → Comissão).
- Fonte: princípio 7
- Onde: `docs/regras/comissoes.md:534-538`
- Antes: KB-19

**CQ-13.** A venda do plano de tratamento tem comissão para quem está em "Quem vendeu" do plano: o percentual "Venda de plano" de Configurações → Comissões e taxas, vazio por padrão (vazio = sem comissão), sobre o valor do plano (a soma dos procedimentos, já com o desconto rateado). Ela só libera com o plano pago inteiro (à vista ou no cartão em N vezes, na hora; no crediário, com a última parcela), o estorno a devolve, desconta a taxa da maquininha se a rede escolheu descontá-la e nunca desconta insumo. O extrato diz "Venda do plano X", com a cliente e o dia do aceite. O crédito interno que paga o plano (todo ou em parte) conta como pago e fica na base, que é o valor do plano (CB-13): ele não é receita de novo (CI-03 de Vendas e financeiro), mas paga o plano.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-05: "concordo"; o plano pago com crédito interno: decisão do Claude, 27/11 (35ª, Decisão A2), pela CB-13
- Onde: `docs/regras/comissoes.md:406-418`, `:428-431`
- Antes: KB-01

## A base da comissão (CB)

**CB-01.** O padrão é a base cheia, e a tela diz isso com estas palavras: "base cheia (sem taxa nem insumo descontados; os pontos e o voucher usados não saem dela)" com "Sobre o preço", ou "base sem os pontos e o voucher usados…" com "Sobre o valor pago". A configuração, o extrato e o CSV (coluna "O que saiu da base") usam a mesma frase, e o extrato diz a de cada linha como ela foi gravada.
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:131-143`
- Antes: KA-19

**CB-02.** A escolha da rede sobre os pontos e o voucher vale em toda comissão: no atendimento avulso, na venda do pacote e em cada sessão dele, na venda do plano e em cada procedimento feito dele, no pré-pago e na venda de produto. Com "Sobre o valor pago", cada linha tira a sua parte dos pontos e do voucher, na proporção do preço dela no total da venda (a sessão de R$ 200 de um pacote de R$ 800 leva 1/4); o estorno devolve essa parte à base. As duas opções dizem "Vale no atendimento, nas sessões de pacote e de plano e nas vendas."
- Fonte: decisão do Claude (pelos princípios 2 e 3, 2026-11-18)
- Onde: `docs/regras/comissoes.md:144-163`
- Antes: KA-20

**CB-03.** Na regra em percentual, a base é o preço menos o desconto comercial (sempre), menos os pontos e o voucher (se a rede escolheu "Sobre o valor pago"), menos a taxa do recebimento (se marcada), menos os insumos (se marcados). Na regra em valor fixo, só os pontos e o voucher a reduzem, na proporção; taxa, insumo e desconto não. No pacote e no plano, o desconto já está no preço da sessão e do procedimento. Com a taxa marcada, a sessão do pré-pago pago no cartão tira da parte dela a taxa daquele recebimento (CT-01, CT-02): a parte de R$ 180 no crédito 3x a 4,9% fica em R$ 171,18.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele); a sessão do pré-pago: decisão do Claude, 27/11 (38ª, Decisão 1), pela própria CB-03 e pela CT-01
- Onde: `docs/regras/comissoes.md:586-590`
- Antes: KB-25

**CB-04.** O valor ao lado da frase é a base que a conta usa de fato: "base sem a taxa da maquininha: R$ 413,70 (R$ 420,00 − R$ 6,30 da taxa) · 40%". O CSV tem Preço, Desconto, Taxa da maquininha, Insumos, Proporção que ficou e Base. Na comissão em R$ fixo, a base é o preço sem os pontos e o voucher. Na comissão de produto em "R$ por unidade", a linha mostra a conta que valeu, as unidades × o valor por unidade (2 × R$ 15,00), e não o vendido como base.
- Fonte: princípio 3; o "R$ por unidade": decisão do Claude, 27/11 (D9 da 38ª), pela própria CB-04 e pela CB-03 (no fixo o desconto não reduz a base)
- Onde: `docs/regras/comissoes.md:164-179`
- Antes: KA-21

**CB-05.** Os pontos e o voucher não se chamam "desconto" na base: a tela diz "R$ 20,00 de desconto − R$ 20,00 de pontos e voucher", e o CSV tem a coluna "Pontos e voucher que saíram da base" ao lado de "Desconto que saiu da base".
- Fonte: decisão do Claude (pelo princípio 3)
- Onde: `docs/regras/comissoes.md:180-190`, `:236-238`
- Antes: KA-22

**CB-06.** A base de cada comissão de execução: no atendimento avulso, o preço do atendimento; na sessão de plano, cada procedimento com o seu preço no plano e a sua regra; na sessão de pacote, a parte dela no rateio da venda (pelo preço de tabela de cada procedimento), com a regra do procedimento ou a execução que o pacote define.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/comissoes.md:570-575`; `docs/revisao.md:271-272`
- Antes: KB-23

**CB-07.** Quando a unidade tem preço próprio para o procedimento, a comissão sai desse preço, que é o gravado no agendamento ou na venda, e não do preço da rede.
- Fonte: princípio 3
- Onde: `docs/regras/atendimento.md:1564-1580`
- Antes: KC-21

**CB-08.** Quando a rede desconta os insumos, o desconto é o custo dos insumos usados no atendimento, rateado pelo preço de cada procedimento, pelo custo da unidade de consumo (5 ml de um frasco de 100 ml a R$ 90 descontam R$ 4,50).
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:576-579`
- Antes: KB-24

**CB-09.** As comissões de venda (de produto, de pacote e de plano) seguem a escolha da rede sobre a taxa da maquininha, mas nunca descontam insumos.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:249-250`, `:342`, `:428`
- Antes: KA-28

**CB-10.** A comissão guarda a regra e a configuração do momento em que nasceu (percentual, o que sai da base, pontos): mudar a configuração vale para os próximos atendimentos e vendas, não reescreve os já concluídos. A do atendimento nasce na conclusão, mesmo quando espera o pagamento (CN-02): o concluído antes da mudança e pago depois fica com a regra de antes. No mesmo dia também: o concluído antes da mudança fica com o percentual de antes, e o de depois, com o novo.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele); o concluído antes da mudança e pago depois: decisão do Claude, 27/11 (36ª, Decisão B); a mudança no meio do dia: decisão do Claude, 27/11 (40ª simulação, Time A), pelo princípio 3 (o que a tela mostrava na conclusão é o que vale; recalcular o passado seria regra escondida)
- Onde: `docs/regras/comissoes.md:567-569`
- Antes: KB-22

**CB-11.** Cada lançamento do extrato mostra a base de quando foi lançado. O cancelamento do pacote ou do plano, ou a devolução de parte da venda de produto, muda a base dos lançamentos que vêm depois, não a dos anteriores: a liberação diz "base cheia: R$ 1.100,00 · 3%", e o acerto do cancelamento, "R$ 110,00 (R$ 1.100,00, na proporção do que ficou (10%))".
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:191-203`
- Antes: KA-23

**CB-12.** No atendimento avulso, o lançamento ligado a um pagamento (a liberação e o estorno dele) mostra a base daquele pagamento: o desconto, a taxa e os insumos dele, não os do pagamento de hoje.
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:204-214`
- Antes: KA-24

**CB-13.** O crédito interno usado para pagar — o vendido e o concedido sem dinheiro (a cortesia, a compensação: CI-02 do catálogo de Vendas e financeiro) — é forma de pagamento, não desconto nem pontos e voucher: não sai da base. A Drenagem de R$ 140 paga com R$ 100 de crédito de cortesia e R$ 40 no Pix tem a base de R$ 140.
- Fonte: decisão do Claude, 26/11 (31ª simulação, C10) — o desconto que sai da base é só o comercial (CB-03), e a base é a que a tela mostra (princípio 3)
- Onde: (ainda não está em `docs/regras/comissoes.md`; o sistema já faz isso, visto na 31ª simulação); CV-13
- Antes: (nova, 26/11)

## A taxa da maquininha na comissão (CT)

**CT-01.** Quando a rede manda descontar a taxa, a taxa que sai da base é a da MAQUININHA usada no recebimento e, se a maquininha cobra diferente por bandeira, a da bandeira. A comissão sobre o líquido nunca fica negativa, mesmo com taxa alta.
- Fonte: o Heitor, 2026-11-11 (D8): "Quem escolhe a taxa é a operadora: stone, mercadopago, elo e por ai vai… a rede precisa configurar suas taxas, por operadora."
- Onde: `docs/regras/comissoes.md:222-231`, `:607-614`; `docs/regras/vendas-financeiro.md:2200-2201`
- Antes: KA-26, KB-27

**CT-02.** A taxa que sai da base é a das vezes EXATAS do recebimento (a da bandeira naquelas vezes; se a bandeira não tem, a geral da maquininha naquelas vezes); sem taxa cadastrada para aquelas vezes, sai 0% — nunca a de outras vezes.
- Fonte: princípio 4
- Onde: `docs/regras/comissoes.md:602-606`, `:611`
- Antes: KB-28

**CT-03.** As vezes do recebimento são as do cartão (crédito em N vezes = N; sem vezes = 1x), nunca a parcela do crediário: a parcela 2 de 3 paga no crédito à vista usa a taxa do crédito 1x.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:614-620`
- Antes: KB-30

**CT-04.** O pagamento feito em várias formas é UM pagamento: a base soma os descontos e os pontos de todas as formas, e a taxa é a média das taxas de cada forma, pesada pelo valor de cada uma.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:215-221`
- Antes: KA-25

**CT-05.** No plano recebido em vários pagamentos, a taxa da base é a média das taxas, pesada pelo que cada recebimento pagou.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/comissoes.md:606-607`
- Antes: KB-29

**CT-06.** Na rede que só tem a maquininha vazia com que nasceu (nome "Maquininha", sem taxa, sem limite de vezes, sem bandeira), o "+ Adicionar maquininha" abre essa mesma, com o nome vazio, em vez de criar uma segunda, e diz "Use esta, que ainda não tem taxas: dê o nome e as taxas da sua maquininha, e salve." (O catálogo de Vendas e financeiro mandou esta regra para cá.)
- Fonte: princípio 7
- Onde: `docs/regras/comissoes.md:232-236`; `docs/regras/vendas-financeiro.md:473-475`; `docs/catalogo/vendas-financeiro.md:1081`
- Antes: KA-27

## Quando a comissão sai (CN)

**CN-01.** A comissão só fica a pagar quando a cliente pagou tudo. O cartão de crédito em várias vezes conta como pago por inteiro na hora: quem deposita as parcelas é a operadora, e a comissão não espera por elas. A rede não escolhe outro momento: Configurações → Comissões e taxas só diz a regra (com o pagamento integral).
- Fonte: o Heitor, 2026-11-01 (H4): "comissão só paga com pagamento integral do cliente; note que pagamento parcelado no cartão deve ser considerado como pagamento integral da parte do cliente, o repasse do valor das parcelas é de responsabilidade da operadora do cartão, o cliente já fez o pagamento integral"
- Onde: `docs/regras/comissoes.md:12-17`, `:26-31`, `:56-59`
- Antes: KA-01, KA-07

**CN-02.** Só espera o que a cliente ainda deve à rede. No crediário (entrada mais parcelas), a comissão sai quando entra a última parcela. O atendimento avulso concluído sem pagamento espera o pagamento. O avulso pago em duas formas fica pago com as duas. Não há receber parte de uma parcela: o "pago em parte" (CR-08 de Vendas e financeiro) vem de um estorno, e a comissão segue esperando até a parcela ficar paga inteira.
- Fonte: o Heitor, 2026-11-01: "f2 ok, concordamos"; a parcela paga em parte: decisão do Claude, 27/11 (36ª, Decisão C), pela própria CN-02 e pela CN-03
- Onde: `docs/regras/comissoes.md:18-22`, `:31-34`
- Antes: KA-02

**CN-03.** No pacote (a comissão de venda e a de cada sessão já feita), no plano, no pré-pago e na venda de produto, a comissão sai quando a venda inteira está paga. Os pontos usados contam como pagamento.
- Fonte: o Heitor, 2026-11-01 (H4): "comissão só paga com pagamento integral do cliente…"
- Onde: `docs/regras/comissoes.md:23-25`, `:159-160`
- Antes: KA-03

**CN-04.** Enquanto espera, a comissão aparece: o card de quem atende diz "R$ 110,00 aguardando o pagamento integral", e o extrato mostra a linha com o valor "previsto". Ela não entra no "a pagar", no fechamento nem em número nenhum até sair.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:38-46`
- Antes: KA-06

## Estorno e cancelamento (CE)

**CE-01.** Estornar um pagamento desfaz o "pago por inteiro": a comissão volta a aguardar o pagamento.
- Fonte: o Heitor, 2026-11-01 (H4): "comissão só paga com pagamento integral do cliente…"
- Onde: `docs/regras/comissoes.md:35-36`
- Antes: KA-04

**CE-02.** Depois de um estorno, o novo recebimento libera a comissão de novo uma vez só, nunca em dobro.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:594-596`
- Antes: KB-26

**CE-03.** Antes de confirmar o estorno de um recebimento, a tela avisa que a comissão volta a aguardar. O nome de quem recebe a comissão e o valor só aparecem para quem tem o Financeiro em Ver; os outros veem o aviso sem o valor.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:373-377`
- Antes: KC-14

**CE-04.** Quando o pacote é cancelado, a comissão de venda (e a da responsável) cai na proporção do que foi cancelado: 10% de um pacote de R$ 3.300 com R$ 2.200 cancelados fica R$ 110, e o acerto lança a diferença ("Cancelamento do pacote"). A que ainda esperava o pagamento cai do mesmo jeito, e nada sai sobre o que caiu. A comissão de execução das sessões já feitas fica. O "pago por inteiro" passa a ser contado sobre o que ficou (vendido menos cancelado).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-01 (F2b): "concordo"
- Onde: `docs/regras/comissoes.md:393-403`; `docs/regras/vendas-financeiro.md:754-755`
- Antes: KA-47

**CE-05.** O plano cancelado segue a regra do pacote: a comissão de venda cai na proporção do que foi cancelado (10% de um plano de R$ 1.314 com R$ 729 cancelados deve R$ 58,50), o previsto cai junto, a quitação passa a ser pelo que ficou, e as comissões de execução das sessões já feitas ficam.
- Fonte: o Heitor, 2026-11-07: "sim usa a mesma coisa do pacote"
- Onde: `docs/regras/comissoes.md:418-424`
- Antes: KB-02

## O extrato e o fechamento (CF)

### O extrato

**CF-01.** A comissão devida é uma por procedimento executado (e uma por venda), e o extrato é a soma das mudanças dela: cada liberação, ajuste ou estorno é um lançamento, com o motivo; a soma dos lançamentos é o que a pessoa tem a receber por aquela comissão.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/comissoes.md:10`, `:563-566`
- Antes: KB-21

**CF-02.** O extrato liga o estorno à liberação que ele desfaz: a linha do estorno diz "desfaz a liberação das 06:42" (a do mesmo pagamento) e a liberação seguinte diz "de novo, depois do estorno das 06:45". Vale também quando a liberação foi feita pela conclusão (pago antes de concluir).
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:539-549`
- Antes: KB-20

**CF-03.** No extrato, o lançamento de venda diz que é venda: "Venda do plano X", "Venda do pacote X", "Venda de produto: Sérum", "Venda de procedimento: Drenagem"; o do atendimento leva o nome do procedimento.
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:487-492`
- Antes: KB-11

**CF-04.** O extrato diz de onde veio a comissão do pacote: "Venda do pacote X", "Sessão do pacote X" ou "Pacote X (responsável)". O fechamento é o mesmo de qualquer comissão.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:366-367`, `:391-392`
- Antes: KA-46

**CF-05.** O extrato e o CSV dizem de onde veio o percentual de cada comissão de venda: "3% — de Tatiane", "10% — do pacote", "5% — da rede"; a da pessoa diz "— de <nome>" para todos. Os lançamentos de antes dizem só a regra.
- Fonte: princípio 3; o "— de <nome>": o Heitor, 26/11 (página de perguntas, R01): "'— de <nome>' para todos (a proposta)"
- Onde: `docs/regras/comissoes.md:468-473`
- Antes: KB-09

**CF-06.** No CSV do extrato, as colunas "Taxa da maquininha" e "Insumos" ficam vazias quando a configuração não os desconta da base (não "0,00"); com o desconto, levam o valor.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:507-510`
- Antes: KB-13

**CF-07.** O período de uma comissão é o do LANÇAMENTO (o dia em que foi liberada, ajustada ou estornada), em todo número e no fechamento — não o dia do atendimento: o ajuste de outubro de um atendimento de setembro é de outubro, e o plano no crediário libera no mês em que a última parcela entra.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/comissoes.md:633-638`, `:767`
- Antes: KB-31

**CF-08.** O mês da comissão e os limites do fechamento seguem o fuso da REDE, o mesmo em toda tela.
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:628-632`
- Antes: KB-32

### O fechamento

**CF-09.** As comissões se pagam por fechamento, em Financeiro → Comissões (nos dois portais), no período que a rede configurou: mensal, quinzenal (1–15 e 16–fim do mês) ou semanal (segunda a domingo). A tela mostra, por pessoa e unidade, o lançado, o a pagar e o pago, o extrato de cada uma e o CSV.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/comissoes.md:639-645`
- Antes: KB-33

**CF-10.** "Fechar e pagar" é de quem tem o Financeiro em Gerenciar (a vista pessoal não fecha): paga o que está a pagar até o fim do período (ou até agora), vira UMA despesa paga "Comissões" no financeiro da unidade e marca os lançamentos como pagos, tudo junto. O fechamento é por pessoa e unidade, e dois cliques fecham uma vez só.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/comissoes.md:646-651`, `:771`
- Antes: KB-34

**CF-11.** O fechamento é por unidade, e, na rede com mais de uma unidade, a tela diz: "O fechamento é por unidade: quem atende em mais de uma tem um fechamento em cada, e cada um vira uma despesa paga no financeiro daquela unidade". Na rede de uma unidade só, a frase não aparece.
- Fonte: decisão do Claude (pelo princípio 7)
- Onde: `docs/regras/comissoes.md:652-656`; `docs/revisao.md:2272`
- Antes: KB-35

**CF-12.** No período ainda em curso, o fechamento paga até AGORA, e a tela diz ("O período de nov/2026 ainda está em curso: o que for lançado até o fim dele fica para o próximo fechamento."). Cada fechamento diz de quando a quando foram os lançamentos ("de 10/11/2026 até 10/11/2026 às 02:30") e quando foi pago, com a hora ("pago em 18/11/2026 às 10:05"), tudo no fuso da rede, na tela e no CSV. A comissão liberada depois do fechamento (o pagamento que chegou depois) é do dia em que foi liberada (CF-07): fica "A pagar" e entra no próximo fechamento, que lista também os a pagar de antes do período (CF-13).
- Fonte: princípio 3; a liberação depois do fechamento: decisão do Claude, 27/11 (38ª, Decisão 3), pela CF-07 e pela CF-13
- Onde: `docs/regras/comissoes.md:662-674`
- Antes: KB-36

**CF-13.** Dá para pagar só parte: o "Fechar e pagar" lista os lançamentos a pagar da pessoa na unidade (inclusive os de antes do período), todos marcados, e o "Pagar agora" se refaz ao desmarcar ("Pagar agora (1 lançamento fica a pagar) R$ 54,00"). O desmarcado continua a pagar e volta marcado no próximo fechamento. Não existe pagar um valor digitado: cada lançamento é pago inteiro ou fica.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-10: "concordo com marcar e desmarcar"
- Onde: `docs/regras/comissoes.md:675-697`, `:772`
- Antes: KB-37

**CF-14.** Cada lançamento diz se foi pago: "Paga em 10/11/2026" ou "A pagar" no extrato e nas Minhas comissões, e a coluna "Pago em" no CSV. O estorno já descontado num pagamento diz "Descontada em dd/mm/aaaa" ("A descontar" enquanto aberto; "Descontada no pagamento" no CSV), não "Paga".
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:693-697`, `:702-705`
- Antes: KB-38

**CF-15.** O CSV do extrato segue a ordem do tempo (coluna "Hora"), traz a coluna "Ligação" com o mesmo texto da tela ("desfaz a liberação das 13:45") e termina com "Pagamentos das comissões": cada fechamento, o dia e a hora, o valor e se foi estornado.
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:698-706`
- Antes: KB-39

**CF-16.** Fechamento não se reabre: o estorno que chega depois dele vira um lançamento negativo para o próximo fechamento, e saldo negativo não fecha. A comissão estornada depois de paga aparece "A descontar" (CF-14) e entra no próximo fechamento.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele); a comissão estornada depois de paga: decisão do Claude, 27/11 (35ª, Decisão D1)
- Onde: `docs/regras/comissoes.md:707-708`
- Antes: KB-40

**CF-17.** Estornar um fechamento é uma janela própria ("Estornar o fechamento?", com quem e quanto, e o motivo), de quem tem o Financeiro em Gerenciar: estorna a despesa e devolve os lançamentos daquele fechamento a "a pagar". É a única porta: o Financeiro comum recusa estornar essa despesa.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/comissoes.md:709-715`, `:774`; `DEVLOG.md:7815-7820`
- Antes: KB-41

**CF-18.** Quando pagar a comissão em Dinheiro deixa negativa a gaveta do dia, o sistema avisa, mas não impede o pagamento.
- Fonte: princípio 2
- Onde: `docs/regras/vendas-financeiro.md:471-472`
- Antes: KC-23

**CF-19.** Quem foi desativado aparece com "(inativo)" em Financeiro → Comissões, e a comissão dele continua (lançada, a pagar, paga).
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:745-749`
- Antes: KB-45

**CF-20.** A comissão de quem foi desativado que ainda espera o pagamento integral (o crediário da cliente em aberto) segue no nome dele, "aguardando o pagamento integral", com o "(inativo)"; sai quando a cliente quitar e é paga no fechamento seguinte, como a de quem está ativo. A janela de desativar diz isso.
- Fonte: decisão do Claude, 26/11 (31ª simulação, B09) — a comissão nasce do atendimento feito (princípio 5), e desativar não apaga o que é devido (CF-19, CN-04)
- Onde: (ainda não está em `docs/regras/comissoes.md`; o sistema já faz isso, visto na 31ª simulação); CN-03, CN-04, CF-19
- Antes: (nova, 26/11)

## Quem vê (QV)

**QV-01.** Quem tem o Financeiro em Ver vê as comissões de todo mundo, nas unidades ao alcance dela. Não existe "só as minhas" no cargo.
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem, no crm acho que não se aplica diretamente…"
- Onde: `docs/regras/comissoes.md:720-722`; `docs/revisao.md:1293-1296`, `:2214`; `CLAUDE.md` §11 ("Não existe 'só os meus'")
- Antes: KB-42, KC-12

**QV-02.** Sem o Financeiro em Ver, a comissão de outra pessoa não chega à tela em lugar nenhum: nem em Financeiro → Comissões, nem na aba Profissionais dos Relatórios, nem no ranking do dashboard, nem no Copilot, nem no Vender. Ter a Equipe, os Relatórios ou a vista pessoal não basta.
- Fonte: decisão do Claude
- Onde: `docs/regras/comissoes.md:500-505`, `:730-733`, `:768`; `docs/regras/indicadores.md:1222-1223`; `docs/regras/copilot.md:275-276`
- Antes: KB-42, KC-13

## As Minhas comissões (MC)

**MC-01.** Quem atende, ou tem comissão no nome dela (o percentual de venda próprio ou qualquer comissão já gravada, como a da venda do plano ou do produto pela regra da rede), e não tem o Financeiro, vê as Minhas comissões: só as próprias comissões. Elas só mostram — não fecham nem pagam (fechar e pagar pede o Financeiro em Gerenciar). Quem tem o Financeiro já vê tudo pelo módulo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-23: "vamos pela sua recomendação"
- Onde: `docs/regras/comissoes.md:722-731`, `:646`; `docs/revisao.md:1287-1289`, `:2215`, `:2238`; `CLAUDE.md:611-618` (§11)
- Antes: KB-43, KC-15, KC-16

**MC-02.** As Minhas comissões ficam à vista em quatro lugares: no menu; quem abre o Financeiro sem ter o módulo vai direto para elas; no destaque "Minhas comissões · a pagar" do dashboard da unidade; e no topo da Minha agenda. Na tela de Cargos, com o Financeiro em "Sem acesso", a linha diz "Não aparece para esta pessoa — a menos que ela atenda ou tenha comissão no nome dela: aí vê as Minhas comissões, só as dela."
- Fonte: princípio 3
- Onde: `docs/regras/comissoes.md:734-739`; `docs/regras/indicadores.md:1186-1194`; `docs/regras/atendimento.md:676-677`; `docs/regras/plataforma.md:882-885`
- Antes: KC-17, KB-44

**MC-03.** Para quem atende em mais de uma unidade, as Minhas comissões somam todas essas unidades, têm um filtro de unidade e dizem "nas 2 unidades".
- Fonte: decisão do Claude
- Onde: `docs/regras/atendimento.md:352-354`; `docs/regras/indicadores.md:1426-1431`
- Antes: KC-18

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Fica na página só a Q03 (está no escopo? a comissão de venda no checkout do plano). As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo. Revisão de 25/11 (o Heitor, 24/11: "Em teoria não é pra ter pergunta de regra e de escopo, as regras já foram definidas e o escopo também."): a Q03 foi decidida pelo Claude, pelos princípios, para o Heitor revisar.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **A regra e a base da comissão — escritas como decisão sua, sem a sua fala: confirma?** A reforma das comissões de 30/09 abre com "Decisões do Heitor" (`docs/regras/comissoes.md:10`; `DEVLOG.md:7905`, `:7968-7977`), mas sem as suas palavras: CA-01 (a comissão de execução é da pessoa, um padrão e exceções por procedimento; sem os dois, sem comissão), CB-03 (o que sai da base no percentual e no valor fixo), CB-06 (a base de cada caso: avulso, sessão de plano, sessão de pacote), CB-10 (a comissão guarda a regra e a configuração do dia em que nasceu) e CT-05 (no plano pago em vários recebimentos, a taxa é a média pesada).

Q02. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **O extrato e o fechamento — escritas como decisão sua, sem a sua fala: confirma?** Do mesmo bloco de 30/09 (`docs/regras/comissoes.md:10`; `DEVLOG.md:7815`: "decisão do Heitor: volta para 'a pagar'"): CF-01 (uma comissão por procedimento, e o extrato é a soma das mudanças), CF-07 (o período é o do lançamento, não o do atendimento), CF-09 (o fechamento pelo período que a rede configurou), CF-10 ("Fechar e pagar" vira uma despesa paga "Comissões"), CF-16 (fechamento não se reabre; saldo negativo não fecha) e CF-17 (estornar o fechamento devolve os lançamentos a "a pagar").

Q03. **Decidida pelo Claude, 25/11 (o Heitor revisa):** Não é recurso novo: o plano tem "Quem vendeu" e comissão de venda (CQ-13), e a frase é a mesma regra da Nova venda — dizer antes do dinheiro o que a conta vai fazer (princípio 3: "O que a tela mostra é o que vale na conta"). O sistema já a mostra no "Receber o plano" (C42, `apps/web/components/shared/pergunta-da-venda.tsx`; prova `apps/web/e2e/plano-checkout-uma-transacao.spec.ts:122`). Fica — `docs/regras/comissoes.md:555-556` já o diz ("O “Receber o plano” … mostra a mesma frase (C42, F67)"); o catálogo é que estava velho. Nada muda no código. — *Era:* **Está no escopo? A comissão de venda no checkout do plano.** A Nova venda diz a comissão de venda antes de vender (CV-06), mas o checkout do plano não diz (`docs/regras/comissoes.md:505`: "O checkout do plano não mudou"), e o plano também tem "Quem vendeu" e comissão de venda (CQ-13). Mostrar a frase também no checkout do plano está no escopo?

Q04. **Resolvida na revisão de 24/11:** A sua regra das Tags ("onde tiver for passível de filtro, um dos filtros que ela pode usar são as tags") já decide: a aba Comissões tem filtro, então ganha o de Tags (a tag da cliente da comissão). Defeito a corrigir. — *Era:* **O filtro de Tags em Financeiro → Comissões.** A sua regra das Tags (CLAUDE.md §1, 13/11) diz "onde tiver for passível de filtro, um dos filtros que ela pode usar são as tags". A seção "Tags" da revisão (`docs/revisao.md:378-445`) não diz quais telas ganham o filtro; o Financeiro o pôs em A receber, A pagar e Movimentações (FN-08 do catálogo de Vendas e financeiro) e deixou a aba Comissões de fora por decisão do Claude ("Comissões não: é por profissional", `docs/regras/vendas-financeiro.md:1448`). A tag é da pessoa (a cliente), e cada lançamento de comissão tem uma cliente, mas a aba se organiza por quem recebe a comissão. A aba Comissões ganha o filtro de Tags?

(Sem pergunta nova: a Q25 do catálogo do Atendimento — se a comissão do procedimento é configuração da rede toda, PC-03 — vale igual para CM-03, CQ-02 e CV-09, que aplicam a mesma fala de 18/11 à configuração de Comissões e taxas, ao pacote e ao produto. A resposta de lá decide estas.)

## Divergências

O texto de `docs/regras/` (ou da própria revisão) contra a decisão mais nova — para corrigir o texto depois.

- CM-03 (e PC-03 do Atendimento): `docs/revisao.md:1729` (Bloco Procedimentos, 14/11) diz "A comissão do procedimento segue com quem é da rede (é do financeiro)", e `docs/revisao.md:2133`, "a configuração da rede toda só de quem é da rede (H7)"; o Heitor, 18/11 (`CLAUDE.md` §11): "Configuração da rede toda só pela conta admin". `docs/regras/comissoes.md:83-86` já segue a de 18/11; as frases da revisão estão velhas.
- CM-06 (pergunta removida: KA-15): `docs/regras/comissoes.md:97-99` explica a trava pelo caso de "quem tinha o Financeiro em Gerenciar" mexendo no valor da Admin pelo procedimento, e `:104-108` diz que a regra geral nova num procedimento em que a Admin não tem valor próprio "é do procedimento, não dela" (H9, 2026-11-11, opção a: "a Admin da rede já controla quem tem o Financeiro em Gerenciar"). Desde 18/11 só a Admin da rede muda a comissão do procedimento (PC-03): a trava pelo procedimento só vale entre duas Admins, e a distinção da H9 não tem mais a quem se aplicar. O texto devia dizer isso.
- CA-04: `docs/regras/comissoes.md:111` diz "(correção C68; hoje salva calada)", e `:111-114` descrevem o aviso nas duas portas, com prova. O texto não diz se o aviso já entrou.
- CM-01: `docs/regras/comissoes.md:125`, `:155`, `:240`, `:255`, `:275-276` e `:441` ainda chamam a aba de "Configurações → Comissões", e o catálogo de Vendas e financeiro também (MQ-07: "Configurações → Comissões → 'Taxas da maquininha'"); `docs/regras/comissoes.md:119-124` (A2 da 14ª) mudou o nome para "Comissões e taxas", e todo texto que leva à aba deve usá-lo.
- CV-09: `docs/regras/comissoes.md:264-265` diz que a seção aparece "só para o produto de revenda ou 'os dois'"; o Heitor decidiu "checkbox" — Insumo e Venda direta (`docs/revisao.md:137`, E2, feito em 14/11, `:1730-1733`). A seção aparece no produto marcado como Venda direta.
- CV-02: `docs/regras/comissoes.md:316-317` diz que "Quem recebe" é quem tem "o PDV ou o Financeiro em Gerenciar, ou a Admin"; a decisão de 23/11 ("Cada passo do atendimento, um módulo", `docs/revisao.md:1317`: "PDV: receber, a comanda."; `CLAUDE.md` §11: "receber é do PDV") diz que quem recebe é quem tem o PDV em Gerenciar. O catálogo de Vendas e financeiro (PV-04) trata o "ou o Financeiro" do código como defeito a corrigir.
- CV-02, CM-05: `docs/regras/comissoes.md:302-303` ainda aceita em "Quem vendeu" quem é "de fora e que ATENDE nela" (decisão 2 da 8ª), `:518-520` diz que "quem é de unidade só mexe nos da unidade" e que a Equipe da unidade mostra quem é "de outra unidade — e atende ali", e `docs/regras/plataforma.md:765-769` repete; com as várias unidades por pessoa (EQ1, `docs/revisao.md:1187-1193`, o Heitor: "Concord.") é "das unidades dela", e o Heitor, 23/11 (`docs/revisao.md:2236`): "uma pessoa só pode atender nas unidades que faz parte, isso é obvio". Não existe mais quem atende numa unidade que não é dela.
- CQ-09: `docs/regras/crm-inbox.md:1020` (a importação "Pacote de antes") diz que o pacote sem valor de referência "não geram comissão de execução (R$ 0)"; o item 11 das correções da auditoria (18/11, `docs/regras/comissoes.md:380-387`) decidiu que a comissão em R$ fixo por sessão é paga e só a em percentual é R$ 0. O catálogo de Clientes, CRM e inbox (IM-22) já diz certo e lista a mesma divergência; só o texto de `crm-inbox.md` está velho.
- QV-01: `docs/regras/comissoes.md:551-556` diz "quem o cargo deixa ver 'só as minhas'" e que tudo se lê pelo servidor "com o 'só as minhas' do cargo"; `docs/revisao.md:1293-1296` e `:2214` (SM1, o Heitor, 23/11) tiraram o "só os meus": Ver vê tudo, e o que é da pessoa é a vista pessoal.
- CF-08: `docs/regras/comissoes.md:628` diz "o mês de `released_at` (fuso de SP)" e `:632` "até ela entrar, é SP"; a regra do fuso da rede já entrou (`apps/web/lib/comissoes/periodo.ts:11`; `DEVLOG.md:13761`, F64 com o C4) — o texto do SP está velho.
- CM-08, CM-09: `docs/regras/comissoes.md:441-442` chama a pílula de "Sem comissão"; a mais nova, `:525-528` (A22 da 19ª), diz "Sem comissão de atendimento" para quem atende sem padrão.
- CM-08 (a conferir): `docs/regras/plataforma.md:1125-1127` (A22 da 20ª) faz o resumo da comissão dizer, a quem não atende, "Comissão: nenhuma." ou só a de venda; o chip foi corrigido depois (A6 da 24ª, `docs/regras/comissoes.md:529-531`) porque o "Sem comissão de venda" escondia a do pacote, do produto e da rede, que valem. O "Comissão: nenhuma." do resumo tem o mesmo problema (princípio 3).
- MC-01: `docs/regras/plataforma.md:884`, `:919`, `docs/regras/indicadores.md:1101` e `:1188` dizem que vê as Minhas comissões "quem atende ou tem comissão de venda", e `docs/regras/vendas-financeiro.md:1432` manda às Minhas comissões só "quem atende e não tem o Financeiro"; a decisão de 23/11 (`docs/revisao.md:2238`, "vamos pela sua recomendação") diz quem tem "comissão no nome dela, não só o percentual próprio", que é o texto de `docs/regras/comissoes.md:723-727`.
- MC-01, dentro da própria revisão: o SM2 (`docs/revisao.md:2215`) abre a vista "a quem atende (o 'Atende' marcado)"; a resposta do mesmo dia (`docs/revisao.md:2238`) amplia para quem tem comissão no nome dela.
- CM-03, CM-04: `docs/regras/copilot.md:460-462` diz que o Copilot dá como quem muda as comissões "o Financeiro em Gerenciar, na rede; a Admin da rede sempre". Desde 18/11 a configuração de comissão (Comissões e taxas, procedimento, pacote, produto) é só da Admin da rede; o Financeiro em Gerenciar vale só para a comissão de cada pessoa (CM-04), e o texto não separa as duas.
- CQ-01, CV-09 (pergunta removida: KC-05, KC-06): os rascunhos davam como "atribuída ao Heitor sem a fala" ficar com a comissão no cadastro do pacote e com o preço e a comissão de venda no cadastro do produto. As duas estão na tabela "O sistema faz e não está na lista do Heitor (ele decide se fica)" da revisão, com a resposta dele: PC5 "ok, mantém" (`docs/revisao.md:293`) e E9 "mantém" (`docs/revisao.md:149`) — como o catálogo de Vendas e financeiro já leu a PC3 e a PC4. Não é regra sem fonte.
- CF-11 (pergunta removida: KB-35): `docs/revisao.md:2272` põe "A frase 'o fechamento é por unidade' aparece só com mais de uma unidade" entre as coisas que a F75 decidiu "pela frente e não pelo Heitor". O princípio 7 responde ("O caso comum aparece; o raro fica guardado", e o cliente real é a rede de uma unidade, CLAUDE.md §1): fica como decisão do Claude.

## Ficou fora do catálogo

Detalhe de dado antigo ou regra que perdeu efeito, sem decisão de produto que valha hoje.

- KA-05: o pacote vendido antes de existir a venda de pacote no sistema (sem preço de venda gravado) libera a comissão na conclusão da sessão (`docs/regras/comissoes.md:36-37`) — caminho de dado antigo, não regra de produto.
- KA-08: a comissão gerada antes de 01/11/2026 continua com a conta daquela época (`docs/regras/comissoes.md:47-52`) — história; o que vale hoje é que cada comissão guarda a regra do dia em que nasceu (CB-10).
- KA-15: a regra geral nova num procedimento em que a Admin da rede não tem valor próprio "é do procedimento" e pode ser gravada (`docs/regras/comissoes.md:104-108`) — perdeu efeito em 18/11, quando a comissão do procedimento ficou só com a Admin da rede (PC-03); ver Divergências.
- As linhas "O que nunca fazer aqui" de `docs/regras/comissoes.md:756-777` (a conta só no banco, a base efetiva, a base do pagamento e da hora de cada lançamento, a liberação só com o pagamento integral, o modo INTEGRAL, a geral que vence, os pontos na base de toda comissão, o fixo do pacote de fora, a comissão da Admin no procedimento, a responsável do pacote, "Quem vendeu" só com quem vende) repetem regras acima ou são técnicas.

## É de outra área

- KA-12: a comissão do procedimento só da Admin da rede (`docs/regras/comissoes.md:83-86`) — área: Atendimento, PC-03 (com a pergunta Q25 aberta).
- KC-04: o cadastro do procedimento continua com a seção de comissão (o Heitor, 13/11: "Parte de descrição, disponivel nas unidades, salas, insumos e o resto pode manter.", `docs/revisao.md:201-202`, `:219`, `:1929`) — área: Atendimento (o cadastro do procedimento).
- KC-01: as Comissões são a última das cinco abas do Financeiro, com a mesma barra de período e de unidade, nos dois portais (`docs/revisao.md:634-640`, `:2007`, `:2012`; `docs/regras/vendas-financeiro.md:1422-1423`) — área: Vendas e financeiro, FN-01.
- "Quem vendeu" nasce sempre vazio, pergunta "Vender assim?" quando fica vazio, e é quem a tela marcou, não quem registrou (`docs/regras/comissoes.md:287-301`) — área: Vendas e financeiro, VD-06 e VD-07; aqui fica só o efeito na comissão (CV-01, CV-02). Atenção: a VD-07 data a com-06 de 2026-11-18, e `docs/regras/comissoes.md:288` a data de 2026-11-02 (o 18/11 é da auditoria que tirou o "quem registrou").
- O máximo de parcelas do crediário, que mora na mesma configuração (`docs/regras/comissoes.md:127`) — área: Vendas e financeiro (CR).
- As maquininhas, as taxas, a bandeira e o Pix como cadastro (`docs/regras/comissoes.md:222-231`) — área: Vendas e financeiro, MQ-06 a MQ-13; aqui ficam só o efeito na comissão (CT-01 a CT-05) e a maquininha de fábrica (CT-06), que aquele catálogo mandou para cá.
- O cartão em várias vezes como pagamento feito na hora e as parcelas da operadora (`docs/regras/comissoes.md:26-31`) — área: Vendas e financeiro, MQ-01.
- A maquininha do pagamento quando a tela não pergunta (`docs/regras/comissoes.md:612-614`) — área: Vendas e financeiro, MQ-15.
- A taxa e o líquido no Vender, que só aparecem para quem tem o Financeiro em Ver (`docs/regras/vendas-financeiro.md:1008-1015`) — área: Vendas e financeiro, MQ-17.
- O Fechamento do dia não abre pela vista pessoal (`docs/regras/vendas-financeiro.md:1609`) — área: Vendas e financeiro, FC-01.
- O cancelamento do pacote em si (quem cancela, a prévia, o que volta à cliente) e o pacote trazido de fora como registro (`docs/regras/comissoes.md:371-372`, `:393-394`) — área: Vendas e financeiro, PA-24 e os cancelamentos.
- As comissões que `docs/regras/vendas-financeiro.md` só repete com o endereço de `comissoes.md` (o pacote e o plano cancelados, o pré-pago, o crédito interno vendido, o pacote de fora, o "Abater do pacote": `:744-751`, `:850-851`, `:909`, `:940-944`, `:984-988`, `:1099-1101`, `:1311-1312`) — o catálogo de Vendas e financeiro as mandou para cá; estão nas regras acima.
- A seção de comissão no cadastro do produto (Venda direta) — área: Atendimento, ES-08; CV-09 é a regra da comissão.
- A Admin da rede que atende marca o "Atende" e a comissão na Equipe com o cargo travado (`docs/regras/comissoes.md:523-524`) — área: Atendimento, AG-65.
- O atendimento concluído não se cancela nem vira falta; o que se desfaz é o pagamento, pelo estorno (`docs/regras/comissoes.md:625-627`, `:766`) — área: Atendimento.
- A linha de comissão nasce na conclusão, numa transação só (`docs/regras/atendimento.md:3310-3313`); desistir no meio não gera comissão (`:3389`); a sessão de plano usa o preço do plano (`:1269`) — área: Atendimento.
- Os pontos e o voucher como forma de pagamento (`docs/regras/comissoes.md:24-25`, `:159-160`) — área: Fidelidade. O catálogo de Fidelidade (KA-62 dele) mandou para cá a base da comissão com os pontos e o voucher e a escolha "Sobre o preço / Sobre o valor pago" (`docs/regras/fidelidade.md:113-118`): estão em CB-01, CB-02 e CB-05.
- A importação "Pacote de antes" (`docs/regras/crm-inbox.md:1020`) — área: Clientes, CRM e inbox, IM-22; a divergência do texto está acima (CQ-09).
- O "Meu faturamento" e a coluna Profissional das Vendas, que usam "Quem vendeu" (`docs/regras/comissoes.md:296-297`); o lucro, que conta a comissão quando ela é lançada, e a despesa paga "Comissões" do fechamento, que fica só no caixa (`:430-431`, `:657-661`, `:773`); o ranking de comissão (`:740-741`); a tabela "Comissões por Profissional" e o "Também têm comissão, sem atender" (`docs/regras/indicadores.md:1360-1367`); o "Meu faturamento" × as comissões (`:1195-1206`); o fuso da rede nas comissões (`:76-80`) — área: Indicadores.
- Os eventos `comissao.gerada`, `comissao.liberada` e `comissao.paga` (`docs/regras/comissoes.md:716-719`) — área: Automações (o catálogo de eventos).
- O Copilot não muda comissão, só indica a tela (`docs/regras/copilot.md:215`), e dá a comissão só a quem tem o Financeiro em Ver (`:275-276`, a regra é a QV-02) — área: Copilot.
- O "repasse" do EQ1c e do UM5 (`docs/revisao.md:2113`, `:2232`) é o repasse dos agendamentos e das oportunidades ao desativar alguém, não o pagamento da comissão — área: Plataforma (Equipe).
- A pessoa só pode atender nas unidades dela (o Heitor, 23/11: "uma pessoa só pode atender nas unidades que faz parte, isso é obvio") — área: Plataforma (Equipe).
- Os cargos-modelo nascem sem o Financeiro, porque o que eles viam do Financeiro eram as próprias comissões, que hoje são a vista pessoal (`docs/regras/plataforma.md:916-922`) — área: Plataforma (Cargos).
- Ao desativar uma unidade, a janela mostra a comissão a pagar e oferece "Fechar as comissões"; a unidade desativada que ainda tem comissão a pagar continua contada e alcançável (`docs/regras/plataforma.md:953-990`) — área: Plataforma (unidades).
- O catálogo dos planos da assinatura, que lista as comissões entre as funcionalidades — área: Plataforma (assinatura); CM-02 é só o efeito na comissão.
- A sessão não lê comissão e a tela escuta um sinal (`docs/regras/comissoes.md:550-562`) — regra do sistema inteiro, no CLAUDE.md §4.
