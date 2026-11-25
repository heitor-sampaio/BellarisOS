# Para o Heitor: o que precisa de você

O Heitor, 24/11: "Quando eu voltar a gente revisa as decisoes que precisam de mim." O que está aqui não foi feito, ou foi
feito e mudou teste. Cada item diz o que é, o que o Claude propõe e o teste em jogo. As regras que o Claude decidiu sozinho
estão no catálogo, marcadas "decisão do Claude, 25/11 (o Heitor revisa)".

## 1. Testes alterados ou apagados nas correções da 28ª (25/11)

Pela regra do CLAUDE.md §15, todo teste alterado vem aqui, com a fala que o permite.

**Pelo "o pagamento acontece por dentro desse PDV, seja do que for" (13/11) e pelo "cada passo do atendimento, um módulo" (23/11)**

O plano saiu da tela do atendimento: agora se recebe só no PDV.
- `tests/varredura-vendas-financeiro.test.ts`
- `tests/atritos-da-20-vendas.test.ts`
- `tests/pdv-varias-formas-e-crediario-avulso.test.ts`
- `tests/checkout-pagamento.test.ts`: "a receber no atendimento" virou "a receber no PDV"
- `e2e/financeiro-f67.spec.ts`
- `e2e/maquininhas-f67.spec.ts`
- `e2e/plano-recebimento.spec.ts`: reescrito
- `e2e/plano-recebimento-concorrente.spec.ts`: reescrito
- `e2e/vendas-forma-nasce-vazia.spec.ts`
- `e2e/atendimento-atritos-da-7.spec.ts`

**APAGADO**: o caso do duplo clique ("o mesmo envio duas vezes: grava uma, e as duas respostas dizem o recebido"), em
`plano-recebimento-concorrente`. No PDV a gravação também é uma só, mas a segunda resposta é um erro, não "recebido".
Decida se o PDV deve responder "recebido" às duas vezes; se sim, o caso volta, no PDV.

**Pelo "não recusar o valor que a rede escolheu, no máximo avisar" (princípio 2, 04/11)**

Os limites viraram aviso. Os valores do "comum" acima dos quais se avisa são decisão do Claude.
- `tests/fidelidade-config.test.ts`: três casos
- `tests/fidelidade-voucher.test.ts`
- `tests/checkout-lancamentos.test.ts`: as parcelas
- `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`: o texto da recusa do zero

**Pelo "o sistema precisa ser intuitivo" (princípio 7, 11/11)**

"Cancelar" virou "Desistir do atendimento" no atendimento em andamento. O NOME é decisão do Claude.
- `e2e/atendimento-atritos-da-8.spec.ts`
- `e2e/atendimento-atritos-da-10.spec.ts`
- `e2e/atendimento-quem-inicia-e-conclui.spec.ts`

**Por regras suas de antes**
- `e2e/configuracoes-textos-e-estados-vazios.spec.ts`: a aba Assinatura é só da Admin da rede ("Configuração da rede
  toda só pela conta admin", 18/11).
- `tests/sessao-so-le-prontuario-e-automacoes.test.ts`: a sessão não lê mais as automações ("vai na 2", 19/11).
- `tests/auditoria-atendimento-e-permissao.test.ts`: o "OWN" saiu ("pode tirar, as vistas pessoais resolvem", 23/11).
- `e2e/campanha-data-anual.spec.ts`: a cliente sem aparelho não conta como enviada ("O que a tela mostra é o que vale
  na conta", princípio 3).
- `e2e/indicadores-cada-numero-no-seu-modulo.spec.ts`: quem atende sem a Agenda vê as etapas da Agenda com os números
  dela ("as vistas pessoais resolvem", 23/11).
- `e2e/indicadores-dashboard-da-rede-so-os-meus.spec.ts`: no dashboard da unidade, quem atende sem a Agenda vê a etapa
  Agendamentos com os agendamentos dela (era "a etapa não aparece"); mesma fala de 23/11.

## 2. Testes que o Claude NÃO mudou e propõe mudar (a regra é só decisão do Claude)

1. **"Completar a ficha" ou "Completar o cadastro"?** Hoje os dois nomes convivem no checkout. O catálogo diz "o
   cadastro", e os testes exigem "a ficha": `tests/atritos-da-15.test.ts:250` e
   `e2e/documentos-completar-a-ficha-f73.spec.ts:73`.
2. **O texto "Atende clientes em"** no aviso de desativar alguém da equipe e no agendamento. O controle hoje se chama
   "Atende clientes", e a lista só aparece depois de "Escolher em quais unidades atende". Proposta: citar o botão.
   Teste: `e2e/equipe-atritos-da-8.spec.ts:102`.
3. **O resumo do cargo**: três casos testam um jeito de montar o resumo que nenhuma tela usa. Proposta: apagar os três
   casos e o código. Teste: `tests/resumo-do-cargo.test.ts:9`, `:12` e `:15`.
4. **O Reativar por unidade**: a função do banco `metrics_clientes_para_reativar` (por unidade) é código morto, porque
   a tela usa a da rede (CC-05). Proposta: apagar a função e os seis testes que a usam:
   - `e2e/indicadores-f68-contas:139`
   - `e2e/indicadores-cenario:346`
   - `e2e/fuso-da-unidade:440`
   - `e2e/indicadores-reativar-clientes:28`
   - `e2e/tags-sem-unidade:207`
   - `tests/tags-so-quem-marca:186`
5. **A busca e o "Cadastrar «termo»"**: o seu "Ok" de 13/11 (BU1) diz que a oferta aparece sempre que nenhuma cliente
   bate. Desde 16/11 ela some quando o termo é nome de página, por decisão do Claude. Fica a exceção, ou volta o
   "sempre"? Teste: `tests/atritos-da-15.test.ts:78-93`.
6. **O produto de revenda nasce com "Insumo" marcado.** Proposta: nasce sem nenhuma caixa marcada; salvar sem nenhuma
   já é recusado com mensagem. Teste: `e2e/estoque-marcas-e-fornecedores.spec.ts:185-206`.
7. **Agendar no passado**: pelo princípio 2, o "+ Agendar" da equipe com horário passado avisaria e deixaria, como o
   remarcar já faz. Hoje recusa. Testes: `tests/validacao-limite-legivel.test.ts` e o E2E da agenda.
8. **O nome do número de WhatsApp**: vindo da Meta, é cortado em 60 caracteres sem aviso; ao renomear, não tem limite.
   Proposta: um limite só, que avisa, ou nenhum. Teste: `tests/whatsapp-rotulo.test.ts:34`.
9. **O nome da tag** recusa acima de 60 caracteres, e o banco não tem limite. É um limite contra o princípio 2? Teste:
   `tests/tags.test.ts:31`.
10. **Desativar unidade**: a janela segue listando à parte o atendimento concluído sem pagamento, como o Financeiro
    faz? Testes: `tests/unidades-da-tela.test.ts:56`, `:70`, `:83` e `:118`.

## 3. Outros limites que o princípio 2 talvez alcance

Ninguém mexeu. A pergunta: o "no máximo, avisar" vale para estes também?
- a validade do pré-pago: de 1 a 3.650 dias;
- o custo da recompensa: até 10 milhões de pontos;
- o cartão: em até 12 vezes;
- a despesa parcelada: até 48; a recorrente: até 60;
- a validade do plano: até 365 dias;
- o prazo para alterar pelo portal: até 720 horas;
- a validade da ficha de saúde: até 36 meses.

## 4. Fatos que só você sabe

1. **O app Android já está na Play Store?** Se não está, a menção sai do site (`apps/site/lib/perguntas.ts:30`,
   `apps/site/components/conteudo.tsx:253`).
2. **A trava da mensalidade em R$ 0** só abre para o plano do tipo cortesia. A rede com 100% de desconto no plano recebe
   a recusa ao tirar o último adicional. A trava deve olhar o total a pagar, como a regra da cortesia?

## 5. As decisões do Claude no catálogo (25/11)

As 10 perguntas que tinham ficado foram decididas pelo Claude, com a regra, e estão no catálogo como "Decidida pelo
Claude, 25/11 (o Heitor revisa)". Duas delas viraram sugestão, na lista `docs/sugestoes-de-funcionalidades.md`.
