# A leitura do inventário: o que cada achado pede

O inventário (`README.md`, `mapa.tsv`) liga cada caso de teste à regra que ele prova. Esta página separa os achados pelo que
pedem: o **código** está errado, o **catálogo** ficou para trás, ou o **teste** precisa do "sim" do Heitor.

O Heitor, 19/11: "o teste só pode ser alterado se a regra foi alterada". Nenhum teste foi mudado. Tudo que muda teste está
na seção 3, para ele decidir. A conferência de cada caso no código é do Claude, feita em 24/11.

## 1. Defeitos do código: o teste e o código contradizem a regra

São defeitos pelo escopo fechado. O código se corrige pela regra, e o teste que exige o comportamento errado está na seção 3.

- **O plano se recebe na tela do atendimento.** As regras dizem que não: AT-13 ("a sessão não cobra nada"), PV-13, PV-01
  e DP-06. O caminho ainda existe em `appointment-session.tsx` (`receberDoPlano` pela rota do atendimento). Os testes que
  o exigem:
  - `financeiro-f67:138`
  - `maquininhas-f67:151`
  - `plano-recebimento:72`
  - `plano-recebimento-concorrente:84`, `:97` e `:113`
  - `vendas-forma-nasce-vazia:107`
  - `varredura-vendas-financeiro.test:112`
  - `checkout-pagamento.test:11`
- **A entrada acima do total.** A CR-03 diz que ela é recusada, "nunca cortada calada", e `lib/checkout/lancamentos.ts`
  a corta com `Math.min`. O teste que exige o corte é `checkout-lancamentos.test:41`.
- **O "A receber" guarda a forma de pagamento.** Pela CR-01, ele não tem forma nenhuma. O teste que exige a forma é
  `checkout-pagamento.test:21`.
- **Com duas maquininhas, a venda sem escolha fica na primeira.** A MQ-15 diz que a primeira não vale calada. O teste é
  `maquininhas-f67:67`.
- **A frase da comissão de venda no "Receber o plano".** A CV-06 diz que essa tela não mostra a frase. O teste que a exige
  é `plano-checkout-uma-transacao:122`.
- **A tela diz "checkout do plano".** Pela PL-10, isso não existe mais: o plano se recebe na comanda do PDV. O teste é
  `atendimento-atritos-da-7:102`.
- **As etapas da Agenda no quadro do ciclo.** A DB-01 diz que quem atende sem a Agenda vê as etapas com os números dela,
  pela vista pessoal (VP-01). A tela as esconde de todos. O teste é `indicadores-cada-numero-no-seu-modulo:145`.
- **O Reativar por unidade.** Pela CC-05, o Reativar é sempre o da rede. Ainda existe a função por unidade, que nenhuma
  tela chama. Os testes são `indicadores-f68-contas:139` e `indicadores-cenario:346`.
- **O impedimento para desativar a unidade.** Desde 16/11 (UN-10), o atendimento concluído sem pagamento é comanda aberta
  do PDV. O resumo ainda o lista como impedimento à parte. O teste é `unidades-da-tela.test:56`.
- **A aba Assinatura.** A AS-15 diz que ela é só da Admin da rede. O teste exige que outra pessoa, com "A rede inteira",
  leia nela o texto de quem tem acesso. O teste é `configuracoes-textos-e-estados-vazios:85`.
- **O adicional do plano a R$ 0.** A PN-20 diz que nenhum adicional deixa a mensalidade em R$ 0 com a cobrança ligada. O
  teste aceita R$ 0 como cortesia, como na AS-06. O teste é `planos-adicionais:223`. Decisão do Claude: a cortesia da AS-06
  vale para a mensalidade inteira, dada pela plataforma; a PN-20 vale para o adicional.
- **Dois textos para o mesmo link.** `checkout-wizard.tsx` diz "Completar a ficha" na linha 1052 e "Completar o cadastro"
  na 554, e a DD-02 chama o link de "Completar o cadastro". O teste é `atritos-da-15.test:250`.
- **A oferta de "Cadastrar «termo»".** A AO-05 diz que a busca a oferece sempre que nenhuma cliente bate. O código a tira
  quando o termo é o nome de uma página. O teste é `atritos-da-15.test:90`.
- **Tetos.** O princípio 2 diz "no máximo, avisar", e o código recusa um valor que a rede escolheu:
  - pontos por real acima de 1.000 (`fidelidade-config.test:20`);
  - bônus acima de 1.000.000 e aviso acima de 90 dias (`fidelidade-config.test:33`);
  - validade dos pontos acima de 120 meses (`fidelidade-config.test:40`);
  - validade do voucher acima de 365 dias (`fidelidade-voucher.test:65`);
  - prazo da operadora acima de 120 dias (`financeiro-cartao-a-receber-da-operadora:336`);
  - crediário acima de 48 parcelas (`checkout-lancamentos.test:45`; também na migration `20261112006702`);
  - nome do número de WhatsApp cortado em 60 caracteres sem aviso (`whatsapp-rotulo.test:34`, marcado como sem regra);
  - nome da tag acima de 60 caracteres (`tags.test:31`).

## 2. O catálogo ficou para trás: o teste segue uma regra mais nova

Aqui o código e o teste estão certos, e quem muda é o texto do catálogo (`docs/catalogo/`). É correção de documento, sem
mudança de comportamento.

- **Regras que mudaram depois do catálogo:**
  - DP-04, FN-17, FN-13, FN-11, FN-07, CR-04 e CR-09 ("Vencida há N dias");
  - FC-10 (`regras/vendas-financeiro.md:1611`);
  - PV-13, DP-03, AT-11 e FN-06 ("o PDV ou o Financeiro");
  - ES-27 (os motivos de perda);
  - PC-11 (a Q24);
  - PN-04 (a exceção do Copilot);
  - plataforma:AD-26 (o fuso);
  - copilot:CO-05 (a Q02 de 24/11: em Ver, o Copilot consulta e pede gravações);
  - crm-inbox:LG-09 (Q09), IM-04 (Q10) e indicadores:TF-05 (Q05);
  - RB-04 e `regras/plataforma.md:244`: a outra unidade vai por último, pela A2 da 10ª (`lib/setup/proximos-passos.ts`);
  - ED-09: o gatilho novo, como em `regras/automacoes.md:501`;
  - PU-05 e QM-06;
  - atendimento:AG-46: pelo Copilot, a sala pedida se grava (A1 da 27ª, `regras/copilot.md:371`).
- **"A explicação mora na dica"** (`regras/design.md:215`, de 16/11): LU-02, LU-11, TM-02, CC-03 e CC-06 ainda dizem que o
  texto fica à vista.
- **O nome da rede (Q06):** CI-10, AC-03, AG-48 e AG-53.
- **Textos da tela:**
  - PO-13, PO-11, CL-20 e AG-61;
  - EQ-17 (o "Atende" é uma caixa só);
  - FN-05 ("Você não tem acesso a esta ação.");
  - CU-08 e CL-23 (sem "abrimos"; "Suas permissões não abrem…").
- **fidelidade:AP-03 perdeu um "não".** `regras/fidelidade.md:95-100` está certo: o ajuste não vai ao app.
- **whatsapp-push:NC-05 generalizou além das fontes.** As fontes dela são o plano, a assinatura, a ficha e o chamado. Os
  avisos do agendamento seguem `regras/whatsapp-push.md:38-40`, que diz "o aviso do próprio fato", e o próprio fato inclui o
  procedimento. Decisão do Claude: o texto da NC-05 se restringe ao que é clínico.
- **Conflito para conferir:** `regras/vendas-financeiro.md:2830` contra a DP-01.

## 3. Para o Heitor: os testes que mudariam

O teste só muda com a regra que mudou. Cada item diz qual é.

- **Junto com os defeitos da seção 1.** Corrigir o código quebra os testes que exigem o comportamento errado. Cada um muda
  pela regra citada ao lado dele na seção 1.
- **Testes de algo que nenhuma tela usa.** São candidatos a sair:
  - `resumo-do-cargo.test:9`, `:12` e `:15`: testam `rotuloDasAbasAlcancadas` sem o `soAsDela`, e a tela de Cargos o chama
    com `soAsDela: true` (`roles-editor.tsx:1012`);
  - `documentos-marcacao.test`: o formato antigo de marcação e o `validarModelo`, que nada chama;
  - `metrics-escopo.test:59`: prova a função pura. A tela filtra a linha sem execução (`lib/metrics/dos-modulos.ts:74`),
    então não é defeito; o caso fica.
- **Testes que conferem uma regra que saiu:**
  - `sessao-so-le-prontuario-e-automacoes.test:58` exige a leitura pela sessão que a migration `20261128200002` tirou
    (CLAUDE.md §4, "a sessão só lê sinais", 19/11);
  - `auditoria-atendimento-e-permissao.test:125` exige o "OWN", e o "só os meus" saiu em 23/11;
  - `equipe-atritos-da-8:102` exige o texto antigo do "Atende".
- **As repetições** (seção 3 do `README.md`): 43 casos provam a mesma coisa, na mesma camada, que outro caso.
- **Os fracos** (seção 4): 35 casos dizem provar uma regra e não provam.
- **Sem regra** (seção 2): 360 casos. A maioria é detalhe de implementação ou de tela que nenhuma regra escrita cobre. Os
  que parecem regra ficaram listados nas notas de cada parte.

## 4. Regras de `docs/regras/` que o catálogo não tem

Algum caso prova cada uma, e o catálogo não a tem. Elas entram no catálogo quando ele for revisto.

- design.md: `:49`, `:55`, `:79`, `:150`, `:176`, `:215`, `:221`, `:228`, `:233`, `:239`, `:268`, `:278`
- convencoes.md: `:66`, `:76`, `:163`
- copilot.md: `:40`, `:84`, `:155`, `:223`, `:231`, `:308`, `:330`, `:337`, `:371`, `:486`, `:493`
- automacoes.md: `:502`, `:604`
- whatsapp-push.md: `:218`, `:359`
- crm-inbox.md: `:42`, `:242`, `:1625`
- plataforma.md: `:1010`, `:1170-1175`
- vendas-financeiro.md: `:690`, `:1827`, `:2419`, `:2839`, `:2909`, `:3304`
- indicadores.md: `:482`, `:538`
- documentos.md: `:714`
- atendimento.md: `:605`
- infra.md: `:73`, `:96`
- e2e.md: `:81`, `:85` e as do apoio do teste
