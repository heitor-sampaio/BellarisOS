# Catálogo de regras — Vendas e financeiro

Este é o catálogo das regras de Vendas e financeiro que valem HOJE: o PDV e as comandas, a Nova venda, quem vendeu e o desconto, as formas de pagamento, o crediário e as parcelas, o dinheiro do plano, os pacotes, o pré-pago, a venda de produto, o crédito interno, o estorno, o cartão e as maquininhas, o Fechamento do dia, o Financeiro, o CSV e o recibo, e o que a cliente vê dos pagamentos no app. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, ou "decisão do Claude". "Atribuída ao Heitor sem a fala" quer dizer que o texto diz que a decisão é dele, mas não traz a fala — está nas Perguntas. "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: o PDV e as comandas, `docs/regras/vendas-financeiro.md:1-551`; KB: os pacotes, `:552-1039`; KC: o pré-pago, a venda de produto e o crédito interno, `:1040-1391`; KD, KE e KF: o Financeiro, `:1392` ao fim; KG: as decisões de `docs/revisao.md`). É um RASCUNHO para o Heitor revisar. Contagem: 180 regras (O PDV e as comandas 16, A Nova venda, quem vendeu e o desconto 10, As formas de pagamento 6, O crediário e as parcelas 11, O dinheiro do plano 11, Os pacotes 26, O pré-pago e o agendar do que já foi pago 8, A venda de produto 8, O crédito interno 10, O estorno 11, O cartão, as maquininhas e as taxas 19, O Fechamento do dia 15, O Financeiro 18, O CSV e o recibo 6, Os pagamentos no app da cliente 5), 4 perguntas e 47 divergências. Dos 404 números do rascunho, 3 ficaram fora do catálogo e 6 são de outra área, que também lista 29 itens sem número dos rascunhos (ver os apêndices); todos os outros estão num "Antes". Das perguntas dos rascunhos, as que uma regra dele já responde saíram (receber é do PDV pelo `podeReceber`; o contrato de pacote antes do dinheiro; o "ok, mantém" do PC3 e do PC4; a taxa na venda só a quem vê o Financeiro; o "Seu crédito", que já é a Q06 do catálogo de Clientes); o motivo de cada uma está em "Divergências".

## O PDV e as comandas (PV)

### O PDV e quem usa

**PV-01.** Todo pagamento de venda acontece no PDV, seja do que for (o atendimento, o pacote, o pré-pago, o produto, o crédito interno, o plano): ele é o lugar de vender e de controlar as vendas e os pagamentos.
- Fonte: o Heitor, 2026-11-13: "vamos fazer um PDV. E aí tudo que foi relacionado a alguma coisa que tenha cobrança vira uma comanda. E aí o pagamento acontece por dentro desse PDV, seja do que for."
- Onde: `docs/regras/vendas-financeiro.md:10-12`; `docs/revisao.md:520-535`, `:1975`
- Antes: KA-03, KG-01

**PV-02.** O PDV mostra uma unidade por vez (na rede, escolhe-se a unidade). À esquerda ficam as comandas (Abertas / Fechadas hoje / Todas, com busca pela cliente); à direita, a comanda escolhida, com o "Receber". No topo, "Hoje em <unidade>": o que entrou hoje e quantas comandas têm valor a receber (as abertas e as pagas hoje que ainda têm parcela em aberto). O que entrou hoje é o total de entradas do Fechamento do dia: o crédito parcelado conta inteiro no dia da venda, e as parcelas que a operadora deposita são outro fluxo, o "A receber da operadora" (MQ-01).
- Fonte: o Heitor, 13/11: "vamos fazer um PDV."; o crédito parcelado inteiro no "Hoje": decisão do Claude, 26/11 (34ª, Decisão D), pela MQ-01 e pelo princípio 5
- Onde: `docs/regras/vendas-financeiro.md:15-21`, `:384-386`; `docs/revisao.md:520`, `:1975`
- Antes: KA-01

**PV-03.** O que a cliente paga na frente de quem está no balcão passa pelo PDV; o resto é do Financeiro.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/revisao.md:603-611`, `:1987-1988`
- Antes: KD-12, KG-14

**PV-04.** Receber é o passo do PDV, não da Agenda nem do Atendimento. Recebe quem tem o PDV em Gerenciar (cada passo pertence a UM módulo, e nenhuma ação pede dois), em todo caminho: vender na "Nova venda", receber a comanda do atendimento e a do plano, a parcela, o "Abater do pacote", fechar o dia — no PDV, na agenda, na ficha, na tela do atendimento e na comanda do plano. As vistas pessoais (a Minha agenda, as Minhas comissões) só mostram: não deixam receber. Procedimentos em Gerenciar não dá a venda, e a tela de Cargos diz isso no resumo do cargo ("Vende no PDV (procedimento, pacote, produto e crédito)."). Hoje o código também deixa receber quem tem o Financeiro em Gerenciar — ver Divergências.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-23: "concordo, pode anotar, marcar as questões e ajustar o codigo"
- Onde: `docs/revisao.md:1309-1330` (a proposta "cada passo pertence a UM módulo, e nenhuma ação pede dois" … "PDV: receber, a comanda"); CLAUDE.md §11 ("receber é do PDV (`podeReceber`)"); `docs/regras/vendas-financeiro.md:16-17`, `:46-49`, `:1027-1037`, `:1471`, `:1758`, `:1798`; `docs/revisao.md:1309-1317`, `:1329-1330`, `:2215`
- Antes: KA-02, KB-10, KD-14, KG-13

**PV-05.** A permissão PDV tem só dois níveis, "Sem acesso" ou Gerenciar: ela abre a tela do PDV e o Fechamento do dia e dá vender e receber; o Financeiro da unidade e o da rede continuam pedindo a permissão Financeiro. O nome é "PDV" (era "Recebimentos") na tela de Cargos, no resumo do cargo e no menu. Todo plano de assinatura tem o PDV: nem o teste grátis nem a rede bloqueada que volta ficam sem ele.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "concordo, o resto fica como está"
- Onde: `docs/regras/vendas-financeiro.md:1792`; `docs/revisao.md:1264-1267`, `:1893-1894`, `:2193`, `:1596-1600`, `:2164`
- Antes: KD-13, KG-12, KG-11

### A comanda

**PV-06.** Uma venda, uma comanda: o atendimento, o pacote, o procedimento pré-pago, o produto, o crédito interno vendido e o plano, cada um na sua comanda, por qualquer caminho que venda (o Copilot não vende: só manda ao PDV). As parcelas seguintes da mesma venda não abrem outra comanda.
- Fonte: o Heitor, 2026-11-13: "Uma comanda para cada coisa que vai ser vendido, né? … Tudo que for uma venda gera uma comanda."
- Onde: `docs/regras/vendas-financeiro.md:12-13`, `:70-74`; `docs/revisao.md:555-561`, `:1976`
- Antes: KA-04, KG-02

**PV-07.** O "Receber" é o mesmo em toda comanda: a prévia, o voucher, o desconto com o motivo, os pontos, a maquininha, as vezes, a bandeira, o saldo de crédito e o combinado do plano. Dentro da comanda ficam o crediário (entrada + parcelas), o "a receber", o cartão em N vezes, o desconto, "Quem vendeu", o estorno e a devolução. Com o contrato do procedimento assinado, receber com outro pagamento (ou outro desconto) pergunta antes e substitui o contrato junto do dinheiro (DG-03 de Documentos).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "implementa lá e se eu achar que precisa mudar algo te aviso"; o contrato no receber: decisão do Claude, 26/11 (33ª simulação, D1), pela DG-03
- Onde: `docs/regras/vendas-financeiro.md:50-54`; `docs/revisao.md:1983`, `:55-60`
- Antes: KA-15, KG-08; antes de 26/11: o receber da comanda do atendimento não perguntava

### A comanda do atendimento

**PV-08.** Agendar, confirmar e remarcar não geram comanda: a comanda do atendimento nasce quando ele é iniciado (AT-10 do catálogo do Atendimento) e já se recebe com ele em andamento. O atendimento só agendado não se recebe, e a tela diz "O atendimento ainda não começou: a comanda nasce quando ele é iniciado."
- Fonte: o Heitor, 2026-11-13: "A cliente que não veio e ninguém cancelou, a comanda sai como no cancelamento. A remarcação não faz diferença, porque daí ninguém efetivamente iniciou o atendimento, só gera comanda quando inicia o atendimento."
- Onde: `docs/regras/vendas-financeiro.md:36-40`; `docs/revisao.md:572-578`, `:591-592`, `:1977`
- Antes: KA-07, KG-03

**PV-09.** A comanda está paga quando o dinheiro dela está lançado e vivo; estornado o pagamento, ela volta a ficar aberta sozinha. A comanda ainda não paga sai sem cobrança quando o atendimento vira falta ("A cliente não compareceu") ou é cancelado ("Atendimento cancelado"), e quando ele passa a ser pago de outro jeito ("Sessão do pacote", pelo "Abater do pacote", ou "Procedimento pré-pago"); ela continua na lista "Todas" do dia, com o motivo. Só o cancelamento se registra à mão, sempre com o motivo. A comanda paga não sai: o dinheiro que entrou só se desfaz pelo estorno.
- Fonte: o Heitor, 13/11: "a comanda sai como no cancelamento"
- Onde: `docs/regras/vendas-financeiro.md:22-26`, `:41-45`; `docs/revisao.md:575-576`
- Antes: KA-06, KA-08

**PV-10.** Enquanto a comanda do atendimento não foi paga, quem recebe acrescenta nela um produto de Venda direta que a cliente leva, com a quantidade ("−" e "+"), e o tira até receber; o estoque não fica reservado e é conferido de novo ao receber, e o sistema recusa o produto que não é de Venda direta e a quantidade que o estoque não cobre. A tela não deixa: o "Acrescentar" e o "+" desligam no que há na unidade (somado o que já está na comanda), e o produto que passou do saldo depois diz "Só há N un de X nesta unidade." e desliga o "Receber", cada um com o motivo "Falta estoque nesta unidade." (R04, o Heitor, 26/11; o botão: decisão do Claude, 26/11). O produto vale o preço de venda do momento e entra no total; ao receber, é vendido junto, nas formas do atendimento (o atendimento primeiro, depois os produtos), e sai do estoque da unidade. Ele não abre comanda própria; o estorno o devolve. A quantidade é a que quem recebe escolhe: acima de 100 de um produto e de 20 produtos na comanda a tela avisa e grava; só o impossível (zero, fracionário, acima de 2.147.483.647, o estoque que não cobre) é recusado, como na venda (PR-04).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "implementa lá e se eu achar que precisa mudar algo te aviso"; as quantidades: o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." (o "comum" e o impossível: decisão do Claude, 25/11)
- Onde: `docs/regras/vendas-financeiro.md:238-252`, `:249-268`, `:278-280`, `:399-401`, `:529-531`; `docs/revisao.md:1711-1715`, `:1976`
- Antes: KA-09, KA-10, KG-04

**PV-11.** O atendimento avulso tem as mesmas formas de pagamento da venda: à vista (numa forma ou em várias), Crediário com entrada e parcelas (até o limite da rede) e A receber. A comanda fecha quando o pago mais o que ficou a receber cobrem o preço, e mostra "Crediário · R$ … em aberto", como a da venda; no Crediário e no A receber, o botão diz "Fechar a comanda".
- Fonte: o Heitor, 16/11: "Mesma regra de pagamentos dos outros"
- Onde: `docs/regras/vendas-financeiro.md:522-544`; `docs/revisao.md:1709-1710`, `:1720-1722`
- Antes: KA-20, KG-10

**PV-12.** A comanda reaberta por um estorno cobra só o que falta (o atendimento estornado e o produto não, ou só uma das formas estornada): mostra "Já pago" e "Falta receber", e o valor não conta duas vezes o pagamento estornado e o reaberto. O produto estornado deixa de contar como pago, e o item diz "estornado · voltou ao estoque" (ou "não voltou ao estoque"); a comanda diz "Produto estornado às HH:MM — Nome × 1, voltou ao estoque. Fica fora do que falta receber." Paga de novo, a comanda volta a mostrar o valor inteiro.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:281-296`, `:540-542`, `:3267`
- Antes: KA-13, KA-14, KF-64

**PV-13.** A tela do atendimento não recebe nem tem janela de pagamento: o que ela fazia, o PDV faz (pacote, desconto e motivo, voucher, pontos, maquininha, vezes, bandeira, crédito interno, o combinado do contrato). A ficha da cliente não lista os atendimentos a receber: mostra só "N comanda(s) aberta(s) no PDV · R$ X", com o "Receber no PDV" da comanda mais antiga numa unidade ao alcance para quem recebe, e "Recebe-se no PDV, com quem tem o PDV em Gerenciar." para quem não recebe (o resto é a AT-11 do catálogo do Atendimento).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"; quem recebe é só o PDV: recomendação do Claude aprovada pelo Heitor, 2026-11-23: "concordo, pode anotar, marcar as questões e ajustar o codigo" (PV-04)
- Onde: `docs/regras/vendas-financeiro.md:1734`, `:1739`, `:1749`, `:1807-1808`; `docs/revisao.md:1994`; `apps/web/components/shared/comandas-abertas-da-ficha.tsx:66`
- Antes: KD-45, KD-46

### O que a comanda mostra

**PV-14.** A venda no Crediário ou no A receber fecha a comanda (ela vai para "Fechadas hoje", a aba que não se chama "Pagas"), mas a linha e a comanda dizem o que ficou em aberto ("Crediário · R$ 1.800,00 em aberto (3 parcelas, a 1ª em 15/12)"). O selo diz de onde a comanda vem: "Plano aceito, a pagar" a do plano, "A receber" a da Nova venda (nunca "Paga"), e "Atendida, a pagar" só a do atendimento.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:75-83`, `:358-360`, `:395-396`
- Antes: KA-31, KA-32

**PV-15.** A linha da comanda diz o que ela leva: a do atendimento, o produto ("Limpeza de pele + 1 produto"); cada item, a quantidade e o preço ("2 × R$ 150,00"); a do plano, as sessões ("3 sessões: 2 × Limpeza, 1 × Peeling"). Com desconto, o item aparece cheio e o desconto numa linha própria ("Desconto −R$ …"). A comanda paga mostra todas as formas, com o valor e a bandeira ("Dinheiro R$ 180,00 + Pix R$ 120,00", "Crédito Mastercard 10x"), e o desconto, o voucher e os pontos em linhas acima do "Total pago"; "Fechadas hoje" mostra o valor recebido, não o preço. Na comanda aberta, a coluna acompanha o que se escolhe no "Receber", e o total é o que se vai receber. No Financeiro, o lançamento do pré-pago diz o procedimento e as sessões ("Massagem relaxante — 1 sessão").
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:82-83`, `:94-101`, `:337-340`, `:380-383`, `:407-408`, `:424-426`, `:444-447`
- Antes: KA-32, KA-33, KA-34

**PV-16.** A tela diz o que aconteceu e por que um botão não anda: depois de "Receber", "Recebido R$ 2.060,00 (Crédito Mastercard 10x). A comanda saiu das abertas e está em “Fechadas hoje”.", com "Ver a comanda"; depois de vender, o que foi vendido, o valor e onde fica o recibo; o botão de vender desligado mostra o motivo ao lado ("Escolha a forma da entrada", "Falta estoque nesta unidade."), e a recusa que já aparece junto do campo não se repete. O PDV vazio diz o que fazer: sem comanda nenhuma, "Ela nasce quando um atendimento é iniciado e tem o que cobrar"; sem comanda escolhida, "Escolha uma comanda na lista"; para quem alcança mais de uma unidade, "N comandas abertas em <unidade>", com o link, ou "Nenhuma comanda aberta em <unidade>." com o link para a outra.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:90-91`, `:307-312`, `:341-347`, `:402-403`, `:421-423`, `:453-455`, `:3031`
- Antes: KA-21, KA-22, KA-39, KF-65

## A Nova venda, quem vendeu e o desconto (VD)

### A Nova venda

**VD-01.** Só se vende pelo PDV. A ficha da cliente não tem "Vender" (segue com o "+ Agendar"); o "Vender" do inbox e o da busca universal levam à Nova venda do PDV já com a cliente (IN-17 do catálogo de Clientes); a tela de Pacotes não vende e diz que a venda é no PDV, em "Nova venda" (escolha Pacote), e que vender é de quem tem o PDV.
- Fonte: o Heitor, 2026-11-13: "O vender da ficha sai e o do inbox ele pode sair, ele pode levar pro PDV, tá? Porque só vende pelo PDV."
- Onde: `docs/regras/vendas-financeiro.md:55-67`, `:1005-1007`, `:1035-1036`, `:1053-1054`, `:1150-1153`, `:1283-1287`; `docs/revisao.md:566-568`, `:1981`
- Antes: KA-23, KG-07, KC-01, KB-08

**VD-02.** Na "Nova venda", nos dois portais, escolhe-se a cliente (a busca é na rede inteira) e vende-se procedimento pré-pago, pacote, produto ou crédito interno (as abas Procedimento, Pacote, Produto e Crédito interno), com desconto, "Quem vendeu" e a forma de pagamento. A aba do pré-pago se chama "Procedimento pré-pago": o atendimento avulso se cobra na comanda dele.
- Fonte: o Heitor, 13/11: "um lugar para realmente vender"
- Onde: `docs/regras/vendas-financeiro.md:57-61`, `:91-93`, `:1053-1054`; `docs/revisao.md:525`
- Antes: KA-24, KC-01

**VD-03.** A venda acontece na unidade do PDV: o catálogo, o estoque, a equipe de "Quem vendeu", o caixa e a baixa são os dela. Na rede com duas ou mais unidades, o PDV da rede sem unidade escolhida pergunta antes de tudo "Em qual unidade é a venda?", sem nenhuma já escolhida; com uma unidade só, não pergunta. Pela mesma regra, o que se grava a partir da ficha numa rede com duas ou mais unidades (o crédito interno, o agendar do pré-pago e o da sessão de pacote, os pontos, o voucher) pergunta a unidade — nunca vai calado para a unidade de cadastro da cliente nem para a primeira da lista.
- Fonte: o Heitor, 2026-11-01 (H5): "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/vendas-financeiro.md:61-65`, `:660-674`, `:3195`
- Antes: KA-25, KB-11, KB-12, KF-56

**VD-04.** Sem ficha, primeiro o cadastro: a venda exige uma cliente cadastrada na rede (sem a ficha, é recusada). No inbox, com o contato ainda sem ficha, o "Vender" (a quem também tem Clientes em Gerenciar) abre o cadastro — o cadastro rápido serve — e, ao salvar, leva ao PDV com a cliente nova.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:687-690`, `:1153-1155`
- Antes: KB-13, KC-14

**VD-05.** A "Nova venda" avisa quando o mesmo procedimento já tem um valor a receber (seria cobrado duas vezes) e leva à comanda dele.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1755`
- Antes: KD-47

### Quem vendeu

**VD-06.** "Quem vendeu" nasce sempre vazio, em toda venda — também o "Quem vendeu os produtos" da comanda do atendimento, que não é dado a quem atendeu. A lista traz as pessoas da unidade da venda (quem a tem como principal e quem a tem entre as outras). A opção vazia diz "Escolha quem vendeu", e a tela explica que vazio é ninguém e sem comissão de venda; deixado vazio, a tela pergunta "Vender assim?" (inteira na tela, também no celular, com o foco no "Vender assim"; na comanda, "Receber assim"), e o servidor faz a mesma pergunta. Confirmado vazio, ninguém fica como quem vendeu.
- Fonte: o Heitor, 2026-11-18: "nasce sempre vazio"
- Onde: `docs/regras/vendas-financeiro.md:111-115`, `:253-266`, `:259`, `:1779`, `:2790`, `:2808`, `:3243`
- Antes: KA-11, KA-26, KD-51, KF-26, KF-33

**VD-07.** Quem vendeu é quem a tela marcou em "Quem vendeu" (ou ninguém), não quem registrou a venda.
- Fonte: o Heitor, 2026-11-18 (com-06): "às vezes quem vai registrar a venda é recepção e quem vendeu foi a…"
- Onde: `docs/regras/vendas-financeiro.md:257`, `:3236`
- Antes: KF-34

### O desconto

**VD-08.** Toda venda aceita desconto (o pacote, o pré-pago, o produto, o plano e o atendimento avulso no PDV), em R$ ou %, sem teto, e fica registrado quem deu.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:2899`
- Antes: KF-35

**VD-09.** Os descontos se aplicam sempre nesta ordem, em todo caminho: o desconto comercial sobre o total da comanda, o voucher sobre o que sobrou, os pontos sobre o resto; o "o que sai" do receber lista nessa ordem. Na comanda do atendimento com produtos, os descontos se repartem entre o atendimento e os produtos na proporção do valor de cada um; o voucher de procedimento fica inteiro no atendimento.
- Fonte: o Heitor, 2026-11-18: "Desconto, voucher, pontos"
- Onde: `docs/regras/vendas-financeiro.md:269-273`, `:482-483`, `:2923`, `:3244`
- Antes: KA-19, KF-39

**VD-10.** Toda venda com desconto tem o campo "Motivo do desconto (opcional)". O motivo aparece na linha do tempo e embaixo do valor na lista do Financeiro ("Desconto R$ 20,00 · cliente antiga"), uma vez por venda; com o motivo em branco, a janela lembra que "Sem motivo, a lista do Financeiro mostra só o valor do desconto…". O desconto faz parte do combinado no contrato: o contrato diz o valor com desconto e o desconto, e trocar o desconto depois de assinado substitui o contrato, como trocar a forma.
- Fonte: o Heitor, 2026-11-02: "adicionar campo de texto livre para informar motivo…"
- Onde: `docs/regras/vendas-financeiro.md:2936`, `:2942`, `:2956`, `:2962`
- Antes: KF-40, KF-41, KF-42

## As formas de pagamento (FP)

**FP-01.** Não existe pagamento sem forma, e o Crediário é uma das formas, com esse nome. Toda tela que vende ou recebe mostra as formas em blocos — Pix, Dinheiro, Débito, Crédito e Crédito interno, e também o Crediário (com o limite de parcelas da rede) e o A receber onde fazem sentido —, e o botão "Receber R$ X" só funciona depois de escolhida a forma. Escolhido o Crediário, a venda fica registrada como Crediário, e o contrato diz "no crediário". Vale igual no PDV e no pagamento do plano.
- Fonte: o Heitor, 13/11: "sempre tem que ter forma de pagamento, o crediario é uma forma de pagamento, não existe pagamento sem forma de pagamento"
- Onde: `docs/regras/vendas-financeiro.md:53-54`, `:209-216`, `:2157`, `:2564`, `:2637`, `:3226`; `docs/revisao.md:1982`, `:2259-2260`
- Antes: KA-16, KG-09, KF-03, KE-23

**FP-02.** Toda tela de cobrança começa com a forma vazia; só o meio combinado vem já escolhido (no contrato, e na baixa de uma receita que nasceu com um), e quem recebe confirma ou troca. O que se recebe agora (à vista, a entrada, a parcela, a baixa de uma receita em aberto) não se confirma sem a forma: o botão espera, o servidor recusa ("Escolha a forma de pagamento."), e no cartão pedem-se também a bandeira, a maquininha e as vezes. A receita sem forma não se baixa, e o Copilot pergunta como foi pago.
- Fonte: o Heitor, 13/11: "sempre tem que ter forma de pagamento, o crediario é uma forma de pagamento, não existe pagamento sem forma de pagamento"
- Onde: `docs/regras/vendas-financeiro.md:1485`, `:2150`, `:2162`, `:2581`, `:3188`, `:3209`; `docs/revisao.md:1982`
- Antes: KE-22, KF-19, KD-16, KE-24, KF-01

**FP-03.** No pagamento à vista dá para usar mais de uma forma, com "+ Outra forma", que já aparece quando o diálogo abre, quantas vezes quem recebe clicar: sem teto e sem aviso (o botão segue depois da 5ª). Cada forma tem o seu valor, e a primeira fica com o que falta ("Pix: R$ 200,00 (o que falta das outras)"). As formas precisam fechar o total ao centavo, senão o sistema recusa ("As formas somam … e não fecham o total"). Vale na comanda do atendimento, na Nova venda e no plano. Os pontos e o voucher abatem na primeira forma, até o valor dela. O Crediário e o A receber não se dividem, e o crédito interno vendido se paga numa forma só.
- Fonte: recomendação do Claude aprovada pelo Heitor, 16/11: "Ok"; sem limite de formas: o Heitor, 25/11, sobre o limite de 5 formas: "Não precisa de aviso, essa não é uma ação automatica, o usuario vai precisar clicar em um botão, então ele fez de proposito."
- Onde: `docs/regras/vendas-financeiro.md:397-398`, `:451-452`, `:491-506`
- Antes: KA-18

**FP-04.** As formas de pagamento são Dinheiro, Pix, Débito, Crédito e Crédito interno (e, na venda, o Crediário e o A receber). O Boleto existe só na despesa: a tela só o oferece ali, e na receita ele é recusado ("Boleto é forma de pagar uma despesa.").
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:2132`
- Antes: KE-17

**FP-05.** A forma de pagamento tem um nome só em todo lugar, com as vezes ("Crédito 3x"): nas listas do Financeiro, na ficha, na confirmação do atendimento, no portal da cliente e na linha do tempo ("via Dinheiro"). Texto para pessoas nunca mostra o código da forma.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:2681`, `:2694`, `:3231`
- Antes: KF-10

**FP-06.** O dinheiro digitado tem uma leitura só: "180" é R$ 180,00; a vírgula separa os centavos e o ponto, o milhar ("1.400,50", "1.400", "12.500"); sem vírgula, o ponto seguido de um ou dois dígitos é decimal ("180.50"). O que é ambíguo ("1,400.50", "0.012") não é adivinhado: o campo guarda o que foi escrito e diz "use vírgula para os centavos".
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:2094`
- Antes: KE-26

## O crediário e as parcelas (CR)

### O crediário

**CR-01.** No Crediário, a entrada (se houver) pede a forma dela ("Forma da entrada *"); a forma, as vezes e a bandeira escolhidas na venda são as da ENTRADA. Sem entrada, nada entra agora e nenhuma forma é pedida. As parcelas são pagas à rede e não são cartão: nascem sem forma, e a forma de cada uma se pede quando o dinheiro entra (a parcela recebida no PDV ou a baixa no Financeiro). O A receber não tem forma nenhuma. A venda nunca fica sem forma: o contrato diz "no crediário", "no crediário, com a entrada no Pix" ou "a receber", e a ficha e o app mostram a parcela como "Crediário". O A receber deixa a comanda INTEIRA a receber e não se junta a outra forma (FP-03): quem recebe uma parte agora e deixa o resto usa o Crediário com entrada (a entrada agora, o resto nas parcelas, CR-05).
- Fonte: o Heitor, 13/11: "sempre tem que ter forma de pagamento, o crediario é uma forma de pagamento, não existe pagamento sem forma de pagamento"; o A receber inteiro e a parte pelo Crediário com entrada: decisão do Claude, 25/11 (o Heitor revisa), pela FP-03 e pela CR-05 (B13 da 30ª simulação; dividir a comanda entre pago e A receber sem o crediário é a sugestão 65)
- Onde: `docs/regras/vendas-financeiro.md:216-225`, `:536-537`, `:2569`, `:3208`; `docs/revisao.md:1982`
- Antes: KA-17, KF-02

**CR-02.** O máximo de parcelas do crediário é configuração da rede (padrão 12) e vale igual em todo caminho que vende no crediário (a venda no PDV, o pagamento do contrato, o pagamento do plano): a tela oferece até o limite e o servidor recusa acima dele. O limite é o número que a rede digita, de 1 para cima: acima de 48 a tela avisa ("Acima do comum (…). Confira: o valor vale como está.") e o valor vale; só o que o registro não guarda (acima de 32.767) é recusado. As parcelas geradas são todas as vendidas, nunca cortadas em silêncio. A despesa também avisa em vez de recusar (FN-17). O banco não prende a parcela em 48: o crediário em 60 vezes grava.
- Fonte: o Heitor, 2026-11-11: "Decisão da rede"; o aviso no lugar do teto: princípio 2 (o Heitor, 2026-11-04: "no máximo, avisar"); o aviso começar no teto de antes (48): decisão do Claude, 25/11
- Onde: `docs/regras/vendas-financeiro.md:2718-2737`; `apps/web/lib/financeiro/parcelas-do-crediario.ts`
- Antes: KF-06

**CR-03.** A entrada vazia quer dizer sem entrada; a entrada que não se consegue ler mostra o aviso junto do campo, e a tela não salva. A entrada maior que o total é recusada, nunca cortada calada ("A entrada (R$ 1.000,00) passa do total do plano (R$ 900,00). Corrija a entrada."), na tela e no servidor, em toda venda com entrada; a entrada igual ao total passa (é tudo na entrada). O vencimento do "a receber" é opcional (na venda do pacote e no pagamento do contrato): sem data, o contrato diz "a receber" sem o dia.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:699-702`, `:2110`, `:2117`, `:2874`, `:3232`
- Antes: KE-25, KF-21, KB-16

**CR-04.** O valor das parcelas que a tela mostra é o que vai ser gravado ("2x de R$ 890,66 + 1x de R$ 890,68"), nunca a média saldo ÷ parcelas, e o contrato lista cada parcela com a data. Antes de vender, a tela mostra o resumo ("Entrada R$ 300,00 + 3× R$ 1.000,00") e diz quantos pagamentos dá ("3x + entrada (4 pagamentos)"), no PDV e no recebimento do plano (a tela do atendimento não recebe, PV-13).
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:361-363`, `:2661`, `:2670`, `:3203`
- Antes: KF-09, KA-46, KF-08

**CR-05.** Cada parcela é um lançamento próprio, com o vencimento dela: a entrada ("— entrada") e uma linha por parcela ("— parcela 2/3"); o que se recebe agora e o que fica a receber nunca vão no mesmo lançamento. Pagar e estornar valem por parcela, no pacote, no pré-pago, no plano e na despesa parcelada. A divisão é sempre a mesma: em centavos, a sobra vai na última parcela, e o dia 31 vira o último dia do mês curto.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:691-693`, `:1803`
- Antes: KD-52, KB-14

### Receber a parcela

**CR-06.** A parcela se recebe no PDV. Escolhida a cliente na Nova venda, o PDV mostra o que ela tem em aberto nesta unidade: as parcelas do crediário com o vencimento (a vencida em destaque) e o valor a receber; "Receber esta parcela" pede a forma (sem Crediário nem A receber), a bandeira, a maquininha e as vezes do crédito. A comanda paga com parcelas em aberto mostra "Parcelas desta venda", uma por linha, com o "Receber" ao lado, para quem pode receber. O topo das Abertas diz "N vendas com parcelas a receber"; o link abre só essas vendas, em "Fechadas hoje", e a tela diz que está filtrada e oferece "Ver todas as fechadas hoje".
- Fonte: recomendação do Claude aprovada pelo Heitor, 13/11: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:86-93`, `:108-109`, `:227-237`, `:419-420`, `:441-443`; `docs/revisao.md:611`, `:1992`
- Antes: KA-40, KG-15, KA-41, KA-47

**CR-07.** O "Receber" da parcela ou do valor a receber (no PDV, na ficha e no Financeiro) também aceita "+ Outra forma": quantas formas quem recebe quiser, sem teto e sem aviso, cada uma acima de zero e fechando o valor ao centavo; a parcela com desconto ou com pontos não se divide. Nas listas (o Financeiro, a ficha e o plano, na equipe e no app), as formas de uma mesma parcela aparecem numa linha só, com o total e as formas ("Pix R$ 400,00 + Dinheiro R$ 200,00"); o recibo e o estorno continuam por forma ("Estornar (Pix)"), e na planilha cada forma tem a sua linha, marcada "(forma 1 de 2)".
- Fonte: decisão do Claude; sem limite de formas: o Heitor, 25/11, sobre o limite de 5 formas: "Não precisa de aviso, essa não é uma ação automatica, o usuario vai precisar clicar em um botão, então ele fez de proposito."
- Onde: `docs/regras/vendas-financeiro.md:507-522`
- Antes: KA-42, KA-43

**CR-08.** Receber uma parcela com outra anterior da mesma venda ainda em aberto avisa "Adiantada: a 1/2 (vence …) segue em aberto." e recebe mesmo assim, no PDV, na ficha e no Financeiro. A parcela recebida em parte diz quanto foi pago e quanto falta ("1/3 · R$ 150,00 · pago R$ 50,00, falta R$ 100,00").
- Fonte: princípio 2
- Onde: `docs/regras/vendas-financeiro.md:366-368`, `:387-388`, `:430-432`
- Antes: KA-44, KA-45

### A parcela vencida e o vencimento

**CR-09.** Vencida é a parcela a receber, ainda em aberto, com vencimento anterior a hoje no horário de Brasília; a que vence hoje ainda não venceu, e quem decide o dia é o servidor. A regra é a mesma em todo lugar: a vencida aparece como vencida, nunca como "Pendente". As listas dos dois Financeiros e o app dizem "Vencida em 05/11"; a aba Financeiro da ficha diz "Vencida há N dias" (os dias vêm do servidor, no fuso da unidade), com a linha em destaque de alerta e a data ao lado ("Vence 14/11/2026"); a lista da unidade tem "Vencidas" no filtro; o cartão "A receber da cliente" diz "Vencidas: R$ 1.294,00 (1 parcela, desde 05/11) · Ver as vencidas", que abre o A receber só com as vencidas, de qualquer mês.
- Fonte: princípio 3; o "Vencida há N dias" da ficha: recomendação do Claude aprovada pelo Heitor, 2026-11-18 (item 17 do escopo): "17 - ok" (`DEVLOG.md:1875`)
- Onde: `docs/regras/vendas-financeiro.md:1827-1838`, `:1977-1980`, `:3245`
- Antes: KD-62, KF-85, KD-63

**CR-10.** No check-in, quem recebe é avisado de que a cliente tem parcela vencida ("Mariana tem 1 parcela vencida (R$ 1.294,00, desde 05/11)…"), e a recebe no PDV. O aviso não impede o check-in.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1929`; `docs/revisao.md:1992`
- Antes: KD-64

**CR-11.** Quem tem o Financeiro em Gerenciar, com a unidade ao alcance, pode "Remarcar vencimento" numa linha em aberto (o botão com o nome escrito, na lista dos dois Financeiros e na parcela em aberto da aba Financeiro da ficha): informa o novo dia e, se quiser, um motivo. O histórico do lançamento guarda a remarcação, e a linha mostra "Vencimento remarcado: era 05/11 (Lúcia, em 07/11 — combinado com a cliente)". O que já foi pago ou estornado não se remarca. O novo dia pode ser no passado: não se recusa, e a linha passa na hora a "Vencida em …" (CR-09), como o agendamento no passado (AG-06 do Atendimento); o que pode haver junto do campo é um aviso ("essa data já passou: a parcela fica vencida"), nunca a recusa.
- Fonte: decisão do Claude; o dia no passado: decisão do Claude, 25/11 (o Heitor revisa), pelo princípio 2: "Não recusar o valor que a rede escolheu (taxa, percentual, preço, prazo): no máximo, avisar." (C06 da 30ª simulação)
- Onde: `docs/regras/vendas-financeiro.md:1935`, `:2031-2040`, `:2056`, `:3247`; `apps/web/actions/financial.ts` (`remarcarVencimento`: só confere o formato do dia)
- Estado: o dia no passado já se aceita; o aviso junto do campo ainda não existe (`apps/web/components/shared/remarcar-vencimento.tsx`).
- Antes: KD-65, KE-21, KF-87

## O dinheiro do plano (DP)

Aceitar o plano, as sessões e o contrato junto do pagamento são do catálogo do Atendimento (PL-07, PL-13, PL-14, PL-22); aqui fica o dinheiro.

**DP-01.** A comanda do plano tem "Receber o plano": desconto, "Quem vendeu", à vista ou crediário, o contrato e, por último, o recebimento. Ali não se agendam as sessões (elas se agendam pelo plano ou pela agenda). O botão final diz o que entra ("Receber R$ …" ou "Fechar a comanda"), e "O que se recebe agora" mostra a forma. Quando um documento que "Bloqueia" trava o pagamento por falta de assinatura, a tela diz que quem exige é o modelo do documento e onde a rede o troca para "Só avisa".
- Fonte: o Heitor, 13/11: "primeiro colhe assinatura, depois paga"
- Onde: `docs/regras/vendas-financeiro.md:157-161`, `:457-460`, `:2765`; `docs/revisao.md:1010-1011`
- Antes: KA-48, KF-25

**DP-02.** O plano aceito se recebe uma vez só ("Este plano já foi recebido"); o proposto não se recebe ("Aceite o plano antes de receber"); o cancelado ou recusado leva junto a comanda que não foi paga. Fechar o dinheiro do plano grava tudo de uma vez ou nada, e a segunda tentativa (outra aba, "tentar de novo", duas pessoas ao mesmo tempo) lê "Este plano já foi fechado. Recarregue a tela." ou que o saldo já foi recebido ou mudou. A comanda do plano conta como paga quando o recebimento lançou o dinheiro, à vista ou no crediário; o valor estornado não conta como recebido no que falta pagar. O "Quem vendeu" fica guardado no plano, e a tela o traz de volta.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:182-186`, `:1463`, `:1493`, `:2868`, `:3228`
- Antes: KA-49, KD-18, KF-30, KD-19

**DP-03.** O plano aceito com saldo diz "Plano aceito. Falta receber" e que a comanda do plano está no PDV; o aceito sem dinheiro nenhum ainda diz "Plano aceito e ainda não recebido: a comanda do plano está no PDV." A tela do plano fechado mostra "Valor do plano", "Recebido" e "A receber", cada lançamento com a situação (pago em tal dia e forma, a vencer, ou vencido — receba no PDV) e as sessões feitas e agendadas; o rodapé diz que o que falta se recebe no PDV — a quem recebe, com o "Receber no PDV"; a quem não recebe, com o nome de quem tem o PDV em Gerenciar naquela unidade — e que, se caiu na conta, a baixa é no Financeiro (FN-06). O saldo do plano (o em aberto e o a vencer) na tela do atendimento só aparece a quem recebe. O "Recebido" conta o crédito interno que pagou o plano, sem que ele vire receita de novo (CI-03, VE-05) (decisão do Claude, 27/11, 35ª D3).
- Fonte: princípio 3; quem recebe é só o PDV: recomendação do Claude aprovada pelo Heitor, 2026-11-23: "concordo, pode anotar, marcar as questões e ajustar o codigo" (PV-04); a baixa do que caiu na conta: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim" (CX2)
- Onde: `docs/regras/vendas-financeiro.md:2734`, `:2803-2806`, `:2862`, `:2875`, `:2884`; `apps/web/lib/plano-de-tratamento/textos.ts:31-59`
- Antes: KF-22, KF-31, KF-29

**DP-04.** O pagamento do plano cobra só o plano: o atendimento que gerou o plano (a avaliação) tem a comanda dele no PDV, aberta no início do atendimento, e se recebe lá, como qualquer avulso. A comanda do plano não o mostra nem o soma.
- Fonte: o Heitor, 2026-11-13: "Uma comanda para cada coisa que vai ser vendido, né? … Tudo que for uma venda gera uma comanda." (PV-06; a revisão das perguntas de 24/11 deu por vencida a regra de 20/10, em que o pagamento do plano cobrava junto o "atendimento de hoje")
- Onde: `docs/regras/vendas-financeiro.md:2807-2815`
- Antes: KF-23

**DP-05.** O pagamento do plano sugere o pacote ativo da unidade com os mesmos procedimentos nas mesmas quantidades, quando sai mais barato (o mais barato, se houver dois), dizendo a economia. "Fechar como pacote" põe a economia no desconto: o plano continua por procedimento e não vira venda de pacote (a dica no editor do plano é a PL-23 do catálogo do Atendimento).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:2813`
- Antes: KF-27

**DP-06.** Do plano, o PDV cobra só a parcela que já venceu (sem data, ou com vencimento até o fim de hoje); a que vence depois aparece como "a vencer", sem botão.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:2856`, `:3227`; `docs/revisao.md:2074`
- Antes: KF-28

**DP-07.** No plano, o desconto se divide entre os procedimentos, sem nenhum passar do preço de antes; contrato, sessões, comissão e fidelidade usam o preço vendido. Aplicar de novo parte sempre do preço de antes, e desconto 0 desfaz. O desconto combinado no editor do plano vale a partir do aceite: dali em diante a comanda, a agenda, a ficha, o app e o contrato mostram o preço com desconto, e o pagamento do plano abre com ele e ainda pode ajustá-lo; antes do aceite, os preços são os de tabela e as telas mostram o total com o combinado.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:2906`, `:2912`
- Antes: KF-37, KF-38

**DP-11.** A sessão do plano que já tem agendamento antes do pagamento (a cliente marcou pelo app ou pela página do plano) fica com ele: o "Receber o plano" não a agenda de novo, e o aviso do fim conta as duas coisas ("Plano fechado: 5 sessões. 1 já agendada, 4 sem data — agende pela ficha…").
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:2839-2846`; `apps/web/components/branch/checkout-wizard.tsx:531`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

### Cancelar o plano fechado

**DP-08.** Cancelar o plano fechado é o mesmo "Cancelar pacote", sem configuração nem conta própria (nem tabela, nem multa, nem preço de tabela): "Cancelar plano" no "Tratamento em andamento" da ficha, na ficha de tratamento, no "Gerenciar" das sessões e na página do plano, para quem tem o Financeiro em Gerenciar, com a unidade do plano ao alcance. Quem recebe e não cancela lê "Cancelar o plano é de quem tem o Financeiro em Gerenciar: …". O cancelamento também abre na janela do estorno ("Cancelar pacote", "Cancelar plano", "Cancelar a sessão N"), que se abre nos dois financeiros, na ficha e no PDV: quem tem o Financeiro em Gerenciar sem Clientes e sem o Atendimento cancela por ali, e a janela não manda a um lugar que a pessoa não abre (decisão do Claude, 27/11, 35ª D1).
- Fonte: o Heitor, 2026-11-07 (decisão 2): "sim usa a mesma coisa do pacote"
- Onde: `docs/regras/vendas-financeiro.md:870-889`, `:3199`; `docs/revisao.md:2077`
- Antes: KB-45, KF-32

**DP-09.** No plano, o usado é o preço das sessões feitas (atendimento concluído), cada uma pela soma dos procedimentos dela já com o desconto repartido — sem multa e sem preço de tabela. O resto é a conta do pacote (PA-17 a PA-21): o crediário cai antes; o pago além do usado volta como estorno (parcial, ou o inteiro com o usado lançado de novo; no cartão, só o inteiro) ou crédito interno; as sessões agendadas se cancelam juntas, com um motivo só, ou ficam avulsas a cobrar; sessão em atendimento agora impede.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:890-901`
- Antes: KB-46

**DP-10.** Depois de cancelado o plano, a ficha o tira do "Tratamento em andamento" e o Histórico diz "Plano cancelado: X — 2 sessões canceladas · nada a devolver · Motivo: …"; o "A receber" perde as parcelas que caíram; o app deixa de mostrar o cartão do plano e o pagamento diz "Plano cancelado em …".
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:912-916`
- Antes: KB-47

## Os pacotes (PA)

### O pacote e o catálogo

**PA-01.** Pacote é um conjunto de procedimentos já montado antes (iguais ou não, ex.: "5 limpezas + 3 drenagens"), vendido por um preço só e igual a qualquer cliente: é um tipo de produto. O plano, ao contrário, nasce da avaliação, feito para uma cliente. Para montar o pacote, escolhem-se o nome, os procedimentos, quantas sessões de cada um e o preço; o mesmo procedimento posto em duas linhas vira uma linha só, com as sessões somadas. Não há limite de procedimentos; acima de 100 sessões e de R$ 1.000.000 a tela avisa e vale; só se recusa o que o registro não guarda — mais de 32.767 sessões (cada sessão é uma linha) e preço acima de R$ 99.999.999,99 (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; os números são decisão do Claude).
- Fonte: o Heitor, 2026-11-05: "a diferença entre pacote e plano é que um plano é algo personalizado de acordo com a necessidade de cliente e um pacote é um conjunto de procedimentos já estabelecidos previamente"
- Onde: `docs/regras/vendas-financeiro.md:554-563`, `:590-594`, `:628-630`; `docs/revisao.md:253-256`
- Antes: KB-01, KB-03, KG-28, KB-05

**PA-02.** O pacote não aparece no Estoque (é um conjunto de procedimentos, não de itens): fica no catálogo de Pacotes, em Comercial → Pacotes, nos dois portais.
- Fonte: o Heitor, 13/11: "Pacote tipo um produto que se vende, não aparece no estoque pq é um conjunto de procedimentos, não de itens."
- Onde: `docs/regras/vendas-financeiro.md:627-642`; `docs/revisao.md:296-298`, `:1942`
- Antes: KB-02, KG-29

**PA-03.** O preço do pacote já vem com a soma (sessões × preço de tabela de cada procedimento) e acompanha a soma até alguém mexer no campo; dá para alterar. O pacote que já existe guarda o preço dele.
- Fonte: o Heitor, 13/11: "O valor base do pacote já puxa a soma dos valores dos procedimentos adicionados, mas com opção de alterar o valor."
- Onde: `docs/regras/vendas-financeiro.md:632-634`; `docs/revisao.md:256-257`, `:284`, `:1935`
- Antes: KB-06, KG-30

**PA-04.** O pacote tem validade em dias (vazio = sem validade) e a marca "À venda", que tira o pacote da venda sem apagá-lo. A validade acima de 3.650 dias avisa e vale; só o zero e o acima de 100 anos são recusados — o mesmo na validade do pré-pago (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; os números são decisão do Claude).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "ok, mantém"
- Onde: `docs/revisao.md:291-292`, `:1942`; `docs/regras/vendas-financeiro.md:629-630`
- Antes: KB-04, KG-32, KG-33

**PA-05.** Ver os pacotes pede Procedimentos em Ver; criar e editar pede Procedimentos em Gerenciar, e só isso (não precisa ter "A rede inteira"), nos dois portais.
- Fonte: o Heitor, 13/11: "apenas gerenciar"
- Onde: `docs/regras/vendas-financeiro.md:629-632`; `docs/revisao.md:294`, `:1723-1727`, `:1936`
- Antes: KB-07, KG-31

### Vender o pacote

**PA-06.** O pacote se vende como um produto, na hora, só pelo PDV: na "Nova venda", aba Pacote, à vista, com entrada + parcelas ou a receber.
- Fonte: o Heitor, 2026-11-13: "E o pacote, ele vai ser vendido como se fosse um produto. Então já faz ali na hora"
- Onde: `docs/regras/vendas-financeiro.md:57-61`, `:649-659`; `docs/revisao.md:581-583`, `:595`, `:1979`
- Antes: KA-28, KG-05, KB-09

**PA-07.** A venda grava tudo junto ou nada: o pacote da cliente com o retrato do preço vendido (o de tabela menos o desconto), das sessões e da validade (mudar o catálogo vale só para as próximas vendas), todas as sessões livres e o dinheiro; o pagamento e as sessões fecham com o preço vendido, e se a soma das sessões não fechar, a venda é recusada. Vendido o pacote, quem tem a Agenda em Gerenciar vê "Venda registrada. Agendar a 1ª sessão agora?", com o procedimento da sessão nº 1, e agenda ali mesmo; "Cancelar" deixa para depois.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:694-698`, `:945-952`, `:2904`
- Antes: KB-15, KF-36, KB-17

### Os documentos do pacote

**PA-08.** A cliente assina uma vez, pelo pacote: as sessões do pacote não pedem documento de novo. O contrato de pacote se assina ANTES do dinheiro, como no plano: com o contrato de pacote ativo, a venda não grava nada até ele ser assinado (ou dispensado, com o motivo); se ele foi assinado com outro pagamento, a tela pergunta antes de substituir.
- Fonte: o Heitor, 13/11: "o ideal era funcionar como no plano de tratamento"
- Onde: `docs/regras/vendas-financeiro.md:568-581`; `docs/revisao.md:285`, `:1816-1819`, `:1939`
- Antes: KB-18, KG-34, KB-19, KG-38

**PA-09.** Escolhida a cliente, se o contrato de pacote ativo da rede pede um dado do cadastro que a ficha não tem, o pacote diz o que falta ("O contrato deste pacote (X) pede Endereço (rua, número e bairro), que falta no cadastro…"), e quem tem Clientes em Gerenciar vê também "Completar o cadastro". O aviso vem antes de tentar vender; a venda em si não grava enquanto o contrato estiver aberto (PA-08). A comanda do pacote vendido com contrato a assinar leva ao contrato ("Colher a assinatura"), e logo depois da venda "Colher a assinatura agora" aparece como botão.
- Fonte: princípio 3 (o aviso); a trava é a da PA-08
- Onde: `docs/regras/vendas-financeiro.md:313-322`, `:448-450`
- Antes: KA-29, KA-30

**PA-10.** A venda do pacote emite também o termo de cada procedimento diferente e os "outros documentos" deles (menos o contrato do procedimento e os que o pacote excluiu), que vão à cliente junto do contrato de pacote, para uma assinatura só (AG-35 do catálogo do Atendimento). Esses não seguram o dinheiro: a tela da venda diz o que ficou para assinar, e o que "Bloqueia" trava o início de cada sessão. Cancelar o pacote cancela os documentos dele que ainda estavam abertos.
- Fonte: o Heitor, 13/11: "ele vai puxar os termos dos procedimentos e vai puxar também os outros documentos que tiver. Ele só não puxa o contrato."
- Onde: `docs/regras/vendas-financeiro.md:582-587`; `docs/revisao.md:359-374`, `:1819`, `:1939`, `:1941`
- Antes: KB-20, KG-37, KB-21, KG-39

### As sessões e o dinheiro do pacote

**PA-11.** Cada sessão vendida tem o seu procedimento e a sua parte do preço: o preço do pacote repartido pelo preço de tabela de cada procedimento, com a última sessão levando o arredondamento.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:595-600`; `docs/revisao.md:271-272`
- Antes: KB-22

**PA-12.** O tratamento comprado (pacote, plano fechado e pré-pago) é da rede: qualquer unidade da rede vê e agenda as sessões, não importa em que unidade foi vendido, e o agendamento fica numa unidade ao alcance de quem agenda. O dinheiro é do caixa da unidade da venda: cancelar, estornar e fechar pedem a unidade da venda ao alcance de quem faz.
- Fonte: o Heitor, 2026-11-01 (H5): "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/vendas-financeiro.md:604-620`, `:3184`
- Antes: KB-24, KF-55, KB-25

### Pacote com valor em aberto e "Abater do pacote"

**PA-13.** Liberar as sessões do pacote vendido no crediário (ou a receber) é escolha da rede, em Configurações → Geral → "Pacote com valor em aberto": "Libera as sessões e avisa o que falta" (o padrão) ou "Libera as sessões só depois de pago". Na segunda, a sessão não se agenda nem se usa até o pacote estar pago, em todo caminho (equipe, app, Copilot e "Abater do pacote"); a parcela estornada não conta como em aberto. Como configuração da rede toda, só a Admin da rede muda essa opção.
- Fonte: princípio 1
- Onde: `docs/regras/vendas-financeiro.md:703-722`, `:3198`; `apps/web/actions/rede.ts:86-89`, `:129`; CLAUDE.md §11
- Antes: KB-27, KF-53, KB-28

**PA-14.** A tela diz o que falta pagar: na ficha (embaixo de "Tratamento em andamento") e ao agendar a sessão, "R$ 300,00 deste pacote ainda em aberto (3 parcelas do crediário)", com a frase da opção da rede, e o botão "Receber no PDV", que leva à "Nova venda" com a cliente no PDV da unidade do pacote, onde as parcelas dela aparecem. Só quem recebe vê.
- Fonte: princípio 2
- Onde: `docs/regras/vendas-financeiro.md:723-737`; `docs/revisao.md:1992`
- Antes: KB-29

**PA-15.** Ao receber no PDV um atendimento avulso já concluído e a receber, se a cliente tem pacote na validade com sessão livre do mesmo procedimento, a comanda oferece "Abater do pacote" (a quem recebe, com a unidade ao alcance). A sessão vira usada, o preço do atendimento passa a ser a parte da sessão, a conta a receber sai, não nasce cobrança nova, e o atendimento vira "Sessão de pacote". Enquanto a comanda tiver produto pendente, o atendimento não se abate, porque ainda há dinheiro a receber.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:276-277`, `:738-753`
- Antes: KB-30, KA-12

### Cancelar o pacote

**PA-16.** Quem tem o Financeiro em Gerenciar cancela o pacote, na ficha (embaixo do "Tratamento em andamento") e na ficha de tratamento do pacote, com a unidade do pacote ao alcance. Antes de confirmar, a janela mostra a conta inteira: as sessões que restam e o valor delas (a parte de cada uma, já com o desconto), o usado, o pago, o a receber, as parcelas que caem e o que volta; se os valores mudarem no meio, o cancelamento é recusado ("Os valores do pacote mudaram…").
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-01: "concordo"
- Onde: `docs/regras/vendas-financeiro.md:754-767`
- Antes: KB-31, KB-32

**PA-17.** O crediário cai antes de se devolver qualquer coisa: o a receber que passa do usado cai da parcela mais nova para a mais antiga (a que cai inteira sai estornada, a que cai em parte diminui). O que foi pago além do usado volta como quem cancela escolher — estorno (do pagamento mais novo para o mais antigo) ou crédito interno ("Cancelamento do pacote X"; no crédito, o dinheiro e os pontos ficam) —, nunca como uma despesa "Devolução" a pagar.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-01: "concordo"
- Onde: `docs/regras/vendas-financeiro.md:768-782`, `:3211`
- Antes: KB-33, KB-34, KF-57

**PA-18.** Quando o que volta é menor que um pagamento, a janela pergunta como estornar: (a) estorno parcial (o pagamento passa a valer o usado e um "Estorno parcial" leva o resto) ou (b) estornar o pagamento inteiro e lançar o usado de novo, como um pagamento novo, pago agora. Na (b), a forma de pagamento do usado, as vezes e a bandeira nascem em branco, e quem cancela escolhe; o que já tinha escolhido não se desfaz. Vale também na sessão do pré-pago e na devolução de produto. No cartão, só a (b) (EX-06).
- Fonte: o Heitor, 2026-11-03: "não sabemos se vai ser possível fazer estorno parcial, então precisamos dar opção. flexibilidade"
- Onde: `docs/regras/vendas-financeiro.md:783-805`, `:3240`
- Antes: KB-35, KB-36, KF-58

**PA-19.** Na forma (b), o usado entra como receita no dia do cancelamento (o Fechamento do dia o mostra na forma escolhida), o estorno é saída do dia do cancelamento, e o pagamento estornado continua no dia em que entrou.
- Fonte: princípio 5
- Onde: `docs/regras/vendas-financeiro.md:810-815`
- Antes: KB-38

**PA-20.** As sessões já agendadas: quem cancela escolhe cancelar os agendamentos (motivo "Pacote cancelado: …", com o aviso à cliente e à equipe) ou mantê-los como atendimentos avulsos a cobrar, com o preço que a sessão tinha; sessão com a cliente em atendimento agora (chegou ou em andamento) impede o cancelamento. As sessões que sobraram ficam canceladas e não se agendam; o pacote guarda quando, quem, o motivo, o valor cancelado e a conta. Pacote já cancelado, ou com todas as sessões feitas, não se cancela.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-01: "concordo"
- Onde: `docs/regras/vendas-financeiro.md:821-830`
- Antes: KB-39, KB-40

**PA-21.** Cancelar o pacote vencido é escolha da rede, em Configurações → Geral → "Pacote vencido": "Não se cancela" (o padrão; a tela diz que as sessões que sobraram não se devolvem e que é uma opção da rede) ou "Pode ser cancelado, com a devolução", pela mesma conta do cancelamento. Com a segunda, a ficha mostra o pacote vencido fora do "Tratamento em andamento" ("Pacote X venceu em 10/11/2026, com 4 sessões que sobraram."), com o "Cancelar pacote", a quem tem o Financeiro em Gerenciar. Só a Admin da rede muda essa opção.
- Fonte: o Heitor, 18/11: "pacote vencido = configuração da rede"
- Onde: `docs/regras/vendas-financeiro.md:831-846`, `:3198`; `apps/web/actions/rede.ts:86-89`, `:130`
- Antes: KB-41, KF-54, KB-28

**PA-22.** Depois de cancelado, o pacote sai do "Tratamento em andamento" e vai ao Histórico da ficha ("Pacote cancelado: X — 4 sessões canceladas · R$ 2.200,00 em crédito interno · Motivo: …"); no app da cliente sai dos tratamentos em curso; o lembrete de vencimento não o lembra; o pacote LGPD diz "cancelado em".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-01: "concordo"
- Onde: `docs/regras/vendas-financeiro.md:854-858`
- Antes: KB-42

### Trazer pacote de fora

**PA-23.** "Trazer pacote de fora" registra o saldo que a cliente já tinha antes do sistema: na ficha (no cartão do tratamento em andamento), com o procedimento, as sessões do pacote, as já usadas antes, a validade (opcional) e um valor de referência (opcional); a janela diz a conta antes de gravar ("Ficam 4 de 6 sessões para agendar · R$ 200,00 por sessão…"). Também entra pela importação (a coluna "Pacote de antes"). Traz quem tem o Financeiro em Gerenciar (quem dá o crédito interno); na ficha da rede com duas ou mais unidades, a janela pergunta a unidade. Acima de 100 sessões e de R$ 10.000.000 de valor de referência a janela avisa e vale; só se recusa o que o registro não guarda — mais de 32.767 sessões e valor acima de R$ 99.999.999,99 —, na ficha e na importação (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; os números são decisão do Claude). A validade que já passou também vale: a janela avisa que o pacote já nasce vencido, e o vencido segue a opção "Pacote vencido" da rede (PA-21).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-06: "concordo"; a validade já passada: decisão do Claude, 27/11 (37ª, Decisão A2), pelo princípio 2 e pela fala do Heitor de 25/11 ("Se não for impossível, ainda que improvável, pode ser feito.") — registrar o pacote vencido que a cliente trouxe é improvável, não impossível
- Onde: `docs/regras/vendas-financeiro.md:955-970`
- Antes: KB-48, KB-49; antes de 27/11: a validade já passada entrava sem aviso

**PA-24.** O pacote trazido não é venda: não tem comanda nem lançamento, não entra no caixa, não dá pontos nem comissão de venda, não aparece no catálogo de venda, no Relatório de Vendas, no ticket médio, no faturamento nem no app com recibo; esse registro não se edita.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-06: "concordo"
- Onde: `docs/regras/vendas-financeiro.md:74-75`, `:971-975`, `:3193-3194`
- Antes: KB-50, KA-05, KF-51

**PA-25.** A sessão que restou do pacote trazido se agenda e se usa como a de um pacote vendido aqui ("Já pago"). Cada uma vale a sua parte do valor de referência (dividido igual, a sobra na última); a execução conta essa parte no dia da sessão, e sem valor de referência não conta nada; o caixa e o faturamento nunca contam. A tela diz o que é: na ficha "PACOTE DE ANTES · 4 de 6 restantes · 2 usadas antes do sistema" (e um aviso quando não tem valor), nas sessões "Usada antes do sistema", no Histórico "Pacote de antes registrado" sem valor, e no app "Pacote de antes: 4 de 6 restantes", sem pagamento nem recibo.
- Fonte: princípio 5
- Onde: `docs/regras/vendas-financeiro.md:978-997`
- Antes: KB-51, KB-52

**PA-26.** Cancelar o pacote trazido é o cancelamento de sempre, mas nada foi pago à rede por ele: não há o que devolver nem parcela a cair, e não nasce lançamento nem crédito.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:998-1001`
- Antes: KB-53

## O pré-pago e o agendar do que já foi pago (PP)

### Procedimento pré-pago

**PP-01.** O pré-pago é a venda de várias sessões de UM procedimento, pagas antes (ou a receber) e agendadas depois. É separado do pacote: o pacote é um conjunto vendido por um preço só; o pré-pago é o procedimento avulso pago antes.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:1042-1045`, `:3206`
- Antes: KC-02, KF-52

**PP-02.** A venda do pré-pago guarda o retrato do que foi vendido: preço unitário e total de tabela, desconto, valor vendido, validade (opcional) e quem vendeu; cada sessão fica com a sua parte do valor vendido, dividida por igual em centavos. Quantas sessões é o que quem vende escolhe: acima de 100 a tela avisa ("Acima do comum (mais de 100 sessões). Confira: o valor vale como está.") e a venda grava; só o impossível é recusado — zero, fracionário e acima de 32.767 sessões (cada sessão é uma linha no registro). O atendimento feito com uma sessão do pré-pago não se cobra de novo: concluir marca a sessão como usada, o recebimento recusa cobrar e a tela não mostra o botão de receber.
- Fonte: decisão do Claude; as sessões: o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." (o "comum", 100, e o impossível, 32.767: decisão do Claude, 25/11)
- Onde: `docs/regras/vendas-financeiro.md:1047-1059`
- Antes: KC-03, KC-04

**PP-03.** Cancelar uma sessão do pré-pago é de quem tem o Financeiro em Gerenciar, com a unidade ao alcance, e pede motivo; só a sessão livre e não agendada se cancela (o "Cancelar" do card "Procedimentos pagos" abre "Cancelar sessão"). A conta segue a do pacote: a venda passa a valer o vendido menos as sessões canceladas; o a receber que passa desse valor cai antes (a parcela inteira sai estornada, a que cai em parte diminui); o pago além disso volta como quem cancela escolher, estorno ou crédito interno ("Cancelamento da sessão 2 de Peeling").
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-01: "concordo"
- Onde: `docs/regras/vendas-financeiro.md:754-755`, `:1104-1125`
- Antes: KC-09, KC-10

**PP-04.** A ficha mostra o pré-pago no card "Procedimentos pagos", e o portal da cliente em "Tratamentos em curso"; o export da LGPD tem uma seção própria para ele.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1136-1137`
- Antes: KC-11

### Agendar com o que já foi pago (pacote e pré-pago)

**PP-05.** Agendar usando o que já foi pago (uma sessão do pré-pago ou uma sessão de pacote) confere o crédito: é da cliente, da rede, está livre e dentro da validade. A validade se confere no DIA MARCADO para a sessão, não no dia em que se agenda: marcar ou remarcar a sessão para depois da validade é recusado, em todo caminho (a agenda, o app, a remarcação), e a recusa diz até quando o crédito vale. A validade é um dia: no dia da validade o crédito vale, pelo dia da unidade do agendamento (como o lote, ES-24 do catálogo do Atendimento), qualquer que seja a hora gravada na compra. O crédito decide o procedimento, a parte do preço e a duração do agendamento; não se troca o procedimento, e procedimento diferente é recusado. Dois agendamentos não usam o mesmo crédito: quem chega depois tem o agendamento desfeito. O conflito de horário vale pela duração inteira, como em todo agendamento.
- Fonte: decisão do Claude; o dia marcado e a validade como um dia: decisão do Claude, 27/11 (37ª, Decisão A3 e A6), pelo princípio 3 (a tela diz "válido até 29/11") e pela ES-24 do catálogo do Atendimento
- Onde: `docs/regras/vendas-financeiro.md:601-603`, `:1060-1068`, `:1091-1094`; `apps/web/lib/creditos/credito.ts` (`valido`, `conferirCredito`)
- Antes: KC-05, KB-23; antes de 27/11: a validade se comparava com a hora de agora, e a sessão se marcava para depois dela (D1 da 37ª: o app aceitou 30/11 num pacote que vencia em 29/11)

**PP-06.** Agenda-se com o que já foi pago pelo "Agendar" do card "Procedimentos pagos" da ficha, pelo campo "Incluído" do modal da agenda e do inbox, e pelo "Agendar agora" que aparece depois de vender um procedimento (este, para quem tem a Agenda em Gerenciar).
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1069-1074`
- Antes: KC-06

**PP-07.** No modal da agenda, quando o procedimento escolhido bate com um crédito da cliente, o crédito mais antigo já vem escolhido, com o aviso "Incluído no pacote X (sessão 2 de 3). Para cobrar à parte, escolha “Não usar”." e a dica "Escolhido porque o procedimento é o mesmo.". O mais antigo é o da data de compra, qualquer que seja o tipo (o pacote, o pré-pago, o pacote trazido, que conta pela data em que foi registrado); empatando, o que vence antes. O aviso acompanha o crédito escolhido, também quando a pessoa troca o crédito à mão.
- Fonte: princípio 3; o mais antigo de qualquer tipo e o empate: decisão do Claude, 27/11 (37ª, Decisão A1) — a PP-07 não distingue o tipo, e gastar primeiro o que vence antes é o critério da SA-05 de Fidelidade e da ES-24 do Atendimento; o aviso na troca à mão: decisão do Claude, 27/11 (37ª, A2), pelo princípio 3
- Onde: `docs/regras/vendas-financeiro.md:1073-1081`; `apps/web/lib/creditos/credito.ts` (`creditosDoCliente`), `apps/web/components/branch/appointment-modal.tsx`
- Antes: KC-07; antes de 27/11: os pré-pagos vinham antes dos pacotes, sem ordem de data entre os tipos (D3 da 37ª), e o aviso sumia na troca à mão

**PP-08.** O agendamento avulso já marcado e ainda em aberto (sem plano, sem crédito e sem lançamento) de quem tem crédito do MESMO procedimento oferece "Usar o pacote X (sessão N de M)": o agendamento passa a usar o crédito, o preço vira a parte do crédito e o histórico registra "Ligado ao que já foi pago". O atendimento já concluído segue pelo "Abater do pacote" (PA-15).
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1082-1090`
- Antes: KC-08

## A venda de produto (PR)

**PR-01.** A venda de produto tem quantidade, desconto e forma de pagamento: à vista (também crédito em várias vezes), entrada + parcelas, ou a receber. O estoque baixa pelo lote que vence primeiro. A venda vai para o caixa, para as vendas e para o faturamento como receita "Venda de produto", com a cliente, e nunca como despesa.
- Fonte: o Heitor, 2026-10-29: "com quantidade, desconto e forma de pagamento. O estoque baixa pelo lote que vence primeiro. A venda vai para o caixa, para as vendas e para o faturamento."
- Onde: `docs/regras/vendas-financeiro.md:1142-1145`, `:1156-1165`
- Antes: KC-12

**PR-02.** O PDV vende só o produto marcado como Venda direta, ativo e com preço de venda. A venda mostra quantas embalagens inteiras há na unidade, porque a embalagem aberta não se vende.
- Fonte: o Heitor, 2026-11-13: "E pelo PDV daí também dá para vender o que tiver de produto marcado como coisa que pode ser vendida."
- Onde: `docs/regras/vendas-financeiro.md:433-435`, `:1147-1149`; `docs/revisao.md:526-527`, `:535`, `:1912`, `:1980`
- Antes: KC-13, KG-06, KA-27

**PR-03.** Sem estoque suficiente, a venda diz o que há ("Só há N un de X nesta unidade.") e, a quem tem o Estoque em Gerenciar, oferece "Dar entrada no Estoque" (o aviso da falta aparece para todos); o "Vender" fica desligado, o resumo não diz "sai do estoque agora", e o servidor recusa ("Estoque insuficiente: há 2 un de Sérum nesta unidade."). Numa venda com vários produtos, faltando estoque de um, nada se grava. Nenhum caminho vende produto sem estoque: a Nova venda e a comanda do atendimento (PV-10) recusam no servidor, e a tela desliga o botão com o motivo.
- Fonte: decisão do Claude; o link só com o Estoque em Gerenciar e nenhum caminho vender sem estoque: o Heitor, 26/11 (página de perguntas, R04): "O link só para quem tem o Estoque em Gerenciar; o aviso da falta para todos (a proposta)" e "e tb não deixa realizar a venda de produto sem estoque"; o botão desligado na comanda: decisão do Claude, 26/11
- Onde: `docs/regras/vendas-financeiro.md:433-435`, `:453-455`, `:1162-1164`, `:1177`, `:481-499` (R04)
- Antes: KC-15, KA-27

**PR-04.** Uma venda leva vários produtos com um pagamento só: "Adicionar produto" e o resumo "2 × R$ 100,00 + 1 × R$ 90,00 = R$ 290,00"; a descrição da venda ("2× Sérum + 1× Protetor") é o que aparece nas Vendas, no extrato da comissão e no lançamento. A venda guarda o custo do que saiu: o custo de entrada de cada lote de onde o produto saiu, na proporção; sem lote com custo, o custo de consumo do cadastro. As quantidades são as que quem vende escolhe: acima de 100 de um produto, de 100 unidades na venda e de 20 produtos a tela avisa ("Acima do comum (mais de 100 unidades). Confira: o valor vale como está.") e a venda grava; só o impossível é recusado — quantidade zero, negativa ou fracionária, acima de 2.147.483.647 unidades (o limite do registro) e o estoque que não cobre. O número de produtos não tem limite próprio. O mesmo vale para o produto na comanda do PDV (PV-10) e para a devolução de parte da venda, que só recusa o que passa do que a cliente ainda tem (PR-07). O valor que o registro não guarda (um pagamento acima de R$ 99.999.999,99, a venda acima de R$ 9.999.999.999,99) é recusado com a mensagem, em vez de dar erro.
- Fonte: decisão do Claude; as quantidades: o Heitor, 25/11, sobre os limites que recusavam o valor que a rede escolheu: "Se não for impossível, ainda que improvável, pode ser feito." O "comum" (o teto de antes: 100 de cada, 100 unidades, 20 produtos) e o impossível (o registro: `integer`; o valor, numeric(10,2) e numeric(12,2)): decisão do Claude, 25/11
- Onde: `docs/regras/vendas-financeiro.md:1161-1162`, `:1166-1181`
- Antes: KC-16, KC-17

**PR-05.** O estorno de uma venda de produto é da VENDA, por quem tem o Financeiro em Gerenciar, com a unidade ao alcance: o "Estornar" de qualquer lançamento dela, nos dois portais, abre "Estornar esta venda de produto?", que pergunta "O produto voltou ao estoque?" (Sim / Não; sem resposta não confirma) e o motivo. Estornar desfaz a venda: o que foi pago é estornado na mesma forma; o que estava a receber sai como estornado, sem contra-lançamento; o produto volta ao estoque (se voltou) e o custo sai. A venda guarda quando, quem, o motivo e se o produto voltou, e não se estorna de novo ("Esta venda já foi estornada.").
- Fonte: o Heitor, 2026-11-01: "estorno de produto precisa ter um campo para indicar se houve devolução de produto ou não; se sim, produto volta ao estoque"
- Onde: `docs/regras/vendas-financeiro.md:1196-1207`, `:1222`, `:1239-1240`, `:3238`
- Antes: KC-18, KF-61, KC-19

**PR-06.** A venda de produto toda a receber (nada pago) se cancela: o lançamento em aberto tem "Cancelar venda", nos dois portais, que abre "Cancelar esta venda de produto?" com a mesma pergunta "O produto voltou ao estoque?" e o motivo. O a receber sai como estornado e a venda sai das Vendas.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1223-1228`
- Antes: KC-20

**PR-07.** Dá para devolver só parte da venda de produto, sem estornar a venda inteira: o "Estornar" oferece "Devolver só parte da venda", em que se diz quantas de cada produto voltam e se voltaram ao estoque, com a mesma permissão do estorno. Não há teto de quantidade nem de produtos: só se recusa o que passa do que a cliente ainda tem (e o limite do registro). O que volta é a parte de cada item no valor vendido, com o desconto dividido pelo preço de tabela. O a receber que passa do novo valor cai antes; o pago além dele volta como quem devolve escolher: estorno parcial na mesma forma ou crédito interno.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:1232-1250`, `:3239`
- Antes: KC-21, KF-62

**PR-08.** Depois da devolução de parte, a venda continua e passa a valer o vendido menos o devolvido (no valor, nas unidades e no custo), em tudo o que a usa. O que ainda está com a cliente se devolve de novo, em parte ou pelo estorno da venda, que devolve só o que restou; devolver tudo o que resta é o estorno da venda inteira.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1253-1262`, `:3239`
- Antes: KC-22, KF-62

## O crédito interno (CI)

**CI-01.** Vender crédito interno é a aba "Crédito interno" da Nova venda, que existe em toda unidade. O crédito vendido é o dinheiro que entrou: paga-se só à vista (Pix, dinheiro, débito ou crédito em várias vezes, com a bandeira), nunca com o próprio crédito da cliente; não existe crediário nem a receber para ele, e um lançamento manual não cria crédito.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-07: "concordo"
- Onde: `docs/regras/vendas-financeiro.md:1274`, `:1283-1294`, `:3250`
- Antes: KC-23, KF-47

**CI-02.** O "Conceder crédito" continua como está, fora do caixa: serve para o crédito que a cliente trouxe de fora, a cortesia ou a compensação, sem dinheiro. Ele fica na ficha da cliente, aba Financeiro, para quem tem o Financeiro em Gerenciar.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode manter e anotar no plano como voce sugeriu"
- Onde: `docs/regras/vendas-financeiro.md:1278-1279`, `:1342-1343`, `:1424`; `docs/revisao.md:636-640`, `:2013`
- Antes: KC-26, KG-26, KD-08

**CI-03.** O crédito vendido entra no caixa, no Fechamento do dia (na forma em que foi pago) e no faturamento no dia em que o dinheiro entrou; usá-lo depois não conta como receita de novo, e a linha do pagamento feito com crédito interno diz que não é receita. A venda de crédito não tem "Quem vendeu" nem comissão de venda; quem atende depois, quando a cliente usa o crédito, recebe a comissão de execução do atendimento, como sempre. A tela diz a regra ("Entra no caixa hoje… Usar depois não conta como receita de novo. Sem comissão de venda."), e a ficha diz "Inclui o crédito interno comprado".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-07: "concordo"
- Onde: `docs/regras/vendas-financeiro.md:1272-1279`, `:1289-1292`, `:1301-1305`, `:1311-1312`, `:2036`, `:2981`
- Antes: KC-24, KF-45, KE-11, KC-25

**CI-04.** Pagar com crédito interno desconta do saldo da cliente e é recusado sem saldo; estornar esse pagamento devolve o crédito. Escolhido o crédito interno, a tela de cobrança diz o saldo e quanto sobra depois (ou quanto falta, se não cobre). A ficha diz quanto a cliente pagou com crédito interno (que não conta no investido) e de onde veio o crédito: concedido sem dinheiro (não é receita), comprado, ou que ficou de um cancelamento.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:2968`, `:2987`
- Antes: KF-44, KF-46

**CI-05.** O estorno de uma venda de crédito é da VENDA, por quem tem o Financeiro em Gerenciar, com a unidade ao alcance, e tira o crédito junto. Volta o saldo de crédito que a cliente tem hoje, até o que ela pagou — nunca mais que o saldo; o que ela já usou fica pago. O crédito concedido (o "Conceder crédito" e o bônus de outra venda) é o último a ser gasto, fica com a cliente e nunca volta em dinheiro. A janela mostra a conta ("Vendido R$ 300,00 · Já usado R$ 119,00 · Volta à cliente R$ 181,00" e, se houver, "Crédito concedido (fica com a cliente)").
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1313-1327`, `:1335-1337`, `:3241`, `:3251`
- Antes: KC-27, KF-48

**CI-06.** Voltando todo o pago, é o estorno de sempre. Voltando parte, quem estorna escolhe: estorno parcial (o pagamento fica com o usado e um "Estorno parcial" leva o resto) ou o pagamento inteiro estornado e o usado lançado de novo (no cartão, só esta: EX-06). O crédito que voltou sai do saldo da cliente.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1328-1333`
- Antes: KC-28

**CI-07.** A venda de crédito tem "Bônus (opcional)", vazio por padrão; só o bônus negativo é recusado. O caixa e o faturamento recebem só o valor pago: o bônus entra no saldo da cliente como crédito concedido, ligado à venda, e não é receita. Antes de vender, a janela diz a conta ("A cliente fica com R$ 550,00 de crédito: R$ 500,00 pagos + R$ 50,00 de bônus. O caixa recebe só os R$ 500,00 pagos…"), e a ficha (na linha do crédito comprado) e o app (no Início e no Financeiro, ao lado do saldo) dizem "R$ 500,00 pagos + R$ 50,00 de bônus".
- Fonte: princípio 5
- Onde: `docs/regras/vendas-financeiro.md:1349-1362`, `:3252`
- Antes: KC-29, KC-30, KC-31, KF-49

**CI-08.** No estorno da venda de crédito, o bônus sai junto, e a rede escolhe como: a janela pergunta "Como o bônus sai?", com a conta de cada opção, e sem escolher não confirma. INTEIRO: o bônus sai todo (até o saldo) e volta o saldo menos o bônus, até o pago. PROPORCIONAL: o saldo se divide entre o pago e o bônus, e o bônus sai na proporção do que volta. Nunca volta mais do que a cliente pagou, e o que sai do crédito nunca passa do saldo dela. O "Já usado" da janela diz quanto do usado saiu do bônus ("R$ 180,00 usados, R$ 16,36 deles do bônus").
- Fonte: o Heitor, 2026-11-10: "No estorno sai o bonus junto, a clinica decide se integral ou parcial"
- Onde: `docs/regras/vendas-financeiro.md:1345-1348`, `:1363-1379`, `:3252`
- Antes: KC-32, KF-49, KC-33

**CI-09.** A venda de crédito avisa quando a cliente não tem acesso ao app: "Esta cliente não tem acesso ao app: ela não vai ver o saldo do crédito pelo celular. Dar acesso ao app na aba Dados da ficha." É só aviso: o acesso continua sendo criado pela rede, na ficha.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:1383-1388`
- Antes: KC-34

**CI-10.** Nas telas da equipe, o crédito da cliente se chama "Crédito interno"; no app, "Crédito em <o nome da rede>" ("Crédito em Estética Bella", sem artigo: o gênero do nome não se adivinha). O crediário se chama "Crediário" / "no crediário".
- Fonte: decisão do Claude (o nome da equipe); o nome da rede no app: recomendação do Claude aprovada pelo Heitor, 13/11: "Concordo" (CA1, `docs/revisao.md:1498-1502`; a Q06 do catálogo de Clientes, revisão de 24/11)
- Onde: `docs/revisao.md:1895-1897`, `:2147`; `docs/regras/vendas-financeiro.md:213`; `apps/web/lib/clientes/fala-da-rede.ts`
- Antes: KG-40

## O estorno (EX)

**EX-01.** Estornar um pagamento, lançar, cancelar pacote, plano ou sessão do pré-pago, dar crédito, trazer pacote de fora, devolver produto, remarcar e antecipar pedem o Financeiro em Gerenciar, com a unidade ao alcance. Valem para qualquer registro dentro da abrangência da pessoa, sem recorte por "os meus".
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem"
- Onde: `docs/regras/vendas-financeiro.md:84-85`, `:1488`, `:3002`; `docs/revisao.md:1293`
- Antes: KD-17, KF-67, KA-35

**EX-02.** O "Estornar" aparece nas listas do Financeiro, na aba Financeiro da ficha (os dois portais) e na página do atendimento pago, a quem estorna, sempre com a mesma janela. A quem não pode desfazer, a comanda, a ficha (aba Financeiro), o cartão do pacote e o atendimento pago dizem quem pode, pelo nome (ativos, ao alcance da unidade, e a Admin da rede); o atendimento concluído esperando o PDV diz, a quem não recebe, quem recebe (quem tem o PDV ou o Financeiro em Gerenciar), pelo nome.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:102-104`, `:3002`, `:3012`, `:3015`, `:3025`
- Antes: KF-68, KF-69, KA-35

**EX-03.** Na comanda paga, quem estorna vê cada pagamento com o seu "Estornar". Quando o atendimento e o produto foram pagos juntos, a comanda mostra cada parte ("Atendimento · Pix · R$ 250,00") e diz "Pago junto: atendimento R$ X + produtos R$ Y (Pix). Cada parte se estorna sozinha."
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:84-85`, `:102-104`, `:297-304`
- Antes: KA-35

**EX-04.** Só se estorna o que foi pago, e não se estorna um estorno. Estornar pede confirmação (a janela mostra o lançamento e o valor e avisa que não se desfaz) e o motivo, obrigatório, que aparece na lista ("Motivo: …"); o estorno sai na mesma forma e nas mesmas vezes do pagamento original. O estorno é um lançamento de saída, e o original fica marcado como estornado: nada se apaga.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:3118`, `:3134`, `:3138`
- Antes: KF-71, KF-72, KF-73

**EX-05.** Antes de confirmar, a janela do estorno, do cancelamento e da devolução mostra a conta (o que volta, o que cai do a receber, o que a venda passa a valer) e avisa as consequências: no pacote, as sessões já feitas ("1 das 5 sessões já foi feita, e o pacote segue com as 4 que restam."); na venda de produto, a venda inteira ("A venda inteira: R$ 300,00 (Pix R$ 200,00 e Dinheiro R$ 100,00)."); em qualquer recebimento, a comissão que volta a aguardar (com nome e valor para quem vê a comissão de todos, sem valor para os outros) e que a taxa da maquininha daquele pagamento sai da conta, sem dizer o valor da taxa. Confirmar vale por aquela conta: se os valores mudaram no meio, é recusado.
- Fonte: princípio 4
- Onde: `docs/regras/vendas-financeiro.md:353-355`, `:373-377`, `:427-429`, `:1113-1115`, `:1127-1128`, `:1241-1245`, `:1317-1318`, `:1333-1334`
- Antes: KA-38, KC-36

**EX-06.** No cartão (crédito à vista, em qualquer número de vezes, e débito), o estorno é sempre do pagamento INTEIRO: o pagamento no cartão não se diminui. O que a operadora ainda não pagou é cancelado, e o que ela já pagou fica estornado. Para devolver só parte (no cancelamento do pacote ou do plano, na sessão do pré-pago, na devolução de produto, no crédito interno), estorna-se o pagamento todo e lança-se de novo o que fica, na forma escolhida: a opção do estorno parcial aparece desligada com o motivo "No cartão, a operadora estorna o pagamento inteiro", e a outra já vem escolhida.
- Fonte: o Heitor, 2026-11-03: "estornar no cartão estorna a venda inteira, todas as operadoras fazem assim"
- Onde: `docs/regras/vendas-financeiro.md:807-810`, `:1107`, `:1118-1121`, `:1247-1248`, `:1330-1332`, `:2539-2541`, `:3196`
- Antes: KB-37, KC-35, KE-36, KF-17

**EX-07.** O lançamento de uma venda de produto ou de uma venda de crédito interno não se estorna sozinho: estornar só o dinheiro é recusado ("estorne a venda, dizendo se o produto voltou"; "Este lançamento é de uma venda de crédito interno: estorne a venda…"), porque deixaria a venda viva.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1218-1221`, `:1338-1341`
- Antes: KC-37

**EX-08.** Estornar pela lista um pagamento de pacote, plano ou pré-pago devolve o dinheiro e reabre aquele valor como "a receber" da mesma venda, com o mesmo vencimento; a janela diz isso antes. Desfazer a venda é o "Cancelar" (pacote, plano, sessão do pré-pago).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:3121`
- Antes: KF-74

**EX-09.** Estornado o pagamento de um atendimento avulso, a cobrança dele reabre: a comanda volta a ficar aberta no PDV, e receber de novo é um pagamento novo. A janela avisa que o atendimento volta a receber; o histórico do agendamento ganha "Pagamento estornado — <motivo>"; na lista do Financeiro a linha é "Estorno" e diz "Anula a receita estornada"; o app mostra o pago estornado como "Estornado", e a ficha mostra o original estornado e o estorno como saída. Vale também para a parcela estornada do crediário do avulso: o valor dela reabre na comanda, e as outras parcelas seguem com o vencimento delas (pagar e estornar por parcela, a CR-05, é do pacote, do pré-pago, do plano e da despesa).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele); a parcela do crediário do avulso: decisão do Claude, 27/11 (35ª, Decisão D2), pela própria EX-09 e pela CR-05
- Onde: `docs/regras/vendas-financeiro.md:3147`, `:3168`
- Antes: KF-75, KF-76

**EX-10.** A comanda reaberta por estorno diz o que foi estornado ("Estornada às 21:20 — R$ 250,00, Pix, com R$ 30,00 de desconto. Ao receber de novo, o desconto se escolhe de novo."), e o aviso sai quando é paga de novo. A venda estornada e recebida de novo conta uma vez só; a comanda da venda e a do plano dizem o estorno ("Estornada às 09:27 — R$ 1.000,00, Débito: o valor voltou a receber." ou "Recebida de novo depois do estorno das 09:27 (R$ 1.000,00, Débito)."). A venda estornada inteira diz "Estornada", continua mostrando com o que foi paga e diz "Para cobrar de novo, faça uma Nova venda."
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:105-107`, `:323-336`, `:364-365`, `:404-405`
- Antes: KA-36, KA-37

**EX-11.** A linha do lançamento diz o que aconteceu: o pagamento estornado em parte diz o pago e o estornado ("Pago R$ 1.100,00 · R$ 990,00 estornados") nos dois Financeiros, e o app diz o mesmo ("R$ 300,00 pagos · R$ 136,36 devolvidos"). O pagamento de R$ 0 (feito todo com o voucher ou com os pontos) diz com o que foi pago ("Pago com o voucher “X”: R$ 180,00" ou "Pago com pontos: …"); o botão é "Desfazer o pagamento", e a janela avisa que nenhum dinheiro volta (o voucher volta a valer, e os pontos voltam ao saldo).
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:2010`, `:2018`, `:2028`, `:2030`
- Antes: KE-09, KE-10, KE-08

## O cartão, as maquininhas e as taxas (MQ)

### O que a operadora deposita

**MQ-01.** O cartão de crédito em N vezes (de 1 a 1.200; acima de 12 a tela avisa, em todo campo de vezes do cartão — o receber da comanda, a Nova venda, o lançamento, a baixa —, e não só no limite da maquininha, MQ-12) é UM pagamento da cliente, feito na hora: um lançamento só, pago, e para ela não fica dívida nenhuma. A operadora deposita em N parcelas, que aparecem no Financeiro mês a mês como "a receber da operadora" — não são receita nem dívida da cliente. A receita é da venda: conta inteira no dia em que a venda foi feita, e a parcela recebida não soma receita de novo.
- Fonte: o Heitor, 2026-11-01: "no financeiro mês a mês, como a receber" e "conta no mês do dia da venda"; acima de 12 vezes: o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." (acima de 12 vezes avisa); o impossível (zero, negativo, fracionário, acima de 1.200 vezes — 100 anos de parcelas mensais, o limite das datas) e o aviso começar no teto de antes (12): decisão do Claude, 25/11; o aviso em todo campo de vezes: decisão do Claude (lembrada na 32ª simulação, A20: o receber em 15x não avisava), pelo princípio 2
- Onde: `docs/regras/vendas-financeiro.md:2172`, `:2179`, `:2502`, `:3215-3216`
- Antes: KE-27, KF-16, KE-28

**MQ-02.** A parcela k vence na data da venda + k × N dias corridos; N é o prazo de recebimento da maquininha, 30 dias por padrão, e mudar o prazo só vale para as vendas seguintes. O prazo é o que a rede digita, de 1 dia para cima: acima de 120 dias a tela avisa ("Acima do comum (mais de 120 dias). Confira: o valor vale como está.") e o valor vale; só o que o registro não guarda é recusado. Cada parcela tem o seu valor e a sua taxa (a da maquininha para aquele número de vezes); os centavos que sobram da divisão, no valor e na taxa, vão na última parcela, e a soma fecha com a venda.
- Fonte: o Heitor, 2026-11-03: "como a operadora paga de verdade e configurável o prazo"; o aviso no lugar do teto: princípio 2 (o Heitor, 2026-11-04: "no máximo, avisar"); o aviso começar no teto de antes (120 dias): decisão do Claude, 25/11
- Onde: `docs/regras/vendas-financeiro.md:2186`, `:2191`, `:2265`, `:3341`; `apps/web/lib/financeiro/vezes-do-cartao.ts:43-60`
- Antes: KE-30, KE-29

**MQ-03.** O crédito à vista (1x) também vira uma parcela da operadora, dentro do prazo. O débito e o Pix contam como recebidos no dia da venda, porque não têm prazo configurado, e o "A receber da operadora" diz isso ("Débito no período: R$ 540,00 — conta como recebido no dia da venda"); no Financeiro da rede com uma unidade filtrada, esse débito é o da unidade.
- Fonte: princípio 4
- Onde: `docs/regras/vendas-financeiro.md:1495`, `:2050`, `:2549`
- Antes: KE-31, KD-20

**MQ-04.** A parcela da operadora passa a recebida sozinha quando vence. "Marcar recebida" antes do vencimento é a antecipação, feita por quem tem o Financeiro em Gerenciar, numa unidade ao alcance. A parcela antecipada tem "Desfazer", que pede confirmação antes ("Desfazer o recebimento?"), e volta a ficar a receber; a que venceu foi recebida na data, e isso não se desfaz.
- Fonte: o Heitor, 2026-11-03: "mudar solicitando confirmação antes de desfazer"
- Onde: `docs/regras/vendas-financeiro.md:2504`, `:2509`
- Antes: KE-32, KE-33

**MQ-05.** As parcelas da operadora não aparecem para a cliente (nem na ficha, nem no app, nem no Fechamento): ela não deve nada. O Financeiro mostra os dois a receber, cada um com o seu nome, "A receber da cliente" e "A receber da operadora". A lista da operadora tem todo o em aberto, de qualquer vencimento, mais o que vence no período, agrupada pelo mês do depósito, e o cartão tem "Ver as parcelas". O "A receber da operadora" e o fluxo de caixa contam o líquido (o que a operadora deposita), com o bruto ao lado; no cartão da operadora, o número grande é o que ela ainda vai depositar, e o total do período fica embaixo.
- Fonte: decisão do Claude; o líquido no número (é o que entra na conta) e o bruto embaixo, no fluxo e no cartão da operadora: confirmado, decisão do Claude, 26/11 (34ª, Decisão D), pelos princípios 3 e 5
- Onde: `docs/regras/vendas-financeiro.md:2047`, `:2516`, `:2528`
- Antes: KE-34, KE-35

### As maquininhas e as taxas

**MQ-06.** A rede cadastra as maquininhas que usa (Stone, Mercado Pago…), cada uma com o nome, a taxa do débito, a do crédito à vista, até quantas vezes ela parcela, a taxa de cada número de vezes e o prazo de recebimento; o "Parcelar no crédito até" e o prazo são de cada maquininha. Na tela de Taxas, com mais de uma maquininha, um seletor escolhe qual editar; há "+ Adicionar maquininha", arquivar e "Voltar a usar" (a última ativa não se arquiva), e um único "Salvar taxas" grava o Pix e as maquininhas que mudaram.
- Fonte: o Heitor, 2026-11-11: "Quem escolhe a taxa é a operadora: stone, mercadopago, elo e por ai vai… a rede precisa configurar suas taxas, por operadora."
- Onde: `docs/regras/vendas-financeiro.md:2200`, `:2251`, `:2263`
- Antes: KE-37, KE-41

**MQ-07.** Só a Admin da rede configura as maquininhas, as taxas e o Pix (Configurações → Comissões → "Taxas da maquininha").
- Fonte: o Heitor, 18/11: "só pela conta admin"
- Onde: `docs/regras/vendas-financeiro.md:2210`; CLAUDE.md §11
- Antes: KE-38

**MQ-08.** O Pix tem um campo de taxa próprio na tela de Taxas, fora das maquininhas, e o padrão é 0%. O campo de taxa vazio mostra "0%" e vale 0%; os campos não têm aviso "Sem taxa".
- Fonte: o Heitor, 2026-11-11: "A taxa do pix fica em algum lugar nessas configurações e o aviso sem taxa acho que nem precisa na verdade"
- Onde: `docs/regras/vendas-financeiro.md:2288`, `:2291`
- Antes: KE-39, KE-40

**MQ-09.** A bandeira fica dentro da maquininha, numa opção que vem fechada: "Esta maquininha cobra diferente em alguma bandeira?". Aberta, cada bandeira pode ter as suas taxas e o seu prazo naquela maquininha; o campo vazio da bandeira vale a taxa da maquininha para aquele mesmo número de vezes.
- Fonte: o Heitor, 2026-11-03: "Lembre-se, flexibilidade. Prazo por bandeira. Taxas também configuráveis por bandeira."
- Onde: `docs/regras/vendas-financeiro.md:2267`, `:2296`, `:2307`
- Antes: KE-42

**MQ-10.** A taxa vale só para aquelas vezes exatas: sem a da bandeira, vale a da maquininha daquelas vezes; sem nenhuma das duas, a taxa é 0%, nunca a de outro número de vezes, e nada é recusado: a venda grava normalmente. A quem não cadastra a taxa (quem não é a Admin da rede), o aviso de taxa faltando diz quem cadastra, pelo nome das Admins da rede ativas.
- Fonte: o Heitor (revisão das decisões da F16, opção A): "pode levar a erros de cálculos"
- Onde: `docs/regras/vendas-financeiro.md:2316`, `:2686`, `:2690`, `:3218`, `:3220`
- Antes: KE-43, KF-13, KF-15

**MQ-11.** As taxas não têm teto: só não podem ser negativas (o registro guarda até 999,99%), e com a taxa acima de 100% o depósito previsto da operadora não fica abaixo de zero. O "Salvar taxas" grava o que a rede escolheu; quando parcelar em mais vezes sai mais barato que o crédito à vista, ele avisa, e a mensagem termina com "Ficou salvo como está."
- Fonte: o Heitor (F16-3, sem data no texto): "não é pra recusar nada, juros podem passar facilmente de 100% no acumulado"
- Onde: `docs/regras/vendas-financeiro.md:2387`, `:2412`, `:3219`
- Antes: KE-51, KF-14, KE-48

**MQ-12.** A rede diz, em cada maquininha, até quantas vezes se parcela no crédito; em Automático (vazio), vale a maior quantidade de vezes com taxa cadastrada, e sem nenhuma, 12x. O limite é o número que a rede escolhe: de 1 a 12 no seletor e, em "Mais de 12x…", digitado; acima de 12 a tela avisa ("Acima do comum (mais de 12 vezes). Confira: o valor vale como está.") e o valor vale; só o impossível (zero, fracionário, acima de 1.200) é recusado. Toda tela de cobrança oferece só até esse limite, e o servidor recusa acima dele; vale só para o cartão em N vezes, não para o crediário. Na tela de Taxas, as linhas do crédito só aparecem até o limite (em Automático, até 12x, ou até a maior com taxa quando ela passa de 12), e o "Preencher" só preenche as que aparecem; a taxa das vezes acima de 12 se cadastra como as outras, e sem ela vale 0% (MQ-10) — nunca a do 12x; com "Só à vista", o crédito parcelado some, e a tela diz por quê. O que está gravado acima do limite não se apaga, e aumentar o limite traz essas linhas de volta.
- Fonte: o Heitor, 2026-10-29: "A clínica configura 'parcela até Nx'…"; acima de 12 vezes: o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." (acima de 12 vezes avisa); o impossível (zero, negativo, fracionário, acima de 1.200 vezes — 100 anos de parcelas mensais, o limite das datas) e o aviso começar no teto de antes (12): decisão do Claude, 25/11
- Onde: `docs/regras/vendas-financeiro.md:2393`, `:2400`, `:2607`, `:2613`
- Antes: KF-05, KE-50, KE-49

**MQ-13.** "Colar a tabela da operadora" é o jeito principal de preencher as taxas: lê a tabela copiada da operadora ou de uma planilha ("6x 6,50%", ou só os números em ordem a partir do 1x), mostra antes o que vai preencher e só preenche os campos (grava-se no "Salvar taxas"); o que ele não entende vira erro, sem chutar. Uma faixa digitada no campo da taxa por parcela ("de 3,1 a 11,9") não vira taxa e não é recusada: a tela diz que é a faixa da tabela da operadora e abre o "colar" só com as pontas (1x e a última linha do crédito), e as do meio a rede cola ou digita. "Preencher pela taxa por parcela" (o botão secundário) preenche o crédito de 1x até o limite com a taxa por parcela × o número de vezes, em duas casas (1,15% → 1x 1,15%, 2x 2,30%…); antes, mostra o que vai pôr e avisa quando o 1x muda; cada campo segue editável, e o débito não muda.
- Fonte: o Heitor (r4-f15-01, sem data no texto): "a taxa é por parcela, por exemplo 1.15% por parcela, então a taxa total é a taxa vezes a quantidade de parcelas"
- Onde: `docs/regras/vendas-financeiro.md:2339`, `:2354`, `:2368`, `:2372`, `:2380`
- Antes: KE-45, KE-46, KE-47

**MQ-14.** Cada lançamento guarda a taxa que tinha quando foi feito: trocar a taxa da maquininha não muda o passado. A bandeira informada ou trocada depois do pagamento refaz o prazo e a taxa das parcelas da operadora, enquanto ela não tiver pago nenhuma; o estorno fica com a bandeira do pagamento.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:2215`, `:2495`
- Antes: KE-52, KE-60

### O cartão na venda

**MQ-15.** Com uma maquininha ativa, ela vale sem perguntar, e o pagamento não diz qual foi. Com mais de uma, todo pagamento no cartão pergunta "Qual maquininha?" — a primeira não vale calada ("Escolha a maquininha do cartão.") —, em todo caminho de venda e de baixa, no Copilot e no novo pagamento do usado depois de um estorno; a taxa, o prazo e o limite de vezes são os da maquininha da venda, e o pagamento diz qual foi ("Débito Visa · Stone") na confirmação do atendimento, no histórico, na lista do Financeiro e no CSV. O estorno fica na maquininha do pagamento, a despesa no cartão não tem maquininha (o cartão da rede não é maquininha), e o pagamento combinado do contrato não pergunta (a maquininha se escolhe quando o dinheiro entra).
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:2228`, `:2272`, `:2708`, `:3221-3223`, `:3225`
- Antes: KE-53, KF-12, KF-11

**MQ-16.** Todo pagamento no cartão pergunta a bandeira, mas ela é opcional ("Bandeira (opcional)"), em todo lugar onde se recebe no cartão, inclusive na receita paga do "Novo lançamento"; na receita lançada em aberto, a bandeira é perguntada na baixa, e a despesa não tem bandeira. A bandeira aparece onde a forma aparece: no recibo, na tela do atendimento, na ficha e no app ("Crédito Visa 5x"); a opção das vezes diz só "6x" em toda tela de cobrança.
- Fonte: o Heitor (sem data no texto): "flexibilidade, e é o mesmo campo opcional dos outros lugares"
- Onde: `docs/regras/vendas-financeiro.md:2429`, `:2450`
- Antes: KE-55, KE-56

**MQ-17.** Junto de todo campo de vezes no cartão, a tela diz o limite ("Até 4x no crédito") e, escolhidas as vezes, o valor de cada parcela ("· 3× R$ 1.100,00"); à vista, diz para que serve o campo. A taxa e o líquido da maquininha (no crédito, e no débito "Taxa da maquininha no débito: 1,6% … a rede recebe R$ 186,96") só aparecem a quem tem o Financeiro em Ver; quem só recebe vê apenas o aviso de que não há taxa cadastrada ("sai sem desconto (0%)"), sem valor nenhum, e o servidor não manda os números a ele. As taxas estimadas ficam no Financeiro.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:1008-1026`, `:2249`, `:2284`, `:2442`, `:2653`; `docs/revisao.md:1997`
- Antes: KB-54, KE-07, KE-57, KF-08

**MQ-18.** A receita paga no crédito, no "Novo lançamento", escolhe "Vezes no cartão" até o limite: é um pagamento só, que a operadora deposita em N parcelas, e a tela diz isso ("Um pagamento só: a cliente pagou tudo agora… Não é o crediário da cliente."). A baixa no crédito ("Receber no cartão") também escolhe as vezes, de 1 até o limite, com o valor da parcela e o aviso da taxa, e a regra é a mesma no Copilot. No crediário com a entrada no cartão de crédito, a entrada também pode ser em N vezes. O débito é sempre 1x, e o lançamento pendente não pergunta as vezes (elas se escolhem na baixa).
- Fonte: o Heitor (F16-5, sem data no texto): "ajuste isso para permitir escolher parcelas"
- Onde: `docs/regras/vendas-financeiro.md:2461`, `:2475`, `:2590`
- Antes: KE-58, KE-59, KF-04

**MQ-19.** "Preencher pela taxa por parcela" preenche o crédito de 1x até a última linha que aparece (12x, ou o limite da maquininha — que pode passar de 12, o Heitor, 25/11) com a taxa × as vezes, o 1x (à vista) inclusive, e a tela diz isso ("de 1x (à vista, inclusive)"); quando o 1x tinha outro valor, avisa antes de salvar ("O crédito à vista (1x) também mudou: era 1,19%, agora 1,15%. Confira antes de salvar."). Só preenche os campos: grava no "Salvar taxas", e cada campo segue editável.
- Fonte: princípio 3, sobre a fala do Heitor da MQ-13 ("a taxa é por parcela … então a taxa total é a taxa vezes a quantidade de parcelas")
- Onde: `docs/regras/vendas-financeiro.md:2409-2423`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## O Fechamento do dia (FC)

**FC-01.** O Fechamento do dia fica dentro do PDV ("Fechar o dia", no topo; o item "Fechamento do dia" do menu leva até ele) e mostra o dinheiro da unidade inteira: o dia por forma de pagamento (entradas, saídas pagas e saldo, com o total), o dinheiro em espécie esperado, a contagem e quem fechou. Vê quem tem o PDV em Gerenciar ou o Financeiro em Ver; fecha quem recebe (PV-04), que também vê. As Minhas comissões não abrem o Fechamento. Quem só tem o PDV não vê a descrição nem o motivo de uma despesa: as saídas aparecem só pela forma.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:199-205`, `:1542`, `:1604`, `:1683`; `docs/revisao.md:611`, `:1995`; `apps/web/lib/auth.ts:387-388`
- Antes: KA-50, KD-23, KG-16, KD-32, KD-40

**FC-02.** A conferência é uma tabela com uma linha por forma: Registrado, Conferido e Diferença. O registrado do Dinheiro é o esperado na gaveta (com o fundo de troco); o das outras formas é o saldo do dia. O Dinheiro é obrigatório, a não ser no dia sem dinheiro esperado e sem movimento em dinheiro (aí é opcional, e em branco fecha com R$ 0,00); as outras formas são opcionais, e em branco quer dizer "não conferido", nunca zero nem o valor registrado. Acima de R$ 10.000.000 (para mais ou para menos) a célula avisa e o conferido vale; só se recusa o que a conta não guarda em centavos exatos (acima de R$ 90.071.992.547.409,91) (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; os números são decisão do Claude).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:1552`, `:1555`, `:1631`; `docs/revisao.md:1995`
- Antes: KD-24, KD-25

**FC-03.** Algumas linhas não se conferem: os pontos (o que os pontos pagaram inteiro é um lançamento de R$ 0, mostrado como "Sem forma (pontos)"), o "Sem forma de pagamento" (como a compra de estoque) e a forma que no dia só teve saída — esta volta a se conferir se já tiver sido conferida no último fechamento.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1562`, `:2721`, `:2896`
- Antes: KD-26, KF-18

**FC-04.** Enquanto se digita o conferido, a diferença é recalculada na tela, mas vale o que o sistema grava ao fechar. Depois de fechar, cada linha mostra o último conferido e a diferença contra o registrado daquele fechamento: "Bateu", "Faltou R$ X", "Sobrou R$ X" ou "não conferido". "Bateu" só aparece quando o registrado de agora é o mesmo do fechamento; se mudou, a diferença diz "a conferir · mudou depois do fechamento", o conferido diz "às HH:MM, quando o registrado era R$ X", e o CSV diz o mesmo. Com diferença, o fechamento pede o motivo na observação, sem obrigar; os fechamentos anteriores mostram o motivo ou "sem motivo anotado".
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:461-463`, `:1569`, `:1577`, `:1584`, `:3266`
- Antes: KD-28, KD-29, KF-91, KA-52

**FC-05.** "Fechar de novo" (o nome do botão ao reabrir) volta com os valores do último fechamento; a linha que mudou depois dele vem em branco, porque o conferido antigo não vale para o registrado novo, e o que ainda vai ser conferido não aparece como "Não conferido".
- Fonte: princípio 4
- Onde: `docs/regras/vendas-financeiro.md:389-390`, `:1571`, `:1595`
- Antes: KD-30, KA-51

**FC-06.** Quando o dinheiro registrado no dia fica negativo, o fechamento avisa: "Saiu R$ X a mais do que entrou em dinheiro: confira a saída em dinheiro, ou informe o fundo de troco."; pagar uma comissão em Dinheiro que deixa a gaveta do dia negativa também avisa, e o pagamento segue. Nas formas que não são dinheiro, o conferido pode ser negativo (o Pix que saiu mais do que entrou): a tela diz "confira com o sinal de menos", e o sistema aceita.
- Fonte: princípio 2
- Onde: `docs/regras/vendas-financeiro.md:369-372`, `:409-410`, `:471-472`, `:1590`
- Antes: KA-51, KA-54, KD-31

**FC-07.** Cada fechamento fica registrado: fechar de novo não apaga o anterior, e vale o mais recente. Dia futuro não se fecha. O dia que ninguém fechou diz "Ainda não fechado: ninguém fechou este dia.", para quem fecha e para quem só vê, e o CSV traz a "Situação do dia" ("Ainda não fechado" ou "Fechado por … em … às …; Bateu").
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:1611`, `:1716`; `docs/revisao.md:1998`
- Antes: KD-33, KD-43, KG-19

**FC-08.** O Fechamento tem só estes avisos: "Há N comanda(s) aberta(s)", com link para as comandas abertas, para quem recebe; "Houve movimento depois do fechamento das HH:MM (entrou R$ X e saiu R$ Y): confira e feche de novo" (o estorno conta como "saiu"); e, quando a unidade fecha hoje antes do fim do expediente, "A unidade atende até 22:00: o dia ainda está aberto. O que entrar depois deste fechamento pede fechar de novo." — só aviso: o fechamento antes da hora vale. "Por quem recebeu" e "Estornos do dia" ficam recolhidos em "Detalhes do dia".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:1614`, `:1633`; `docs/revisao.md:1996`
- Antes: KD-34, KG-17, KD-35

**FC-09.** O fundo de troco é opcional, na linha do dinheiro: quem fecha o dia pode "Informar fundo de troco", o dinheiro que já estava na gaveta no começo do dia — um por unidade e por dia; informar de novo substitui, e zero é sem fundo. Com fundo, o dinheiro esperado é o fundo mais o saldo em dinheiro do dia, e o fechamento guarda o fundo; sem fundo, nada muda. Acima de R$ 1.000.000 de fundo a tela avisa e vale; só se recusa o acima de R$ 9.999.999.999,99 (o limite do registro do fechamento), no fundo, no dinheiro contado e no esperado na gaveta (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; os números são decisão do Claude).
- Fonte: o Heitor, 2026-11-02: "flexibilidade, precisamos dar as opções para que a rede possa operar da maneira que melhor lhe convier"
- Onde: `docs/regras/vendas-financeiro.md:1639`; `docs/revisao.md:1995`
- Antes: KD-36, KG-16

**FC-10.** Os estornos do dia aparecem numa linha própria ("Estornos do dia: R$ X"), e nos "Detalhes do dia" cada estorno pago no dia vem com a descrição, a forma e o motivo, e o total. Se um pagamento de hoje foi estornado hoje mesmo, a linha da forma diz isso ("R$ 320,00 estornado de um pagamento de hoje: já fora das entradas") e continua na tabela, zerada — mas não pede conferência, porque não há o que conferir (a forma só com saída, ou zerada, não se confere, a não ser que tenha sido conferida no último fechamento). O estorno parcial do mesmo dia também sai das entradas, na própria forma ("R$ 720,00 estornado de um pagamento de hoje: já fora das entradas"), e a entrada aparece pelo que ficou.
- Fonte: princípio 3; o estorno parcial do mesmo dia: decisão do Claude, 27/11 (35ª, Decisão D1), pela FC-11
- Onde: `docs/regras/vendas-financeiro.md:1565`, `:1597`, `:1610-1618`, `:1658`
- Antes: KD-37, KD-27

**FC-11.** O estorno conta no dia em que o dinheiro sai: o Fechamento de um dia, fechado ou não, não muda por um estorno feito depois. O estorno de um pagamento de outro dia é saída do dia em que foi feito, na forma do pagamento; o de um pagamento do mesmo dia já fica fora das entradas, porque um anula o outro; o pagamento estornado em parte conta o valor cheio no dia em que entrou. Cada estorno diz em qual caso está ("Pagamento de 10/11: sai nas saídas deste dia." ou "Pagamento deste dia: já fora das entradas."), e o CSV também. Os estornos do dia são só o que voltou às clientes: o estorno de uma DESPESA é dinheiro voltando ao caixa (em outro dia, entrada na forma dele; no mesmo dia, um anula o outro), e a linha que o desfaz diz "Anula a despesa estornada"; o estorno do uso do crédito interno fica fora, porque não é dinheiro do caixa.
- Fonte: princípio 5
- Onde: `docs/regras/vendas-financeiro.md:1662`, `:1676`, `:2028`, `:3253`, `:3256`
- Antes: KD-38, KF-77, KE-09, KD-39, KF-78

**FC-12.** Na rede com duas ou mais unidades, o Fechamento mostra "O dia na rede": cada unidade com as entradas e as saídas do dia (ou "Sem movimento"), a unidade aberta marcada e o "Total da rede". Sem unidade escolhida, abre na primeira que teve movimento. O fechamento continua sendo por unidade.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:1688`; `docs/revisao.md:1998`
- Antes: KD-41, KG-19

**FC-13.** "Por quem recebeu" lista as entradas do dia de cada pessoa, por forma, com o total dela. Quem recebeu é quem lançou o lançamento que já nasceu pago, ou quem deu a baixa depois; quando isso não ficou registrado, aparece "Quem recebeu não registrado". As saídas e os estornos ficam no total da unidade. O CSV do Fechamento traz essa seção.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:1698`
- Antes: KD-42

**FC-14.** O que não é conferir o dia mora no Financeiro (dos dois portais), para quem tem o Financeiro em Ver, no período e nas unidades da tela: o aviso de venda no cartão sem taxa cadastrada ("Sem taxa da maquininha cadastrada — saiu sem desconto da operadora: Crédito 4x (Elo): 1 venda, R$ 1.100,00…"), a linha "Taxas da maquininha no período (estimadas): R$ X — só para conferência; não saem do saldo.", o que a operadora ainda vai depositar e o "CSV do fechamento do dia"; nada disso aparece no Fechamento. O arquivo do CSV mora no Financeiro → Movimentações; o Fechamento só aponta para ele, com o link "Baixar o CSV do fechamento · no Financeiro → Movimentações", e o link só aparece para quem tem o Financeiro em Ver (quem não abre o Financeiro não vê o link). Não existe "abrir caixa" nem sangria: para auditar o dia, usa-se o Financeiro, por período, unidade e forma de pagamento.
- Fonte: a aprovação do Heitor de 13/11 ("Blz pode ser assim") sobre o CSV morar no Financeiro; o link para lá, decisão do Claude, 26/11, a pedido dele ("Como você acha melhor?", R09 da página de perguntas)
- Onde: `docs/regras/vendas-financeiro.md:1520`, `:1533`, `:1654`, `:2330`; `docs/revisao.md:1997-1998`, `:2252-2253`; `apps/web/app/_shared/fechamento-do-dia.tsx:123` (o link, com o Financeiro em Ver)
- Antes: KD-21, KG-18, KE-44, KD-22, KG-20

**FC-15.** O Fechamento do dia separa o cartão por maquininha, quando o dia teve mais de uma, e dentro dela por bandeira e por vezes ("Cartão de crédito 6x — Visa R$ 630,00 · Mastercard R$ 600,00"); a despesa no cartão aparece como "Cartão".
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:1994`, `:2256`, `:2276`, `:3231`
- Antes: KE-54, KF-10

**FC-15a.** O pagamento já feito no crédito à vista se chama "Crédito 1x" ("Cartão de crédito 1x" no Fechamento e no CSV), como o "Crédito 3x" ao lado. O banco grava o à vista com as vezes nulas, e o nulo vale 1x. A forma a escolher (os botões do PDV, as listas de forma) continua "Crédito"; o combinado antes de pagar continua "à vista".
- Fonte: o Heitor, 26/11 (R20 da página): "Escrever \"1x\" no crédito à vista (a proposta)"
- Onde: `apps/web/lib/financeiro/formas.ts` (`rotuloDaForma`); `apps/web/tests/financeiro-formas.test.ts`

## O Financeiro (FN)

### As abas

**FN-01.** O Financeiro tem cinco abas, iguais nos dois portais: Resumo, A receber, A pagar, Movimentações e Comissões. Abre no Resumo, e trocar de aba leva junto o período e a unidade da tela. Não há recurso novo — são as funções que já existiam, reorganizadas —, e não há conciliação com o extrato do banco nem plano de contas contábil completo. A aba Comissões abre a página das comissões com a mesma barra de abas e some quando o plano da rede não inclui comissões.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode manter e anotar no plano como voce sugeriu"
- Onde: `docs/regras/vendas-financeiro.md:1394`, `:1422`; `docs/revisao.md:634-640`, `:2002-2007`, `:2012`, `:2015`
- Antes: KD-01, KG-21, KD-07, KG-27

**FN-02.** O Resumo mostra o que entrou, o que saiu e o resultado do período. Embaixo vem "O que vem pela frente": o a receber das clientes, o da operadora do cartão e o a pagar, cada um com link para a sua aba; depois, o fluxo de caixa, a evolução, as formas e as categorias (na rede, também por unidade). O Resumo não mostra a lista de lançamentos.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode manter e anotar no plano como voce sugeriu"
- Onde: `docs/regras/vendas-financeiro.md:1401`; `docs/revisao.md:2008`
- Antes: KD-02, KG-22

**FN-03.** A aba A receber lista tudo o que as clientes ainda devem, de qualquer vencimento, do mais antigo para o mais novo (as vencidas primeiro), com "Receber" e "Remarcar vencimento" em cada linha e a opção "Só as vencidas"; embaixo ficam as parcelas que a operadora do cartão ainda vai depositar. Ali se dá baixa só no que entra sem passar pelo balcão (a transferência que caiu na conta).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:1407`; `docs/revisao.md:1993`, `:2009`
- Antes: KD-03, KG-23

**FN-04.** A aba A pagar lista toda conta a pagar em aberto, de qualquer mês, começando pelo vencimento mais próximo; o "Novo lançamento" lança a conta avulsa, a parcelada e a recorrente (com as Contas), e ali se paga e se vê o que vence. A aba Movimentações é o extrato do período, com filtro: ali ficam o estorno, o recibo, a devolução, o cancelamento da venda, o "Exportar CSV" e o "CSV do fechamento do dia", e os avisos das taxas da maquininha (FC-14).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode manter e anotar no plano como voce sugeriu"
- Onde: `docs/regras/vendas-financeiro.md:1415`, `:1418`; `docs/revisao.md:2010-2011`
- Antes: KD-05, KG-24, KD-06, KG-25

### Quem vê e quem mexe

**FN-05.** No topo do Financeiro há só o "Novo lançamento", e só para quem tem o Financeiro em Gerenciar: quem só vê não vê o botão, e a recusa diz "Você não tem acesso a esta ação." (o "sem acesso" genérico não põe a culpa no cargo: pode ser a unidade ou o plano). Quem tem o Financeiro em Ver lê todas as abas, mas não lança nem remarca, e não recebe instrução de dar baixa ("Ver e receber", "use Pagar na linha"). Quem atende ou tem comissão no nome e não tem o Financeiro vê as Minhas comissões (a vista pessoal).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode manter e anotar no plano como voce sugeriu"; a frase da recusa: decisão do Claude (15ª simulação), pela regra do vocabulário (o Heitor, 2026-11-13: "o que define quem gerencia é permissão, ponto"); a vista pessoal: CLAUDE.md §11 (SM2, 23/11)
- Onde: `docs/regras/vendas-financeiro.md:1424`, `:1432`, `:2068`, `:3259`; `docs/revisao.md:2013`, `:2015`; `apps/web/lib/erro-na-tela.ts:24`
- Antes: KD-08, KE-13, KG-26, KD-09, KF-70

**FN-06.** Dar baixa no Financeiro ("Receber" numa receita, "Pagar" numa despesa) é de quem tem o PDV ou o Financeiro em Gerenciar; é para o dinheiro que entra sem passar pelo balcão (a transferência que caiu na conta). É a exceção do CX2 ao "receber é do PDV" (PV-04): o que a cliente paga no balcão — a comanda, a parcela que ela veio pagar — segue só no PDV. A janela diz quanto e de quem ("R$ 200,00 — Paula Neves") e usa as formas em blocos, como no PDV; o cartão da parcela diz "Ver e receber". Quem não pode dar baixa lê "Receber é de quem tem o PDV ou o Financeiro em Gerenciar."
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim" (CX2: "dá baixa só no que entra sem passar pelo balcão (a transferência que caiu na conta)")
- Onde: `docs/regras/vendas-financeiro.md:469-470`, `:1410`, `:1474`, `:1524-1533`; `docs/revisao.md:1993`; `apps/web/lib/financeiro/so-os-meus.ts:14-24`
- Antes: KD-15, KG-23, KD-04, KA-56

**FN-07.** A aba Financeiro da ficha é igual nos dois portais e abre para quem tem o Financeiro em Ver ou recebe. Mostra tudo da cliente: os lançamentos, o pago, o a receber (os lançamentos em aberto mais os atendimentos concluídos ainda sem lançamento) e o crédito interno. As parcelas em aberto vêm primeiro, do vencimento mais antigo ao mais novo (a vencida, ou a mais próxima, primeiro; sem vencimento, depois; no empate, a parcela menor), e a vencida fica em destaque (CR-09). O resto vem da mais nova para a mais antiga, pela data que a própria linha mostra (o dia do atendimento ou, senão, o dia do lançamento); no empate, a parcela maior vem primeiro. No celular, cada lançamento é um cartão, sem rolar de lado.
- Fonte: princípio 3; o em aberto primeiro, pelo vencimento: recomendação do Claude aprovada pelo Heitor, 2026-11-18 (item 17 do escopo): "17 - ok" (`DEVLOG.md:1875`)
- Onde: `docs/regras/vendas-financeiro.md:1810-1838`, `:3246`, `:3304`
- Antes: KD-49, KD-50, KF-86

### O filtro de tags

**FN-08.** As listas A receber, A pagar e Movimentações têm o filtro "Tags", ao lado dos filtros fixos, nos dois portais: o lançamento entra se a cliente dele tem TODAS as tags marcadas, e com alguma tag marcada o lançamento sem cliente (a despesa, o fornecedor) sai da lista. As opções são as tags da rede (sem nenhuma tag na rede, o filtro não aparece). O filtro fica guardado no endereço e acompanha a troca de aba, de período e de unidade (na aba Comissões não); o "Exportar CSV" e o "caixa da lista" seguem a lista filtrada. Os cartões e os números não mudam com a tag: o Resumo não tem o filtro, e os cartões do A receber e do A pagar e as parcelas da operadora continuam os da unidade; a dica do filtro explica isso.
- Fonte: o Heitor, 13/11: "um dos filtros que ela pode usar são as tags"
- Onde: `docs/regras/vendas-financeiro.md:1435`, `:1446`, `:1452`, `:3263`
- Antes: KD-10, KF-90, KD-11

### As listas e os cartões

**FN-09.** Na lista do período, o lançamento pago aparece no dia do pagamento, e o em aberto no vencimento (sem vencimento, no dia em que foi criado, e a linha diz "Sem vencimento" no lugar da data): a parcela de novembro aparece em novembro.
- Fonte: decisão do Claude; a linha "Sem vencimento": decisão do Claude, 27/11 (36ª, Decisão C, A4), pelo princípio 3
- Onde: `docs/regras/vendas-financeiro.md:1816`, `:3204`
- Antes: KD-53, KF-84

**FN-10.** O Financeiro da rede também tem os números de A receber e de A pagar, e as listas da rede e da unidade têm a coluna Cliente (sem cliente, "—"), com o nome mesmo quando a cliente foi cadastrada em outra unidade. Com uma unidade filtrada, os números são os dela.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:1820`
- Antes: KD-54

**FN-11.** O cartão "A receber · em aberto" (o Heitor, 25/11: "O cartão vira 'A receber · em aberto' e soma tudo"; era "A receber da cliente") mostra no número grande todo o em aberto, de qualquer vencimento, nas unidades ao alcance, inclusive o que não é de cliente nenhuma (a nota diz "Inclui sem cliente: R$ …"), e a nota diz "Vence no período: R$ …", com o link "Ver e receber", que abre a aba A receber. O cartão "A pagar · vence no período" diz o recorte no título e conta pelo vencimento, até o fim do período; com zero, mostra o próximo vencimento depois do período ("Próximo: R$ 300,00 em 05/11"); embaixo, "Em aberto, de qualquer vencimento: R$ 5.200,00", com o "Ver e pagar", que abre a aba A pagar. O "pelo vencimento, no período" e o resto da conta moram na dica do cartão (a explicação mora na dica). Para quem não pode dar baixa, o link é "Ver a lista", e a faixa diz de quem é a baixa.
- Fonte: princípio 3; a explicação na dica: o Heitor, 2026-11-16: "pode tirar esse monte de aviso e explicação, se quiser manter bota em um tooltipzinho que só aparece se passar o mouse em cima. Aproveita e faz esse ajuste pra todo sistema."
- Onde: `docs/regras/vendas-financeiro.md:436-438`, `:478`, `:1903-1908` (o título do a pagar: A6 de 25/11, decisão do Claude), `:1951-1965`; `docs/regras/design.md:215`; `apps/web/components/shared/nota-do-vencimento.tsx`; `apps/web/lib/financeiro/abas.ts:86`, `:93`
- Antes: KA-57, KD-56, KD-57, KD-55

**FN-12.** O cartão "Fluxo de caixa — próximos meses", nos dois Financeiros, mostra mês a mês o que vai entrar e o que vai sair, pelo vencimento: o que entra é o a receber das clientes somado ao que a operadora ainda vai depositar, empilhados; o que sai são as despesas a pagar. Há gráfico de barras e tabela com o saldo de cada mês; o que já venceu e continua em aberto conta no mês atual; o a receber sem vencimento, no mês em que foi criado (FN-09); na rede, o filtro de unidade troca o gráfico; o atendimento concluído sem pagamento não entra, porque não tem vencimento. No próprio cartão, a rede escolhe ver 3, 6 ou 12 meses (6 é o padrão, e o título acompanha).
- Fonte: o Heitor, 2026-11-03: "crie o gráfico"; o sem vencimento: decisão do Claude, 27/11 (36ª, Decisão C), pela FN-09 (é o que `metrics_fluxo_de_caixa` faz)
- Onde: `docs/regras/vendas-financeiro.md:1848`, `:1850`
- Antes: KD-58, KD-59

**FN-13.** O total da lista vem com sinal e se chama "caixa da lista", não resultado ("14 lançamentos · caixa da lista −R$ 1.929,00"). Ele conta o dinheiro de verdade: entra o pagamento, pelo valor que entrou, e o estorno, com o sinal dele; não entram o que está em aberto, o uso do crédito interno (e o estorno dele) e o que foi pago todo em pontos. A lista de um dia soma o mesmo saldo do Fechamento daquele dia. A dica do Lucro do período explica a diferença: "É o resultado do período: a receita e a despesa pelo que foi pago; o insumo quando é usado; o custo do produto quando ele é vendido, mesmo a receber; a comissão quando é lançada. O total da lista de lançamentos é o caixa." — sem a palavra "competência" —, e, com despesa em aberto vencendo no período, a tela diz "A pagar no período, fora do resultado: R$ …".
- Fonte: princípio 3 (a frase sem "competência": D4 da 10ª simulação — a regra é a despesa PAGA, como a receita); a explicação na dica: o Heitor, 2026-11-16 (ver a FN-11)
- Onde: `docs/regras/vendas-financeiro.md:1864`, `:1871`, `:1881`; `docs/regras/indicadores.md:353-361`; `apps/web/components/shared/conta-do-resultado.tsx:34-38`
- Antes: KD-60, KD-61

**FN-14.** A descrição do lançamento é para pessoas, porque chega à cliente: nunca leva texto interno da tela (o plano grava "Plano de tratamento — entrada", e o mesmo nome com o número de cada parcela), e o lançamento do atendimento mostra o nome do procedimento ("Preenchimento labial", "Limpeza de pele — saldo") no lugar de "Atendimento concluído", nas Movimentações dos dois Financeiros, no CSV e nas parcelas a receber da operadora.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:2040`, `:2602`, `:3210`
- Antes: KE-12, KF-20

### O lançamento manual e a despesa

**FN-15.** O lançamento manual pago tem "Data do pagamento": hoje por padrão, nunca no futuro; o pagamento de um dia anterior conta no caixa daquele dia.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:2075`
- Antes: KE-14

**FN-16.** A despesa não tem desconto: o campo "Desconto" só aparece na receita, e na despesa o campo se chama "Valor". As categorias da despesa são uma lista só (a mesma na tela e no Copilot), na ordem do uso: "Compra de estoque", "Salários", "Aluguel", "Contas (energia, água, internet)", "Marketing", "Material de consumo (limpeza, copa)", "Manutenção", "Equipamentos", "Fornecedores", "Material de escritório" e, por último, "Outro". Todas contam como despesa operacional (no caixa e no lucro), menos a "Compra de estoque", que fica fora do lucro.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:2081`, `:2085`
- Antes: KE-15, KE-16

**FN-17.** O "Novo lançamento" pede o Fornecedor (na despesa) e a Nota fiscal. A despesa não segue o limite do crediário: parcelada e recorrente vão de 2 vezes para cima; acima de 48 parcelas ou de 60 repetições a tela avisa ("Acima do comum (…). Confira: o valor vale como está.") e o valor vale (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."). Só o impossível é recusado: menos de 2, fração e a última data a mais de 100 anos (cada vez é um lançamento com a sua data: 1.200 parcelas mensais; as repetições pela frequência, 5.214 semanais a 100 anuais — decisão do Claude, 25/11). As duas pedem um vencimento só (o da 1ª parcela, ou o do primeiro lançamento). O "Pagar despesa" sempre abre a janela: na despesa sem forma, o campo começa vazio, é obrigatório e oferece o Boleto; na que já tem forma, a forma lançada vem escolhida, e quem paga confirma ou troca, como na baixa da receita. A janela diz quanto e, quando a despesa diz, a quem.
- Fonte: decisão do Claude (a despesa com forma também abre a janela: A13 da 26ª, princípio 3 — revê a da 9ª, que pagava direto)
- Onde: `docs/regras/vendas-financeiro.md:1957`, `:2138`, `:2145`, `:2205-2213`, `:2634`
- Antes: KE-03, KE-18, KF-07, KE-20

**FN-18.** A despesa recorrente guarda em cada lançamento a forma de pagamento escolhida, como a parcelada já guardava.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:2140`
- Antes: KE-19

**FN-19.** O valor do lançamento não tem teto de "comum": recusa-se só o zero e o que o registro não guarda — acima de R$ 99.999.999,99 ("No máximo 99.999.999,99 reais (o limite do registro)."), conferido no servidor no lançamento único, em cada parcela da despesa parcelada (o total pode passar, dividido) e em cada repetição da recorrente; o Copilot recusa o mesmo.
- Fonte: o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; e, 19/11: "Qualquer gravação que não passa pela validação do backend ta errada"; o limite (o tipo da coluna, numeric(10,2)) é decisão do Claude, 25/11
- Onde: `docs/regras/vendas-financeiro.md` ("O valor do lançamento até o que o registro guarda"); `apps/web/lib/financeiro/limites-do-registro.ts`
- Antes: o erro do banco, em inglês ("numeric field overflow")

**FN-20.** O "Pagar" da conta a pagar paga o valor inteiro, na forma escolhida: não há baixa parcial da despesa. Quem paga só uma parte remarca o vencimento ou divide a conta à mão. (O pagamento em parte das comissões é outra coisa, por linha: CF-13; a parcela do crediário recebida em parte é a CR-08.)
- Fonte: decisão do Claude, 26/11 (34ª, Decisão D) — pagar parte da conta é recurso novo (a sugestão nº 110), não correção
- Onde: `docs/regras/vendas-financeiro.md` (o Financeiro, a baixa); `docs/sugestoes-de-funcionalidades.md` (nº 110)
- Antes: (sem número: Fausto, Time D da 34ª, material descartável)

## O CSV e o recibo (CS)

**CS-01.** "Exportar CSV", na lista de Movimentações dos Financeiros da unidade e da rede, baixa tudo o que a lista tem com os filtros da tela, não só as linhas que a tabela desenha. As colunas são Data, Descrição, Cliente, Unidade, Categoria, Tipo, Forma, Situação e Valor, com sinal (a despesa e o estorno saem negativos).
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1945`
- Antes: KE-01

**CS-02.** O CSV dá à contabilidade o que ela precisa para fechar o mês: a Taxa da maquininha e o Líquido da receita paga (os mesmos da conta do resultado, sem conta própria da tela), o Vencimento, o Pago em, o Fornecedor e a Nota fiscal (os dois "se informado"). O sistema não calcula competência: o CSV traz o vencimento e o dia do pagamento, e a contabilidade monta a dela.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:1954`, `:1960`, `:1994`, `:3248`
- Antes: KE-02, KF-88

**CS-03.** O CSV tem a coluna "Conta no caixa" (Sim/Não), logo depois do Valor: somar só as linhas "Sim" dá o caixa do período (o pagamento estornado em parte entra pelo valor que entrou, e o estorno entra negativo; a taxa e o líquido seguem a mesma conta). Tem também a Unidade (sempre, também na rede de uma unidade só), o Profissional (quem atendeu; na venda, quem vendeu), a Bandeira do cartão, o Desconto em reais (o desconto de uma venda sai uma vez só, não em cada parcela) e a coluna "Pago com pontos/voucher" logo depois do Desconto, porque o pago com pontos não é desconto; a coluna da maquininha se chama "Maquininha ou forma", porque dinheiro e Pix não têm maquininha.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:391-392`, `:411-412`, `:1979`, `:1987`, `:3258`
- Antes: KE-04, KE-05, KF-43, KA-55

**CS-04.** O CSV do fechamento do dia se baixa pelo Financeiro, nos dois portais: o botão "CSV do fechamento do dia", ao lado do "Exportar CSV", pede o Dia (e a Unidade, quando há mais de uma) e traz as formas, o total, o esperado em espécie, os estornos, o "Cartão por bandeira" e a "Taxa e líquido por maquininha (estimados)", com o Pix numa linha própria. Baixa quem tem o Financeiro em Ver, nas unidades ao alcance; o Fechamento do dia tem um link para ele, e na rede sem unidade escolhida o arquivo traz um bloco por unidade ao alcance.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Blz pode ser assim"
- Onde: `docs/regras/vendas-financeiro.md:463-468`, `:1968`, `:1998`, `:2278`; `docs/revisao.md:611`, `:1997`
- Antes: KE-06, KA-53

**CS-05.** Todo pagamento de receita pago e não estornado tem "Recibo" em PDF (abrir, imprimir ou baixar): na lista do Financeiro (unidade e rede), na aba Financeiro da ficha (a quem vê o Financeiro ou recebe), na tela do atendimento pago (a quem recebe), e no Financeiro e no Histórico → Pagamentos do app (que diz "Estornado" no estornado). O a receber e o estornado não têm recibo. Da equipe, abre quem recebe ou vê o Financeiro da unidade, com a unidade ao alcance; a cliente, só os pagamentos dela.
- Fonte: o Heitor, 2026-11-02: "um recibo simples em PDF, pelo app ou impresso"
- Onde: `docs/regras/vendas-financeiro.md:3094`, `:3097`, `:3103`
- Antes: KF-79, KF-80

**CS-06.** O recibo diz o número, quem pagou (com o CPF, ou o passaporte/RNE), a quantia, o referente, a forma, quando, o desconto e o motivo quando há, e o "Emitente" — a rede e a unidade que receberam (CNPJ, endereço, telefone) —, e avisa que não substitui a nota fiscal ("Este recibo não substitui a nota fiscal."). A seção se chama "Emitente", não "Quem recebeu": no Fechamento do dia, "Quem recebeu" é a pessoa que deu a baixa. No atendimento, o referente é o procedimento, o dia, a hora e quem atendeu; no crédito em N vezes, as parcelas no cartão ("Parcelas no cartão: 2x de R$ 550,00").
- Fonte: decisão do Claude; o nome "Emitente": decisão do Claude, 25/11, pelo princípio 3 (o mesmo nome não diz duas coisas)
- Onde: `docs/regras/vendas-financeiro.md:3194-3204`
- Antes: KF-81

## Os pagamentos no app da cliente (AC)

**AC-01.** No app, o Financeiro e o Histórico → Pagamentos mostram também o que está "A pagar na unidade" (o atendimento concluído e não pago), e a parcela pendente diz qual é (parcela 2 de 3) e quando vence. A ordem é uma só: o pendente primeiro, pela próxima a vencer; o resto pelo dia do pagamento, do mais recente.
- Fonte: princípio 3
- Onde: `docs/regras/vendas-financeiro.md:865-868`, `:3079`, `:3085`
- Antes: KB-44, KF-82, KF-83

**AC-02.** O app diz o que aconteceu com o dinheiro de um pacote cancelado: em Histórico → Pagamentos e no Financeiro, o pagamento do pacote diz "Pacote cancelado em 04/11/2026", e o estorno devolvido a ela aparece como saída ("− R$ 600,00 · Estorno").
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:858-865`
- Antes: KB-43

**AC-03.** No app, a cliente vê "Crédito em <o nome da rede>" (no Financeiro e no Início) só quando o saldo é maior que zero, e só o saldo: os lançamentos do crédito ficam com a equipe. É o saldo da ficha da rede do endereço.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele); o nome da rede: recomendação do Claude aprovada pelo Heitor, 13/11: "Concordo" (CA1, `docs/revisao.md:1498-1502`)
- Onde: `docs/regras/vendas-financeiro.md:3067`; `apps/web/app/[slug]/cliente/home/page.tsx:348-354`; `apps/web/lib/clientes/fala-da-rede.ts`
- Antes: KF-50

**AC-04.** Ao agendar pelo app, a cliente usa o que já pagou: a sessão livre de um plano vendido ou, sem ela, o crédito de pacote ou de pré-pago (o preço e a duração vêm da sessão). Se outra pessoa usou o crédito ao mesmo tempo, o agendamento fica avulso.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:2831`
- Antes: KF-59

**AC-05.** No Confirmar do app, o que já está pago diz de onde: "Incluído no pacote X (sessão 2 de 3)", parte do plano de tratamento (sessão n de t) ou incluído no pré-pago (sessão n de m); a lista de procedimentos diz "Incluído" no lugar do preço.
- Fonte: decisão do Claude
- Onde: `docs/regras/vendas-financeiro.md:2844`
- Antes: KF-60

## Perguntas ao Heitor

Revisão de 25/11 (o Heitor, 24/11: "Em teoria não é pra ter pergunta de regra e de escopo, as regras já foram definidas e o escopo também."): a Q04, que ficava, foi decidida pelo Claude — é de escopo, e vai à lista de sugestões; o Heitor revisa. Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Ficava na página só a Q04 (vender o pacote pela internet está no escopo?). E a pergunta da página sobre o atendimento que gerou o plano (DP-04) se resolveu pela sua fala de 13/11 ("Tudo que for uma venda gera uma comanda", PV-06, mais nova que a DP-04 de 20/10): cada um na sua comanda; o pagamento do plano cobrar o atendimento junto é defeito a corrigir. As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Vendas, pacotes e pré-pago — escritas como decisão sua, sem a sua fala: confirma?** VD-04 (sem ficha, primeiro o cadastro: o "Vender" abre o cadastro e leva ao PDV, "decisão do Heitor, 2026-09-30", `docs/regras/vendas-financeiro.md:687-690`); VD-08 (desconto em toda venda, em R$ ou %, sem teto, com quem deu, 2026-09-30, `:2899`); PA-15 (o "Abater do pacote": o pacote vendido depois paga o avulso já concluído, simulação de 28/10, `:738-740`); PP-01 (o pré-pago é uma venda separada do pacote — "o Heitor recusou reaproveitar `client_packages`", `:1043-1045`, `:3206`).

Q02. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Plano e estorno — escritas como decisão sua, sem a sua fala: confirma?** DP-04 (o atendimento que gerou o plano entra no pagamento do plano, 2026-10-20, `docs/regras/vendas-financeiro.md:2738`) — e, com "uma venda, uma comanda" (PV-06), o atendimento avulso tem a comanda dele: ele ainda entra junto no pagamento do plano, ou cada um se recebe na sua comanda?; DP-05 (o pagamento do plano sugere o pacote equivalente e "Fechar como pacote" vira desconto, 2026-10-21, `:2813`); EX-08 (o estorno pela lista reabre o a receber do pacote, plano ou pré-pago, H2 do levantamento das regras, 2026-11-11, opção a, `:3121`); EX-09 (o estorno reabre a cobrança do atendimento avulso, D6 da simulação de 2026-10-28, `:3147`).

Q03. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Financeiro e app — escritas como decisão sua, sem a sua fala: confirma?** CR-05 (cada parcela é um lançamento, com o seu vencimento, "pedido do Heitor, 2026-09-30", `docs/regras/vendas-financeiro.md:1803`); FN-10 (o Financeiro da rede com A receber e A pagar, e a coluna Cliente nas listas, "2026-10-21, decisão do Heitor", `:1820-1821`); FN-15 (o lançamento manual pago tem a data do pagamento, "2026-10-21, decisão do Heitor", `:2075`); FN-18 (a despesa recorrente guarda a forma, D11 do levantamento das regras, 2026-11-11, `:2140`); AC-03 (o "Seu crédito" no app, só com saldo, D-17 de 2026-10-30, `:3067`); AC-04 (o app usa o que a cliente já pagou ao agendar, 2026-10-21, `:2831`).

Q04. **Decidida pelo Claude, 25/11 (o Heitor revisa):** É escopo, e nenhuma regra pede: hoje o pacote se vende só pelo PDV (PA-06), e a fala ("normalmente isso aí vai ser vendido até online", "e um dia online") fala do futuro. Fica como está, e a venda do pacote pelo app vai à lista de sugestões. — *Era:* **Está no escopo? A venda do pacote pela internet.** Você disse "normalmente isso aí vai ser vendido até online" (`docs/revisao.md:581-583`, resumido em `:595` como "e um dia online"). Hoje o pacote só se vende pelo PDV (PA-06).

## Divergências

O texto de `docs/regras/` (ou da própria revisão) contra a decisão mais nova — para corrigir o texto depois.

- PV-04 (resolvida no código: `podeReceber` é só o PDV em Gerenciar, `apps/web/lib/auth.ts:387-389`; a baixa no Financeiro é a exceção do CX2, FN-06) — era: (o CÓDIGO contra a regra): `apps/web/lib/auth.ts:378-379` (`podeReceber`) deixa receber quem tem o PDV OU o Financeiro em Gerenciar, e o resumo do cargo diz "vender é de quem tem o PDV (ou o Financeiro em Gerenciar)"; a decisão de 23/11 (`docs/revisao.md:1309-1330`, "concordo, pode anotar, marcar as questões e ajustar o codigo") diz "cada passo pertence a UM módulo, e nenhuma ação pede dois" e "PDV: receber, a comanda". Pela regra, receber é só do PDV: é defeito a corrigir no código (com o teste), não pergunta. (O condensador tinha lido o "nenhuma ação pede dois" como "não pede os dois ao mesmo tempo" e escrito a regra pelo código — corrigido pelo Claude.)
- PV-04 (pergunta removida): o rascunho perguntava se quem tem o Financeiro em Gerenciar e não tem o PDV ainda recebe, porque o "cada passo, um módulo" (`docs/revisao.md:1309-1317`, 23/11) diz "PDV: receber, a comanda" e "nenhuma ação pede dois". A regra do sistema responde: CLAUDE.md §11 diz "receber é do PDV (`podeReceber`)", e `podeReceber` (`apps/web/lib/auth.ts:378-379`) é o PDV em Gerenciar OU o Financeiro em Gerenciar — nenhuma ação pede os dois juntos. A baixa no Financeiro com o mesmo "ou" foi aprovada pelo Heitor em 13/11 (CX2, `docs/revisao.md:1993`, "Blz pode ser assim"). O texto da revisão devia dizer que "receber é do PDV" é o `podeReceber`.
- PA-08 (pergunta removida): `docs/revisao.md:1816-1818` (14/11) e `:1939` dizem que a venda do pacote "NÃO espera a assinatura (princípios 2 e 6 — o 'assinatura antes do dinheiro' foi dito do plano)" — leitura do Claude. `docs/regras/vendas-financeiro.md:574-581` (auditoria das regras de 18/11, mais nova) aplica a fala do Heitor no PC2 (13/11: "o ideal era funcionar como no plano de tratamento") e a do plano ("primeiro colhe assinatura, depois paga"): o contrato de pacote se assina antes do dinheiro. Não são duas decisões dele que se contradizem; vale a de 18/11, e o "não espera" só continua certo para os termos e os outros documentos (PA-10). A frase da revisão fica velha.
- PA-04 (pergunta removida): a validade em dias e o "À venda" (PC3, PC4) estão em `docs/revisao.md:289-292` na tabela "O sistema faz e não está na lista do Heitor (ele decide se fica)", com "**Decidido:** ok, mantém" — é a resposta dele à pergunta da revisão, não uma regra sem fonte.
- CI-10, AC-03 (resolvida: o app diz "Crédito em <o nome da rede>", `apps/web/lib/clientes/fala-da-rede.ts`; o texto das duas regras mudou em 25/11) — era: a CA1 que o Heitor aprovou ("Concordo", `docs/revisao.md:1498-1502`) dizia usar o NOME da rede no app ("Crédito na Estética Bella"); o que se fez em 16/11 foi "Seu crédito" (`docs/revisao.md:2147`). É a mesma pergunta já feita no catálogo de Clientes — ver Q06 / PO-07 de `docs/catalogo/crm-inbox.md`; não se repete aqui.
- MQ-17 (pergunta removida): `docs/regras/vendas-financeiro.md:2442-2448` mostra, no campo da bandeira das telas de cobrança (o PDV também), "Taxa da maquininha no débito: 1,6% … a rede recebe R$ 186,96", e `:2464-2465` e `:2653` "o aviso da taxa" nas vezes do crédito, sem dizer para quem. A regra aprovada pelo Heitor (CX6, 13/11, "Blz pode ser assim", `docs/revisao.md:1997`) e `:1008-1026` / `:2249-2250` / `:2285-2286` respondem: a taxa e o líquido só aparecem a quem tem o Financeiro em Ver; quem só recebe vê o aviso sem valor. Os trechos de `:2442-2448`, `:2464-2465` e `:2653` deviam dizer isso.
- MQ-01 (pergunta removida): `docs/regras/vendas-financeiro.md:2172` escreve "Cartão de crédito em N vezes é PAGO na hora PELA CLIENTE" como "decisão do Heitor, 2026-10-20", sem a fala; a regra fica com a fala dele de 01/11 ("no financeiro mês a mês, como a receber" e "conta no mês do dia da venda", `:2179`, `:2502`) e com o princípio 5.
- MQ-12 (pergunta removida): `docs/regras/vendas-financeiro.md:2400-2402` atribui o Automático do "Parcelar no crédito até" à F18 e à D9 do Heitor (11/11), sem a fala; a fala dele de 29/10 ("A clínica configura 'parcela até Nx'…", `:2607`) já cobre o limite, e `:2613` diz o que vale vazio.
- FN-11: `docs/regras/vendas-financeiro.md:413-414` (A9 da 22ª) diz que o cartão é "A receber da cliente · vence no período" e que o número é o que vence no período; `:436-438` (A17 da 23ª, 17/11, mais nova) voltou para "A receber da cliente · em aberto" ("Era o A9 da 22ª"). O item da 22ª precisa sair ou ser riscado. E `:1833-1846` (27/10 e a D-14 de 29/10, esta "decisão do Heitor" sem a fala) ainda descreve o cartão do A receber "pelo vencimento, no período", com o em aberto embaixo; desde a 23ª o em aberto é o número grande, e só o A pagar conta pelo vencimento.
- CS-05 (pergunta removida): `docs/regras/vendas-financeiro.md:3097` atribui o recibo na ficha, no Histórico do app e no atendimento pago a "r2-ven-13, o Heitor, 2026-11-03", sem a fala; a fala dele de 02/11 ("um recibo simples em PDF, pelo app ou impresso", `:3094`) já pede o recibo no app e impresso.
- PA-13, PA-21: `docs/regras/vendas-financeiro.md:707` e `:833-834` não dizem quem muda "Pacote com valor em aberto" e "Pacote vencido"; elas ficam em Configurações → Geral, os dados da rede, e a action (`atualizarDadosDaRede`, `apps/web/actions/rede.ts:86-89`) recusa quem não é a Admin da rede (`recusaDaConfigDaRede`), pela regra de 18/11 ("Configuração da rede toda só pela conta admin", CLAUDE.md §11). É decisão do Claude pela regra do Heitor; o texto devia dizer.
- PA-14: `docs/regras/vendas-financeiro.md:699` diz "O a receber se quita no financeiro, como qualquer conta a receber"; `docs/revisao.md:1992` (CX1) decidiu que o PDV recebe a parcela do crediário ("abrir a cliente no PDV mostra as parcelas em aberto dela, e recebe-se ali"), e o próprio `:729-732` já leva ao "Receber no PDV".
- PA-02: `docs/regras/vendas-financeiro.md:560-561`, `docs/revisao.md:298` e `:1942` dizem que o pacote fica em "Vendas → Pacotes"; o grupo do menu passou a se chamar Comercial em 2026-11-17 (`docs/regras/vendas-financeiro.md:627`, `:640-642`, o Heitor: "opcao 2").
- PP-01 a PP-04, AC-05: `docs/regras/vendas-financeiro.md:1047-1137` e `:2844` chamam de "unidade" a sessão do pré-pago ("as unidades", "Cancelar a unidade", "a unidade pré-paga", "unidade n de m"); `:1111-1112` (A6 da 25ª) decidiu que é "sessão", porque "unidade" é a unidade da rede (CLAUDE.md §1). O mesmo vale para "unidade pré-paga" em `:1488` (EX-01) e para o AT-21 do catálogo do Atendimento.
- PR-02: `docs/regras/vendas-financeiro.md:1147` diz "Só produto de REVENDA (ou 'os dois', `products.uso`)"; `docs/revisao.md:137` e `:1912` (E2) decidiram a caixa de marcar — Insumo e Venda direta.
- (sem número; AT-21 do catálogo do Atendimento): `docs/regras/vendas-financeiro.md:1102-1103` diz "Falta ou cancelamento do agendamento DEVOLVE a unidade" sem exceção; o Heitor, 2026-11-18 (AT-21), decidiu que o atendimento INICIADO e cancelado gasta a sessão; só o cancelamento antes de iniciar e a falta devolvem.
- FN-01: `docs/regras/vendas-financeiro.md:1395` atribui ao Heitor, entre aspas, "Nada de recurso novo: o que já existe, organizado pelas cinco perguntas de quem cuida do dinheiro"; em `docs/revisao.md:2002` esse é o texto do plano. A fala do Heitor está em `docs/revisao.md:640`: "Blz pode manter e anotar no plano como voce sugeriu".
- PV-04: `docs/regras/vendas-financeiro.md:1471` diz que "o check-in do plano recebe" com `podeReceber`; `docs/revisao.md:2074` (PT1e) decidiu "A sessão não cobra nada; a parcela com a clínica que venceu aparece no PDV (CX)".
- FN-06: `docs/regras/vendas-financeiro.md:1902` diz que a faixa mostra "Dar baixa é de quem tem o PDV no cargo."; o CX2 (`docs/revisao.md:1993`, aprovado em 13/11, e `docs/regras/vendas-financeiro.md:1474-1483`) deu a baixa a quem tem o PDV OU o Financeiro em Gerenciar.
- DP-02, DP-03 a DP-07: `docs/regras/vendas-financeiro.md:1463-1470`, `:2738`, `:2765`, `:2790`, `:2813` falam do "checkout do plano" como uma transação que grava, junto, o desconto, os lançamentos, os agendamentos, as sessões e o aceite; `docs/revisao.md:2070-2072` (PT1a–PT1c) e `:1978` (PDV4 revisto) tiraram o "Fechar checkout": o aceite é sem dinheiro, o contrato e o pagamento andam juntos no PDV, e as sessões se agendam depois. O mesmo em `:562-563` ("se fecha no checkout do plano"; ver PL-07 do catálogo do Atendimento).
- (sem número; AT-11 do catálogo do Atendimento): `docs/regras/vendas-financeiro.md:1802` diz "`FinancialTransaction` criada automaticamente ao concluir `Appointment`"; `docs/revisao.md:1977` (PDV3) e `:1994` (CX3) decidiram que a comanda nasce ao iniciar o atendimento e que o concluído sem pagamento é comanda aberta do PDV; o próprio texto, em `:1765` e `:1862`, diz que esse concluído está "sem lançamento".
- (sem número; AT-11): `docs/regras/vendas-financeiro.md:1726-1728` atribui ao Heitor ("a revisão do Heitor de 2026-11-13"), entre aspas, o texto do CX3 e do PDV7; esse texto é do plano (`docs/revisao.md:1994`, `:1981`), e a aprovação do Heitor é "Blz pode ser assim" (`docs/revisao.md:611`).
- CR-10: `docs/regras/vendas-financeiro.md:1930-1933` diz que o aviso do check-in manda "receba no Financeiro." e que "A cobrança no check-in continua só a do plano"; `docs/revisao.md:1992` (CX1) decidiu que a parcela que a cliente veio pagar se recebe no PDV, e `:2074` (PT1e) que a sessão não cobra nada. Os outros textos já dizem "receba no PDV" desde 16/11 (`docs/regras/vendas-financeiro.md:2880`).
- CS-04: `docs/regras/vendas-financeiro.md:2284` diz que a parte "Taxa e líquido por maquininha" do CSV sai "Só a quem vê o financeiro da rede (`veComissaoDeTodos`)"; `:1972` diz que quem tem o Financeiro em Ver baixa o CSV, e a regra de 23/11 (não existe "só os meus": quem tem Ver vê tudo, dentro da abrangência) não deixa uma parte do mesmo CSV mais restrita.
- FP-04: `docs/regras/vendas-financeiro.md:2132` lista as formas sem o Crediário; `docs/revisao.md:1982` (PDV8) decidiu "O **Crediário** é uma das formas, ao lado de Pix, Dinheiro, Débito, Crédito e Crédito na rede".
- FP-01, CR-01: `docs/regras/vendas-financeiro.md:2157` diz "O "a receber" e o crediário sem entrada não têm forma agora", e `:2577` "(`pagamento.metodo` é o da entrada; sem entrada, vazio)"; `docs/revisao.md:1982` (PDV8) decidiu que o vazio nos documentos sai e "passa a dizer 'Crediário'", e que a venda fica registrada como Crediário (a própria `vendas-financeiro.md:225` já diz "o `pagamento.metodo` nunca fica vazio").
- FP-02: `docs/regras/vendas-financeiro.md:2152`, `:2236`, `:2451` e `:2564-2567` ainda contam como portas de cobrança "o "Receber" do plano no check-in", "o checkout do plano" e "o pagamento do atendimento avulso"; `docs/revisao.md:1975` (PDV1) decidiu "Todo pagamento de venda passa por ele", `:1978` (PDV4) "Sai o "Fechar checkout"", e `:2074` (PT1e) "A sessão não cobra nada".
- FP-02: `docs/regras/vendas-financeiro.md:2163` põe o "Pagar" da receita "nos dois financeiros e na ficha"; `docs/revisao.md:1987` decidiu "o que a cliente paga na frente de quem está no balcão passa pelo PDV; o resto é do Financeiro", e `:1992` (CX1) que a parcela do crediário se recebe no PDV.
- EX-02: `docs/regras/vendas-financeiro.md:3020` dá à parcela em aberto um "Receber" na aba Financeiro da ficha; `docs/revisao.md:1992` (CX1) decidiu que "abrir a cliente no PDV mostra as parcelas em aberto dela, e recebe-se ali", e `:1994` (CX3) que "a ficha mostra só o resumo das comandas abertas".
- MQ-02, MQ-06: `docs/regras/vendas-financeiro.md:2194-2198` diz que o prazo N "é da rede: Configurações → Comissões → "Prazo da operadora (dias)""; `:2265` (D8, o Heitor, 11/11) decidiu que o prazo é de cada maquininha.
- MQ-09, MQ-10: `docs/regras/vendas-financeiro.md:2299-2306` descreve o seletor "Bandeira (Regra geral, Visa, …)" e a "REGRA GERAL", e `:2443-2444` e `:2686` dizem que, sem bandeira, "vale a regra geral"; `:2203-2205` e `:2267` (D8, 11/11) decidiram que a regra geral é a taxa da maquininha e que a bandeira mora dentro dela.
- MQ-08: `docs/regras/vendas-financeiro.md:2325-2330` (a linha sem taxa "aparece em destaque de aviso — "Sem taxa…"") e `:2404-2405` ("as vazias com o aviso "Sem taxa"") contrariam `:2291` (o Heitor, 11/11: "o aviso sem taxa acho que nem precisa na verdade").
- MQ-08: `docs/regras/vendas-financeiro.md:2405-2409` põe a taxa do Pix "na regra geral" (com a nota "o Pix, só se a sua operadora cobrar"); `:2288` (o Heitor, 11/11) decidiu que o Pix tem um campo próprio, fora das maquininhas, com o padrão 0%.
- MQ-05, FC-14: `docs/regras/vendas-financeiro.md:2534-2536` diz "o aviso do Fechamento diz "R$ X líquido"" (o que a operadora vai depositar); `docs/revisao.md:1997` (CX6) mandou isso para o Financeiro, e `:1996` (CX5) deixou no Fechamento os avisos de "há comanda aberta" e "entrou dinheiro depois do fechamento".
- DP-06: `docs/regras/vendas-financeiro.md:2649` diz que a regra do crediário vale também para "a caixa do plano no atendimento"; `docs/revisao.md:533` decidiu "O pagamento acontece só pelo PDV", e `:1981` (PDV7) tirou "a janela de pagamento da tela do atendimento".
- DP-04 (resolvida: o pagamento do plano cobra só o plano, `docs/regras/vendas-financeiro.md:2807-2815`; o texto da regra mudou em 25/11) — era: `docs/regras/vendas-financeiro.md:2754` manda "receba pela tela do atendimento"; `docs/revisao.md:1981` (PDV7) tirou o pagamento da tela do atendimento — o atendimento se recebe na comanda dele, no PDV.
- DP-06: `docs/regras/vendas-financeiro.md:2856` diz "O check-in só cobra o que VENCEU" e que a parcela que vence depois "se recebe no financeiro" (e o "O que nunca fazer" repete o check-in em `:3227` e `:3228`); `docs/revisao.md:2074` (PT1e) decidiu que a sessão não cobra nada e "a parcela com a clínica que venceu aparece no PDV", e `:1992` (CX1) que o PDV recebe a parcela do crediário.
- PV-16: `docs/regras/vendas-financeiro.md:3031` fala do aviso do "Vender" e diz que o recibo fica na ficha; `docs/revisao.md:566` (o Heitor, PDV-P3): "O vender da ficha sai…" e "Porque só vende pelo PDV." — o aviso vale para a venda no PDV.
- VD-06: `docs/regras/vendas-financeiro.md:2812` diz que "Quem vendeu" e "Profissional" seguem "nascendo vazios com mais de uma pessoa"; `:259` (o Heitor, r2-ven-12, auditoria de 18/11): "nasce sempre vazio".
- CI-10: `docs/revisao.md:1982` (PDV8, 13/11) lista a forma "Crédito na rede"; o Bloco Vocabulário (`docs/revisao.md:1895-1896`, 16/11) e `docs/regras/vendas-financeiro.md:213` dizem "Crédito interno".
- EX-01: `docs/regras/vendas-financeiro.md:1488` fala em "recorte por 'os meus'" como coisa que não se aplica; desde 23/11 o "só os meus" não existe (CLAUDE.md §11) — a frase pode sair.
- FC-14: `docs/regras/vendas-financeiro.md:1520` e `:1654` ainda descrevem os avisos da taxa como saídos do Fechamento; está certo, mas `docs/revisao.md:1997` chama o CSV de "planilha da contadora" — nome de cargo; devia dizer "para a contabilidade".
- PV-08: `docs/revisao.md:578-579` diz que "a comanda do plano aparece quando inicia o primeiro atendimento do plano"; `docs/revisao.md:1978` (PDV4 revisto) decidiu que a comanda do plano nasce no aceite (PL-07 do catálogo do Atendimento).
- PV-13: `docs/regras/vendas-financeiro.md:1739` lista na janela de pagamento do atendimento o "pacote" e "o combinado do contrato" como se ela ainda existisse; desde o PDV7 (`docs/revisao.md:1981`) a tela do atendimento não tem janela de pagamento.
- FN-05: `docs/regras/vendas-financeiro.md:2068` e `:2132` dizem que a recusa é "Seu cargo não libera esta ação."; desde a 15ª o "sem acesso" genérico é "Você não tem acesso a esta ação." (`apps/web/lib/erro-na-tela.ts:24`; `tests/defeitos-da-15.test.ts:152`) — o texto de `docs/regras/` ficou velho; mas `:1432` ainda manda "quem atende e não tem o Financeiro" às Minhas comissões sem a regra de 23/11 (as Minhas comissões também são de quem tem comissão no nome, CLAUDE.md §11).
- DP-08: `docs/revisao.md:2077` põe o cancelamento do plano por quem tem o Financeiro em Gerenciar no bloco do Plano de tratamento; a regra é desta área (o dinheiro do plano) e está em DP-08.
- (sem número; FI8): `docs/revisao.md:2014` registra a saída da política antiga do banco que abria o Financeiro de uma unidade a todo funcionário dela; é detalhe do banco, já coberto pela regra de que a sessão só lê sinais (CLAUDE.md §4).
- PA-09: `docs/regras/vendas-financeiro.md:320` diz "Só avisa: a venda segue (princípio 2)"; a PA-08 (o Heitor, 13/11: "o ideal era funcionar como no plano de tratamento") e `docs/regras/documentos.md:79-82` dizem que, com o contrato de pacote aberto (a assinar ou faltam dados), a venda não grava nada. O aviso de antes fica; o "a venda segue" está velho.
- DP-01 × `docs/regras/vendas-financeiro.md:2830-2832` (conferido em 25/11): o texto de lá diz que "agendar no checkout continua opcional"; a DP-01 vale — o "Receber o plano" é o único que monta o checkout, e o monta sem o passo de agendar (`apps/web/components/shared/pdv/receber-o-plano.tsx:51`, `podeAgendar={false}`). O texto de `docs/regras/` ficou velho (o "As sessões 2 e 3 ficam sem data" sobra no aviso do fim, DP-11).
- FN-13: `docs/regras/vendas-financeiro.md:1934-1936` ainda cita "É o resultado do período (competência)…"; a frase de hoje é a da D4 da 10ª (`docs/regras/indicadores.md:353-361`, `apps/web/components/shared/conta-do-resultado.tsx:34`).
- FN-11: `docs/regras/vendas-financeiro.md:1954` ainda chama o link de "Ver e dar baixa"; desde a A25 da 24ª é "Ver e receber" (`:478`; `apps/web/components/shared/nota-do-vencimento.tsx:72`).
- PV-04: `docs/regras/vendas-financeiro.md:1524-1526` diz que o check-in do plano recebe com `podeReceber` "(o PDV OU o Financeiro em Gerenciar)", e `:3071-3073` que a frase é "Quem recebe é quem tem o PDV ou o Financeiro em Gerenciar"; desde 24/11 `podeReceber` é só o PDV, e a frase é "Quem recebe é quem tem o PDV em Gerenciar" (`apps/web/lib/equipe/textos-de-quem-pode.ts:28`).
- PV-06: `docs/regras/vendas-financeiro.md:70-73` e o CP1 (`docs/revisao.md:1428-1429`) dizem que o Copilot vende e recebe pela comanda do PDV; as respostas do Heitor de 18/11 (`DEVLOG.md:2201`, sobre 17/11) dizem que ele só lê e manda ao PDV. Vale a mais nova (ver o catálogo do Copilot).
- FN-11 (texto): `docs/regras/vendas-financeiro.md:421-422` (A9 da 22ª) diz que o cartão é "A receber da cliente · vence no período"; o código diz "A receber da cliente · em aberto" (`apps/web/lib/financeiro/abas.ts:86`), com o "Vence no período" na nota, como a FN-11. "vence no período" é o título do A PAGAR (`:93`; `:1903-1908`, A6 de 25/11).

## Ficou fora do catálogo

Detalhe de tela ou implementação, sem decisão de produto.

- KB-26: na ficha, a primeira janela do pacote ("Abrir para ver e agendar as sessões") já lista as sessões, cada sessão livre com o seu "Agendar", e o "Gerenciar sessões" continua (arrumação da janela).
- KF-24: recarregar a página do pagamento do plano volta ao passo e ao pagamento escolhidos; fechar ou cancelar apaga a escolha (estado da tela).
- KF-66: no pagamento do plano e no atendimento, o CPF e o telefone aparecem com máscara, e o passaporte e o RNE como vieram (formato de exibição).

## É de outra área

- KD-44: o atendimento concluído que ainda não foi pago é uma comanda aberta do PDV (o avulso com preço), sem lista à parte de "Concluídos a receber" na agenda, no Fechamento ou na ficha — área: Atendimento (AT-11).
- KD-48: o atendimento de R$ 0 conclui sem cobrança ("Sem cobrança"), sem conta a receber de zero, e receber um assim é recusado — área: Atendimento (AT-12).
- KF-63: o atendimento concluído de R$ 0 não pede pagamento — área: Atendimento (AT-12).
- KG-35: o contrato de pacote é um modelo da rede, à parte do contrato de plano, preenchido com os procedimentos, as sessões e o pagamento; um só ativo por rede, e toda rede nasce com o padrão (o Heitor, 13/11; `docs/revisao.md:326-353`, `:1938`, `:2049`, `:2052`) — área: Documentos (PC9a).
- KG-36: ao criar o pacote, a janela puxa o termo de cada procedimento diferente e os outros documentos dos procedimentos (nunca o contrato do procedimento), e qualquer um pode ser excluído ali (o Heitor, 13/11; `docs/revisao.md:354-373`, `:1940`) — área: Documentos (PC9b/PC10).
- KF-89: o cartão das despesas do caixa se chama "Despesas pagas (caixa)" e inclui a compra de estoque e o pagamento das comissões (`docs/regras/vendas-financeiro.md:3249`) — área: Indicadores.
- A comanda do atendimento nasce ao iniciar; o que não tem o que cobrar não gera comanda (R$ 0, sessão de plano, sessão de pacote, pré-pago); a sessão de plano e a de pacote não se cobram e a parcela vencida aparece no PDV, `docs/regras/vendas-financeiro.md:28-35`, `:155-156`; `docs/revisao.md:1994`, `:2074` — área: Atendimento (AT-10, AT-11, AT-12, AT-13).
- Aceitar o plano (só "quero fazer"; quem aceita; a comanda do plano nasce no aceite com o valor inteiro; a cliente aceita pelo app, também com a proposta vencida; a equipe é avisada), o "Aceitar plano" na página do plano proposto, o plano se paga inteiro, `docs/regras/vendas-financeiro.md:117-154`, `:2725`, `:3242`; `docs/revisao.md:1978` — área: Atendimento (PL-07, PL-13).
- O contrato e o pagamento do plano andam juntos no PDV, sem o contrato assinado ou dispensado o PDV não recebe, e os gestos de quem recebe o plano pedem o PDV, `docs/regras/vendas-financeiro.md:162-172`; `docs/revisao.md:2072` — área: Atendimento (PL-14, PL-22).
- Os textos da fila do antigo checkout ("Planos propostos", "a cliente vai pensar"), o aviso das sessões do plano que ficam sem data, a dica do pacote equivalente no editor do plano, o plano proposto no app e a validade da proposta, e o aviso de plano × avulso do mesmo procedimento, `docs/regras/vendas-financeiro.md:206-208`, `:2772`, `:2822`, `:3034`, `:3048` — área: Atendimento (plano de tratamento, PL-23).
- O aceite do plano, as sessões e o seu agendamento gravados pelo antigo "checkout do plano", `docs/regras/vendas-financeiro.md:1463` — área: Atendimento (PL).
- O plano cancelado como retrato só de leitura no editor, e o plano ainda não aceito que se cancela sem dinheiro, `docs/regras/vendas-financeiro.md:917-934` — área: Atendimento (PL-15, PL-16).
- A sessão do plano fechado como crédito do agendamento, `docs/regras/vendas-financeiro.md:1062-1064` — área: Atendimento (PL-18).
- A falta ou o cancelamento do agendamento devolve a sessão do pré-pago, `docs/regras/vendas-financeiro.md:1102-1103` — área: Atendimento (AT-21; o texto diverge, ver Divergências).
- A sessão de pacote não emite documento no agendamento, o link único para todo envio de documentos, e a sessão de pacote se agenda pelo app, `docs/regras/vendas-financeiro.md:568-572`; `docs/revisao.md:458`, `:1941`, `:1958`, `:2149` — área: Atendimento (AG-34, AG-35, AG-49) e Documentos (PC10).
- O termo, o contrato do avulso e os "outros documentos" do procedimento (PC7/PC8), `docs/revisao.md:299-339`, `:1937` — área: Procedimentos (PC-07).
- A sala opcional ao agendar a 1ª sessão do pacote, `docs/regras/vendas-financeiro.md:953-954` — área: Atendimento (AG-46).
- O estoque no estorno da venda de produto (voltou: saldo e lotes, "Devolução de venda"; não voltou: perda "Venda estornada"), `docs/regras/vendas-financeiro.md:1208-1215` — área: Estoque (ES-28 do catálogo do Atendimento).
- Os pontos e o voucher na comanda do PDV, na comanda do plano e na Nova venda (só à vista, só o voucher de desconto, o ponto nasce do que foi pago e quando a comanda é paga), `docs/regras/vendas-financeiro.md:173-181`, `:476-490`; `docs/revisao.md:686-690`, `:2024-2026` — área: Fidelidade (PD-01, PD-04, PD-06, PD-07, GA-02).
- Estornado só o produto, o voucher segue usado na parte do atendimento, `docs/regras/vendas-financeiro.md:349-352` — área: Fidelidade (ES-05).
- Os pontos no cancelamento do pacote e da sessão do pré-pago seguem o estorno, `docs/regras/vendas-financeiro.md:851-852`, `:1125-1126` — área: Fidelidade (ES-03).
- O ajuste de pontos e a troca e entrega do voucher pela ficha da rede perguntam a unidade, `docs/regras/vendas-financeiro.md:670-672` — área: Fidelidade.
- Os pontos do pré-pago por procedimento, na proporção do pago, `docs/regras/vendas-financeiro.md:1134-1135` — área: Fidelidade (GA-04).
- Os pontos da venda de produto, o que a janela da venda e a da devolução dizem deles, `docs/regras/vendas-financeiro.md:1190-1195`, `:1263-1267` — área: Fidelidade (GA-08, GA-09).
- Os pontos da venda de crédito interno (na venda, pelo pago; o uso e o bônus não pontuam), `docs/regras/vendas-financeiro.md:1308-1310`, `:1354` — área: Fidelidade (GA-07).
- Desfazer o pagamento com voucher ou pontos faz o voucher voltar a valer e os pontos voltarem ao saldo, `docs/regras/vendas-financeiro.md:2015` — área: Fidelidade (o rótulo da linha no Financeiro está em EX-11).
- As comissões: a de venda do pacote e do plano e a de execução no cadastro do pacote (PC5), a parte da sessão como base, a do "Abater do pacote", a do cancelamento do pacote e do plano, as do pacote só a pagar com o pacote pago inteiro (H4), a do pacote trazido de fora, a do pré-pago e a das sessões usadas, a da venda de produto e a da devolução de parte, a de venda que nasce ao fechar o plano e a do plano sem "Quem vendeu", o crédito em N vezes como pagamento integral, a do crediário na última parcela, a taxa da maquininha no líquido da comissão (também acima de 100%, sem a taxa exata, com a bandeira trocada depois), o aviso da maquininha de fábrica, a página Financeiro → Comissões e as Minhas comissões, `docs/regras/vendas-financeiro.md:473-475`, `:563-566`, `:599-600`, `:748-751`, `:850-851`, `:909`, `:940-944`, `:983-988`, `:1099-1101`, `:1126-1127`, `:1176`, `:1254-1258`, `:1422`, `:1434`, `:1467`, `:2176`, `:2319`, `:2423`, `:2492`, `:2499`, `:2565`, `:2688`, `:2797`; `docs/revisao.md:293`, `:2012` — área: Comissões.
- Os números: o plano conta como venda quando é pago; nas Vendas o pacote e o plano cancelados valem o usado; a venda de produto na receita (caixa, faturamento, ticket médio) e o tipo Produto no relatório; a venda estornada e a devolução de parte nas Vendas e no lucro; o crédito interno fora de Relatórios → Vendas; o cartão "Despesas pagas (caixa)" e o DRE (e o "Exportar o DRE (CSV)" e a linha "Fora do resultado no período"); a ponte entre as Vendas e o caixa; o aviso de parcelas vencidas no dashboard; a aba Vendas dos Relatórios que lista as comandas (RL1), `docs/regras/vendas-financeiro.md:187-196`, `:852-853`, `:909-911`, `:1186-1189`, `:1216-1217`, `:1254-1258`, `:1304-1307`, `:1878`, `:1924`, `:1963`, `:1974`, `:2000`, `:2061`; `docs/revisao.md:1152-1154`, `:2099` — área: Indicadores.
- O "Vender" do inbox, com ou sem ficha, leva ao PDV e some no painel só de leitura, `docs/regras/vendas-financeiro.md:65-67`, `:675-686` — área: CRM e inbox (IN-17, CL-24; aqui fica só o "só se vende pelo PDV", VD-01).
- O "Vender" da busca leva ao PDV com a cliente escolhida (BU1), `docs/revisao.md:1560-1562`, `:2157` — área: Busca.
- O Copilot só lê e manda ao PDV: não vende, não recebe e não aceita o plano (as respostas do Heitor de 18/11, sobre 17/11, `DEVLOG.md:2201`, mais nova que o CP1 de 13/11, `docs/revisao.md:1428-1432`) — área: Copilot, `docs/catalogo/copilot.md`.
- O menu com Comercial e Marketing separados e os grupos da tela de Cargos, `docs/regras/vendas-financeiro.md:636-643` — área: Cargos e permissões.
- Cada categoria do menu recolhe pelo título, `docs/regras/vendas-financeiro.md:644-648` — área: Design.
- O pagamento de novo depois de um estorno não manda outra compra à Meta, `docs/regras/vendas-financeiro.md:3163` — área: Automações / integrações (Meta).
- Os membros da unidade incluem quem tem a unidade como uma das outras, `docs/regras/vendas-financeiro.md:3265` — área: Equipe / plataforma.
