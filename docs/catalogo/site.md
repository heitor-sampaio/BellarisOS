# Catálogo de regras — O site

Este é o catálogo das regras do site (bellarisos.com) que valem HOJE: para quem ele é e a chamada do teste grátis, os preços e a calculadora, o que ele diz do sistema (o posicionamento), o app da cliente na página, o texto e o que ele promete, as telas do sistema que ele mostra, os buscadores e as IAs, e o movimento. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta ou a escolha dele), um dos sete princípios de produto, "decisão do Claude". "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/site.md` inteiro, conferido contra a revisão do site em `docs/revisao.md:1606-1652` e `:2167-2174` e as entradas do site no `DEVLOG.md`). A revisão de 13/11 manteve o site como está, falando o sistema adaptado, e o Heitor respondeu "Sim para o site": isso cobre o que o levantamento e o "Mantém" do plano citam (a chamada do teste grátis, os preços do sistema, a calculadora, as telas reais, os buscadores, o movimento) e as três recomendações (o texto adaptado, o que o app da cliente ganhou, as telas fotografadas de novo); o resto vem das entradas de outubro, muitas escritas como pedido dele sem a fala. Os planos, o que cada um dá, a assinatura e o teste grátis DENTRO do sistema ficam no catálogo da Plataforma; o prazo de remarcar e cancelar pelo app, no do Atendimento. É um RASCUNHO para o Heitor revisar. Contagem: 43 regras (O site e a chamada 5, Os preços e a calculadora 7, O que o site diz do sistema 4, O app da cliente na página 5, O texto e o que ele promete 7, As telas 4, Buscadores e IAs 5, O movimento 6), 2 perguntas e 3 divergências. Dos 55 números do rascunho, 5 ficaram fora do catálogo (implementação) e 4 são de outra área (ver os apêndices); todos os outros estão num "Antes".

## O site e a chamada (ST)

**ST-01.** O site mora em bellarisos.com, num app próprio, separado do app da rede. É a página de quem ainda não conhece o BellarisOS e não tem login.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site" (o levantamento, "Fica como está")
- Onde: `docs/regras/site.md:6-7`, `:13-14`, `:62-63`; `docs/revisao.md:1606-1618`
- Antes: KA-01

**ST-02.** O endereço raiz do app da rede (app.bellarisos.com) só decide a porta: com a sessão aberta, leva ao portal; sem sessão, ao login (é o que o app Android abre).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:11`, `:13-15`; `DEVLOG.md:6111-6112`
- Antes: KA-02

**ST-03.** A chamada do site é o teste grátis: os botões levam ao cadastro da rede no app (a rede criada por quem vai usar), sem cartão.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site" (o plano: "Mantém: o teste grátis como chamada")
- Onde: `docs/regras/site.md:8-9`, `:16`; `docs/revisao.md:1615`, `:2174`
- Antes: KA-03

**ST-04.** O site descreve o teste grátis como o sistema o dá: os dias e o que ele inclui são os que valem na plataforma (hoje, 14 dias, com tudo menos o Copilot).
- Fonte: princípio 3
- Onde: `docs/regras/site.md:8-9`; `docs/regras/plataforma.md:344`; `DEVLOG.md:5301-5302`
- Antes: KA-04

**ST-05.** O site não carrega nada de fora além das fontes do Google: script, pixel ou fonte de fora só entra a pedido do Heitor.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:63-65`, `:204`
- Antes: KA-42

## Os preços e a calculadora (PE)

**PE-01.** Os preços aparecem e são os do sistema (os planos dele), nunca escritos na página: preço ou plano novo entra sozinho no site, em até uma hora.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site" (o plano: "Mantém: … os preços do sistema")
- Onde: `docs/regras/site.md:17-18`, `:70-72`, `:197`; `docs/revisao.md:1615-1616`, `:2174`
- Antes: KA-05

**PE-02.** O site mostra só os planos ativos e não mostra as cotas de uso (a do Copilot).
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:70-72`, `:203`; `DEVLOG.md:11413`
- Antes: KA-06

**PE-03.** Se o banco não responder, os preços são os últimos que o site leu; se nunca leu, a seção diz que os planos aparecem em instantes. Nunca R$ 0.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:72-74`, `:201`
- Antes: KA-07

**PE-04.** O cartão de cada plano diz os limites e os adicionais em frases. O destaque em rosé é o plano com o Copilot incluído, dizendo o que ele tem a mais — sem inventar "o mais vendido".
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:75-77`
- Antes: KA-08

**PE-05.** A calculadora (em Preços) pergunta unidades, pessoas na equipe, números de WhatsApp e o que muda de plano para plano (hoje, o Copilot), e indica o plano. As perguntas e os limites saem dos planos do sistema; quando todos os planos têm equipe ilimitada, ela diz isso embaixo da pergunta.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site" (o plano: "Mantém: … a calculadora")
- Onde: `docs/regras/site.md:78-80`, `:84-85`; `DEVLOG.md:5926-5932`; `docs/revisao.md:2174`
- Antes: KA-09

**PE-06.** A calculadora indica o plano de MENOR total por mês que cabe, contando os adicionais que o plano vende (número de WhatsApp extra, sem teto, e Copilot avulso); no empate, o de menos adicionais. Mostra a conta, e cada plano que não cabe diz por quê; se nenhum cabe, indica o teste grátis e a Ajuda. A resposta já vem calculada, mesmo sem JavaScript.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:80-85`, `:200`; `DEVLOG.md:5933-5937`
- Antes: KA-10

**PE-07.** O comparativo dos planos no site é o mesmo do sistema: a mesma tabela, com os nomes das funcionalidades do plano.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:86-87`; `docs/revisao.md:1616`
- Antes: KA-12

## O que o site diz do sistema (PS)

**PS-01.** O hero e o título da página dizem "O sistema operacional da clínica de estética": ERP e CRM num sistema só, do comercial ao financeiro e ao marketing, e o app da cliente. A seção "Não são sistemas separados. É um sistema só." mostra o núcleo e as frentes em volta — Comercial (CRM), Atendimento, Financeiro (ERP), Marketing — e o App da cliente ligado a elas.
- Fonte: o Heitor, 2026-10-18: "Não somos sistemas separados, somos literalmente um sistema operacional para clínicas."
- Onde: `docs/regras/site.md:21-31`; `DEVLOG.md:6040-6050`
- Antes: KA-13, KA-14

**PS-02.** O hero diz que o BellarisOS substitui vários sistemas que não conversam entre si, e a seção da troca mostra, linha a linha, o que a equipe faz hoje à mão entre um sistema e outro e a funcionalidade que existe no lugar. Cada "depois" é uma funcionalidade conferida; nenhum concorrente é citado.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:32-36`; `DEVLOG.md:5946-5955`
- Antes: KA-15

**PS-03.** O "Fácil de usar" se sustenta só no que o sistema tem: a busca universal (Ctrl+K), o menu recortado pelas permissões, o Copilot, o app Android, o /setup com a importação e a Ajuda com chamados. Nada de "em 5 minutos" nem número de adoção.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:37-40`; `DEVLOG.md:5956-5959`
- Antes: KA-16

**PS-04.** O "Cada um vê o seu" diz também "e tudo o que se faz fica registrado" (a Auditoria).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site"
- Onde: `docs/regras/site.md:40-41`; `docs/revisao.md:1643-1646`, `:2172`
- Antes: KA-17

## O app da cliente na página (AQ)

**AQ-01.** O app da cliente é o diferencial: tem seção própria, no menu do topo, com três telas do app em leque.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:42-43`; `DEVLOG.md:6042-6043`, `:6051-6053`
- Antes: KA-18

**AQ-02.** No texto da página, o nome é sempre "App da cliente" (no sistema, é o portal do cliente), nunca "portal". O comparativo dos planos é a exceção: lá vale o nome da funcionalidade do plano, "Portal e app da cliente", o mesmo do sistema.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:43-44`, `:216`; `docs/revisao.md:2164`
- Antes: KA-19

**AQ-03.** O app é um só, para todos (o mesmo sistema, no navegador ou no app Android): quem decide o que se vê é o login, e a cliente que entra vê só a dela. O site não diz que a cliente baixa um app à parte, nem "o app da sua clínica", nem que cada rede tem um app na loja.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:45-48`, `:218`
- Antes: KA-20

**AQ-04.** O texto do app da cliente diz só o que ele faz: agendar sozinha (o que a rede liberar), assinar com o dedo, pacotes, créditos e planos, pontos e recompensas, confirmar e avaliar, avisos no celular, LGPD, remarcar e cancelar até o prazo da rede, e — desde a revisão — aceitar o plano de tratamento pelo celular, agendar as sessões do plano e do pacote e assinar todos os documentos abertos de uma vez.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site"
- Onde: `docs/regras/site.md:49-55`; `docs/revisao.md:1643-1646`, `:2172`; `DEVLOG.md:3454-3459`
- Antes: KA-21, KA-22

**AQ-05.** O site não promete que a cliente paga pelo app (o financeiro dela é consulta, o aceite do plano é um gesto, o pagamento é no PDV da unidade), nem a logo da rede (o app leva o nome da unidade), nem remarcar e cancelar sem o prazo da rede.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site" (a recomendação: "Continua sem prometer o que ele não faz (pagar).")
- Onde: `docs/regras/site.md:56-58`, `:215`; `docs/revisao.md:1643-1646`
- Antes: KA-23

## O texto e o que ele promete (TX)

**TX-01.** O texto do site fala o sistema adaptado: "Documentos" (não "Termos e contratos"), "ficha de saúde" (não "anamnese"), o PDV ("Recebeu no PDV"), "oportunidade" (não "lead"), "Permissões sob medida", e nenhum cargo como se fosse fixo — "a equipe", "quem atende", "as permissões dela". "Termo de consentimento" fica, como um tipo de documento, e "clínica de estética" fica, porque é o mercado, o que se procura no buscador.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site"
- Onde: `docs/regras/site.md:160-172`, `:217`; `docs/revisao.md:1639-1642`, `:2171`; `DEVLOG.md:3443-3453`, `:3468-3471`
- Antes: KA-25

**TX-02.** Nada inventado: sem depoimento, cliente, logo de parceiro ou número de uso enquanto não existirem de verdade. Cada promessa é uma funcionalidade conferida.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:173-175`, `:205`; `DEVLOG.md:6128`
- Antes: KA-26

**TX-03.** O que depende de terceiro fica fora do site até valer em produção: hoje, Instagram e Messenger no inbox (esperam a análise do app na Meta).
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:176-177`, `:207`; `DEVLOG.md:6128-6129`, `:11476`
- Antes: KA-27

**TX-04.** O termo do sistema que não se explica sozinho ganha a explicação no próprio texto (sublinhado pontilhado; abre no mouse, no foco e no toque; no celular, fica dentro da tela). Hoje: ERP e CRM, WhatsApp oficial, modelos aprovados, tarifa da Meta, DRE, inbox, funil, horário de silêncio e PDV. A explicação só diz o que o sistema faz.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:178-183`; `DEVLOG.md:5906-5912`, `:3448-3449`
- Antes: KA-28

**TX-05.** Funcionalidade nova que muda o que a rede ganha muda a página junto (o texto e, se for o caso, uma tela).
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:184-185`
- Antes: KA-29

**TX-06.** O que está chegando mora na seção "Em breve", depois de "E ainda": cartão tracejado e o selo "Em breve" em cada item, sem data prometida. Hoje: emissor de NFS-e, integração com Open Banking e o receituário digital Memed. Só entra ali o que o Heitor pedir; quando fica pronto, sai dali e vai para as funcionalidades.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:186-191`, `:206`; `DEVLOG.md:146-147`
- Antes: KA-30

**TX-07.** O que está "Em breve" não entra nos dados estruturados, no resumo para as IAs nem nas perguntas da página: lá, só o que existe.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:191-192`, `:206`
- Antes: KA-31

## As telas (TL)

**TL-01.** O produto aparece em telas REAIS do sistema, fotografadas de uma rede fictícia (a "Clínica Aurora"), nunca com dado de cliente real. Cada tela tem o texto alternativo que diz o que ela mostra.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site" (o levantamento: "o produto aparece em telas REAIS, fotografadas de uma rede fictícia")
- Onde: `docs/regras/site.md:19`, `:91-95`, `:208`; `docs/revisao.md:1616-1617`
- Antes: KA-32

**TL-02.** Cada destaque mostra a tela do que ele fala (o de "Agenda e atendimento" é a agenda do dia, não a ficha), e a foto do destaque sai sem o menu lateral.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:96-98`; `DEVLOG.md:5878-5882`
- Antes: KA-33

**TL-03.** O app da cliente aparece em três fotos (o início, o agendar com os horários livres, os pontos), e as fotos mostram o que o sistema mostraria de verdade (os pontos ganhos no pagamento, não um ajuste da equipe).
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:99-102`
- Antes: KA-34

**TL-04.** As telas do site são fotografadas de novo no fim do plano de adaptação, com o sistema adaptado.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Sim para o site"
- Onde: `docs/revisao.md:1647-1648`, `:2173`; `DEVLOG.md:3414-3415`, `:3501-3502`
- Estado: decidida, ainda não implementada (`docs/revisao.md:2173`: "no fim do plano")
- Antes: KA-35

## Buscadores e IAs (SE)

**SE-01.** O site é feito para ser achado por buscador e por IA: os buscadores são bem-vindos (sem bloqueio de indexação), com endereço canônico, mapa do site e imagem de compartilhamento; o endereço com "www" leva ao sem "www"; a descrição cabe no resultado (até 160 caracteres) e diz "sistema para clínica de estética".
- Fonte: o Heitor, 2026-10-20: "excelente em SEO e GEO"
- Onde: `docs/regras/site.md:65-66`, `:103`, `:115-120`; `DEVLOG.md:5904-5907`; `docs/revisao.md:2174`
- Antes: KA-36, KA-41

**SE-02.** As perguntas da página são as mesmas, palavra por palavra, nos dados estruturados e no resumo para as IAs, e começam pelas que se fazem a um buscador ou a uma IA: o que é, para quem, o que substitui, quanto custa (com o preço do sistema).
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:104-111`, `:198`
- Antes: KA-37

**SE-03.** O site tem um resumo em texto para as IAs (/llms.txt) com a definição, os planos e as perguntas da página — sem texto próprio.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:111-112`
- Antes: KA-38

**SE-04.** O robots.txt libera com todas as letras os robôs das IAs.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:113-114`
- Antes: KA-39

**SE-05.** Os dados estruturados descrevem a organização, o site e o produto, com cada plano ativo como oferta mensal e as funcionalidades do catálogo.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:104-107`, `:119-120`
- Antes: KA-40

## O movimento (MV)

**MV-01.** O site tem movimento: as seções entram ao chegar na tela, e há gradiente de fundo. É a exceção às regras do sistema, que proíbem as duas coisas, só no site (é vitrine, não ferramenta do dia inteiro); o resto do design vale igual, e a exceção não vai ao app da rede.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-10-18: aprovou o nível "marcante" e a exceção, só no site (o pedido dele: o site "mais atraente e dinâmico")
- Onde: `docs/regras/site.md:124-130`, `:214`; `DEVLOG.md:6060-6064`
- Antes: KA-43

**MV-02.** A página nasce visível e parada. O movimento só liga para quem não pediu menos movimento ao aparelho e com o JavaScript da página funcionando; sem JavaScript, com o script bloqueado ou com movimento reduzido, nada fica invisível e nenhuma animação contínua roda.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:132-137`, `:154-156`, `:211-212`
- Antes: KA-44

**MV-03.** O que se mexe: as seções entram quando chegam na tela; a faixa das funcionalidades, o brilho do hero, a vez dos passos do dia e o celular flutuando são contínuos, e só com o movimento ligado.
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:138-141`, `:151-153`; `DEVLOG.md:6065-6072`
- Antes: KA-45

**MV-04.** As demonstrações (os avisos do hero, a conversa do WhatsApp, o Copilot) contam a mesma história das telas fotografadas (Mariana Costa, Dra. Ana Lima, quinta às 10h) e não prometem nada que as telas não mostram. Andam só enquanto estão na tela; sem movimento, ficam paradas (as conversas inteiras, os avisos no primeiro). O leitor de tela não as lê (o texto alternativo das telas já diz o que mostram).
- Fonte: decisão do Claude
- Onde: `docs/regras/site.md:142-147`, `:213`; `DEVLOG.md:6073-6076`
- Antes: KA-46

**MV-05.** O destaque do título ("num lugar só.") é só a cor rosé, sem traço embaixo; com movimento, um brilho passa uma vez pelas palavras quando o título entra.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/site.md:148-150`; `DEVLOG.md:6088-6091`
- Antes: KA-47

**MV-06.** Os cartões do "Fácil de usar" não têm o brilho rosé que segue o mouse (o "E ainda" tem).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `DEVLOG.md:5882-5884`
- Antes: KA-48

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Fica na página só a Q02 (o fim do teste e o app Android: fatos que só você sabe). As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Estas regras são suas? Escritas como pedido ou decisão sua, sem a sua fala.** O endereço raiz do app da rede que só decide a porta, portal ou login (ST-02; "Decisões do Heitor (2026-10-16)", `docs/regras/site.md:11-15`); a troca de vários sistemas por um, linha a linha, e o "Fácil de usar" sustentado só pelo que o sistema tem (PS-02 e PS-03; "pedido do Heitor, 2026-10-19", `site.md:32`, `DEVLOG.md:5948`); o app da cliente como o diferencial, com seção própria (AQ-01; `DEVLOG.md:6042-6043`, fora das aspas); o app que é um só para todos, sem app de cada rede na loja (AQ-03; "esclarecimento do Heitor, 2026-10-19", `site.md:48`); a explicação dos termos no próprio texto (TX-04; "Pedido do Heitor", `DEVLOG.md:5906`); a seção "Em breve", em que só entra o que você pedir (TX-06; "pedido do Heitor, 2026-10-22", `site.md:186`); o destaque que mostra a tela do que fala (TL-02) e os cartões do "Fácil de usar" sem o brilho do mouse (MV-06) ("Pedidos do Heitor", `DEVLOG.md:5880`); e o título sem o traço embaixo (MV-05; "pedido do Heitor", `DEVLOG.md:6088`). A revisão de 13/11 manteve o site como está ("Sim para o site"), mas não cita estas uma a uma. Confirma as nove?

Q02. **O que o site diz do fim do teste e do app Android.** A pergunta "Como funciona o teste grátis?" responde "Antes de terminar, combinamos o plano" (`apps/site/lib/perguntas.ts:26`), e a página diz que no Android "também há o aplicativo" (`apps/site/lib/perguntas.ts:30`; `apps/site/components/conteudo.tsx:253`). O próprio DEVLOG deixou isso para conferir (`DEVLOG.md:11378-11379`: "Conferir no texto do site: o 'combinamos o plano' do fim do teste, o app Android citado como disponível…"). Nenhuma regra diz se, no fim do teste, a rede escolhe o plano sozinha na Assinatura ou combina com o BellarisOS, nem se o app Android já está na loja. Como é?
- (a) A rede escolhe o plano sozinha: o texto passa a dizer isso. O app Android: está na loja (fica) ou não está (sai até estar).
- (b) O plano se combina com o BellarisOS: o texto fica. O app Android: idem.

## Divergências

O texto de `docs/regras/` (ou o código) contra a decisão mais nova — para corrigir depois.

- ST-04 (texto e CÓDIGO): o teste grátis "com tudo liberado". `docs/regras/site.md:9` diz "tudo liberado, sem cartão", e a página repete: "14 dias com tudo liberado" (`apps/site/components/conteudo.tsx:67`, `:572`; `apps/site/components/precos.tsx:20`; `apps/site/components/calculadora.tsx:66`; `apps/site/lib/llms.ts:22`) e "usa o sistema inteiro por 14 dias" (`apps/site/lib/perguntas.ts:26`). O teste grátis do sistema é "tudo, menos o Copilot" (`docs/regras/plataforma.md:344`; a tela da rede em teste já diz "Teste grátis: tudo, menos o Copilot", `DEVLOG.md:5301-5302`; PN-01 de `docs/catalogo/plataforma.md`). Pelo princípio 3, o site diz o que vale: tudo, menos o Copilot.
- ST-04 (CÓDIGO): os 14 dias escritos na página. O número de dias do teste é uma configuração da plataforma, de 0 a 90, com 14 de padrão (`supabase/migrations/20261003000011_sistema_redes_e_assinaturas.sql:49`; `packages/nucleo/src/lib/redes/criar.ts:98-104`; a tela de Configurações do app sistema), e o site escreve "14 dias" à mão (`apps/site/app/layout.tsx:7`; `apps/site/app/opengraph-image.tsx:29`; `apps/site/lib/perguntas.ts:24`, `:26`, e as linhas da divergência acima). Mudado o número no sistema, o site passa a prometer outro prazo. A correção segue a regra dos preços (PE-01): o site lê os dias do sistema, como lê os planos.
- AQ-02 (texto): `docs/regras/site.md:216` proíbe chamar o app da cliente de "portal" na página, sem exceção; mas o comparativo do site mostra a funcionalidade "Portal e app da cliente" (`packages/nucleo/src/lib/planos/recursos.ts:47`), como o Heitor aprovou em 16/11 (o PL1, "Sim": os rótulos "que o sistema, a tela de assinatura e o site mostram", `docs/revisao.md:2164`; PN-12 de `docs/catalogo/plataforma.md`). O texto de `site.md:43-44` e `:216` passa a dizer a exceção do comparativo.

## Ficou fora do catálogo

Detalhes de implementação, que ficam em `docs/regras/site.md`:
- KA-49: a página renderiza a cada pedido, porque os links do app da rede e os planos vêm do ambiente e do banco (`docs/regras/site.md:67-69`) — técnico; o que a pessoa percebe é o PE-01.
- KA-50: os tamanhos do site como tokens próprios, a paleta, a fonte, os raios e as sombras do núcleo, e nenhum tamanho de fonte à mão (`site.md:88-90`, `:153`, `:209`) — design e implementação.
- KA-51: o escape do "<" no JSON dos dados estruturados (`site.md:107-109`, `:199`) — técnico.
- KA-52: o serviço do site só com a chave pública, e os planos lidos por uma função que não abre a tabela (`site.md:62-63`, `:70-72`, `:202-203`) — segurança técnica; o que a página mostra é o PE-02.
- KA-53: os testes do site e da câmera fora da suíte do app da rede (`site.md:121-122`, `:210`) — técnico.

## É de outra área

- KA-11: os números de WhatsApp extras sem teto (o Heitor, 2026-10-20: "não existe limitação"; `docs/regras/site.md:83`, `DEVLOG.md:5938-5939`) — já em `docs/catalogo/plataforma.md` (PN-16); a calculadora só o aplica (PE-06).
- KA-24: a cliente remarca e cancela pelo app até o prazo da rede, 24 horas antes por padrão (`docs/regras/site.md:51-53`) — já em `docs/catalogo/atendimento.md` (AG-53); o site só o diz (AQ-04, AQ-05).
- KA-54: os nomes das funcionalidades do plano, os mesmos no sistema, na Assinatura, no comparativo e no site (`docs/revisao.md:2164`) — já em `docs/catalogo/plataforma.md` (PN-12); a exceção no texto do site é a AQ-02.
- KA-55: o teste grátis tem tudo, menos o Copilot (`docs/regras/plataforma.md:344`) — já em `docs/catalogo/plataforma.md` (PN-01); o site só o descreve (ST-04).
