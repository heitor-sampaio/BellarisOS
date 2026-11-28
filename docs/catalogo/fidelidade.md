# Catálogo de regras — Fidelidade

Este é o catálogo das regras da Fidelidade que valem HOJE: o programa e quem mexe nele, como o ponto nasce, o estorno e o cancelamento, o uso dos pontos e do voucher no PDV, as recompensas e os vouchers, o saldo, o extrato e a validade, os bônus e o prêmio por indicação, e o que a cliente vê no app. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, ou "decisão do Claude". "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/fidelidade.md`; KB: as decisões de `docs/revisao.md`; KC: os outros arquivos de `docs/regras/` e o `DEVLOG.md`). É um RASCUNHO para o Heitor revisar. Contagem: 58 regras (O programa e quem mexe 8, O ganho do ponto 10, Estorno e cancelamento 5, Pontos e voucher no PDV 10, Recompensas e vouchers 6, Saldo, extrato e validade 7, Bônus e indicação 8, O que a cliente vê no app 4), nenhuma pergunta e 14 divergências. Dos 105 números do rascunho, 2 ficaram fora do catálogo e 5 são de outra área (ver os apêndices); todos os outros estão num "Antes". As cinco perguntas dos rascunhos foram respondidas por regras que já existem (a aprovação do FD1 e do FD2b em 13/11, a regra de permissões do CLAUDE.md §11 e o princípio 1); o motivo de cada uma está em "Divergências".

## O programa e quem mexe (PG)

**PG-01.** O programa de fidelidade é da rede, um só para todas as unidades, e fica como está: a cliente ganha pontos por real pago ou por procedimento e os usa como desconto no pagamento ou troca por recompensa. Nasce desligado, e cada rede o liga e configura em Configurações → Fidelidade.
- Fonte: o Heitor, 2026-11-13: "Eu acho que ta boa, mas aceito recomendação"
- Onde: `docs/revisao.md:660`, `:664`, `:682-685`, `:2019`; `docs/regras/fidelidade.md:10-16`
- Antes: KA-01, KB-01

**PG-02.** Com o programa desligado — ou quando o plano da assinatura da rede não tem a fidelidade —, nenhum sinal de pontos aparece: nem na ficha, nem no app da cliente, nem nas telas de venda, nem no que o Copilot diz da cliente; e não nasce ponto nem bônus.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:16`, `:430`; `docs/regras/plataforma.md:300`; `docs/regras/copilot.md:266`
- Antes: KA-01, KC-08, KC-23

**PG-03.** Configurar a fidelidade — o programa, o catálogo de recompensas e os opcionais — é só da Admin da rede.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/fidelidade.md:11-16`; `docs/regras/plataforma.md:753`; CLAUDE.md §11
- Antes: KA-02, KB-03

**PG-04.** Todos os opcionais nascem desligados e se ligam na aba Fidelidade: a validade dos pontos, o aviso de vencimento, o bônus de aniversário, o bônus de primeiro acesso, a venda de produto pontuar, a troca pelo app e o prêmio por indicação.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:673-676`, `:684-685`, `:2028`; `docs/regras/fidelidade.md:264-265`
- Antes: KA-48, KB-02

**PG-05.** Quem tem a Fidelidade em Ver vê o saldo, o extrato e os vouchers; quem tem em Gerenciar também troca pontos por recompensa (na ficha e no PDV), cancela e entrega o voucher e ajusta pontos. Usar os pontos e o voucher no pagamento não é da Fidelidade: é de quem recebe (o PDV em Gerenciar, `podeReceber`, PV-04 de Vendas), também com a Fidelidade só em Ver. Quem só vê lê na ficha a quem pedir ("Trocar pontos por recompensa e ajustar pontos é de quem tem a Fidelidade em Gerenciar: Lúcia, Fernanda." — as pessoas ativas que alcançam a unidade, e a Admin da rede); no app sem a troca pelo portal, a cliente lê com quem falar ("A troca é feita pela equipe, com quem cuida da fidelidade: Lúcia.").
- Fonte: decisão do Claude; os pontos no pagamento: decisão do Claude, 27/11 (37ª, Decisão B2) — os pontos usados são forma de pagamento (AG-56 do Atendimento), e receber é do PDV (PV-04 de Vendas); é o que o sistema faz (o receber de `apps/web/actions/appointments.ts` pede só o `podeReceber`)
- Onde: `docs/regras/fidelidade.md:89-97`, `:419`; `apps/web/lib/permissions.ts:84`; `apps/web/actions/fidelidade.ts:244-248`, `:262`; `apps/web/components/branch/vouchers-do-cliente.tsx:82`, `:174`
- Antes: KA-03

**PG-06.** O ajuste de pontos à mão pede sempre um motivo; tirar mais do que a cliente tem de saldo é recusado. Acima de 1.000.000 de pontos a ficha avisa e o ajuste vale; só se recusa o zero, o fracionário, o acima de 2.147.483.647 e o crédito que faria o saldo passar disso (o limite do registro) (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; os números são decisão do Claude).
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:677`, `:2028`; `docs/regras/fidelidade.md:78-79`
- Antes: KA-04, KB-15

**PG-07.** Toda cliente cadastrada — à mão ou pela importação — já nasce com a conta de pontos; o contato do CRM que ainda não é cliente não tem.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:297`, `:901`, `:1120`
- Antes: KC-09

**PG-08.** Nenhum número da configuração da fidelidade é recusado por ser grande: acima do comum, o campo avisa ("Acima do comum (…). Confira: o valor vale como está.") e grava. O comum vai até 1.000 pontos por R$ 1, R$ 1.000 o ponto, 1.000.000 de mínimo, de bônus e da indicação, 120 meses de validade dos pontos, 90 dias de aviso e 365 dias de validade do voucher. Só se recusa o impossível (zero onde não cabe, negativo) e o que o registro não guarda (o tipo da coluna, e 100 anos nos prazos).
- Fonte: princípio 2 (o Heitor, 2026-11-04: "no máximo, avisar"); os números do aviso: decisão do Claude, 25/11 (o aviso começa no teto de antes)
- Onde: `docs/regras/fidelidade.md:63-73`, `:457`; `apps/web/lib/acima-do-comum.ts`; `apps/web/tests/tetos-avisam-nao-recusam.test.ts`
- Antes: (sem número: as regras dos tetos mudaram em 25/11)

## O ganho do ponto (GA)

**GA-01.** O ponto nasce no PAGAMENTO, nunca na conclusão do atendimento: concluir (também pelo "Concluído" da agenda) não dá ponto. Toda receita paga de uma cliente pontua, menos o estorno e o que foi pago com crédito interno, e o mesmo pagamento não pontua duas vezes.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:667`, `:687`, `:2025`; `docs/regras/fidelidade.md:18-21`; `docs/regras/atendimento.md:1391`, `:1445`, `:3318`, `:3784`
- Antes: KA-05, KA-33, KB-05, KC-01

**GA-02.** O ponto sai do dinheiro que entrou: na comanda do atendimento (também no produto dela), na "Nova venda" e na comanda do plano, o ganho é sobre o valor pago, depois do voucher e dos pontos usados. No modo por procedimento, os pontos do procedimento valem na proporção do dinheiro que entrou sobre o preço vendido: o voucher, os pontos usados e o crédito interno saem da base; o desconto comercial já sai do preço vendido e não tira pontos (como no pacote e no plano).
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"; decisão do Claude, 28/11 (42ª, B-1 e D1)
- Onde: `docs/revisao.md:2025`; `docs/regras/fidelidade.md:163-167`, `:171-177`; `docs/regras/vendas-financeiro.md:179`, `:265`
- Antes: KA-33, KA-34, KC-02

**GA-03.** A rede escolhe UM modo de ganho: por real pago (arredondado para baixo) ou por procedimento. No modo por procedimento, os pontos de cada procedimento se editam no cadastro dele, e o campo só aparece nesse modo. Acima de 1.000.000 de pontos o cadastro avisa e vale; só se recusa o negativo, o fracionário e o acima de 2.147.483.647 (o limite do registro) (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; os números são decisão do Claude). O campo aparece no modo por procedimento também com o programa desligado (a rede prepara e liga depois, princípio 6), e não aparece sem a fidelidade no plano da assinatura.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"; decisão do Claude, 28/11 (42ª, B-3 e A1)
- Onde: `docs/revisao.md:666`, `:218`, `:1929`, `:2028`; `docs/regras/fidelidade.md:22-24`
- Antes: KA-06, KB-04

**GA-04.** O que se paga em partes pontua a cada pagamento e soma: no plano, a entrada pontua antes de qualquer sessão e cada parcela quando é paga; no pacote e no pré-pago no crediário, igual. As parcelas juntas dão exatamente os pontos do total (3 × R$ 33,33 dão os 100 pontos de R$ 100). No modo por procedimento, o plano, o pacote e o pré-pago pontuam na proporção do que foi pago.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:2025`; `docs/regras/fidelidade.md:24-34`; `docs/regras/vendas-financeiro.md:1134`; `DEVLOG.md:12174`
- Antes: KA-07, KC-03, KC-06

**GA-05.** O atendimento avulso recebido em várias formas ou no crediário também soma: cada pagamento dá a parte do que já foi pago, menos o que já foi dado; o procedimento com pontos fixos não os dá duas vezes.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:35-39`
- Antes: KA-08

**GA-06.** O cartão em N vezes pontua na VENDA, inteiro: a cliente pagou tudo na maquininha. O que a operadora deposita depois, em parcelas, não pontua de novo.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:48-51`
- Antes: KA-10

**GA-07.** O crédito interno vendido pontua na VENDA, pelo dinheiro pago, por real pago em qualquer modo de ganho (também no "por procedimento"); usar o crédito depois não pontua. O bônus dado junto com o crédito não pontua (R$ 500 pagos + R$ 50 de bônus pontuam R$ 500). O estorno da venda do crédito tira os pontos do que voltou (na proporção, no estorno parcial).
- Fonte: o Heitor, 2026-11-07: "…crédito, pelo dinheiro pago, não no uso"
- Onde: `docs/regras/fidelidade.md:52-64`; `docs/regras/vendas-financeiro.md:1274`, `:1308`, `:1353`
- Antes: KA-11, KA-12, KC-04, KC-05

**GA-08.** O pacote pontua na venda. A venda de produto só pontua se a rede ligou essa opção (nasce desligada); ligada, a venda de produto paga dá pontos por real pago, também no modo "por procedimento". Vale onde quer que o produto seja vendido: o produto acrescentado na comanda do atendimento (PV-10 de Vendas) segue a mesma opção — desligada, não pontua, e a comanda diz "· não pontua" (GA-09).
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"; o produto na comanda do atendimento: decisão do Claude, 27/11 (37ª, Decisão B1) — a GA-08 fala da venda de produto sem distinguir onde ela é feita
- Onde: `docs/revisao.md:675`, `:688`, `:2025`; `docs/regras/fidelidade.md:285-291`; `docs/regras/vendas-financeiro.md:1190`
- Antes: KA-13, KB-06, KC-07

**GA-09.** Com a fidelidade ligada, a tela diz quando a venda de produto pontua ou não: a janela da venda, na dica "Sobre os pontos desta venda" ao lado do "Pagamento" ("A venda de produto não gera pontos de fidelidade (Configurações → Fidelidade)." ou "A venda gera pontos de fidelidade quando for paga."), o lançamento pago na aba Financeiro da ficha e no Financeiro do app ("Venda de produto não pontua") e o produto na comanda do atendimento ("· não pontua"). A janela de devolução de produto só fala em pontos que saem do saldo se a venda pontuou. Com a fidelidade desligada, nada se diz de pontos.
- Fonte: princípio 3; a frase da janela da venda na dica: o Heitor, 2026-11-16: "pode tirar esse monte de aviso e explicação, se quiser manter bota em um tooltipzinho que só aparece se passar o mouse em cima." (`docs/regras/design.md`, "A explicação mora na dica")
- Onde: `docs/regras/fidelidade.md:291-299`; `docs/regras/vendas-financeiro.md:1190`, `:1263`; `apps/web/components/shared/vender.tsx` ("Sobre os pontos desta venda")
- Antes: KA-14, KC-07, KC-18

**GA-10.** No modo por procedimento, o que se paga em partes e o que se paga sem dinheiro: (1) a entrada do crediário dá os pontos do procedimento na proporção do que foi pago, arredondando para baixo, e o resto sai com as parcelas, nunca em dobro (a entrada de R$ 100 de um Peeling de R$ 300 que vale 80 pontos dá 26, e as parcelas dão os 54 que faltam); (2) o pacote dá na venda a soma dos pontos dos procedimentos dele (duas drenagens de 40 pontos dão 80), e as sessões dele não dão de novo; (3) a sessão paga só com voucher não tem dinheiro e não dá ponto (0).
- Fonte: decisão do Claude, 26/11 (32ª simulação, Decisão C) — pela GA-02 (o ponto sai do dinheiro que entrou), pela GA-04 e pela GA-05 (a proporção do que foi pago, sem dar duas vezes) e pela GA-08 (o pacote pontua na venda); é o que o sistema faz (C02, C05 e C08 da 32ª)
- Onde: (ainda não está em `docs/regras/fidelidade.md`; o sistema já faz isso, visto na 32ª simulação); GA-02, GA-04, GA-05, GA-08
- Antes: (nova, 26/11)

## Estorno e cancelamento (ES)

**ES-01.** O estorno de um pagamento tira exatamente os pontos que ele deu (no estorno parcial, na proporção do que voltou) e devolve o que foi usado nele: os pontos voltam ao saldo e o voucher volta a valer. Desfazer um pagamento feito com pontos ou voucher não devolve dinheiro nenhum. O saldo pode ficar negativo.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:667`, `:1718`, `:2025`; `docs/regras/fidelidade.md:65-67`, `:121`, `:221-222`; `docs/regras/vendas-financeiro.md:275`, `:2015`
- Antes: KA-15, KA-41, KB-07, KC-15, KC-16

**ES-02.** A janela do estorno diz ANTES o que acontece com os pontos: quantos saem e o saldo de antes e de depois ("…o saldo dela vai de 380 a 200 pontos…"), o prêmio de indicação que sai junto, os pontos usados que voltam, o voucher que volta a valer, o prêmio que passa a outro pagamento, o voucher do prêmio cancelado (ou, já usado, que fica). Com a fidelidade desligada, nada. O "Devolver parte da venda" diz o mesmo: os pontos que saem e o saldo de antes e de depois.
- Fonte: princípio 3; decisão do Claude, 28/11 (42ª, D7)
- Onde: `docs/regras/fidelidade.md:67-77`; `docs/regras/vendas-financeiro.md:2015`
- Antes: KA-16, KC-16

**ES-03.** No cancelamento do pacote (e da unidade do pré-pago), o que volta como estorno tira os pontos (o lançamento estornado inteiro tira tudo o que deu; o estornado em parte, na proporção); o que volta como crédito interno deixa os pontos, porque o dinheiro não voltou. A parcela a receber que caiu nunca deu ponto.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:180-187`, `:194-197`; `docs/regras/vendas-financeiro.md:779`, `:851`, `:1124`, `:1330`, `:3156`
- Antes: KA-17, KC-15

**ES-04.** Com a fidelidade ligada e algo a devolver, o "Cancelar pacote" e o "Cancelar plano" dizem os pontos antes ("Os pagamentos deste pacote deram 750 pontos, e a cliente tem 220 hoje. O estorno tira os pontos do que voltar, na proporção — e o saldo pode ficar negativo…").
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:187-194`
- Antes: KA-18

**ES-05.** Estornado só o produto da comanda, o voucher segue usado na parte do atendimento, e a comanda diz: "O voucher “X” segue usado na parte do atendimento (R$ 28,71). A parte dele no produto estornado saiu com o estorno."
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:349`
- Antes: KC-17

## Pontos e voucher no PDV (PD)

**PD-01.** Os pontos e o voucher só se usam no PDV, ao receber: na comanda do atendimento (sobre o total, o atendimento e os produtos acrescentados nela), na "Nova venda" à vista (produto, pacote, procedimento) e na comanda do plano (no à vista, sobre o plano depois do desconto comercial). Não existe outro caminho fora do PDV. O bloco "Fidelidade" aparece quando a cliente tem saldo ou voucher de desconto.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:686-690`, `:1711`, `:1716`, `:1860`, `:2024`; `docs/regras/fidelidade.md:98-105`, `:171-177`; `docs/regras/vendas-financeiro.md:173`, `:476`; `docs/regras/atendimento.md:3341`
- Antes: KA-24, KA-34, KB-08, KC-10

**PD-02.** No uso dos pontos valem as regras da rede: quanto vale o ponto, o mínimo de pontos e o teto (em % do valor).
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:669`, `:682`; `docs/regras/fidelidade.md:98-102`
- Antes: KA-24, KB-09

**PD-03.** O que se paga com pontos ou voucher não é dinheiro recebido nem desconto comercial: o preço vendido (e o do contrato) não muda, o lançamento registra o dinheiro que entrou e o que foi pago com pontos ou voucher aparece à parte ("Pago com pontos/voucher" no CSV, "Pago com o voucher “X”: R$ 180,00" ou "Pago com pontos: …" na linha, "Sem forma (pontos)" no Fechamento do dia). Receita, LTV e estorno contam o dinheiro. Pago todo com pontos, o lançamento é de R$ 0,00, sem forma de pagamento, e não vai como compra para a API de Conversões da Meta. O cartão da Agenda do app mostra o valor cobrado contando os pontos. A linha da ficha diz "Pago com pontos/voucher" também quando há dinheiro junto na mesma linha.
- Fonte: decisão do Claude; decisão do Claude, 28/11 (42ª, D10)
- Onde: `docs/regras/fidelidade.md:102-105`, `:119-120`, `:431`; `docs/regras/vendas-financeiro.md:180`, `:391`, `:2011`, `:2721`, `:2896`; `docs/regras/atendimento.md:1213`
- Antes: KA-25, KA-32, KC-14

**PD-04.** Na comanda do atendimento com produtos, os pontos e o voucher se repartem entre os lançamentos na proporção do valor: o estorno de um deles devolve só os pontos dele. O voucher de procedimento fica inteiro no atendimento.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:124-127`; `docs/regras/vendas-financeiro.md:272`
- Antes: KA-27, KC-12

**PD-05.** Recebendo em várias formas ("+ Outra forma"), os pontos e o voucher abatem na primeira forma e não passam do valor dela; a base do teto e do voucher é a venda inteira. Toda tela soma a fidelidade de volta à primeira forma, então isso não limita quem recebe. O ponto sai só do dinheiro que entrou nas formas: os pontos, o voucher e o crédito interno usados ficam fora da base (o crédito já pontuou na venda, GA-07); no modo por procedimento, os pontos do procedimento saem na proporção desse dinheiro.
- Fonte: decisão do Claude; a base do ponto sem os pontos, o voucher e o crédito interno usados: decisão do Claude, 28/11 (42ª, Decisão B-1), pela GA-02 e pela GA-07
- Onde: `docs/regras/fidelidade.md:133-138`, `:148-151`; `docs/regras/vendas-financeiro.md:502`
- Antes: KA-28, KC-13

**PD-06.** Os pontos e o voucher só valem no que se paga agora, à vista: no atendimento avulso, o crediário e o "a receber" os tiram; na "Nova venda" e na comanda do plano, só à vista. No crediário e no "a receber", a tela diz "Os pontos e o voucher se usam no pagamento à vista."
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:137-139`, `:145-158`, `:176`; `docs/regras/vendas-financeiro.md:480`, `:538`
- Antes: KA-29, KC-11

**PD-07.** Na "Nova venda" só vale o voucher de DESCONTO (valor ou percentual); o voucher de procedimento paga o atendimento daquele procedimento e se usa na comanda dele.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:139-140`, `:159-162`; `docs/regras/vendas-financeiro.md:483`
- Antes: KA-30, KC-12

**PD-08.** A venda de crédito interno não usa pontos: é dinheiro guardado, não consumo.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:143-144`
- Antes: KA-31

**PD-09.** A tela diz onde os pontos se usam: na ficha, o voucher de desconto ativo diz "Usa-se no PDV, ao receber"; em Configurações → Fidelidade, "No PDV, ao receber" (não "Na recepção, ao confirmar o pagamento").
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:689-690`, `:1719`, `:2026`; `docs/regras/fidelidade.md:168-170`
- Antes: KA-35, KB-12

**PD-10.** O receber do atendimento e a "Nova venda" oferecem "Trocar pontos por voucher" (a mesma troca da ficha), e o voucher novo já vem escolhido. Só aparece o que vale ali — o voucher de desconto e o de procedimento do procedimento do atendimento —, e só quando o saldo alcança algum. Troca quem tem a Fidelidade em Gerenciar; quem não tem lê "Trocar pontos por voucher é de quem tem a Fidelidade em Gerenciar: …".
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:413-421`
- Antes: KA-36

## Recompensas e vouchers (RV)

**RV-01.** A rede monta o catálogo de recompensas: procedimento grátis, desconto em R$ ou em %, produto ou brinde. Na troca, os pontos saem na hora e nasce um voucher com validade. A troca é feita pela equipe (na ficha ou no PDV); a cliente só troca pelo app se a rede ligou essa opção — senão, só VÊ o voucher.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:669`, `:671`, `:675`, `:2028`; `docs/regras/fidelidade.md:198-203`
- Antes: KA-37, KB-10, KB-11

**RV-02.** O voucher guarda um retrato da recompensa de quando foi trocado: editar a recompensa depois não muda o já emitido.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:203-204`, `:433`
- Antes: KA-38

**RV-03.** O voucher de produto se entrega na ficha, e sai uma embalagem do estoque da unidade de onde ele sai. O brinde pode não ser produto ("Nenhum — brinde ou serviço fora do estoque"): a recompensa é o nome, e o "Entregar brinde" só marca o voucher como usado.
- Fonte: princípio 1
- Onde: `docs/regras/fidelidade.md:207-214`
- Antes: KA-39

**RV-04.** O voucher é da rede: cancela-se e entrega-se em qualquer unidade da rede, seja qual for a unidade em que foi trocado; na entrega de produto, a unidade conferida é a do estoque de onde ele sai.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo"
- Onde: `docs/regras/fidelidade.md:258-262`; `DEVLOG.md:2088`, `:4561`
- Antes: KA-20, KC-20

**RV-05.** Cancelar um voucher não usado devolve os pontos (menos o do prêmio por indicação, que não custou pontos); o vencido não vale e não devolve; o estorno do pagamento em que ele foi usado o reativa.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:221-222`, `:350-358`
- Antes: KA-41

**RV-06.** O formulário da recompensa diz quanto os pontos valem ("2.000 pontos valem R$ 20,00 pelo valor do ponto (R$ 0,01…) — o procedimento custa R$ 150,00 na tabela") e, no "Procedimento grátis", que o procedimento precisa estar cadastrado em Procedimentos. O desconto acima do que os pontos valem ganha aviso ("O desconto (R$ 30,00) vale 15 vezes o que os 200 pontos valem (R$ 2,00). Confira o custo em pontos ou o valor do ponto.") e salva igual: a rede decide o custo. O custo acima de 10.000.000 de pontos também avisa e salva; só o zero, o fracionário e o acima do registro (2.147.483.647) são recusados (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito.").
- Fonte: princípio 2
- Onde: `docs/regras/fidelidade.md:223-235`
- Antes: KA-42, KA-43

## Saldo, extrato e validade (SA)

**SA-01.** O saldo de pontos é um só, da rede, e inclui os bônus: o ponto ganho numa unidade vale em todas — no desconto do pagamento, na troca por recompensa (pela equipe e pelo app), no ajuste e no voucher trocado em outra unidade. Não existe "pontos só na unidade", saldo por unidade nem "Onde o bônus pode ser usado"; o extrato só diz onde cada lançamento aconteceu ("· Unidade X").
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:691-696`, `:1752`, `:2027`, `:2273`; `docs/regras/fidelidade.md:248-260`, `:277-284`, `:438`; `DEVLOG.md:4561`
- Antes: KA-19, KA-51, KB-13, KC-19

**SA-02.** O saldo é sempre a soma do extrato.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:86-88`
- Antes: KA-21

**SA-03.** Na ficha da rede com duas ou mais unidades, o ajuste de pontos, a troca por recompensa e a entrega do voucher perguntam a unidade (nenhuma vem escolhida), e o produto do voucher sai do estoque da unidade escolhida. Com uma unidade só, nada a perguntar; no portal da unidade, é ela.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:660`, `:670`
- Antes: KC-21

**SA-04.** A ficha mostra o saldo, o extrato, os vouchers e quanto vence nos próximos 30 dias, com o "vence em" de cada linha; o app mostra o mesmo vencimento.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:677`; `docs/regras/fidelidade.md:246-247`
- Antes: KA-45, KB-14

**SA-05.** A validade é opcional: a rede escolhe se os pontos não vencem ou vencem em N meses. O vencimento de cada ponto se fixa quando ele nasce: mudar a regra vale só para os pontos novos. Gastam-se primeiro os que vencem antes; o vencido sai do saldo como "Pontos vencidos".
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:673`, `:2028`; `docs/regras/fidelidade.md:238-246`
- Antes: KA-44, KB-16

**SA-06.** O aviso de vencimento no celular é opcional e só existe com a validade: um aviso por lote novo de pontos que entra na janela, nunca um por dia nem dois de uma vez. O link leva ao portal da unidade dos pontos que vencem; se ela não está ativa, à última unidade que a cliente usou no portal; senão, à primeira unidade ativa da rede — nunca à unidade de cadastro.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:314-322`; `docs/regras/atendimento.md:983`; `docs/revisao.md:673`
- Antes: KA-46, KB-16, KC-22

**SA-07.** O dia do aniversário e o "vence em" do aviso seguem o fuso da rede (Brasília de padrão).
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:323-324`
- Antes: KA-47

## Bônus e indicação (BO)

### Os bônus

**BO-01.** O bônus de aniversário (uma vez por ano) e o de primeiro acesso (uma vez) se ligam cada um pela rede e nunca se dão duas vezes. Quem nasceu em 29/02 ganha em 28/02 fora de ano bissexto.
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"
- Onde: `docs/revisao.md:674`, `:2028`; `docs/regras/fidelidade.md:266-270`
- Antes: KA-49, KB-17

**BO-02.** O bônus de primeiro acesso é por ficha, isto é, por rede: a mesma pessoa, com um login só, ganha em cada rede na primeira vez que a abre. Quem já tinha entrado antes de a opção existir não ganha.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:270-276`
- Antes: KA-50

**BO-03.** O aviso no celular sobre os bônus da fidelidade só chega à cliente se a rede ligou; nada sai sozinho.
- Fonte: o Heitor, 2026-11-13: "Pode fechar"
- Onde: `docs/revisao.md:1513`, `:1531`
- Antes: KB-20

### O prêmio por indicação

**BO-04.** O "Prêmio por indicação" nasce desligado; ligado, dá a quem indicou N pontos ou uma recompensa do catálogo. A recompensa sai como voucher sem custo de pontos, só se estiver ativa, e cancelar esse voucher não devolve pontos.
- Fonte: o Heitor, 2026-11-10: "1 - sim"
- Onde: `docs/regras/fidelidade.md:331-334`, `:350-358`; `docs/revisao.md:676`, `:2028`
- Antes: KA-56, KB-18

**BO-05.** O prêmio sai quando a indicada paga o primeiro atendimento ou a primeira compra (pacote, pré-pago, produto ou crédito interno também contam) — o primeiro pagamento que vale: com dinheiro, que não é estorno, não foi estornado, não foi pago com crédito interno nem todo com pontos. Uma vez por indicada, nunca retroativo (se ela já tinha um pagamento que vale, nada sai). Os pontos entram como "Indicação de Marina", com a validade da rede.
- Fonte: princípio 5
- Onde: `docs/regras/fidelidade.md:359-372`, `:383-384`, `:435`
- Antes: KA-57

**BO-06.** O estorno inteiro desse pagamento tira o prêmio: os pontos saem ("Estorno da indicação de Marina…") e o voucher ainda ativo é cancelado (o já usado fica). Se a indicada tem outro pagamento que vale, o prêmio passa ao primeiro deles; sem nenhum, o próximo pagamento dela premia. O estorno de uma parte não tira o prêmio.
- Fonte: princípio 5
- Onde: `docs/regras/fidelidade.md:373-382`
- Antes: KA-58

**BO-07.** A configuração do prêmio diz quando ele sai e o que o estorno faz ("Se esse pagamento for estornado por inteiro, o prêmio sai junto; o estorno de uma parte não tira o prêmio."), e o número que vem ao ligar é sugestão ("300 pontos é uma sugestão: ajuste ao seu programa.").
- Fonte: princípio 3
- Onde: `docs/regras/fidelidade.md:382-388`
- Antes: KA-59

**BO-08.** A Visão geral da ficha diz a situação do prêmio de cada indicada: "Indicou: Marina (prêmio dado em 10/11)" — ou estornado, ou à espera do primeiro pagamento, ou sem prêmio porque ela já tinha pagado antes. Com a fidelidade desligada, só os nomes. O extrato diz "Indicação de Marina" uma vez.
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:389-397`
- Antes: KA-60

## O que a cliente vê no app (AP)

**AP-01.** No portal e no app, a aba Fidelidade mostra à cliente o saldo, o extrato e as recompensas. A troca aparece só se a rede ligou a troca pelo portal: aí a cliente troca pontos por recompensa com o saldo da rede (a unidade do portal é só onde a troca fica registrada); desligada, ela não troca pelo app. Sem a troca pelo app, o bloco se chama "Recompensas"; com ela, "Troque seus pontos".
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "Concordo"; decisão do Claude, 28/11 (42ª, A5)
- Onde: `docs/revisao.md:1493`, `:1498`, `:1503`, `:2151`; `docs/regras/fidelidade.md:300-303`, `:433`
- Antes: KA-52, KB-11, KB-19

**AP-02.** A recompensa fora do alcance diz quanto falta ("Faltam 120 pontos") embaixo do "Trocar" desabilitado, no app e na ficha. Sem a troca pelo app, o app mostra o "Faltam N pontos" embaixo do custo e, com o saldo que alcança, "Você já pode trocar: peça à equipe."
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:304-313`
- Antes: KA-53

**AP-03.** O extrato do app diz a recompensa trocada ("Recompensa: Limpeza de pele") e o uso no pagamento ("Desconto no pagamento: R$ …") embaixo do título — textos que o sistema escreve. O ajuste, o voucher cancelado e o estorno NÃO levam ao app o motivo que a equipe escreveu: ele é anotação da equipe, não da cliente; no app, só o título do lançamento.
- Fonte: princípio 3 (A26 da 25ª simulação)
- Onde: `docs/regras/fidelidade.md:95-100`; `apps/web/lib/fidelidade/formato.ts:41-50`
- Antes: KA-22

**AP-04.** No app, "Indique uma amiga" aparece só com o prêmio por indicação ligado (e a recompensa ativa), em Meus pontos e no Início, e diz o prêmio ("você ganha 300 pontos" ou "um voucher: …"). A cliente não cadastra a amiga pelo app: "É só ela dizer o seu nome à equipe…".
- Fonte: decisão do Claude
- Onde: `docs/regras/fidelidade.md:398-405`, `:437`
- Antes: KA-61

## Perguntas ao Heitor

Nenhuma. As cinco perguntas dos rascunhos tinham resposta numa regra que já existe (o FD1 e o FD2b, aprovados em 13/11 com "concordo"; a regra de permissões do CLAUDE.md §11; o princípio 1). Cada uma está em "Divergências", com o motivo.

## Divergências

O texto de `docs/regras/` (ou da própria revisão) contra a decisão mais nova — para corrigir o texto depois.

- PG-01, PG-04 (pergunta removida): `docs/regras/fidelidade.md:10-11` diz "decisão do Heitor, 2026-09-28" (o programa da rede, desligado ao nascer) e `:264` "decisão do Heitor, 2026-09-29" (os opcionais desligados), sem a fala; `docs/revisao.md:664`, `:673` e `:684-685` (FD1, "Os opcionais nascem desligados (princípio 6)") têm a aprovação dele, "concordo" (13/11). O texto devia citar o FD1.
- GA-04 (pergunta removida): `docs/regras/fidelidade.md:26-28` atribui ao Heitor a D14 de 11/11 (o pacote e o pré-pago no crediário somam, como o plano) e `DEVLOG.md:12174` diz "Confirmado pelo Heitor (2026-10-29)" (a entrada do plano pontua), os dois sem a fala; `docs/revisao.md:2025` (FD2b, "concordo") decidiu que "O ponto nasce quando a comanda é paga, pela regra que já existe" — o que já valia era isso.
- GA-08 (pergunta removida): `docs/regras/fidelidade.md:286` põe entre aspas "os pontos são configuráveis pela clínica" como se fosse fala; `DEVLOG.md:12063` mostra que é o resumo da D4 de 29/10 ("Decidido pelo Heitor (2026-10-29): fazer"), não fala dele, e diz "clínica". A regra fica com o FD2b ("o produto pontua se a rede ligou", `docs/revisao.md:2025`, "concordo") e com o princípio 1.
- PG-05, RV-04 (pergunta removida): `docs/regras/fidelidade.md:207-208`, `:221` e `:258-262` não dizem quem cancela e entrega o voucher. A regra do sistema responde (CLAUDE.md §11: em Ver vê, em Gerenciar mexe; `apps/web/lib/permissions.ts:84` dá à Fidelidade os três níveis), e o código já faz assim: `cancelarVoucher` e `entregarVoucherProduto` pedem a Fidelidade em Gerenciar (`apps/web/actions/fidelidade.ts:247`), e a ficha só mostra os botões com ela (`apps/web/components/branch/vouchers-do-cliente.tsx:174`). Fica como decisão do Claude, e o texto devia dizer isso.
- PG-05: `docs/regras/fidelidade.md:89` diz "VIEW = saldo e extrato; MANAGE = ajustar"; `:92-93` (A38, 07/11) e `:419` (A50, 18/11) dizem que a Fidelidade em Gerenciar também troca pontos por recompensa, e o código pede o Gerenciar para cancelar e entregar o voucher. A descrição do módulo na tela de Cargos ("Pontos do cliente: saldo, extrato e ajuste", `apps/web/lib/permissions.ts:56`) também não fala da troca nem do voucher.
- PG-03: `docs/regras/fidelidade.md:89-90` diz "Configurar é Configurações"; desde 18/11 configurar a fidelidade é só da Admin da rede (`:11-16`, CLAUDE.md §11).
- RV-01, PD-10: `docs/regras/fidelidade.md:200-201` diz "A EQUIPE troca os pontos na ficha", `:302-303` "Desligada, só a equipe troca, na ficha." e `docs/revisao.md:671` "A troca é feita pela equipe, na ficha."; `docs/regras/fidelidade.md:413-421` (A50 da 24ª, 18/11) acrescentou a troca no PDV ("Trocar pontos por voucher" no receber do atendimento e na "Nova venda").
- SA-01: `docs/revisao.md:674-675` (o levantamento de 13/11) lista "pontos só na unidade em que foram ganhos" entre os opcionais; o FD3 (`:691-696`, "concordo") tirou a opção. E a fala da H10 (`docs/regras/fidelidade.md:281-282`, "A clinica decide onde pode ser usado.") caiu com o FD3 — o texto já diz isso; a regra é a de hoje.
- SA-06: `docs/revisao.md:673` junta a validade e o aviso no celular num opcional só ("validade em N meses (com aviso no celular)"); `docs/regras/fidelidade.md:264` e `:314` tratam o aviso como opcional à parte, que nasce desligado. O catálogo segue o separado (princípio 6).
- GA-01: `docs/regras/atendimento.md:3389` diz, do atendimento que para no meio, "Sem comissão e sem pontos: não houve conclusão" — como se o ponto viesse da conclusão; o ponto nasce no pagamento (`docs/revisao.md:2025`; `docs/regras/atendimento.md:1391`, `:3318`), e a sessão já paga não volta (o Heitor, 18/11, `docs/regras/atendimento.md:3390-3391`).
- PD-03: `docs/regras/vendas-financeiro.md:2896` chama de "**Desconto de fidelidade**" o que foi pago com pontos e voucher, e `docs/regras/fidelidade.md:102-105` e `docs/revisao.md:686` falam em "desconto em pontos"; a decisão mais nova (A17 da 25ª, `docs/regras/comissoes.md:180`, decisão do Claude pelo princípio 3) é que os pontos e o voucher não se chamam "desconto" (`docs/regras/vendas-financeiro.md:392`: "não é desconto").
- (sem número; a busca): `docs/regras/busca.md:64` leva à aba Fidelidade "quem é da REDE"; desde 18/11 a configuração da rede toda é só da Admin da rede (CLAUDE.md §11).
- (sem número; Configurações): `docs/revisao.md:1378` (levantamento de Configurações, 13/11) diz que "a configuração da rede toda é de quem é da rede (H7)"; o CLAUDE.md §11 (18/11) a fez só da Admin da rede. É retrato de antes, não regra.
- AP-03 (texto): `docs/regras/fidelidade.md:98-100` diz que o ajuste, o voucher cancelado e o estorno "não — levam o motivo que a equipe escreveu", que se lê ao contrário do que o código faz; o código (`apps/web/lib/fidelidade/formato.ts:41-50`) não leva o motivo ao app ("que não é para a cliente"). O catálogo foi corrigido em 25/11; o texto da regra deve dizer "não levam ao app o motivo".

## Ficou fora do catálogo

Detalhe de tela ou implementação, sem decisão de produto.

- KA-09: os números com fração da configuração se digitam com vírgula e o ambíguo ("0.012") não salva (é a regra do dinheiro do formulário, que vale para o sistema inteiro — `DEVLOG.md:12041-12058`; aqui é só o campo).
- KA-23: o painel Fidelidade da ficha mostra o saldo, o extrato e os vouchers novos sem recarregar a página (atualização da tela, implementação).

## É de outra área

- KA-26: a ordem desconto → voucher → pontos (o Heitor, 18/11, `docs/regras/fidelidade.md:128-132`, `:205-206`) e a repartição dos descontos entre o atendimento e os produtos da comanda (`docs/regras/vendas-financeiro.md:269`, `:2924`, `:3244`) — área: Vendas e financeiro.
- KA-40: o brinde que sai do estoque é a perda "Brinde da fidelidade" em Relatórios → Estoque, pelo custo do lote (`docs/regras/fidelidade.md:215-220`, `docs/regras/indicadores.md:465`, `docs/regras/atendimento.md:2745`) — área: Estoque / Indicadores.
- KA-54: "Indicada por" é um vínculo com outra ficha da rede, escolhida pela busca, nunca texto livre (`docs/regras/fidelidade.md:331-343`, `docs/regras/crm-inbox.md:298`) — área: Clientes (CL-16 do catálogo de Clientes). A fala que falta na Q01 daquele catálogo está em `docs/regras/fidelidade.md:332`: "decisão do Heitor, 2026-11-10: "1 - sim"".
- KA-55: a importação liga "Indicada por" pelo nome quando ele bate com UMA ficha ativa; senão guarda o texto e diz (`docs/regras/fidelidade.md:343-349`) — área: Clientes / Importações (CL-16).
- KA-62: a base da comissão quando a cliente usa pontos ou voucher ("Sobre o preço" × "Sobre o valor pago", Configurações → Comissões) e o nome deles na base (`docs/regras/fidelidade.md:113-118`, `docs/regras/comissoes.md:129`, `:137-163`, `:180-190`, `:586`, `:624`, `:764`) — área: Comissões.
- O gatilho "pontos" da campanha automática virou modelo desligado (MK1), e o modelo "pontos de fidelidade" de "Usar um modelo" nasce em rascunho (AU1), `docs/revisao.md:1053`, `:1113`, `:1868`, `:2083`, `:2091`; `docs/regras/automacoes.md:136`, `:267` — área: Automações / Marketing.
- A aba Fidelidade fica no grupo "Clientes" de Configurações (CF1), `docs/revisao.md:1389`, `:2128` — área: Configurações.
- O levantamento de Configurações diz "a configuração da rede toda é de quem é da rede (H7)", `docs/revisao.md:1378` — área: Configurações (texto de 13/11, superado pelo CLAUDE.md §11 de 18/11; ver Divergências).
- O plano da assinatura diz se a rede usa a fidelidade, `docs/revisao.md:1589` — área: Plataforma (o efeito na rede é a PG-02).
- Os "pontos" do mapa de injetáveis (o rosto, não a fidelidade), `docs/revisao.md:730` — área: Prontuário / Atendimento.
- O pacote trazido de fora não é venda (sem lançamento, sem pontos, sem comissão), `docs/regras/vendas-financeiro.md:971` — área: Vendas e financeiro.
- O bônus do crédito interno vendido e como ele sai no estorno, `docs/regras/vendas-financeiro.md:1345` — área: Vendas e financeiro.
- O voucher e os pontos contam como pagamento nas Vendas, e a Receita dos atendimentos é líquida deles, `docs/regras/indicadores.md:785`, `:264`, `:820`, `:1441` — área: Indicadores.
- A entrega do voucher não se desfaz pelo "Desfazer ajuste" do estoque, `docs/regras/atendimento.md:2695` — área: Estoque.
- A recompensa (sem unidade) usa o preço da rede do procedimento, `docs/regras/atendimento.md:1582` — área: Procedimentos.
- As frases da Auditoria sobre pontos e voucher ("Creditou 200 pontos…", "Devolveu o Voucher…"), `docs/regras/plataforma.md:1311`, `:1397` — área: Plataforma (Auditoria).
- A busca leva à aba Fidelidade, `docs/regras/busca.md:64` — área: Busca (o texto está velho; ver Divergências).
- O fuso da rede na rotina da fidelidade, `docs/regras/indicadores.md:50` — área: Indicadores.
- A rotina `fidelidade` do cron, `docs/regras/infra.md:243` — área: Infra.
- O ajuste e a troca de pontos gravam uma vez por envio, `docs/regras/convencoes.md:197`, `:210` — área: Convenções.
- O site diz que o app da cliente tem pontos e recompensas, `docs/regras/site.md:50`, `:100` — área: Site.
