# Inventário dos testes contra o catálogo de regras

Gerado em 24/11 a partir de `docs/catalogo/`. Nenhum teste foi mudado: isto é a lista do que o Heitor decide.
O Heitor, 19/11: "o teste só pode ser alterado se a regra foi alterada".

- Casos: **6290** (unidade/integração/tela/leitura do fonte: unidade 2823, tela 1732, leitura-do-fonte 932, integracao 803).
- Achados: ok 5742, sem-regra 360, contradiz 60, infra 50, duplica 43, fraco 35.
- Regras do catálogo: 1354; sem nenhum caso que as prove: **97**.
- O mapa inteiro, um caso por linha: [`mapa.tsv`](mapa.tsv).
- **O que cada achado pede** (defeito do código, catálogo atrasado, teste para o Heitor): [`leitura.md`](leitura.md).

## 1. Os testes que contradizem uma regra (`contradiz`)

O teste exige o contrário do que a regra diz hoje. Se a regra vale, o CÓDIGO e o teste mudam juntos — o teste só
muda com o "sim" do Heitor. Os `teto:` são recusas de um valor que a rede escolheu acima de um limite que nenhuma
regra põe (princípio 2: "no máximo, avisar").

| Caso | Regras | Camada | Nota |
|---|---|---|---|
| `e2e/atendimento-atritos-da-7.spec.ts:102` | atendimento:PL-10; atendimento:PL-05 | tela | Exige a tela dizer "vai pronto ao checkout do plano"; PL-07/PL-10: não há checkout do plano, ele se recebe na comanda do PDV. O "opcional" bate com PL-05 |
| `e2e/checkout-de-plano.spec.ts:310` | vendas-financeiro:PV-06; vendas-financeiro:DP-04 | tela | Exige que o pagamento do plano NÃO receba o atendimento que o gerou (só o plano é lançado). A DP-04 do catálogo diz "O pagamento do plano cobra também o atendimento que gerou o plano"; bate com a PV-06 e com a nota das Perguntas (24/11), que dá a DP-04 por vencida: é o catálogo que precisa tirar a DP-04. |
| `e2e/configuracoes-textos-e-estados-vazios.spec.ts:85` | plataforma:AS-15; plataforma:CU-02 | tela | AS-15: a aba Assinatura é só da Admin da rede; o teste exige que quem tem "A rede inteira" com Configurações em Gerenciar, sem ser a Admin, leia "Veja faturas e pagamento na aba Assinatura" |
| `e2e/dicas-relatorios-dashboard.spec.ts:38` | regras/design.md:215; indicadores:LU-02; indicadores:LU-11; indicadores:LU-10 | tela | LU-02 diz que o cartão diz "Desconta do lucro" e LU-11 que embaixo do DRE a tela diz a perda fora do lucro; o caso exige os dois só na dica (design.md:215, o Heitor 16/11). |
| `e2e/dicas-relatorios-dashboard.spec.ts:60` | regras/design.md:215; indicadores:TM-02; indicadores:OC-07; indicadores:CC-03; indicadores:CC-06; indicadores:CC-02 | tela | TM-02 (o subtítulo diz a conta), CC-03 (embaixo do quadro a tela diz o recorte) e CC-06 (o Reativar diz o recorte); o caso exige os três só na dica (design.md:215). |
| `e2e/dicas-relatorios-dashboard.spec.ts:82` | regras/design.md:215; indicadores:TM-02 | tela | TM-02: o subtítulo diz a conta do ticket; o caso a exige só na dica (design.md:215). |
| `e2e/dicas-relatorios-dashboard.spec.ts:93` | regras/design.md:215; indicadores:CC-03 | tela | CC-03: embaixo do quadro a tela diz o recorte; o caso o exige escondido até o toque na dica (design.md:215). |
| `e2e/equipe-atritos-da-8.spec.ts:102` | plataforma:EQ-17; atendimento:AG-61 | tela | exige o texto antigo "marque X no “Atende clientes em”"; desde EQ1 o "Atende" é uma caixa só (AG-61) — a divergência EQ-17 do catálogo (TEXTO e TELA) |
| `e2e/financeiro-a-pagar-vencimento.spec.ts:107` | vendas-financeiro:FN-17; vendas-financeiro:FP-02 | tela | FN-17 diz que a despesa que já tem forma "se paga direto"; o teste exige que o "Pagar" abra a janela com a forma lançada escolhida e que se possa trocar (é o texto de regras/vendas-financeiro.md:2208-2212, A13 da 26ª: o catálogo ficou velho). |
| `e2e/financeiro-atritos-da-10.spec.ts:47` | vendas-financeiro:FN-13; indicadores:LU-08; indicadores:RE-09 | tela | FN-13 cita o texto "É o resultado do período (competência): …"; o teste exige que a explicação NÃO diga "competência" e diga "a receita e a despesa pelo que foi pago", mais "A pagar no período, fora do resultado". O código segue o teste. |
| `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts:336` | vendas-financeiro:MQ-02; vendas-financeiro:MQ-06; vendas-financeiro:MQ-07; CLAUDE.md §1 princípio 2 | tela | teto: além do prazo de 15 dias valer só para as vendas seguintes (MQ-02), o teste exige que a action recuse o prazo 0 com "de 1 a 120 dias" — limite que nenhuma regra põe; o princípio 2 só recusa o impossível. |
| `e2e/financeiro-f67.spec.ts:138` | vendas-financeiro:PV-04; atendimento:AT-13; vendas-financeiro:PV-13 | integracao | O "só o PDV recebe" bate com PV-04, mas o caso exige que o check-in da sessão do plano (rota do atendimento) receba o plano; AT-13: "a sessão de plano não se cobra no atendimento… o servidor recusa". |
| `e2e/indicadores-cada-numero-no-seu-modulo.spec.ts:145` | indicadores:VP-01; indicadores:DB-01; indicadores:VP-05 | tela | DB-01: quem atende sem a Agenda vê as etapas da Agenda com os números dela; o caso exige que a etapa "Agendamentos" não apareça para ela (texto velho, A32 da 24ª). |
| `e2e/indicadores-cenario.spec.ts:346` | indicadores:CC-05; indicadores:RE-03; indicadores:TM-04; indicadores:ER-01 | integracao | CC-05: o Reativar é sempre o da rede (quem nunca veio também entra); o caso exige a versão por unidade (metrics_clientes_para_reativar, que o app não usa mais), sem a C3 de outra unidade. **Resolvido em 25/11: a função por unidade e este trecho saíram (o Heitor, "ok mas tenha certeza absoluta que não é usada"; migration `20261206700001`).** |
| `e2e/indicadores-f68-contas.spec.ts:139` | indicadores:CC-05 | integracao | Exige que o Reativar recortado à unidade A liste a cliente que veio à B há 10 dias (última visita NELA); o CC-05 diz que quem foi a outra unidade não sumiu: o Reativar é sempre o da rede. **Resolvido em 25/11: a função por unidade e este trecho saíram (o Heitor, "ok mas tenha certeza absoluta que não é usada"; migration `20261206700001`).** |
| `e2e/maquininhas-f67.spec.ts:67` | vendas-financeiro:MQ-15; vendas-financeiro:MQ-02; vendas-financeiro:MQ-06 | integracao | Taxa e prazo da Stone batem; mas exige que, com duas maquininhas, a venda sem escolha fique na primeira (e a taxa dela). MQ-15: "Com mais de uma… a primeira não vale calada". |
| `e2e/maquininhas-f67.spec.ts:151` | vendas-financeiro:MQ-15; vendas-financeiro:PV-13; atendimento:AT-13 | tela | "Qual maquininha?" trava o receber no PDV, o do plano e a Nova venda (bate com MQ-15); mas exige o "Receber R$" do plano no check-in da tela do atendimento — PV-13/AT-13: ali não se recebe. |
| `e2e/plano-checkout-uma-transacao.spec.ts:122` | comissoes:CV-06; vendas-financeiro:DP-02 | tela | Exige no "Receber o plano" a frase "Comissão de venda de X: 5% do vendido — da rede…"; CV-06 diz "O checkout do plano não mostra essa frase" (e a Q03 de Comissões pergunta se está no escopo). O "Quem vendeu" que volta é DP-02. |
| `e2e/plano-recebimento-concorrente.spec.ts:84` | atendimento:AT-13; vendas-financeiro:DP-02; vendas-financeiro:PV-13 | integracao | Exige que receberDoPlano pela rota do atendimento (/admin/agenda/<id>, o check-in) receba o plano; AT-13 diz que a sessão de plano "não se cobra no atendimento (… o servidor recusa)". A trava da concorrência em si é DP-02. |
| `e2e/plano-recebimento-concorrente.spec.ts:97` | atendimento:AT-13; vendas-financeiro:DP-02; vendas-financeiro:PV-13 | integracao | O mesmo caminho do check-in (receberDoPlano à vista pela rota do atendimento) tem de receber e gravar o histórico do agendamento; contraria AT-13 ("o plano se paga na comanda dele, no PDV"). |
| `e2e/plano-recebimento-concorrente.spec.ts:113` | atendimento:AT-13; vendas-financeiro:DP-02 | integracao | Duplo clique no receberDoPlano do check-in grava uma vez; exige que o check-in receba o plano, o que AT-13 recusa. |
| `e2e/plano-recebimento.spec.ts:72` | atendimento:AT-13; vendas-financeiro:PV-13; vendas-financeiro:PV-04; vendas-financeiro:DP-06 | tela | Exige na tela do atendimento "Receber R$ 300,00" e "Confirmar recebimento" do plano; AT-13/PV-13: "A tela do atendimento não recebe nem tem janela de pagamento", o plano se paga no PDV (DP-06: o PDV cobra só a vencida). |
| `e2e/planos-adicionais.spec.ts:223` | plataforma:PN-20; plataforma:AS-06 | integracao | a PN-20 diz que nenhum adicional deixa a mensalidade em R$ 0 com a cobrança ligada; o teste exige aceitar R$ 0 (cortesia, como a AS-06). **Resolvido em 25/11: o catálogo estava atrasado (a recusa saiu em 07/10); a PN-20 foi corrigida e o teste bate.** |
| `e2e/setup-retoma.spec.ts:85` | plataforma:RB-04 | tela | RB-04 diz a ordem "Outra unidade (se houver) → Equipe → Salas…"; o teste exige a Outra unidade por ÚLTIMO, depois do Funil (A2 da 10ª), e a mostra numa rede de uma unidade |
| `e2e/vendas-forma-nasce-vazia.spec.ts:107` | vendas-financeiro:PV-01; vendas-financeiro:DP-06; vendas-financeiro:FP-02 | tela | Exige um "Receber R$" do plano na tela do agendamento em check-in; PV-01: "Todo pagamento de venda acontece no PDV", e a PT1e (divergência DP-06/FP-02): "A sessão não cobra nada". |
| `tests/atritos-da-15.test.ts:90` | busca:AO-05 | leitura-do-fonte | AO-05 oferece "Cadastrar «termo»" sempre que nenhuma cliente bate; o teste tira a oferta quando o termo é nome de página |
| `tests/atritos-da-15.test.ts:250` | documentos:DD-02 | leitura-do-fonte | DD-02 chama o link de "Completar o cadastro"; o teste exige "Completar a ficha" em checkout-wizard.tsx:1052 (o mesmo arquivo usa "Completar o cadastro" na 554) **Resolvido em 25/11: o Heitor, "Completar cadastro"; o link e o teste dizem "Completar o cadastro".** |
| `tests/atritos-da-25-ficha-estoque-app.test.ts:54` | fidelidade:AP-03; regras/fidelidade.md:95 | unidade | Exige que o AJUSTE não leve linha à cliente (motivo da equipe nunca vai ao app). AP-03 diz "o ajuste, o voucher cancelado e o estorno levam o motivo que a equipe escreveu"; regras/fidelidade.md:99 diz "não" (o catálogo perdeu o "não"). |
| `tests/auditoria-atendimento-e-permissao.test.ts:125` | atendimento:AT-02; CLAUDE.md §14 "Migration que cria função sem notify pgrst" | leitura-do-fonte | exige "atendimento":["MANAGE","OWN"] (o "só os meus") no modelo da migration de 23/11; CLAUDE.md §11: não existe "só os meus" e o escopo guarda sempre ALL (a 20261129000001 já reescreve); confere história |
| `tests/automacoes-encaixe.test.ts:15` | automacoes:ED-09 | unidade | ED-09: "Se o anterior é o gatilho… nasce solto"; o teste exige ligar ao gatilho aberto. regras/automacoes.md:501 fala do gatilho NOVO: o texto do catálogo parece o errado |
| `tests/cargos-automacoes-e-marketing-so-ver.test.ts:58` | copilot:CO-05 | unidade | CO-05: "tem três níveis"; o teste exige só Sem acesso e Ver. Segue a Q02 do Copilot (resolvida 24/11): o texto do CO-05 ficou velho |
| `tests/cargos-automacoes-e-marketing-so-ver.test.ts:63` | copilot:CO-05 | unidade | CO-05: "Ver: só consultas (a gravação nem é oferecida)"; o teste exige que o Ver diga que pede gravações. Segue a Q02 do Copilot (24/11) |
| `tests/cargos-automacoes-e-marketing-so-ver.test.ts:70` | copilot:CO-05 | unidade | o resumo do cargo diz que o Copilot em Ver consulta e pede gravações; o CO-05 dá isso só ao Gerenciar. Segue a Q02 do Copilot (24/11) |
| `tests/checkout-lancamentos.test.ts:41` | vendas-financeiro:CR-03 | unidade | O teste exige que a entrada acima do preço "vira à vista" (500 sobre 200 → um lançamento de 200). A CR-03: "A entrada maior que o total é recusada, nunca cortada calada". |
| `tests/checkout-lancamentos.test.ts:45` | vendas-financeiro:CR-02; CLAUDE.md §1 princípio 2 | unidade | teto: exige recusar 49 parcelas (TETO_DO_CREDIARIO = 48, também na configuração da rede). A CR-02 deixa o máximo à rede, sem teto. O resto (forma, negativa, data) recusa o impossível. |
| `tests/checkout-pagamento.test.ts:11` | vendas-financeiro:CR-01; vendas-financeiro:PV-01; atendimento:AT-13 | unidade | Sem pagamento escolhido, o contrato diz "a receber no atendimento"; o pagamento é só no PDV (PV-01) e o atendimento não cobra (AT-13). As outras frases batem com a CR-01. |
| `tests/checkout-pagamento.test.ts:21` | vendas-financeiro:CR-01; vendas-financeiro:CR-03 | unidade | Exige que o a receber guarde a forma Pix e que o contrato diga "a receber, no Pix". A CR-01: "O A receber não tem forma nenhuma", e o contrato diz "a receber". |
| `tests/copilot-sala-abas-e-comanda.test.ts:79` | atendimento:AG-46; regras/copilot.md:371 | unidade | AG-46 diz que o Copilot agenda sem escolher sala; o teste exige que a ferramenta aceite a sala pedida (A1 da 27ª, decisão do Claude em regras/copilot.md:371) |
| `tests/copilot-sala-abas-e-comanda.test.ts:101` | atendimento:AG-46; atendimento:AG-43; regras/copilot.md:371 | leitura-do-fonte | exige que o efetivar do agendar do Copilot grave a sala; AG-46 diz que pelo Copilot o agendamento nasce sem sala |
| `tests/decisoes-de-16-11.test.ts:47` | plataforma:CU-08; crm-inbox:CL-23 | unidade | CU-08/CL-23 dão de exemplo "…Abrimos Tags." e "Seu cargo não abre a aba Prontuário…: abrimos a Visão geral."; o teste proíbe "abrimos" e exige "Suas permissões não abrem… Você está na Visão geral." |
| `tests/defeitos-da-15.test.ts:152` | CLAUDE.md §1; vendas-financeiro:FN-05 | leitura-do-fonte | Proíbe "Seu cargo não libera" na tela de erro e no mensagemDoErro (hoje "Você não tem acesso a esta ação."); FN-05 e regras/vendas-financeiro.md:2132 ainda dizem que a recusa é "Seu cargo não libera esta ação." Catálogo velho. |
| `tests/defeitos-da-15.test.ts:160` | CLAUDE.md §1; crm-inbox:CL-23 | unidade | Exige "Suas permissões não abrem a aba Prontuário desta ficha. Você está na Visão geral." e proíbe "Seu cargo não abre a aba"; CL-23 ainda traz "Seu cargo não abre a aba Prontuário desta ficha: abrimos a Visão geral." Catálogo velho. |
| `tests/fidelidade-config.test.ts:20` | CLAUDE.md §1 | unidade | Exige recusar 1.001 pontos por R$ 1 (e zero). O princípio 2 diz "Não recusar o valor que a rede escolheu (taxa, ...): no máximo, avisar". 1.001 não é impossível. |
| `tests/fidelidade-config.test.ts:33` | fidelidade:PG-04; CLAUDE.md §1 | unidade | Exige recusar bônus acima de 1.000.000 e aviso acima de 90 dias. O princípio 2 (não recusar prazo nem valor que a rede escolheu, só o impossível) diz o contrário. |
| `tests/fidelidade-config.test.ts:40` | fidelidade:SA-05; CLAUDE.md §1 | unidade | Validade nula ou 1 a 120 meses: exige recusar 121 meses. SA-05 diz "vencem em N meses" sem teto, e o princípio 2 não recusa prazo que a rede escolheu. |
| `tests/fidelidade-voucher.test.ts:65` | CLAUDE.md §1 | unidade | Exige recusar custo 0 e validade de 400 dias (teto de 365). O princípio 2 não recusa prazo nem valor que a rede escolheu; nenhuma regra do catálogo põe teto na validade do voucher. |
| `tests/financeiro-baixa-cx2.test.ts:84` | vendas-financeiro:FN-17; regras/vendas-financeiro.md:2208 | leitura-do-fonte | Exige que toda despesa abra a janela, também a que já tem forma. A FN-17: "a que já tem forma se paga direto". A regra de regras/ (A13 da 26ª, decisão do Claude) mudou isso; o catálogo não. |
| `tests/metrics-escopo.test.ts:59` | indicadores:RA-03; indicadores:RA-08; indicadores:VP-01 | unidade | RA-03 ("nenhuma linha fica com valor e 0 execuções") e a fala da RA-08; o caso exige a linha Toxina R$ 900 com 0 execuções (dinheiro de todos, agenda dela). |
| `tests/ordem-das-transacoes.test.ts:85` | regras/vendas-financeiro.md:1827; vendas-financeiro:CR-09 | leitura-do-fonte | Exige na ficha o chip "Vencida há N dias" com fundo de alerta; CR-09 diz que a aba Financeiro da ficha mostra "Vencida em 05/11". Catálogo velho (regras/vendas-financeiro.md:1833, item 17 de 18/11). |
| `tests/pdv-caixa-da-18.test.ts:157` | vendas-financeiro:FC-10; regras/vendas-financeiro.md:1611 | unidade | FC-10: a forma estornada no dia fica "mesmo zerada, para ser conferida"; o teste exige conferivel:false. Bate com regras:1611 (forma sem nada a conferir não se confere): o catálogo pode estar errado |
| `tests/resumo-do-cargo.test.ts:9` | plataforma:CG-17 | unidade | CG-17 manda o resumo não contar as abas da configuração da rede toda; o teste exige "Configurações (só Comissões e taxas)" no modo sem soAsDela, que a tela (soAsDela:true) não usa **Resolvido em 25/11: o caso e o caminho sem `soAsDela` saíram (o Heitor, "ok mas tenha certeza absoluta que ninguem usa").** |
| `tests/resumo-do-cargo.test.ts:12` | plataforma:CG-17 | unidade | CG-17 manda não contar as abas da rede toda; o teste exige Fichas/Documentos listados no resumo (modo sem soAsDela, que a tela de Cargos não usa) **Resolvido em 25/11: o caso e o caminho sem `soAsDela` saíram (o Heitor, "ok mas tenha certeza absoluta que ninguem usa").** |
| `tests/resumo-do-cargo.test.ts:15` | plataforma:CG-17 | unidade | CG-17 manda não contar as abas da rede toda; o teste exige essas abas no resumo (modo sem soAsDela, que a tela de Cargos não usa) **Resolvido em 25/11: o caso e o caminho sem `soAsDela` saíram (o Heitor, "ok mas tenha certeza absoluta que ninguem usa").** |
| `tests/sessao-so-le-prontuario-e-automacoes.test.ts:58` | CLAUDE.md §4 | leitura-do-fonte | Exige que a migration antiga dê às automações leitura pela sessão (sessao_ve_o_modulo); hoje "a sessão só lê SINAIS" e 20261128200002 tirou essas políticas. Passa por ler texto velho. |
| `tests/setup-proximos-passos.test.ts:10` | plataforma:RB-04 | unidade | RB-04 põe "Outra unidade (se houver)" primeiro, antes da Equipe; o teste exige a Equipe primeiro e a outra unidade por último (A2 da 10ª) |
| `tests/setup-proximos-passos.test.ts:11` | plataforma:RB-04 | unidade | RB-04 põe "Outra unidade (se houver)" primeiro; o teste exige a ordem com a Equipe na frente e a outra unidade no fim |
| `tests/textos-dos-avisos-da-9.test.ts:9` | whatsapp-push:NC-01; whatsapp-push:NC-05 | unidade | Exige o nome do procedimento no aviso de concluído e de pagamento à cliente (vai ao celular por notifyCompleted/notifyPayment); NC-05 diz que o aviso no celular "não diz o procedimento nem nada de saúde". Conferir qual vale. |
| `tests/textos-dos-avisos-da-9.test.ts:13` | atendimento:AG-51; whatsapp-push:NC-05 | unidade | O remarcado e o cancelado dizem a unidade com mais de uma (AG-51, ok), mas levam o nome do procedimento ao aviso no celular; NC-05: "não diz o procedimento". Conferir qual vale. |
| `tests/unidades-da-tela.test.ts:56` | plataforma:UN-10 | unidade | UN-10 (e a CX3 de 16/11) não lista o atendimento concluído sem pagamento (virou comanda aberta do PDV); o teste o exige no resumo do que impede desativar a unidade |
| `tests/varredura-vendas-financeiro.test.ts:112` | vendas-financeiro:PV-13; vendas-financeiro:DP-06 | leitura-do-fonte | PV-13: "A tela do atendimento não recebe nem tem janela de pagamento" e PT1e ("a sessão não cobra nada"); o teste exige receberDoPlanoInterno na tela do atendimento |

## 2. Os testes sem regra (`sem-regra`) — candidatos a "teste extra"

| Caso | Regras | Camada | Nota |
|---|---|---|---|
| `e2e-site/site.spec.ts:117` | — | tela | Confere que a página não rola para o lado em 360px e que nenhuma imagem quebra; nenhuma regra do site pede isso (o TL-01 só diz que as telas são reais). |
| `e2e-site/site.spec.ts:250` | — | tela | Confere que o rodapé leva à /privacidade do app da rede; nenhuma regra do site pede o link (o CLAUDE.md §6 só diz que a página é pública). |
| `e2e/agenda-atritos-da-11.spec.ts:72` | — | tela | Desenho do bloqueio na grade (AG-27, fora do catálogo como exibição). |
| `e2e/agenda-atritos-da-11.spec.ts:102` | — | tela | Desenho da agenda no celular (exibição). |
| `e2e/agenda-atritos-da-7.spec.ts:126` | — | tela | Desenho e atalho da agenda (AG-123, AG-125, fora do catálogo como exibição). |
| `e2e/agenda-atritos-da-7.spec.ts:170` | — | tela | Nome dos procedimentos no card (AG-142, exibição). |
| `e2e/agenda-atritos-da-8.spec.ts:310` | — | tela | Desenho da agenda (AG-123, exibição). |
| `e2e/agenda-atritos-da-9.spec.ts:111` | — | tela | Desenho da agenda (AG-43, exibição). |
| `e2e/agenda-avisos.spec.ts:65` | — | tela | Aviso de resultado da ação (AG-121, exibição). |
| `e2e/agenda-avisos.spec.ts:76` | — | tela | Avisos e desenho (AG-121, AG-123, exibição). |
| `e2e/agenda-avisos.spec.ts:96` | — | tela | Rolagem da agenda até o aviso (exibição). |
| `e2e/agenda-dia-a-dia.spec.ts:93` | — | tela | O motivo do cancelado no tooltip e inteiro na janela: o catálogo deixou fora como exibição (rascunho AG-69) |
| `e2e/agenda-dia-a-dia.spec.ts:106` | — | tela | Ao trocar de dia a grade rola até o primeiro atendimento, com o plural certo: o catálogo deixou fora (rascunho AG-38) |
| `e2e/agenda-grade-madrugada.spec.ts:73` | — | tela | O cartão das 02:30 não fica por baixo do das 03:30 (o clique abre o dele): desenho da grade, sem regra no catálogo |
| `e2e/agenda-janela-detalhes.spec.ts:89` | — | tela | O cartão curto diz procedimento e sala: desenho do cartão, fora do catálogo (rascunho AG-123) |
| `e2e/agenda-minha-agenda-data-e-rotulos.spec.ts:63` | — | tela | A Minha agenda abre no ?date= e as setas têm nome: o catálogo põe o dia no endereço como implementação (rascunho AG-121) |
| `e2e/agenda-modal-erro-mantem-campos.spec.ts:53` | — | tela | O conflito recusado não apaga o que foi digitado no modal: comportamento de tela sem regra no catálogo |
| `e2e/anuncios-integracao.spec.ts:153` | — | tela | A tela Anúncios lista as campanhas da conta escolhida, com o token dela; nenhuma regra do catálogo cobre essa lista. |
| `e2e/assinaturas-asaas.spec.ts:162` | regras/plataforma.md:510-513 | integracao | a fatura que chega antes do id da assinatura é achada pelo cliente do Asaas: o catálogo põe o webhook em "Ficou fora" como implementação |
| `e2e/atendimento-atritos-da-11.spec.ts:58` | — | tela | O texto do atraso antes e depois de iniciar ("57 min depois do horário marcado"): o catálogo deixou fora como texto (rascunho AG-80) |
| `e2e/atendimento-atritos-da-11.spec.ts:72` | — | tela | No celular o campo do valor do procedimento da sessão do plano cabe na largura: desenho, sem regra no catálogo |
| `e2e/atendimento-atritos-da-7.spec.ts:118` | — | tela | A busca de insumo vazia diz "Nenhum produto cadastrado" e aponta o Estoque: o catálogo deixou fora como texto (rascunho AT-17) |
| `e2e/atendimento-campos-da-tela.spec.ts:80` | — | tela | A evolução tem um nome só na tela e na janela de concluir: o catálogo deixou fora como nome de campo (rascunho AT-23) |
| `e2e/autenticacao-login-antes-da-hidratacao.spec.ts:44` | regras/plataforma.md:52-62 | tela | o "Entrar" desligado até a hidratação: o catálogo o põe em "Ficou fora" como implementação |
| `e2e/autenticacao-login-antes-da-hidratacao.spec.ts:53` | regras/plataforma.md:52-62 | integracao | o login responde com redirect 303: o catálogo o põe em "Ficou fora" como implementação |
| `e2e/automacoes-escolhas.spec.ts:51` | CLAUDE.md §1 princípio 7 | tela | O passo "Mover de etapa" pede o funil e depois a etapa, e grava etapaId e funilNome; nenhuma regra do catálogo diz isso. |
| `e2e/automacoes-mobile.spec.ts:49` | — | tela | O editor no celular: a paleta vira gaveta e os painéis ocupam a tela inteira; nenhuma regra do catálogo diz isso. |
| `e2e/campanha-seletor-de-tags.spec.ts:37` | — | tela | O Esc fecha o seletor de tags e o "Próximo" avança no primeiro clique (J-21); detalhe de interface sem regra no catálogo. |
| `e2e/clientes-arquivar.spec.ts:119` | vendas-financeiro:PV-01 | tela | o PDV não abrir a venda da cliente arquivada não tem regra (a ficha sem "Vender" é a PV-01) |
| `e2e/clientes-ficha-proximos-depois-de-agendar.spec.ts:47` | — | tela | a ficha atualiza os próximos depois de agendar (cache), como o KB-08 que o catálogo deixou fora por ser implementação |
| `e2e/comissoes-calculo.spec.ts:271` | — | tela | pacote antigo sem preço vendido libera na conclusão (KA-05): o catálogo diz que é caminho de dado antigo, não regra |
| `e2e/configuracoes-atritos-da-14.spec.ts:147` | — | tela | o lápis da linha da Equipe diz "Cargo e unidade"; nenhuma regra dá esse texto |
| `e2e/configuracoes-textos-e-estados-vazios.spec.ts:66` | — | tela | sem insumo cadastrado, a janela leva ao Estoque; nenhuma regra dá esse caminho |
| `e2e/configuracoes-textos-e-estados-vazios.spec.ts:76` | — | tela | salvar a ficha de saúde mostra a confirmação; nenhuma regra dá esse texto |
| `e2e/configuracoes-textos-e-estados-vazios.spec.ts:101` | — | tela | o texto da dica do funil (cria funil novo, os existentes ficam); nenhuma regra dá esse texto |
| `e2e/configuracoes-unidade-cnpj.spec.ts:166` | — | integracao | o mesmo envio repetido do "Nova unidade" cria uma unidade só (D10); nenhuma regra do catálogo |
| `e2e/configuracoes-unidade-horario-e-cep.spec.ts:80` | — | tela | O CEP do detalhe da unidade com máscara e busca no 8º dígito: detalhe de tela, sem regra no catálogo |
| `e2e/copilot-esqueleto.spec.ts:129` | — | integracao | a conversa e o cartão de um membro não se abrem nem se confirmam por outro membro da mesma rede; nenhuma regra escrita diz isso |
| `e2e/crm-atritos-da-7.spec.ts:71` | — | tela | Enter grava o nome da etapa: é o KE-07, que o catálogo deixou fora como comportamento do campo |
| `e2e/crm-estrutura.spec.ts:145` | — | tela | a cor inicial da etapa nova; nenhuma regra fixa a cor padrão |
| `e2e/equipe-horario-parte-da-unidade.spec.ts:64` | — | tela | O X do segundo período tira aquele período, e "Juntar" junta os dois: o catálogo deixou fora como detalhe do editor (rascunho AG-12) |
| `e2e/estoque-atritos-da-14.spec.ts:169` | — | tela | Com a tela filtrada numa unidade, Entrada e Perda já vêm com ela: o catálogo põe como atalho de tela fora do catálogo (rascunho ES-49) |
| `e2e/estoque-chip-da-unidade.spec.ts:39` | — | tela | O chip de estoque por unidade traz o nome inteiro da unidade (exibição): nenhuma regra do catálogo |
| `e2e/estoque-uso-da-10.spec.ts:99` | — | tela | "Ver lotes esgotados" só no produto que tem lote esgotado: o catálogo põe como exibição fora do catálogo (rascunho ES-52) |
| `e2e/estoque-uso-da-10.spec.ts:110` | — | tela | Os cartões do topo cabem a 1440 px e "Validade em 30 dias" diz lote e data: layout e exibição, sem regra no catálogo |
| `e2e/estoque-uso-do-produto.spec.ts:116` | — | integracao | Confere a migração dos produtos antigos (preço de venda passou a ser uso) no banco inteiro; só a parte "revenda sem preço não existe" toca a ES-08 |
| `e2e/estoque-vazio.spec.ts:33` | — | tela | Sem produto, a tela diz "Nenhum produto cadastrado" com um "Novo produto" só: o catálogo põe como estado vazio fora do catálogo (rascunho ES-46) |
| `e2e/ficha-documentos-um-cancelar.spec.ts:25` | — | tela | o formulário de anexo da aba Documentos da ficha tem um "Cancelar" só; nenhuma regra (nem regras/design.md) diz isso |
| `e2e/ficha-unica.spec.ts:42` | — | integracao | só confere que as tabelas e colunas antigas saíram do banco |
| `e2e/ficha-uso-da-10.spec.ts:115` | — | tela | o texto "É o CPF já salvo nesta ficha" (KA-16 está em "Ficou fora" como texto de tela) |
| `e2e/fidelidade-painel-atualiza.spec.ts:42` | regras/fidelidade.md:422 | tela | O painel Fidelidade da ficha mostra os pontos novos no router.refresh, sem recarregar. O catálogo deixou fora como implementação (KA-23). |
| `e2e/financeiro-atritos-da-7.spec.ts:102` | — | tela | Recarregar o "Receber o plano" volta ao passo e à forma escolhidos. É o KF-24, que o catálogo pôs em "Ficou fora do catálogo" (estado da tela). |
| `e2e/funcionalidades-ligadas.spec.ts:105` | whatsapp-push:NA-01 | tela | Sair do portal tira a inscrição de push deste navegador e deixa a do outro; nenhuma regra do catálogo nem de docs/regras fala do push ao sair (chama a action direto, o navegador de teste não tem push). |
| `e2e/importacao-contatos.spec.ts:250` | — | tela | a importação aparece em Configurações → Ações em lote; nenhuma regra diz onde ela mora |
| `e2e/inbox-cabecalho-mobile.spec.ts:53` | — | tela | a altura do cabeçalho da conversa no celular (desenho, sem regra) |
| `e2e/inbox-cabecalho-mobile.spec.ts:83` | — | tela | o gesto de puxar o painel no celular (desenho) |
| `e2e/inbox-cabecalho-mobile.spec.ts:106` | — | tela | detalhe de desenho do cabeçalho no celular, sem regra |
| `e2e/injetaveis-atritos-da-11.spec.ts:130` | atendimento:PT-13 | tela | confere a linha que explica cada botão da folha de injetáveis: a PT-39 está em "Ficou fora do catálogo" (texto) |
| `e2e/injetaveis-mobile.spec.ts:25` | — | tela | navegação da lista de planejamentos no celular, rodada como admin; nenhuma regra de produto |
| `e2e/injetaveis-mobile.spec.ts:61` | — | tela | abrir o planejamento no celular e voltar à lista, como admin; só desenho de tela |
| `e2e/injetaveis-mobile.spec.ts:77` | — | tela | a folha do mapa no celular cabe na tela, como admin; só desenho de tela |
| `e2e/injetaveis-pinca.spec.ts:55` | — | tela | o gesto de pinça aproxima o mapa e não marca ponto; detalhe de interação sem regra |
| `e2e/injetaveis-ponto-novo.spec.ts:67` | — | tela | o rótulo "Nome" do ponto ligado ao campo; detalhe de acessibilidade sem regra no catálogo |
| `e2e/injetaveis-ponto-novo.spec.ts:76` | — | tela | o primeiro ponto nasce sem produto e "Região (opcional)": a PT-34 está em "Ficou fora do catálogo" |
| `e2e/mensagens-meta.spec.ts:263` | crm-inbox:IN-07 | integracao | O cron da API de Conversões manda os eventos com o id do clique e descarta o mais velho que 7 dias e o sem id; nenhuma regra diz isso. |
| `e2e/menu-lateral.spec.ts:47` | — | tela | Os itens do menu são links (href, aria-current) e navegam no clique (A2 da 5ª); nenhuma regra pede isso. |
| `e2e/menu-lateral.spec.ts:58` | regras/vendas-financeiro.md:690 | tela | No celular, abrir ou fechar uma categoria não fecha a barra; a regra do menu recolhível não fala do celular. |
| `e2e/nao-encontrada.spec.ts:12` | — | tela | Na raiz, a rota que não existe mostra "Página não encontrada" em português e "Ir para o início" (D12); sem regra escrita. |
| `e2e/nao-encontrada.spec.ts:19` | — | tela | No portal da rede, o 404 fica dentro do layout, com a barra lateral e "Voltar ao início" levando ao dashboard; sem regra. |
| `e2e/nao-encontrada.spec.ts:48` | — | tela | No portal da unidade, o 404 fica dentro do layout, e "Voltar ao início" leva ao dashboard dela; sem regra. |
| `e2e/nao-encontrada.spec.ts:130` | — | tela | Sem sessão, a rota que não existe sob um endereço reservado (/api, /assinar) responde 404, não 500; nenhuma regra fala do status (a lista não traz o prefixo "sem sessão ›"). |
| `e2e/planejamentos-mobile.spec.ts:24` | — | tela | lista de planejamentos no celular, como admin; só desenho de tela |
| `e2e/planejamentos-mobile.spec.ts:70` | — | tela | abrir o planejamento no celular, como admin; só desenho de tela |
| `e2e/planejamentos-mobile.spec.ts:89` | — | tela | renomear o planejamento no celular, como admin; não prova a permissão da PT-16 |
| `e2e/plano-sessao-com-dois-procedimentos.spec.ts:79` | — | tela | a duração prevista na tela é a do agendamento: a AG-144 está em "Ficou fora do catálogo" (exibição) |
| `e2e/plano-sessao-com-dois-procedimentos.spec.ts:89` | — | tela | a sessão com vários procedimentos lista todos: a AG-142 está em "Ficou fora do catálogo" (exibição) |
| `e2e/planos-condicoes.spec.ts:247` | — | tela | a tela da rede no sistema resume as condições, e o formulário fica só no modal; organização de tela sem regra |
| `e2e/plataforma-hosts.spec.ts:147` | — | integracao | confere a CSP com nonce, o frame-ancestors e o noindex dos hosts; o catálogo põe a CSP da plataforma como implementação (regras/plataforma.md:101-114) |
| `e2e/portal-cliente-agendar-horarios.spec.ts:66` | — | tela | o agrupamento Manhã/Tarde/Noite do app (AG-167 está em "Ficou fora" como exibição) |
| `e2e/portal-cliente-alterar-agendamento.spec.ts:220` | — | tela | os atalhos Hoje/Amanhã e o agrupamento Manhã/Tarde/Noite (AG-167 está em "Ficou fora" como exibição) |
| `e2e/portal-cliente-atritos.spec.ts:81` | — | tela | o "Ir para o início" da tela de sem acesso aberta direto leva ao painel; nenhuma regra fala disso |
| `e2e/portal-cliente-atritos.spec.ts:97` | — | tela | a máscara e a busca do CEP no perfil do app; a CL-02 só fala do cadastro e da aba Dados |
| `e2e/privacidade-publica.spec.ts:27` | — | tela | A página fala de controlador, operador, dado sensível, transferência internacional e ANPD. Nenhuma regra escrita sobre esse conteúdo. |
| `e2e/privacidade-publica.spec.ts:42` | CLAUDE.md §6 | tela | / leva ao /login e o /login tem o link da política. A regra é a URL pública (caso 18); nenhuma regra pede o link no login. |
| `e2e/privacidade-publica.spec.ts:53` | — | tela | A página não rola para o lado em 360 px. Nenhuma regra escrita. |
| `e2e/privacidade-publica.spec.ts:63` | — | tela | O público não vê o aviso interno de documento incompleto (A46). Nenhuma regra escrita. |
| `e2e/procedimento-modal-limpo.spec.ts:30` | — | tela | depois de criar, "Novo procedimento" abre o formulário vazio, sem o aviso da vez anterior; correção de tela sem regra |
| `e2e/procedimentos-atritos-da-8.spec.ts:72` | — | tela | o formulário do procedimento só existe no DOM com a janela aberta; implementação de tela |
| `e2e/rls-sessao-so-le-sinais.spec.ts:184` | CLAUDE.md §4 | integracao | O recibo do WhatsApp move só o sinal da conversa, não o da lista do inbox (desempenho; nenhuma regra escrita). Toca o §4: só a equipe da rede lê o sinal da conversa. |
| `e2e/sistema-portal.spec.ts:158` | — | integracao | confere só que a função dos indicadores da plataforma devolve números; nenhuma regra diz o que o painel do sistema conta |
| `e2e/suporte-entrada.spec.ts:79` | — | integracao | o código de uso único entre os hosts, fora da URL e só o hash no banco; o catálogo o põe como implementação (regras/plataforma.md:559-575) |
| `e2e/suporte-entrada.spec.ts:101` | — | integracao | o código de entrada vale uma vez; implementação do "entrar como" entre os hosts (regras/plataforma.md:559-575) |
| `e2e/suporte-impersonar.spec.ts:362` | — | integracao | o pedido interno do Next (RSC) ao fim não encerra a sessão; detalhe da sessão de suporte que o catálogo põe como implementação |
| `e2e/vendas-atritos-da-11.spec.ts:95` | — | tela | CPF e telefone com máscara no receber do plano: o catálogo (KF-66, "Ficou fora do catálogo") diz que é formato de exibição, não regra. |
| `e2e/vendas-atritos-da-12.spec.ts:152` | crm-inbox:CL-16 | tela | Confere que o Enter na busca do "Indicada por" não envia o cadastro; nenhuma regra fala do Enter (correção de defeito de formulário). |
| `e2e/whatsapp-caixa-na-entrada.spec.ts:138` | — | integracao | O aperto de mão de verificação do webhook passa mesmo com uma caixa que não se decifra; robustez de implementação, sem regra. |
| `e2e/whatsapp-conexao-nova.spec.ts:172` | — | tela | A página de um deploy anterior faz a conexão do WhatsApp Web recarregar a página; nenhuma regra (a WC-04 só cobre o caminho da Meta). |
| `e2e/whatsapp-conexao-nova.spec.ts:192` | — | tela | Quando ler a conexão falha, a tela diz e oferece "Tentar de novo"; nenhuma regra do catálogo diz isso. |
| `tests/agenda-bloqueio.test.ts:43` | — | unidade | recusa bloquear período que já terminou ("Esse período já passou."); nenhuma regra (AG-19/AG-20) diz isso; aceita o que já começou |
| `tests/agenda-desenho-ate-a-ocupacao.test.ts:32` | — | unidade | ladoALado: cartões que se cruzam dividem a largura; desenho da grade (o catálogo põe o desenho da grade em "Ficou fora", AG-43) |
| `tests/agenda-desenho-ate-a-ocupacao.test.ts:43` | — | unidade | ladoALado: o que encosta não divide a largura; desenho da grade |
| `tests/agenda-dia.test.ts:10` | — | unidade | o plural de "atendimento(s)"; texto, sem regra |
| `tests/agenda-dia.test.ts:34` | — | unidade | para onde a grade rola ao trocar de dia: o catálogo põe em "Ficou fora" (AG-38, rolagem) |
| `tests/agenda-dia.test.ts:37` | — | unidade | rolagem da grade (AG-38 em "Ficou fora") |
| `tests/agenda-dia.test.ts:40` | — | unidade | rolagem da grade (AG-38 em "Ficou fora") |
| `tests/agenda-dia.test.ts:43` | — | unidade | rolagem da grade (AG-38 em "Ficou fora") |
| `tests/agenda-dia.test.ts:46` | — | unidade | rolagem da grade (AG-38 em "Ficou fora") |
| `tests/agenda-dia.test.ts:50` | — | unidade | rolagem da grade (AG-38 em "Ficou fora") |
| `tests/agenda-dia.test.ts:64` | atendimento:AG-09 | unidade | desiste depois de duas semanas: nenhuma regra põe esse limite à busca do próximo livre |
| `tests/agenda-filtros.test.ts:35` | atendimento:AG-28 | unidade | o título prova o recorte do "só os meus", que saiu em 23/11 (CLAUDE.md §11); o corpo só confere que sem opções de profissional o pedido não vira filtro (já em :28) |
| `tests/agenda-filtros.test.ts:43` | — | unidade | valor repetido na URL vale o primeiro; leitura da URL, implementação |
| `tests/agenda-filtros.test.ts:49` | — | unidade | a tag da URL casa sem caixa e sem repetir; leitura da URL, implementação |
| `tests/agenda-filtros.test.ts:58` | — | unidade | URL vazia, nenhuma tag; implementação |
| `tests/agenda-filtros.test.ts:65` | — | unidade | escape do literal de array do Postgres; implementação |
| `tests/agenda-filtros.test.ts:102` | — | unidade | a URL guarda os filtros; implementação (o catálogo põe o endereço da agenda em "Ficou fora", AG-121) |
| `tests/agenda-horario-livre.test.ts:29` | — | unidade | o pedaço livre menor que 30 min some do "Horário livre"; nenhuma regra põe o corte |
| `tests/alergia-negativa.test.ts:32` | atendimento:FI-06 | unidade | formatação do aviso de alergia (não duplica o ponto final); nenhuma regra fala do formato |
| `tests/alergia-negativa.test.ts:33` | atendimento:FI-06 | unidade | formatação do aviso de alergia (não duplica o ponto final); nenhuma regra fala do formato |
| `tests/alergia-negativa.test.ts:34` | atendimento:FI-06 | unidade | formatação do aviso de alergia (não duplica o ponto final); nenhuma regra fala do formato |
| `tests/anuncio-nome.test.ts:17` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:23` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:29` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:33` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:38` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:43` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:51` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:61` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:70` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:76` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:81` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/anuncio-nome.test.ts:87` | — | unidade | nome/legenda do selo do anúncio na conversa (botão não vira nome); o catálogo não tem regra disso |
| `tests/atendimento-atritos-da-22.test.ts:120` | — | leitura-do-fonte | o rótulo "Horários livres" no agendar pela oportunidade; texto de tela sem regra no catálogo nem em docs/regras |
| `tests/atritos-da-12-f61.test.ts:95` | atendimento:PL-19 | unidade | texto do desconto no plano; PL-19 não fala de como o desconto aparece |
| `tests/atritos-da-15.test.ts:70` | vendas-financeiro:CR-01 | leitura-do-fonte | rótulo da forma de pagamento da entrada; nenhuma regra fixa o texto |
| `tests/atritos-da-15.test.ts:81` | busca:AO-05 | unidade | termo que é nome de página não oferece Cadastrar; essa exceção não está no catálogo |
| `tests/atritos-da-15.test.ts:86` | busca:AO-05 | unidade | termo que é nome de página não oferece Cadastrar; essa exceção não está no catálogo |
| `tests/atritos-da-15.test.ts:281` | atendimento:PC-09 | leitura-do-fonte | texto da tela; nenhuma regra fixa a frase |
| `tests/atritos-da-15.test.ts:286` | automacoes:GT-02 | leitura-do-fonte | rótulo do evento; nenhuma regra fixa o texto |
| `tests/atritos-da-15.test.ts:291` | busca:BA-05 | leitura-do-fonte | texto de ajuda da busca; nenhuma regra fixa a frase |
| `tests/atritos-da-15.test.ts:294` | atendimento:PL-19 | leitura-do-fonte | texto "a combinar na unidade"; nenhuma regra fixa a frase |
| `tests/atritos-da-16.test.ts:37` | vendas-financeiro:FN-03 | leitura-do-fonte | texto da tela; nenhuma regra fixa a frase |
| `tests/atritos-da-16.test.ts:168` | — | leitura-do-fonte | texto/estrutura do cadastro; nenhuma regra do catálogo o fixa |
| `tests/atritos-da-16.test.ts:171` | — | leitura-do-fonte | texto/estrutura do cadastro; nenhuma regra do catálogo o fixa |
| `tests/atritos-da-16.test.ts:186` | — | leitura-do-fonte | texto/estrutura do cadastro; nenhuma regra do catálogo o fixa |
| `tests/atritos-da-16.test.ts:203` | — | leitura-do-fonte | texto/estrutura do cadastro; nenhuma regra do catálogo o fixa |
| `tests/atritos-da-17-cadastros.test.ts:120` | — | leitura-do-fonte | o clique seleciona (comportamento de interface); nenhuma regra o fixa |
| `tests/atritos-da-17-cadastros.test.ts:178` | — | leitura-do-fonte | o link abre em outra aba; nenhuma regra o fixa |
| `tests/atritos-da-18-atendimento.test.ts:93` | — | unidade | o resumo das obrigatórias vazias da ficha de saúde não repete o erro do campo; texto (o catálogo põe o jeito de apontar as obrigatórias em "Ficou fora", AT-28) |
| `tests/atritos-da-18-atendimento.test.ts:99` | — | leitura-do-fonte | a ficha usa o resumo; texto de tela |
| `tests/atritos-da-18-atendimento.test.ts:105` | — | leitura-do-fonte | acessibilidade das estrelas do confirmar (aria-label no botão, ícone escondido); sem regra |
| `tests/atritos-da-18-atendimento.test.ts:280` | plataforma:EQ-17 | leitura-do-fonte | confere o link à Equipe em outra aba e o "Atualizar a lista" no Desativar: o jeito de antes; a regra hoje (EQ-17, plataforma.md:1200) é marcar no "Atende" ali mesmo |
| `tests/atritos-da-19-cadastros.test.ts:82` | — | leitura-do-fonte | texto de placeholder do campo; nenhuma regra o fixa |
| `tests/atritos-da-19-cadastros.test.ts:92` | — | unidade | texto de tela da agenda; a AG-13 ficou fora do catálogo como texto de tela |
| `tests/atritos-da-19-cadastros.test.ts:95` | — | unidade | texto de tela da agenda; a AG-13 ficou fora do catálogo como texto de tela |
| `tests/atritos-da-19-cadastros.test.ts:99` | — | unidade | texto de tela da agenda; a AG-13 ficou fora do catálogo como texto de tela |
| `tests/atritos-da-19-cadastros.test.ts:103` | — | leitura-do-fonte | texto/estrutura da tela; nenhuma regra o fixa |
| `tests/atritos-da-19-caixa.test.ts:127` | — | leitura-do-fonte | Confere que a Nova venda mostra o telefone com máscara; o catálogo deixa o formato de exibição fora (KF-66). |
| `tests/atritos-da-20-vendas.test.ts:191` | — | leitura-do-fonte | Confere o texto "Nenhum anexo" (era "Nenhum documento anexado") na aba de documentos da ficha; não acha regra. |
| `tests/atritos-da-21-caixa.test.ts:280` | — | leitura-do-fonte | Confere o respiro interno (padding) da janela do CSV do fechamento; detalhe visual sem regra. |
| `tests/atritos-da-22-caixa.test.ts:114` | — | leitura-do-fonte | Confere que a linha do pagamento da comanda quebra em vez de cortar com reticências; detalhe de layout sem regra. |
| `tests/atritos-da-22-montar-crm-app.test.ts:24` | — | leitura-do-fonte | Confere só que não há espaço antes dos dois-pontos no texto da faixa dos procedimentos sem insumo (tipografia). A faixa em si é atendimento:PC-12. |
| `tests/atritos-da-23-cargos-atendimento-app.test.ts:139` | — | leitura-do-fonte | o Finalizar troca "O procedimento foi realizado com sucesso?" por "Confirme que o procedimento foi feito."; texto sem regra |
| `tests/atritos-da-23-cargos-atendimento-app.test.ts:196` | — | leitura-do-fonte | o cartão do plano aceito no Início tem "Ver o plano" no resumo; atalho de tela sem regra |
| `tests/atritos-da-24-caixa.test.ts:141` | — | leitura-do-fonte | Confere que a parcela compacta quebra em vez de cortar com reticências; detalhe de layout sem regra. |
| `tests/atritos-da-24-cargos-atendimento-app.test.ts:57` | regras/plataforma.md:1175 | leitura-do-fonte | o seletor travado só mostra o nível que vale, com cadeado; era o PDV travado pelo Financeiro, que saiu com a PV-04; hoje sem caso de regra |
| `tests/atritos-da-24-cargos-atendimento-app.test.ts:86` | — | leitura-do-fonte | o subtítulo do Estoque da rede de uma unidade não repete "Estoque"; texto sem regra |
| `tests/atritos-da-24-cargos-atendimento-app.test.ts:205` | — | leitura-do-fonte | o sino do app não corta o texto (até três linhas); desenho sem regra |
| `tests/atritos-da-24-crm-clientes-cadastros.test.ts:69` | — | leitura-do-fonte | Confere que o CSS do .field-label tem text-align: left. regras/design.md:272 define a classe do rótulo, não o alinhamento. |
| `tests/auditoria-atritos-da-18.test.ts:109` | — | unidade | confere o recorte da leitura "de quem tem unidades" (unidades dela ou sem unidade gravadas por ela); o catálogo o põe como implementação que não alcança ninguém, e o contexto do teste (Admin com unidades) não existe |
| `tests/automacoes-condicoes.test.ts:32` | — | unidade | robustez: caminho que atravessa um valor simples devolve indefinido, sem erro |
| `tests/automacoes-expressao.test.ts:205` | — | unidade | implementação: reconhece o caminho simples (atalho que não passa pelo analisador) |
| `tests/automacoes-expressao.test.ts:268` | — | unidade | robustez: campo vazio na regra não vira erro |
| `tests/automacoes-limites.test.ts:68` | — | unidade | robustez: hora malformada no silêncio não vira silêncio permanente |
| `tests/automacoes-modelos.test.ts:72` | — | unidade | implementação: cada chamada devolve um grafo novo (editar um não muda o modelo) |
| `tests/automacoes-modelos.test.ts:80` | — | unidade | implementação: chave desconhecida não tem modelo |
| `tests/automacoes-tempo.test.ts:66` | — | unidade | robustez: campo vazio ou que não é data não vira espera, com o motivo |
| `tests/automacoes-tempo.test.ts:82` | — | unidade | passada 1 hora do horário, o disparo do dia se perde; nenhuma regra fala dessa tolerância |
| `tests/automacoes-tempo.test.ts:114` | — | unidade | robustez: hora malformada não dispara nunca |
| `tests/automacoes-tempo.test.ts:168` | — | unidade | robustez: sem intervalo não dispara |
| `tests/automacoes-validar.test.ts:211` | — | unidade | implementação: a lista de fatos que a automação assina sai do grafo sem repetir |
| `tests/automacoes-validar.test.ts:216` | — | unidade | implementação: gatilho sem fato escolhido não vira assinatura de nome vazio |
| `tests/automacoes-validar.test.ts:263` | — | unidade | implementação: caminho simples não passa pelo analisador de expressão |
| `tests/automacoes-variaveis-disponiveis.test.ts:58` | — | unidade | robustez: fluxo em anel não trava a tela de montagem |
| `tests/automacoes-variaveis-disponiveis.test.ts:146` | — | unidade | dica de tela: o exemplo longo é cortado em 80 caracteres |
| `tests/automacoes-variaveis-disponiveis.test.ts:152` | — | unidade | dica de tela: o exemplo nulo aparece como traço |
| `tests/automacoes-variaveis-disponiveis.test.ts:159` | — | unidade | robustez: dados ausentes do fato não quebram |
| `tests/busca-universal.test.ts:124` | — | unidade | Confere que a página achada pelo próprio nome não leva subtítulo (apresentação; o PB-04 fala só das duas telas do mesmo apelido). |
| `tests/busca-universal.test.ts:156` | — | unidade | Confere o telefone exibido na linha (tira o 55 e põe a máscara); nenhuma regra da busca fala do formato mostrado. |
| `tests/busca-universal.test.ts:172` | — | unidade | Confere que a linha do membro desativado diz "desativado"; nenhuma regra da busca o pede. |
| `tests/busca-universal.test.ts:186` | — | unidade | Tipo desconhecido não vira resultado (defesa do código, sem regra de produto). |
| `tests/busca-universal.test.ts:190` | — | unidade | Confere o subtítulo da conversa (canal, caixa, começo da mensagem cortado em 57); apresentação sem regra. |
| `tests/busca-universal.test.ts:211` | — | unidade | Termo vazio deixa passar toda conversa no inbox; comportamento trivial, sem regra. |
| `tests/capi-payload.test.ts:25` | — | unidade | Formato do evento da API de Conversões (action_source business_messaging, canal whatsapp). Integração com a Meta; nenhuma regra no catálogo nem em docs/regras (área: Anúncios, não sistema). |
| `tests/capi-payload.test.ts:31` | — | unidade | O ctwa_clid vai em user_data do evento da Meta. Implementação da integração; sem regra escrita. |
| `tests/capi-payload.test.ts:36` | — | unidade | O evento usa o event_id recebido (deduplicação na Meta). Sem regra escrita. |
| `tests/capi-payload.test.ts:41` | — | unidade | event_time é o momento do fato, não do envio. Sem regra escrita. |
| `tests/capi-payload.test.ts:46` | — | unidade | Telefone (só dígitos) e e-mail (minúsculo, sem espaço) vão com hash sha256. Sem regra escrita. |
| `tests/capi-payload.test.ts:57` | — | unidade | Purchase leva valor e moeda BRL. Sem regra escrita (regras/vendas-financeiro.md:3221 fala de não reenviar o Purchase, não do formato). |
| `tests/capi-payload.test.ts:66` | — | unidade | Evento sem valor não manda value 0 nem moeda. Lembra o princípio 4, mas não há regra da integração. |
| `tests/capi-payload.test.ts:75` | — | unidade | Sem telefone nem e-mail, o evento sai só com o ctwa_clid. Sem regra escrita. |
| `tests/cliente-rapido.test.ts:5` | — | unidade | Confere só que o auxiliar tira o que não é dígito do telefone. |
| `tests/cliente-rapido.test.ts:10` | — | unidade | Confere só que o auxiliar aguenta vazio e nulo. |
| `tests/cliente-rapido.test.ts:15` | — | unidade | Título fala em casar pelos 8 dígitos finais (regra velha: crm-inbox:IN-03 diz número inteiro); o corpo só confere o fatiamento da string, nenhum casamento do sistema. |
| `tests/comissoes-config.test.ts:24` | — | unidade | só confere que a leitura devolve o que foi salvo (estrutura da configuração) |
| `tests/comissoes-config.test.ts:40` | — | unidade | validação de formato da entrada da configuração; nenhuma regra de produto |
| `tests/comissoes-config.test.ts:118` | — | unidade | confere a estrutura da linha de comissão montada, não uma regra |
| `tests/comissoes-config.test.ts:122` | — | unidade | preço do pacote ÷ sessões do pacote antigo sem preço vendido: KA-05, que o catálogo diz ser caminho de dado antigo |
| `tests/comissoes-config.test.ts:255` | — | leitura-do-fonte | confere o texto de docs/regras/comissoes.md, não o sistema |
| `tests/comissoes-extrato-texto.test.ts:97` | — | leitura-do-fonte | confere o texto de docs/regras/comissoes.md, não o sistema |
| `tests/comissoes-periodo.test.ts:34` | — | unidade | validação da chave do período vinda da URL; nenhuma regra de produto |
| `tests/configuracoes-abas-do-acesso.test.ts:38` | — | unidade | formata o texto do topo das Configurações (abas em minúsculas, a sigla LGPD mantida); nenhuma regra fala desse texto |
| `tests/copilot-executor.test.ts:148` | — | unidade | confere o formato técnico das ferramentas para a OpenAI (JSON Schema) |
| `tests/copilot-texto.test.ts:35` | — | unidade | confere a formatação do texto ("-" e "1." viram lista, linha em branco separa parágrafos) |
| `tests/correcoes-da-24-area3.test.ts:131` | — | leitura-do-fonte | a janela (modal) da tela; nenhuma regra a fixa |
| `tests/defeitos-da-15.test.ts:41` | — | leitura-do-fonte | Varre o repositório atrás de caractere de controle (D4 da 15ª: um \x01 num texto da tela); higiene do fonte, nenhuma regra o pede. |
| `tests/defeitos-da-15.test.ts:61` | — | leitura-do-fonte | Confere que toda entrada do menu da rede tem ícone no sidebar (D8 da 15ª); nenhuma regra do catálogo nem de docs/regras pede ícone em cada entrada. |
| `tests/defeitos-da-15.test.ts:65` | — | leitura-do-fonte | O mesmo do caso :61 para o menu da unidade (toda entrada tem ícone); sem regra. |
| `tests/dica-abre-em-tela-so-de-leitura.test.ts:34` | regras/design.md:239 | leitura-do-fonte | O nome da dica vem do ::after (.dica-nome), não do aria-label, para não poluir o getByLabel do campo; é implementação a favor dos testes, sem regra. |
| `tests/dinheiro-do-formulario.test.ts:72` | — | unidade | Confere que NaN vira campo vazio na formatação; detalhe de implementação. |
| `tests/documentos-arvore.test.ts:57` | — | unidade | o conversor recusa o nó que a árvore não conhece e o texto vazio: implementação da árvore do editor |
| `tests/documentos-arvore.test.ts:88` | — | unidade | o lugar da assinatura e a quebra de página recusados dentro do cabeçalho ou da lista: implementação da árvore |
| `tests/documentos-arvore.test.ts:99` | — | unidade | a marcação antiga convertida para a árvore dá o mesmo texto: migração de formato, não regra |
| `tests/documentos-assinar-sem-permissao.test.ts:121` | — | leitura-do-fonte | confere que um helper (quemColheOsDocumentos) e um arquivo antigos saíram: limpeza de código |
| `tests/documentos-marcacao.test.ts:11` | — | unidade | o leitor da marcação antiga reconhece título, parágrafo, lista, divisória e assinatura: implementação do formato antigo |
| `tests/documentos-marcacao.test.ts:24` | — | unidade | o leitor da marcação antiga separa negrito e variável: implementação do formato antigo |
| `tests/documentos-marcacao.test.ts:34` | — | unidade | o leitor da marcação antiga aceita a quebra de linha do Windows: robustez do formato antigo |
| `tests/documentos-marcacao.test.ts:40` | — | unidade | lista as variáveis citadas sem repetir: implementação do formato antigo |
| `tests/documentos-marcacao.test.ts:53` | — | unidade | o valor da variável entra como texto puro (marcação no nome não é interpretada): proteção do formato antigo |
| `tests/documentos-marcacao.test.ts:70` | — | unidade | o texto corrido para o export (lista vira marcadores): implementação |
| `tests/documentos-pdf.test.ts:89` | — | unidade | o caractere sem desenho na fonte vira "?" no PDF: robustez da geração |
| `tests/documentos-valores.test.ts:15` | — | unidade | a máscara do CPF e do CNPJ no texto do documento: formatação, nenhuma regra diz |
| `tests/equipe-atende.test.ts:27` | — | unidade | lê o "Atende" do formulário (a lista do checklist; o formulário antigo devolve null): leitura do campo, implementação |
| `tests/equipe-atende.test.ts:38` | — | unidade | junta nomes de unidades com vírgula e "e": auxiliar de texto, sem regra própria |
| `tests/equipe-contagem.test.ts:9` | — | unidade | Concordância de número no texto da Equipe ("1 membro cadastrado"). |
| `tests/equipe-contagem.test.ts:13` | — | unidade | Concordância no plural e no zero. |
| `tests/equipe-contagem.test.ts:17` | — | unidade | "em toda a rede" não flexiona. |
| `tests/erro-na-tela.test.ts:57` | — | unidade | A action de um build anterior (UnrecognizedActionError) recarrega a página e diz que o sistema foi atualizado. Nenhuma regra escrita. |
| `tests/erro-na-tela.test.ts:66` | — | unidade | Recarregou há pouco: só avisa, não entra em laço. Nenhuma regra escrita. |
| `tests/eventos-catalogo.test.ts:84` | — | unidade | implementação: nenhum nome de fato repetido com chaves diferentes |
| `tests/eventos-emitir.test.ts:70` | — | unidade | robustez: erro do banco ao gravar o fato não derruba a ação que o emitiu |
| `tests/eventos-emitir.test.ts:78` | — | unidade | robustez: exceção ao gravar o fato não derruba a ação |
| `tests/eventos-emitir.test.ts:85` | — | unidade | log: a repetição barrada pela chave do fato não vira erro no log |
| `tests/eventos-emitir.test.ts:105` | — | unidade | implementação: nome vazio de quem agiu vira nulo |
| `tests/ficha-do-procedimento-na-conclusao.test.ts:47` | — | unidade | Confere que ficha sem campo nenhum não é gravada (detalhe da montagem do retrato). |
| `tests/fidelidade-config.test.ts:15` | — | unidade | Confere que o schema da configuração converte o texto "1.5" em número. Implementação do schema; nenhuma regra do catálogo. |
| `tests/fidelidade-config.test.ts:57` | — | unidade | O numeric do banco chega como texto e vira número. Implementação da leitura. |
| `tests/fidelidade-config.test.ts:62` | fidelidade:PG-01 | unidade | Valor desconhecido na linha cai no padrão (desligado, por real). Leitura defensiva; não prova regra de produto. |
| `tests/fidelidade-config.test.ts:70` | — | unidade | Formatação de pontos em pt-BR (milhar, singular, sinal de menos). |
| `tests/fidelidade-config.test.ts:76` | — | unidade | O valor em R$ dos pontos nunca sai negativo nem com o valor do ponto zero. Formatação. |
| `tests/fidelidade-config.test.ts:82` | — | unidade | Todo tipo do extrato tem rótulo próprio (não "Lançamento"). Formatação. |
| `tests/fidelidade-voucher.test.ts:47` | — | unidade | A descrição do voucher em uma linha ("15% de desconto", nome do procedimento). Formatação. |
| `tests/financeiro-abas.test.ts:30` | — | unidade | Confere que os endereços antigos (?aberto=…) levam à aba nova; compatibilidade de link, sem regra. |
| `tests/financeiro-csv-dos-lancamentos.test.ts:53` | — | unidade | confere só o nome do arquivo do CSV; nenhuma regra fixa o nome |
| `tests/historico-autor-e-avaliacao.test.ts:9` | — | unidade | Cada evento da linha do tempo da ficha ganha o nome de quem fez a ação (o da última vez, com "via suporte"); J-26/J-27, sem regra no catálogo nem em docs/regras. |
| `tests/historico-autor-e-avaliacao.test.ts:18` | — | unidade | A chegada leva o autor do CHECKIN; evento sem agendamento fica sem autor. Mesmo recurso do :9, sem regra escrita. |
| `tests/historico-autor-e-avaliacao.test.ts:50` | — | unidade | rotuloDaAcao dá nome às ações do histórico do agendamento e usa a descrição na desconhecida; implementação, sem regra. |
| `tests/inbox-busca.test.ts:27` | — | unidade | Menos de 3 dígitos não busca por telefone: um limite do código que nenhuma regra da busca põe. |
| `tests/inicio-adiantado.test.ts:41` | — | unidade | O texto do atraso ao iniciar ("57 min depois do horário marcado (10:00)"); o catálogo deixou fora como texto (atendimento "Ficou fora", AG-80). |
| `tests/inicio-adiantado.test.ts:46` | — | unidade | Até 5 min de atraso e o início adiantado não marcam atraso; mesmo texto deixado fora do catálogo (AG-80). |
| `tests/injetaveis-dose.test.ts:5` | — | unidade | Confere só o formato do número da dose na tela (exibição). |
| `tests/mascaras-do-setup.test.ts:12` | — | unidade | máscara de CNPJ enquanto se digita; nenhuma regra fala dela |
| `tests/mascaras-do-setup.test.ts:20` | — | unidade | a máscara de CNPJ ignora o que não é dígito e corta no 14º |
| `tests/mascaras-do-setup.test.ts:44` | — | unidade | máscara de CPF ou CNPJ: até 11 dígitos a do CPF; nenhuma regra fala dela |
| `tests/mascaras-do-setup.test.ts:49` | — | unidade | máscara de CPF ou CNPJ: do 12º dígito, a do CNPJ |
| `tests/mascaras-do-setup.test.ts:56` | — | unidade | máscara de CEP com o hífen depois do quinto dígito; nenhuma regra fala dela |
| `tests/mascaras-do-setup.test.ts:66` | — | unidade | lerHorarioDoForm: campo ausente não mexe no horário (leitura do formulário, implementação) |
| `tests/mascaras-do-setup.test.ts:69` | — | unidade | lerHorarioDoForm: vazio grava sem horário |
| `tests/mascaras-do-setup.test.ts:72` | — | unidade | lerHorarioDoForm: horário válido volta normalizado |
| `tests/mascaras-do-setup.test.ts:75` | — | unidade | lerHorarioDoForm: horário que termina antes de começar é erro ("Horário inválido"); recusa o impossível, mas nenhuma regra o escreve |
| `tests/menu.test.ts:69` | comissoes:CM-03; plataforma:CG-17 | unidade | Exige que o Financeiro em Gerenciar abra Configurações na rede (aba de comissões); a aba é só da Admin da rede (CM-03) e o CG-17 tira a entrada em menuDaRedeFor: confere só a camada de baixo, sem regra viva. |
| `tests/menu.test.ts:75` | plataforma:CG-17 | unidade | O rótulo "Tags e importações" para quem só tem o CRM em Gerenciar (J-16); nenhuma regra escrita o pede, e Tags e Importações são da rede toda (só a Admin), que o CG-17 tira do menu depois. |
| `tests/menu.test.ts:91` | — | unidade | O menu da unidade não tem entrada separada de modelos de ficha; estrutura do menu, sem regra. |
| `tests/menu.test.ts:97` | CLAUDE.md §1 princípio 7 | unidade | Categoria sem item não aparece no menu; desenho do menu, sem regra escrita. |
| `tests/menu.test.ts:104` | — | unidade | O Dashboard fica solto no topo, antes das categorias; desenho do menu. |
| `tests/metrics-ocupacao.test.ts:33` | — | unidade | Teto de 100% na ocupação; nenhuma regra diz o teto. |
| `tests/metrics-period.test.ts:9` | — | unidade | Aceita só as chaves de período conhecidas (validação do parâmetro). |
| `tests/metrics-period.test.ts:17` | — | unidade | Período desconhecido cai no mês (padrão do parâmetro). |
| `tests/metrics-period.test.ts:69` | — | unidade | "Últimos 7 dias" = hoje e os 6 anteriores, e o rótulo. |
| `tests/metrics-period.test.ts:75` | — | unidade | A semana do período começa na segunda. |
| `tests/metrics-period.test.ts:101` | — | unidade | Personalizado sem datas cai no mês corrente (padrão do parâmetro). |
| `tests/metrics-period.test.ts:117` | — | unidade | Variação zero mostrada como alta (sem seta para baixo). |
| `tests/metrics-resultado-da-lista.test.ts:24` | — | unidade | Soma ao centavo, sem resto de ponto flutuante. |
| `tests/nome-dos-procedimentos.test.ts:6` | — | unidade | Como juntar os nomes dos procedimentos na tela (AG-142, exibição fora do catálogo). |
| `tests/nome-dos-procedimentos.test.ts:12` | — | unidade | Idem: exibição do nome dos procedimentos. |
| `tests/pacotes-rateio.test.ts:34` | — | unidade | confere o texto da composição do pacote; nenhuma regra fixa esse texto |
| `tests/pacotes.test.ts:22` | — | unidade | esquema de senha (autenticação), não é desta área |
| `tests/pacotes.test.ts:33` | — | unidade | esquema de login (autenticação), não é desta área |
| `tests/pacotes.test.ts:62` | — | unidade | junção de tags e cor da origem; nenhuma regra |
| `tests/pacotes.test.ts:72` | — | unidade | formatação (describe "formatação") |
| `tests/pacotes.test.ts:79` | — | unidade | máscaras; a regra delas ficou fora do catálogo |
| `tests/pacotes.test.ts:99` | — | unidade | tempo parado do CRM (describe "CRM: tempo parado") |
| `tests/pacotes.test.ts:105` | — | unidade | tempo parado do CRM |
| `tests/pdv-total-da-comanda-e-sem-cobranca.test.ts:90` | — | leitura-do-fonte | confere só o nowrap do layout do total; nenhuma regra do catálogo |
| `tests/pendencias-area-1.test.ts:126` | — | leitura-do-fonte | Um desenho só de cartão na Minha agenda (23ª A24); o catálogo deixou o desenho da Minha agenda fora (atendimento "Ficou fora", AG-28). |
| `tests/permissions.test.ts:44` | — | unidade | resolvePermissions devolve uma cópia (mexer nela não altera ALL_PERMISSIONS): implementação |
| `tests/permissions.test.ts:50` | — | unidade | ignora linha de módulo que não existe mais: implementação |
| `tests/permissions.test.ts:114` | — | unidade | as abas de Relatórios voltam na ordem da tela, não na do banco: implementação |
| `tests/permissions.test.ts:119` | — | unidade | ignora aba de relatório que não existe mais: implementação |
| `tests/permissions.test.ts:127` | — | unidade | toda aba de Relatórios tem rótulo e dica de texto; nenhuma regra o pede |
| `tests/plano-sessao-vazia-da-25.test.ts:16` | — | unidade | Recusa plano com sessão sem procedimento (A1(b) da 25ª); só invoca os princípios 3 e 7, nenhuma regra escrita diz isso. |
| `tests/plano-sessao-vazia-da-25.test.ts:21` | — | unidade | Idem: sessão vazia no plano é recusada; sem regra escrita. |
| `tests/plano-sessao-vazia-da-25.test.ts:25` | — | leitura-do-fonte | Idem, pelo fonte da action do plano. |
| `tests/plano-situacao.test.ts:29` | — | unidade | Exige o rótulo "Fechado" para o plano aceito; nenhuma regra dá esse nome (PL-20 fala em "Aceito (falta assinar)"); o título fala em checkout, que saiu (PL-07). |
| `tests/plano-situacao.test.ts:33` | — | unidade | Situação desconhecida não quebra a tela (robustez). |
| `tests/plano-uma-venda-uma-comanda.test.ts:58` | — | leitura-do-fonte | confere o texto de um doc de regras, não o sistema |
| `tests/planos-recursos.test.ts:36` | — | unidade | Robustez da validação dos recursos do plano (entrada malformada não quebra). |
| `tests/plataforma-porta.test.ts:9` | regras/plataforma.md:101-114 | unidade | lista de IPs da plataforma (ipPermitido): o catálogo a põe em "Ficou fora" como implementação |
| `tests/plataforma-porta.test.ts:14` | regras/plataforma.md:101-114 | unidade | lista de IPs da plataforma (ipPermitido): o catálogo a põe em "Ficou fora" como implementação |
| `tests/plataforma-porta.test.ts:25` | regras/plataforma.md:101-114 | unidade | CSP dos apps da plataforma: o catálogo o põe em "Ficou fora" como implementação |
| `tests/plataforma-porta.test.ts:33` | regras/plataforma.md:101-114 | unidade | CSP dos apps da plataforma: o catálogo o põe em "Ficou fora" como implementação |
| `tests/plataforma-porta.test.ts:37` | regras/plataforma.md:101-114 | unidade | CSP dos apps da plataforma: o catálogo o põe em "Ficou fora" como implementação |
| `tests/plataforma-porta.test.ts:41` | regras/plataforma.md:101-114 | unidade | CSP dos apps da plataforma: o catálogo o põe em "Ficou fora" como implementação |
| `tests/procedimentos-executados-em-ordem.test.ts:24` | — | leitura-do-fonte | Ordem de exibição dos procedimentos executados; nenhuma regra fixa essa ordem. |
| `tests/prontuario-registros.test.ts:70` | — | unidade | Ordem dos registros (mais recente primeiro); nenhuma regra fixa. |
| `tests/rascunho-do-atendimento.test.ts:51` | — | unidade | Robustez da leitura do rascunho (conteúdo malformado não quebra). |
| `tests/rascunho-do-atendimento.test.ts:124` | — | unidade | O armazenamento do navegador que falha não derruba a tela (robustez). |
| `tests/relatorio-vendas-descricao.test.ts:26` | — | unidade | A descrição "3× Botox" do pré-pago; a VE-07 fala da quantidade do produto. |
| `tests/relatorios-filtro-de-tags.test.ts:52` | — | unidade | Sem tag, a chamada à função é a de antes (implementação). |
| `tests/resumo-do-horario.test.ts:11` | — | unidade | Texto do resumo do horário (AG-167, exibição fora do catálogo). |
| `tests/resumo-do-horario.test.ts:20` | — | unidade | Texto do resumo do horário (exibição). |
| `tests/retrato-dos-injetaveis.test.ts:75` | — | unidade | Nome padrão "Planejamento sem nome" do planejamento sem título (exibição). |
| `tests/saudacao-e-iniciais.test.ts:22` | — | unidade | O primeiro nome guarda o título ("Dra. Lívia") e tira o parêntese; correção de exibição sem regra escrita. |
| `tests/sessao-antiga-do-aparelho.test.ts:24` | — | unidade | A falha do plugin não derruba a página. Robustez da limpeza; nenhuma regra escrita. |
| `tests/sinais-em-rajada.test.ts:17` | — | unidade | Uma rajada de sinais vira uma chamada ao servidor depois da janela; desempenho (resposta ao Heitor em 19/11), sem regra escrita. |
| `tests/sinais-em-rajada.test.ts:45` | — | unidade | Cancelar descarta a chamada pendente (a tela saiu); implementação. |
| `tests/sinais-em-rajada.test.ts:54` | — | unidade | Janela zero chama na hora; implementação. |
| `tests/sistema-regras.test.ts:24` | — | unidade | conversão de centavos para reais (utilitário do sistema), sem regra de negócio |
| `tests/sistema-regras.test.ts:33` | — | unidade | conversão de reais para centavos (utilitário do sistema), sem regra de negócio |
| `tests/sistema-regras.test.ts:41` | — | unidade | gera o slug da rede a partir do nome; o padrão de reserva é o identificador 'clinica' |
| `tests/sistema-regras.test.ts:45` | — | unidade | o documento da rede guarda só os dígitos |
| `tests/suporte-chamados.test.ts:5` | — | unidade | as transições de situação do chamado (aberta, respondida...): nenhuma regra as define |
| `tests/suporte-chamados.test.ts:10` | — | unidade | as transições de situação do chamado: nenhuma regra as define |
| `tests/suporte-chamados.test.ts:15` | — | unidade | as transições de situação do chamado: nenhuma regra as define |
| `tests/suporte-chamados.test.ts:46` | — | unidade | as quatro situações do chamado e seus rótulos: nenhuma regra as define |
| `tests/suporte-marca-no-cliente-de-servico.test.ts:35` | — | unidade | desempenho: a leitura não pergunta pela sessão de suporte |
| `tests/suporte-marca-no-cliente-de-servico.test.ts:42` | plataforma:SU-06 | unidade | robustez: se falha descobrir a sessão, escreve sem marca; nenhuma regra diz isso |
| `tests/suporte-regras.test.ts:39` | plataforma:SU-01 | unidade | exige o Prontuário em Gerenciar para autorizar o suporte com o clínico; SU-01 só diz que autorizar é da Admin da rede |
| `tests/suporte-regras.test.ts:81` | regras/plataforma.md:559-575 | unidade | código de entrada entre hosts do "entrar como": o catálogo o põe em "Ficou fora" como implementação |
| `tests/suporte-regras.test.ts:92` | regras/plataforma.md:576-600 | unidade | session_id da sessão de suporte: o catálogo o põe em "Ficou fora" como implementação |
| `tests/tags-da-pessoa.test.ts:55` | — | unidade | o embed com a chave explícita (implementação contra o PGRST201) |
| `tests/tags-da-pessoa.test.ts:189` | — | leitura-do-fonte | a ponte provisória da migration aditiva (que a 20261125500002 tira) |
| `tests/telas-atritos-da-21.test.ts:13` | — | leitura-do-fonte | O seletor do insumo no procedimento não corta o nome (quebra a linha, title com o nome); desenho de tela, sem regra. |
| `tests/telas-atritos-da-21.test.ts:37` | documentos:DM-09 | leitura-do-fonte | O texto inicial do contrato de pacote no editor começa com "Contrato de pacote"; texto de tela sem regra (DM-09 só diz que a rede nasce com o padrão). |
| `tests/telas-atritos-da-21.test.ts:44` | — | leitura-do-fonte | O botão Reativar da Equipe tem o texto à vista, não só o ícone; desenho, sem regra. |
| `tests/telas-atritos-da-21.test.ts:48` | — | leitura-do-fonte | A coluna Unidade da Equipe tem largura mínima e até duas linhas, com o nome no title; desenho, sem regra. |
| `tests/texto-do-plano.test.ts:15` | — | unidade | Rótulo "Teste grátis" do plano (exibição). |
| `tests/texto-do-plano.test.ts:18` | — | unidade | Rótulo "Sem plano definido" (exibição). |
| `tests/textos-do-plano-da-9.test.ts:23` | — | unidade | Texto do rodapé do plano pago (exibição). |
| `tests/token-do-navegador.test.ts:14` | CLAUDE.md §4 | unidade | Guarda o access token em memória e não pede de novo enquanto vale; cache de implementação (a regra é só que o navegador pega o access token pelo servidor). |
| `tests/token-do-navegador.test.ts:34` | — | unidade | Pedidos ao mesmo tempo dividem uma busca; implementação. |
| `tests/uazapi-anuncio.test.ts:83` | crm-inbox:IN-07 | unidade | Lê as URLs do anúncio no pacote do provedor; detalhe de leitura sem regra própria. |
| `tests/uazapi-anuncio.test.ts:89` | crm-inbox:IN-07 | unidade | Aceita o mediaType numérico do provedor; detalhe de leitura sem regra própria. |
| `tests/uazapi-anuncio.test.ts:99` | crm-inbox:IN-07 | unidade | Lê o sourceApp do anúncio; detalhe de leitura sem regra própria. |
| `tests/uazapi-anuncio.test.ts:118` | crm-inbox:IN-07 | unidade | Lê o título e o corpo do anúncio; detalhe de leitura sem regra própria. |
| `tests/uazapi-anuncio.test.ts:136` | crm-inbox:IN-07 | unidade | Guarda a miniatura do anúncio em base64; detalhe de implementação sem regra. |
| `tests/uazapi-anuncio.test.ts:145` | crm-inbox:IN-07 | unidade | Deixa de fora a miniatura grande demais; limite de implementação sem regra. |
| `tests/varredura-vendas-financeiro.test.ts:140` | — | leitura-do-fonte | confere o texto do doc comissoes.md, não o sistema |
| `tests/varredura-vendas-financeiro.test.ts:261` | — | leitura-do-fonte | confere o texto de um doc de regras, não o sistema |
| `tests/varredura-vendas-financeiro.test.ts:268` | — | leitura-do-fonte | confere o texto de um doc de regras, não o sistema |
| `tests/whatsapp-rotulo.test.ts:34` | whatsapp-push:WN-06 | unidade | Corta o nome escolhido em 60 caracteres, sem avisar; nenhuma regra põe esse limite (ver CLAUDE.md §1 princípio 2). **Resolvido em 25/11: 60 é o limite em todo caminho (o Heitor, "60 pra tudo"); ao renomear, o campo para em 60 e a action recusa acima. O caso fica.** |

## 3. Os testes que repetem outro (`duplica`)

| Caso | Regras | Camada | Nota |
|---|---|---|---|
| `e2e-site/site.spec.ts:192` | site:TX-04 | tela | O :327 já abre o "horário de silêncio" pelo foco, confere o 21h e o aria-describedby; aqui só se acrescenta "escondido antes" e "espera". |
| `e2e/abrangencia-atende-em-outra-unidade-f73.spec.ts:75` | plataforma:LO-04 | tela | mesma prova: a unidade que não é dela pela URL leva à dela, com o aviso |
| `e2e/agenda-dia-a-dia.spec.ts:79` | atendimento:AG-32; atendimento:AG-36 | tela | Com a Agenda em Gerenciar a janela mostra Cancelar e Não compareceu no agendamento dela; o :205 confere isso e ainda grava os dois |
| `e2e/assinaturas-asaas.spec.ts:115` | CLAUDE.md §6 | integracao | mesma prova: o webhook do Asaas com token errado responde 401 e nada se grava |
| `e2e/configuracoes-geral.spec.ts:47` | regras/design.md:278 | tela | mesma prova: o documento digitado com máscara é gravado só com os dígitos |
| `e2e/estoque-cadastro-f66.spec.ts:100` | atendimento:ES-02 | integracao | Quem tem só uma unidade e o Estoque em Gerenciar cria e exclui categoria pela action; o :93 de marcas cobre isso e mais |
| `e2e/fechamento-do-dia.spec.ts:75` | vendas-financeiro:FC-01 | tela | Quem tem o Financeiro em Ver na rede vê o fechamento da unidade no /admin, sem o "Fechar o dia" — o mesmo que o CX4 do pdv-fechar-o-dia, que confere mais (o Fechar de novo e o campo de contagem). |
| `e2e/ficha-cadastro-validacao.spec.ts:104` | crm-inbox:CL-07 | tela | o mesmo telefone, "Cadastrar mesmo assim" (mãe e filha), pela tela; só acrescenta que o nome fica no campo |
| `e2e/ficha-cadastro-validacao.spec.ts:181` | crm-inbox:CL-08; crm-inbox:CL-09 | tela | unificar com a ficha do mesmo telefone sem trocar o nome; a "ficha rápida" já não é caso à parte |
| `e2e/ficha-cadastro-validacao.spec.ts:205` | crm-inbox:CL-07 | tela | "Cadastrar mesmo assim" com o mesmo telefone cria a ficha nova e a outra fica |
| `e2e/fidelidade-validade.spec.ts:49` | fidelidade:SA-05 | tela | A Admin liga o programa e põe a validade de 6 meses pela tela; o opcionais:87 faz o mesmo e mais. |
| `e2e/fidelidade-validade.spec.ts:108` | CLAUDE.md §14 "Rota de /api/* sem defesa própria" | integracao | Só confere 200 com o segredo; o opcionais:217 confere isso, o 401 sem segredo e o efeito. Não confere expiração nenhuma. |
| `e2e/importacao-contatos.spec.ts:525` | crm-inbox:IM-02 | integracao | a mesma permissão (o CRM em Gerenciar sem ser a Admin da rede) e a mesma recusa da action |
| `e2e/portais-isolamento.spec.ts:92` | plataforma:LO-04; CLAUDE.md §11 | tela | Membro de uma unidade não fica no /admin. O vizinho prova o mesmo redirecionamento, com rede própria e o motivo na tela. |
| `e2e/portais-isolamento.spec.ts:98` | plataforma:LO-04; CLAUDE.md §11 | tela | Outra unidade pela URL leva à dele. O vizinho prova o mesmo, com rede própria e o motivo; este pula na rede de uma unidade. |
| `e2e/portais-isolamento.spec.ts:178` | CLAUDE.md §5 | tela | A cliente abre o portal de outra unidade da mesma rede. O vizinho prova o mesmo (e mais), com rede própria; o comentário do caso diz que a prova inteira é lá. |
| `e2e/procedimentos-atritos-da-8.spec.ts:54` | atendimento:PC-01; atendimento:PC-02 | tela | o mesmo membro de unidade fixa com Procedimentos em Gerenciar vendo "Novo procedimento" no portal da unidade; o :61 confere isso e mais |
| `e2e/whatsapp-numeros-tela.spec.ts:75` | whatsapp-push:WN-05 | integracao | O mesmo: rede própria com um padrão, update de outro número para padrão, o índice devolve 23505. |
| `tests/agenda-desenho-ate-a-ocupacao.test.ts:78` | atendimento:AG-08 | unidade | bateNaOcupacao do concluído adiantado: ocupa até a conclusão; o resto está livre |
| `tests/agenda-desenho-ate-a-ocupacao.test.ts:86` | atendimento:AG-08 | unidade | minutosDesenhados do concluído 20 min depois do início = 20 |
| `tests/agenda-desenho-ate-a-ocupacao.test.ts:135` | atendimento:AG-67; atendimento:AG-08 | unidade | a mesma conta de bateNaOcupacao do concluído adiantado, com o controle do Confirmado (já em :20 daquele arquivo) |
| `tests/atritos-da-21-caixa.test.ts:221` | vendas-financeiro:FC-06 | unidade | Mesmo texto de avisoDaGavetaNegativa com outro valor; o par de 20:85 já confere o texto exato. |
| `tests/atritos-da-22-caixa.test.ts:71` | vendas-financeiro:PV-15 | unidade | formasDaComandaEmTexto com duas formas; não liga a venda estornada, então é a mesma prova de 19:69. |
| `tests/atritos-da-22-caixa.test.ts:95` | vendas-financeiro:FC-04 | leitura-do-fonte | Confere só que a tela do Fechamento chama diferencaNaTela, o que 19:109 já confere. |
| `tests/atritos-da-23-cargos-atendimento-app.test.ts:52` | atendimento:AT-02; plataforma:CG-16 | unidade | tratamentosNoResumo com o Atendimento em Ver e nulo sem ele: as mesmas asserções |
| `tests/atritos-da-23-financeiro.test.ts:48` | vendas-financeiro:CR-06 | unidade | Mesmo textoDasComValorEmAberto (1, N, 0) que 21:191. |
| `tests/atritos-da-23-financeiro.test.ts:158` | vendas-financeiro:FN-11 | unidade | A mesma constante do rótulo "em aberto" que 22:47 já confere. |
| `tests/atritos-da-24-caixa.test.ts:82` | vendas-financeiro:PV-15 | unidade | Mesma entrada (2 × 98, total 184,44) e o mesmo resultado (detalhe e desconto 11,56) de 21:72. |
| `tests/atritos-da-24-cargos-atendimento-app.test.ts:35` | atendimento:AT-01; atendimento:AT-03; plataforma:CG-12 | unidade | conclusaoNoResumo com os mesmos textos para Atendimento em Ver e em Gerenciar sem o Prontuário |
| `tests/atritos-da-24-cargos-atendimento-app.test.ts:145` | atendimento:AG-04 | leitura-do-fonte | o encaixe passa por avisoForaDoHorario; :166 confere o mesmo com os argumentos |
| `tests/busca-universal.test.ts:206` | busca:TE-02; busca:TE-01 | unidade | A mesma função (conversaCasaComBusca) casando o telefone pelos dígitos com ou sem máscara. |
| `tests/campanha-filtros-chegam-ao-disparo.test.ts:66` | automacoes:PU-06 | unidade | o "Revisar" diz "Sem visita há mais de 60 dias"; o caso :6 confere a mesma frase na mesma função |
| `tests/campanha-imediata-ou-agendada.test.ts:58` | automacoes:CP-06 | unidade | "todo ano em 08/03, a partir das 09:00": a mesma asserção, na mesma função, que o caso :8 |
| `tests/cargos-equipe-atritos-da-22.test.ts:77` | regras/design.md:122 | leitura-do-fonte | o mesmo regex (data-acoes-do-membro com flexWrap: 'wrap') nas duas Equipes; o caso da 25ª confere isso e ainda que não há nowrap |
| `tests/checkout-parcelas-gravadas.test.ts:22` | vendas-financeiro:CR-04; vendas-financeiro:CR-05 | unidade | dividirEmParcelas fecha em centavos com a sobra na última, só com outros números. |
| `tests/crm-atritos-da-18.test.ts:62` | crm-inbox:OP-11 | unidade | As mesmas duas asserções de avisoDosFunis (a frase para quem não é a Admin da rede; nada para ela). |
| `tests/crm-varredura-de-18-11.test.ts:138` | crm-inbox:CL-23; CLAUDE.md §11 | unidade | Confere só a falta do filtro por dono, que o caso da linha 130 já confere junto com o resultado. |
| `tests/importacao-migracao.test.ts:41` | crm-inbox:IM-09 | unidade | As mesmas recusas (nome vazio; telefone sem DDD na ficha), que o caso de importacao.test.ts:204 confere junto com os avisos. |
| `tests/importacao-migracao.test.ts:66` | crm-inbox:IM-09 | unidade | Os mesmos três avisos do card (valor, procedimento, etapa) com a mesma linha; o caso de importacao.test.ts:179 confere estes e mais. |
| `tests/metrics-divisoes-dos-relatorios.test.ts:41` | indicadores:FO-02 | unidade | A mesma chamada conversaoDasOportunidades({ total: 4, ganhos: 1, temGanho: true }) = 25. |
| `tests/planos-limites.test.ts:32` | plataforma:PN-11; CLAUDE.md §1 | unidade | Mesma asserção do caso da linha 26 (o texto do limite com o vocabulário de unidade). |
| `tests/relatorios-tags-na-visao-geral-e-no-financeiro.test.ts:20` | CLAUDE.md §1; indicadores:TF-05 | unidade | A mesma lista de abas: Visão geral e Financeiro com o filtro, Estoque sem. |
| `tests/varredura-atendimento.test.ts:158` | copilot:CW-01 | unidade | Confere a mesma trava do Copilot que o caso da linha 144. |

## 4. Os testes fracos (`fraco`) — dizem provar a regra e não provam

| Caso | Regras | Camada | Nota |
|---|---|---|---|
| `e2e/auditoria-atritos-da-18.spec.ts:72` | plataforma:AD-23 | integracao | passa a unidade direto à função prontuario_registrar_acesso; não prova que o servidor grava a unidade do endereço |
| `e2e/documentos-contrato-pagamento.spec.ts:144` | documentos:DG-01 | integracao | o "contrato assinado" do caso é um DISPENSADO: não prova que o assinado não muda; a recusa do pagamento torto está provada |
| `e2e/fase4-permissoes.spec.ts:53` | plataforma:CG-02; CLAUDE.md §11 | integracao | confere só que o admin da suíte tem branch_id nulo; não prova que a abrangência "A rede inteira" abre o portal da rede |
| `e2e/indicadores-reativar-clientes.spec.ts:19` | indicadores:CC-05 | integracao | Prova na função metrics_clientes_para_reativar (por unidade), que nenhuma tela chama desde a 24ª: o quadro usa a _rede. Passa mesmo que a conta da tela mude. **Resolvido em 25/11: a função por unidade e este trecho saíram (o Heitor, "ok mas tenha certeza absoluta que não é usada"; migration `20261206700001`).** |
| `e2e/permissoes-f70.spec.ts:259` | plataforma:CU-01; crm-inbox:IM-02 | integracao | sem o controle da Admin importando, e não confere quem tem "A rede inteira" sem ser a Admin; o título fala da regra antiga ("de quem é da rede") |
| `e2e/rls-sessao-so-le.spec.ts:134` | CLAUDE.md §4 | integracao | A cliente não grava o próprio pedido LGPD pela chave pública. O controle só confere que a leitura não deu erro (sem token também não dá): não prova que o token dela vale. |
| `e2e/smoke.spec.ts:50` | CLAUDE.md §14 "Descartar o error de uma query" | tela | Cada tela da rede (laço) abre com HTTP abaixo de 400 e com o título; não prova conteúdo além do título. |
| `e2e/smoke.spec.ts:57` | CLAUDE.md §14 "Descartar o error de uma query" | tela | Cada aba de Configurações (laço) abre com o título "Configurações"; não confere o conteúdo da aba. |
| `e2e/suporte-plataforma.spec.ts:129` | plataforma:SI-02; plataforma:SI-04 | tela | a sessão do SUPORTE é do host do suporte: no sistema ele chega sem sessão, e o login abre de qualquer jeito; só o lado do ADMIN prova algo |
| `e2e/tags-sem-unidade.spec.ts:203` | crm-inbox:TG-01; crm-inbox:CL-19 | integracao | o título diz o "Reativar" da unidade por atendimento, que a CL-19 desfez (é o da rede); a ficha só com a tag não tem visita, e fica fora com ou sem a tag **Resolvido em 25/11: a função por unidade e este trecho saíram (o Heitor, "ok mas tenha certeza absoluta que não é usada"; migration `20261206700001`).** |
| `e2e/templates-por-waba.spec.ts:60` | whatsapp-push:WT-02 | integracao | Refaz a consulta dentro do teste em vez de chamar getTemplatesParaConversa: passa de qualquer jeito, não prova o código. |
| `e2e/whatsapp-numeros-modelagem.spec.ts:179` | whatsapp-push:WN-05 | integracao | Só lê o estado da rede de teste (no máximo um padrão) e se pula sem número; não força o caso. A garantia é provada em whatsapp-numeros-modelagem.spec.ts:28. |
| `tests/atendimento-atritos-da-22.test.ts:61` | atendimento:AT-05 | unidade | confere só que se lê role_permissions uma vez; não confere que é a Agenda em Gerenciar (atritos-da-19:65 confere) |
| `tests/atritos-da-20-vendas.test.ts:174` | atendimento:AT-05; CLAUDE.md §14 "Botão que a pessoa não pode usar" | leitura-do-fonte | Só confere que o editor do plano tem o identificador quemFinaliza; não prova que o "Sem plano, basta o Finalizar" some para quem não finaliza. |
| `tests/atritos-da-23-cargos-atendimento-app.test.ts:65` | vendas-financeiro:PV-04 | unidade | confere só que a função antiga nivelDoPdvPeloFinanceiro não existe; não prova que o Financeiro não abre o PDV |
| `tests/atritos-da-23-cargos-atendimento-app.test.ts:69` | vendas-financeiro:PV-04 | leitura-do-fonte | confere só a ausência de um nome no editor de cargos; não prova o nível do PDV |
| `tests/atritos-da-25-migracao.test.ts:62` | crm-inbox:IM-21 | leitura-do-fonte | só confere que a migration não mexe em metrics_core; passa de qualquer jeito |
| `tests/auditoria-c-dinheiro.test.ts:121` | atendimento:PL-23; CLAUDE.md §1 princípio 2 | leitura-do-fonte | Só confere que a frase "Esta proposta venceu" sumiu da action; não prova que a action aceita o plano vencido. |
| `tests/busca-universal.test.ts:178` | indicadores:FU-02 | unidade | Diz "no fuso da unidade", mas não passa o fuso a resultadoDaLinha: prova só o padrão de Brasília, não a troca pelo fuso da unidade. |
| `tests/documentos-assinar-sem-permissao.test.ts:79` | documentos:DQ-01 | leitura-do-fonte | confere só o assertPermission dos Documentos em Gerenciar; a regra (os modelos só da Admin da rede) é o recusaDaConfigDaRede, que o caso não confere |
| `tests/documentos-marcacao.test.ts:77` | documentos:DV-01 | unidade | validarModelo não é chamado fora do teste (a tela usa validarDocumentoDoEditor); a prova real é documentos-arvore.test.ts:128 e :136 |
| `tests/documentos-marcacao.test.ts:83` | documentos:DV-01 | unidade | validarModelo não é chamado fora do teste; a prova real da regra é documentos-arvore.test.ts:128 e :136 |
| `tests/documentos-marcacao.test.ts:87` | documentos:DV-01 | unidade | validarModelo não é chamado fora do teste; a prova real da regra é documentos-arvore.test.ts:128 e :136 |
| `tests/documentos-marcacao.test.ts:95` | documentos:DV-07; documentos:DV-01 | unidade | validarModelo não é chamado fora do teste; a prova real da regra é documentos-arvore.test.ts:51 e :128 |
| `tests/documentos-pdf.test.ts:37` | documentos:DF-01; documentos:DM-10 | unidade | só confere que o PDF tem 5 ou mais páginas; não confere o cabeçalho e o rodapé repetidos nem a quebra |
| `tests/documentos-pdf.test.ts:48` | documentos:DF-01 | unidade | só confere que o PDF tem 2 ou mais páginas; não confere que o conteúdo não se perde |
| `tests/fidelidade-atritos-da-21.test.ts:31` | fidelidade:RV-06 | leitura-do-fonte | Só confere que o formulário chama avisoDaRecompensaAcimaDosPontos e tem o atributo; o "sem recusar" (salva igual, princípio 2) do título não é conferido. |
| `tests/fuso-sem-relogio-do-aparelho.test.ts:60` | indicadores:FU-02 | leitura-do-fonte | Só confere que a chamada antiga pagoNoDia(l.pagoEm) saiu do fonte; o dia da unidade no pagamento é provado em fuso-da-unidade.test.ts:398. |
| `tests/indicadores-f68.test.ts:175` | indicadores:DI-04 | unidade | Só confere que nenhuma dica diz "Brasília"; não que diga que as horas estão no fuso da unidade. |
| `tests/indicadores-f68.test.ts:184` | indicadores:DI-04; indicadores:ER-04 | unidade | Só confere que a frase antiga "já foi pago na compra" saiu; não que a dica diga que a perda e o ajuste são métrica. |
| `tests/injetaveis-quem-realiza-atendimento.test.ts:119` | atendimento:AT-03 | leitura-do-fonte | Só confere que um trecho exato do código não existe; passa com qualquer outra forma de escrever a mesma trava errada. |
| `tests/pacotes.test.ts:150` | vendas-financeiro:PV-16; vendas-financeiro:PA-07 | leitura-do-fonte | só confere que o atributo e o setRegistrada existem no fonte; não prova o comportamento |
| `tests/planos-adicionais.test.ts:54` | plataforma:PN-15 | unidade | Confere o retrato de quem não tem plano (tudo liberado), não o adicional do plano novo que o título promete. |
| `tests/preco-na-unidade.test.ts:36` | atendimento:PC-09; atendimento:PC-10 | leitura-do-fonte | confere o texto da consulta escrito em docs/regras/atendimento.md, não o código do sistema |
| `tests/relatorios-tags-na-visao-geral-e-no-financeiro.test.ts:34` | indicadores:TF-02; CLAUDE.md §1 | leitura-do-fonte | O título promete a assinatura só com o service_role; o corpo confere só a chamada à troca com_tags. |

## 5. As regras do catálogo sem nenhum caso que as prove

Regra sem teste é regra que pode quebrar sem ninguém ver. Cada uma ganha teste (TDD) quando for tocada.

### atendimento (7)

- **AG-14** O "Agendar" do inbox (e do card) escolhe a unidade numa caixa de seleção simples (só com mais de uma unidade); a tag não escolhe unidade.
- **AG-18** Agendar escreve "agendamento criado" na linha do tempo da oportunidade aberta, mas NÃO move o card de etapa. Mover só por automação que a rede montar.
- **AT-06** Saiu em 23/11 (SM1: sem o "só os meus").
- **PL-13** O valor do plano é a soma das sessões, e ele se paga inteiro — à vista ou parcelado, como qualquer venda —, não por sessão.
- **PL-21** Saiu em 23/11 (SM1: sem o "só os meus").
- **PT-03** Saiu em 23/11 (SM1: sem o "só os meus").
- **ES-01** O estoque tem entrada, saída no atendimento, transferência entre unidades, perda, ajuste (inventário), lotes, validade e aviso de mínimo. A tela geral do estoqu

### automacoes (5)

- **GT-04** Fato clínico não carrega conteúdo clínico, e a automação não lê o prontuário: ela avisa que a ficha chegou; quem precisa do conteúdo abre o prontuário com a per
- **GT-10** Não existe gatilho "Retorno vencendo": o retorno é um agendamento novo, e quem quer avisar usa o gatilho do próprio agendamento.
- **AX-06** O "Mandar mensagem" ganha "Para quem não tem conversa aberta", desligado por padrão: Não mandar · Abrir pelo número padrão · Mandar como aviso no celular. Abrir
- **EV-05** Os limites da automação (silêncio noturno e teto) só valem no "Mandar mensagem" para a cliente, seja mensagem ou aviso no celular. Avisar a equipe e anotar não 
- **EV-12** Com a rede bloqueada, nada sai para a cliente: a automação e a campanha param. A automação que estava esperando ("esperar 3 dias") não perde a espera, e a campa

### busca (7)

- **BA-04** O procedimento só aparece onde a unidade o faz, e a oportunidade de funil arquivado não aparece.
- **BA-06** O contato do CRM que já tem ficha não entra em "Contatos do CRM": ele é achado como a cliente.
- **AL-03** A cliente é da rede: a busca acha as clientes da rede inteira em qualquer portal. Os registros de unidade (agendamentos, procedimentos, pacotes, produtos, membr
- **AL-04** As conversas que a busca acha são as mesmas que a lista do inbox mostra à pessoa (as caixas de WhatsApp que o cargo dela vê), sem conta à parte.
- **PB-05** A Auditoria se acha por "auditoria", "quem fez" e "quem alterou" — para quem a tem no menu, a Admin da rede.
- **AO-01** Cada ação da busca é um atalho para a janela que já existe: a busca não grava nada, e a tela de destino confere tudo de novo.
- **AO-08** A janela aberta pela busca abre uma vez: recarregar a página não a reabre. O nome da cliente que ela mostra vem da ficha da rede, nunca do endereço.

### comissoes (10)

- **CM-01** A configuração das comissões é a aba "Comissões e taxas" de Configurações, no grupo "Dinheiro", e todo texto que leva até ela diz "Configurações → Comissões e t
- **CM-05** Quem não tem "A rede inteira" só mexe na comissão de quem é das unidades dela. Na Equipe da unidade, quem é da rede aparece sem o chip: a comissão dele se muda 
- **CA-04** Quando a regra geral nova de um procedimento muda o que uma Admin da rede ganha, a janela avisa antes de salvar: "A mesma para todos: 20%. Vale também para a Dr
- **CA-05** A comissão do atendimento é do profissional do agendamento. Quem fez outro passo do atendimento (a chegada, o recebimento) fica registrado no histórico e na Aud
- **CQ-12** Em Configurações → Comissões e taxas, o bloco "Venda de pacote" diz onde está essa comissão: no próprio pacote (Pacotes → o pacote → Comissão), e, sem ela, vale
- **CB-07** Quando a unidade tem preço próprio para o procedimento, a comissão sai desse preço, que é o gravado no agendamento ou na venda, e não do preço da rede.
- **CB-09** As comissões de venda (de produto, de pacote e de plano) seguem a escolha da rede sobre a taxa da maquininha, mas nunca descontam insumos.
- **CT-04** O pagamento feito em várias formas é UM pagamento: a base soma os descontos e os pontos de todas as formas, e a taxa é a média das taxas de cada forma, pesada p
- **CT-05** No plano recebido em vários pagamentos, a taxa da base é a média das taxas, pesada pelo que cada recebimento pagou.
- **CF-01** A comissão devida é uma por procedimento executado (e uma por venda), e o extrato é a soma das mudanças dela: cada liberação, ajuste ou estorno é um lançamento,

### copilot (3)

- **CO-02** Na tela, o Copilot não tem nome de função ("secretária" não aparece): na matriz de Cargos ele é "Consultar o sistema e pedir gravações conversando", e no plano,
- **CZ-07** No cancelar, o agendamento que ainda não começou se cancela; o que já está Em atendimento é uma desistência, e o cartão diz "Desistir do atendimento" e avisa qu
- **CY-03** Para o que não faz por conversa (importar, criar tag, mudar comissão, conectar o WhatsApp, colher assinatura), o Copilot explica em uma frase e indica a tela, e

### crm-inbox (6)

- **CL-22** Quem abre a ficha vê a Visão geral e o Histórico inteiros — os atendimentos de todos que atenderam, os valores, o plano e o contrato. A ficha não se recorta por
- **LG-01** O titular só pode pedir a exportação dos dados: o sistema não registra pedido de eliminação. A cliente pede a eliminação pelo contato da rede, que responde à mã
- **LG-02** Pelo app, revogar o consentimento e pedir a exclusão continuam como estão.
- **LG-13** O pacote da LGPD nunca é entregue incompleto: se uma parte da exportação falha, ele não sai.
- **IN-11** O filtro "Número de WhatsApp" mostra as conversas de um ou de vários números ao mesmo tempo (as escolhas se acumulam), incluindo o número removido, cujas conver
- **OP-35** O "Agendar" do inbox e do card escolhe a unidade numa caixa de seleção simples: com duas ou mais unidades ela vem vazia ("Selecione a unidade…"); com uma, já ve

### documentos (8)

- **DM-03** Configurações → Documentos fica no grupo "Atendimento", ao lado das Fichas.
- **DV-05** No documento do pacote, os dados de quem atende saem vazios, sem travar nada. Vale para os documentos do pacote vendido e também para o contrato colhido antes d
- **DA-05** Assinados todos, a tela confirma "Documentos assinados" com os títulos, mesmo que a lista tenha ficado vazia; no app, quem chega sem nada para assinar lê "Nenhu
- **DC-03** O pedido de assinatura pelo app abre o portal na unidade do documento (ou, sem ela, na de quem pediu).
- **DQ-03** Os cargos que a rede recebe como modelo nascem sem os Modelos de documento.
- **DQ-04** Quem tem os Procedimentos em Gerenciar liga um modelo ao procedimento.
- **DQ-08** Na sessão de suporte nada vai à cliente: não se gera nem se manda link de assinatura, nem se pede a assinatura pelo app; e o suporte não colhe assinatura, não r
- **DQ-09** O Copilot consulta a situação de cada documento, sem o texto nem o motivo da dispensa; colher assinatura ele não faz — indica a tela.

### fidelidade (8)

- **PG-07** Toda cliente cadastrada — à mão ou pela importação — já nasce com a conta de pontos; o contato do CRM que ainda não é cliente não tem.
- **GA-05** O atendimento avulso recebido em várias formas ou no crediário também soma: cada pagamento dá a parte do que já foi pago, menos o que já foi dado; o procediment
- **PD-05** Recebendo em várias formas ("+ Outra forma"), os pontos e o voucher abatem na primeira forma e não passam do valor dela; a base do teto e do voucher é a venda i
- **PD-08** A venda de crédito interno não usa pontos: é dinheiro guardado, não consumo.
- **RV-02** O voucher guarda um retrato da recompensa de quando foi trocado: editar a recompensa depois não muda o já emitido.
- **SA-02** O saldo é sempre a soma do extrato.
- **SA-03** Na ficha da rede com duas ou mais unidades, o ajuste de pontos, a troca por recompensa e a entrega do voucher perguntam a unidade (nenhuma vem escolhida), e o p
- **BO-03** O aviso no celular sobre os bônus da fidelidade só chega à cliente se a rede ligou; nada sai sozinho.

### indicadores (8)

- **DI-05** Quando um número não pode ser lido (a consulta falhou), a tela mostra o erro, nunca "R$ 0,00" ou zero como se fosse dado.
- **RA-06** A sessão feita de um plano cancelado continua contando na receita dos atendimentos: a execução existiu. Só as sessões concluídas entram.
- **VE-03** O valor de cada venda é o vendido menos o cancelado, o devolvido e o desconto comercial. O parcelado é UMA venda e entra inteiro no dia da primeira parcela paga
- **VE-10** O plano cancelado vale nas Vendas o que foi usado, como o pacote; o que caiu inteiro sai.
- **FV-03** A receita dos atendimentos e os Top 5 por receita dos Relatórios continuam à vista de quem não tem o Financeiro.
- **VP-02** Na vista pessoal, "o que é dela" é: o atendimento em que ela é a profissional do agendamento; a cliente que tem agendamento NÃO cancelado com ela numa unidade d
- **AN-01** Nos números dos anúncios, zero é um dado: "zero clique" aparece como 0. "Indisponível" só aparece quando a origem não mandou o número.
- **AN-02** As médias de referência dos anúncios são ponderadas pelo que as sustenta: o retorno e o custo por aquisição pelo investimento, a taxa de cliques pelas impressõe

### plataforma (10)

- **SU-12** O diagnóstico de uma rede no suporte não mostra segredo nem dado de cliente: das caixas e integrações, só o estado; dos fatos do sistema, só o nome, o registro,
- **AS-04** Se a mudança feita pela rede não chega à cobrança na hora, a rede é avisada ("chega à cobrança em até uma hora") e o sistema leva o valor depois, sozinho.
- **AS-12** Estorno e contestação de uma fatura ficam registrados, mas não mudam a situação da rede sozinhos: quem decide é a equipe da plataforma.
- **PN-10** O plano trava criar e alterar, não ler nem o que já foi vendido: a ficha da cliente continua mostrando os pacotes e planos que existem, e a sessão de um pacote 
- **PN-20** Com a cobrança ligada, nenhum adicional deixa a mensalidade em R$ 0: encerrar a cobrança é com o BellarisOS. *(só caso fraco/contradiz)* — corrigida em 25/11: o zero é aceito e vira cortesia (AS-06); o caso de `e2e/planos-adicionais.spec.ts:223` a prova.
- **EQ-14** Não se apaga membro nem rede: o membro se desativa (o login fica bloqueado e o registro fica) e a rede se cancela.
- **CG-02** A autorização tem dois eixos: o nível de cada módulo vem do cargo, e as unidades vêm do membro. Um mesmo cargo serve para quem é de uma unidade e para quem é da *(só caso fraco/contradiz)*
- **CU-07** Quem não é a Admin da rede e abre Configurações sem pedir uma aba cai na primeira aba que é dela (no portal da unidade, a aba Unidade).
- **AD-01** A rede tem uma Auditoria: um lugar só de leitura onde se vê tudo o que aconteceu na rede.
- **AD-10** Se o registro da Auditoria falhar, a gravação da pessoa vale mesmo assim (a venda não trava), e a Auditoria mostra a linha "(registro incompleto)".

### site (12)

- **ST-01** O site mora em bellarisos.com, num app próprio, separado do app da rede. É a página de quem ainda não conhece o BellarisOS e não tem login.
- **PE-03** Se o banco não responder, os preços são os últimos que o site leu; se nunca leu, a seção diz que os planos aparecem em instantes. Nunca R$ 0.
- **PE-04** O cartão de cada plano diz os limites e os adicionais em frases. O destaque em rosé é o plano com o Copilot incluído, dizendo o que ele tem a mais — sem inventa
- **PE-07** O comparativo dos planos no site é o mesmo do sistema: a mesma tabela, com os nomes das funcionalidades do plano.
- **AQ-03** O app é um só, para todos (o mesmo sistema, no navegador ou no app Android): quem decide o que se vê é o login, e a cliente que entra vê só a dela. O site não d
- **TX-02** Nada inventado: sem depoimento, cliente, logo de parceiro ou número de uso enquanto não existirem de verdade. Cada promessa é uma funcionalidade conferida.
- **TX-03** O que depende de terceiro fica fora do site até valer em produção: hoje, Instagram e Messenger no inbox (esperam a análise do app na Meta).
- **TX-05** Funcionalidade nova que muda o que a rede ganha muda a página junto (o texto e, se for o caso, uma tela).
- **TX-07** O que está "Em breve" não entra nos dados estruturados, no resumo para as IAs nem nas perguntas da página: lá, só o que existe.
- **TL-01** O produto aparece em telas REAIS do sistema, fotografadas de uma rede fictícia (a "Clínica Aurora"), nunca com dado de cliente real. Cada tela tem o texto alter
- **TL-04** As telas do site são fotografadas de novo no fim do plano de adaptação, com o sistema adaptado.
- **MV-05** O destaque do título ("num lugar só.") é só a cor rosé, sem traço embaixo; com movimento, um brilho passa uma vez pelas palavras quando o título entra.

### vendas-financeiro (5)

- **PV-07** O "Receber" é o mesmo em toda comanda: a prévia, o voucher, o desconto com o motivo, os pontos, a maquininha, as vezes, a bandeira, o saldo de crédito e o combi
- **DP-04** O pagamento do plano cobra também o atendimento que gerou o plano, se ele está concluído, tem preço, é avulso e não foi recebido: se algo é recebido agora, ele  *(só caso fraco/contradiz)*
- **PA-02** O pacote não aparece no Estoque (é um conjunto de procedimentos, não de itens): fica no catálogo de Pacotes, em Comercial → Pacotes, nos dois portais.
- **PA-19** Na forma (b), o usado entra como receita no dia do cancelamento (o Fechamento do dia o mostra na forma escolhida), o estorno é saída do dia do cancelamento, e o
- **PP-01** O pré-pago é a venda de várias sessões de UM procedimento, pagas antes (ou a receber) e agendadas depois. É separado do pacote: o pacote é um conjunto vendido p

### whatsapp-push (8)

- **WT-10** Com os templates fora do plano, some só a tela de criar e editar modelos: o inbox continua respondendo fora das 24 horas com o modelo aprovado que já existe.
- **WT-12** Quando a rede tem números de provedores diferentes, cada conversa segue o provedor do número dela: a janela de 24 h (que só o oficial tem) e o botão de editar m
- **WE-02** Com a rede bloqueada, a saída para a cliente pausa — automação, campanha, lembrete e todo aviso no celular — sem se perder (a espera da automação continua, a ca
- **NA-01** O aviso chega por três caminhos: o app Android, o navegador (Web Push) e o sino do portal. *(só caso fraco/contradiz)*
- **NE-05** A chegada da cliente (check-in) avisa só quem vai atender — não quem responde pela Agenda.
- **NC-01** A cliente recebe no celular o aviso do próprio fato, sem a rede ligar nada: o horário marcado, remarcado, cancelado e concluído, e o pagamento. *(só caso fraco/contradiz)*
- **NC-03** Fora o aviso do próprio fato (NC-01, NC-02), nada vai à cliente sem a rede ligar: o lembrete antes do agendamento e a confirmação são modelos das Automações, qu
- **IG-03** Sem WhatsApp conectado, o inbox vazio diz que a rede não tem WhatsApp conectado. O atalho para ligar (Configurações → Integrações) aparece só para a Admin da re

## 6. A infraestrutura de teste (`infra`)

50 casos testam o apoio do próprio teste ou a ferramenta; estão no `mapa.tsv`.

