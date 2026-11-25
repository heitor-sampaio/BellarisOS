# Catálogo de regras — O sistema inteiro

Este é o catálogo das regras que valem HOJE para o sistema inteiro, fora de uma área: a aparência da tela, a explicação que mora na dica, o texto e os campos, a sessão e o servidor (com o endereço que traz um id) e o menu. Nasceu em 25/11, das regras de `docs/regras/design.md`, `docs/regras/convencoes.md` e `docs/regras/vendas-financeiro.md` que não tinham par no catálogo (`docs/inventario/leitura.md` §4). Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), um dos sete princípios de produto, ou "decisão do Claude". "Onde" aponta a linha do documento; "Antes" diz de onde a regra veio. É um RASCUNHO para o Heitor revisar. Contagem: 13 regras (A tela 4, A explicação na dica 2, O texto e os campos 3, A sessão e o servidor 3, O menu 1), nenhuma pergunta e 1 divergência. O que é como o código se testa ou se implanta (`docs/regras/e2e.md`, `docs/regras/infra.md`, a aparência do seletor no CSS, `design.md:55`, `:239`) não é regra do produto e ficou fora.

## A tela (XT)

**XT-01.** Todo seletor tem uma altura só, a mesma em toda tela — o segmentado, o filtro, o botão de alternar e o campo de busca de uma barra de filtros —, para que a barra feche numa linha só. A tela não escolhe o tamanho do seletor.
- Fonte: decisão do Claude, pelo princípio 7 (o mesmo controle com quatro desenhos)
- Onde: `docs/regras/design.md:49-54`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**XT-02.** No celular, o que se abre por cima da tela (folha, painel) começa embaixo da barra do topo, nunca atrás dela: o cabeçalho, onde mora o botão de fechar, fica sempre à vista.
- Fonte: decisão do Claude (o card do contato do inbox ficava sem saída no celular)
- Onde: `docs/regras/design.md:79-84`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**XT-03.** A saudação do topo segue a hora de Brasília: "Bom dia" das 05:00 às 11:59, "Boa tarde" até as 17:59, "Boa noite" até as 23:59 e, de madrugada (00:00 às 04:59), "Olá".
- Fonte: decisão do Claude, pelo princípio 3 (A55 da 7ª simulação: "Boa noite" às 04h30)
- Onde: `docs/regras/design.md:150-156`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**XT-04.** "Filial" não existe na tela: a palavra é "unidade", com uma ou com dez — também nos quadros que só aparecem com duas ou mais ("Ranking de unidades", "Por unidade", "Todas as unidades"), na recusa que vem do servidor e na dica.
- Fonte: o Heitor, 2026-11-13 (vocabulário, CLAUDE.md §1): "Filial" sai de vez
- Onde: `docs/regras/design.md:176-184`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## A explicação na dica (XD)

**XD-01.** A explicação de uma tela mora na dica (o "i" ao lado do rótulo), não embaixo do número. À vista fica o dado (número, nome, data), o estado ("Vencida"), o caminho para agir, o vazio de uma linha, o erro, o aviso que pede uma ação ou trava a tela, e a consequência no modal do que não se desfaz. Vai para a dica o "como se calcula", o "por que", o "o que esta lista mostra", a legenda de uso, o "isto é de quem tem tal permissão" e o parágrafo de apresentação embaixo de um título. O texto continua: só sai da frente.
- Fonte: o Heitor, 2026-11-16: "Aproveita e faz esse ajuste pra todo sistema. Não dá pra ficar poluindo tela com um monte de explicaçãozinha."
- Onde: `docs/regras/design.md:215-232`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**XD-02.** A dica abre ao passar o mouse, no toque (celular) e no teclado (foco e Enter ou espaço; Esc fecha), também em tela só de leitura; fechada, não muda o texto do rótulo.
- Fonte: decisão do Claude (para que a dica de XD-01 se leia em todo aparelho)
- Onde: `docs/regras/design.md:228-238`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## O texto e os campos (XF)

**XF-01.** Todo rótulo é ligado ao seu campo: o clique no rótulo leva ao campo, e o leitor de tela lê o rótulo junto. Grupo de opções tem um nome de grupo.
- Fonte: decisão do Claude
- Onde: `docs/regras/design.md:268-271`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**XF-02.** O telefone ganha a máscara enquanto se digita, e o exemplo de um campo não é de uma cidade: telefone "(00) 00000-0000", CEP "00000-000", UF "UF", cidade "Nome da cidade".
- Fonte: decisão do Claude, pelo princípio 3 (A21 da 5ª simulação: redes de SC e do RS liam "(11) 99999-9999" e "SP")
- Onde: `docs/regras/design.md:278-282`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**XF-03.** Dinheiro no campo se escreve e se mostra com os centavos ("380,00").
- Fonte: princípio 3 (A11: o insumo de R$ 380 aparecia "380")
- Onde: `docs/regras/design.md:283-284`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## A sessão e o servidor (XS)

**XS-01.** A sessão nunca grava: toda gravação passa pelo servidor, depois de conferida a permissão e o alcance de quem pede, e nenhuma tabela deixa a sessão do navegador (da equipe ou da cliente) inserir, mudar ou apagar.
- Fonte: o Heitor, 2026-11-19: "Qualquer gravação que não passa pela validação do backend ta errada e é uma brecha de segurança"
- Onde: `docs/regras/convencoes.md:66-80`; `CLAUDE.md` §4
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**XS-02.** Toda leitura é do servidor, depois de conferida a permissão e o alcance, com o filtro da rede: o dado de um módulo só chega a quem tem o módulo (ou a vista pessoal dele). O navegador só escuta os sinais do tempo real, que não têm conteúdo, e recarrega pelo servidor.
- Fonte: o Heitor, 2026-11-19: "vai na 2" (à proposta "a sessão não lê nem grava tabela nenhuma; só escuta os sinais do tempo real", CLAUDE.md §4)
- Onde: `docs/regras/convencoes.md:76-92`; `CLAUDE.md` §4
- Antes: (sem número: `docs/inventario/leitura.md` §4)

**XS-03.** O endereço com um id que não existe ou não é válido dá a página "não encontrado", nunca a tela de erro ("A tela não conseguiu carregar").
- Fonte: decisão do Claude, pelo princípio 3
- Onde: `docs/regras/convencoes.md:163-170`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## O menu (XM)

**XM-01.** Cada categoria do menu lateral recolhe pelo título: nasce aberta; fechada, ainda mostra o item da página aberta; o navegador lembra como ficou; com o menu recolhido em ícones, não recolhe.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, "pedido do Heitor, 2026-09-30", sem a fala dele)
- Onde: `docs/regras/vendas-financeiro.md:690-694`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## Divergências

O texto de `docs/regras/` contra a decisão mais nova — para corrigir o texto depois.

- XS-02 (TEXTO): `docs/regras/convencoes.md:76-92` ("Dado de um módulo se lê só com o módulo", varredura de 18/11) descreve a leitura pela sessão com política de RLS por módulo (`private.sessao_ve_o_modulo`); desde 19/11 (o Heitor, "vai na 2") toda leitura é do servidor e o navegador só escuta os sinais (CLAUDE.md §4: "Isto substitui, para a leitura, as regras por módulo"). O texto de convencoes deve dizer a regra nova.
