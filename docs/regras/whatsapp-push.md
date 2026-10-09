# Push e WhatsApp

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.8 Push Notifications
- Dois canais: **Web Push** (VAPID) no navegador e **FCM** no app Android
  (`lib/notifications/push.ts`)
- Pode estar vinculado a `userId` (usuário operacional) ou `clientId` (cliente final) — nunca aos dois ao mesmo tempo
- **Quem recebe uma notificação operacional são as PARTES INTERESSADAS no
  fato**, e a lista não é escrita à mão por evento: sai de
  `lib/notifications/interessados.ts`, por dois eixos que o sistema já
  conhece.
  - **Envolvido direto** — a pessoa de quem o fato é. O profissional do
    agendamento recebe porque a agenda é dele, com permissão ou sem.
  - **Responsável** — quem tem `MANAGE` no módulo que governa o fato e
    alcança a unidade onde ele aconteceu (a própria, ou a rede com
    `branch_id` nulo). É a abrangência do §11, não uma regra nova.
  - `VIEW` **não entra**: ver o módulo é poder consultar, não responder
    pelo que acontece nele. Quem só olha não precisa ser interrompido.
  - **Quem causou o fato sai da lista.** Sino avisando a pessoa do que ela
    acabou de fazer é ruído, e ruído treina a ignorar o sino.
  - A exceção é o **check-in**: ali a parte interessada é uma só, quem vai
    atender. Avisar a gerência de cada chegada seria um sino tocando o dia
    inteiro.
- Notificações operacionais: novo agendamento, cancelamento, remarcação,
  check-in e estoque abaixo do mínimo
- Notificações para cliente: confirmação, lembrete 24h antes, promoções
- Fallback de notificação WhatsApp para quando push falhar (uazapi ou API oficial, conforme o que a rede tiver conectado)

### 9.8.0 Os números de WhatsApp da rede

**A rede tem VÁRIOS números, e cada um é uma linha de `whatsapp_numbers`.** Não
existe mais "o WhatsApp desta rede": toda pergunta é "qual DESTES", e quem
pergunta tem de dizer por quê. `getWhatsAppConfig(tenantId)` foi deletada em vez
de virar atalho — um atalho que escolhe uma linha em silêncio é o defeito que a
tabela veio remover.

- **Tabela própria, não `integration_configs`.** Lá `meta_ads`, `google_ads` e
  `meta_messaging` são legitimamente um por rede, e é a `unique (tenant_id,
  provider)` que os protege. Relaxá-la desprotegeria os três que estão certos.
- **Duas garantias moram em índice único**, não em disciplina do app: no
  máximo um `is_default` por rede, e no máximo um número por PESSOA. Um
  `update` direto ou um script de migração furam a garantia de app; as duas
  existem para matar a mesma coisa, que é a escolha silenciosa.
- **Um número, várias pessoas** (2026-09-27): quem fala por cada número mora em
  `whatsapp_number_users` — o caso típico é UM número de atendimento e três
  SDRs respondendo por ele. O contrário continua proibido (`unique (user_id)`).
  As chaves são compostas com `tenant_id`, então número de uma rede não liga
  pessoa de outra. A única escrita é `definir_vinculos_do_numero` (nome,
  unidade e pessoas numa transação). A antiga `whatsapp_numbers.user_id` saiu
  em 2026-09-28 (migration `20260928000010`).
- **`branch_id` no número é RÓTULO**, não escopo (decisão do Heitor,
  2026-09-25). Não entra em RLS, não entra em `ownerFilter`, e a conversa
  continua nascendo com `branch_id` nulo — a unidade vira tag depois.
- **Cada número tem seu provedor.** uazapi e oficial convivem na mesma rede.
  Nada derruba a conexão vizinha para ativar a sua.

**Por onde a mensagem sai** — a regra é `escolherNumeroDeSaida`
(`lib/whatsapp/escolha.ts`), pura de propósito, nesta ordem:

1. o número **do usuário**, sempre que ele tiver um — inclusive respondendo uma
   conversa que chegou por outra caixa;
2. a caixa **da conversa**;
3. o **padrão da rede** — é por ele que sai tudo que o SISTEMA inicia.

**Sem fallback para "a primeira ativa".** Rede com caixas ativas e nenhum padrão
devolve `null` e a tela avisa: o índice garante NO MÁXIMO um padrão, não PELO
MENOS um, e resolver a falta com um chute ressuscita o `data[0]`.

**O item 1 tem um custo, e ele não pode ser silencioso.** O cliente recebe de um
número que não conhece, abre-se uma thread nova no celular dele, a resposta volta
como conversa nova, e a janela de 24h daquela conversa não vale ali. Por isso:

- **a janela de 24h é da CAIXA QUE VAI ENVIAR**, nunca da conversa
  (`ultimoInboundNaCaixa`). Medir na conversa faz o sistema gravar a mensagem e
  só então a Meta recusar com 400 genérico;
- a mensagem de erro nomeia a caixa e o motivo;
- **`messages.whatsapp_number_id` existe** separado do da conversa, senão o
  histórico afirma que tudo saiu pela caixa dela;
- **`conversations.whatsapp_number_id` nunca é sobrescrito** — a conversa só
  adquire caixa no primeiro envio bem-sucedido, se ainda não tiver uma.
- **Exceção: editar mensagem** sai pela caixa que ENVIOU (o id da mensagem só
  existe lá; por outra linha é 404).

**Na entrada, o webhook nunca descarta a caixa.** `CaixaReceptora` é parâmetro
posicional e obrigatório de `resolveConversation`, antes do `provider` opcional —
um default deixaria um webhook novo voltar a jogar o número fora em silêncio. O
`appSecret` do HMAC vem da caixa que recebeu, não de "a config oficial da rede".
- **O app do BellarisOS é Tech Provider** (2026-09-30): um webhook só para
  todas as redes, em `https://app.bellarisos.com/api/webhooks/whatsapp`
  (Instagram e Messenger: `/api/webhooks/meta`), com o `META_VERIFY_TOKEN`
  do Railway no handshake. Número conectado pelo app não tem segredo próprio:
  a assinatura confere com o `META_APP_SECRET`. Sem nenhum dos dois, recusa —
  HMAC com chave vazia qualquer um calcula. Prova: `e2e/api-sem-credencial.spec.ts`.

**O dedup usa DOIS índices parciais**, não um total: num índice único direto,
`NULL` nunca colide, e Instagram, Messenger e manual ficariam sem dedup nenhum
sem erro nenhum. O ramo `IS NULL` preserva a garantia antiga; o ramo
`IS NOT NULL` acrescenta a garantia por caixa. **E a releitura depois do 23505
leva o mesmo filtro de caixa** — é o único ponto onde esquecê-lo não aparece em
teste feliz: sob concorrência, a mensagem entra na thread errada.

**Nunca use um escalar de rede para decidir algo de uma conversa.**
`canaisConectados.provedorWhatsApp` fazia exatamente isso com a janela de 24h e
o botão de editar; com dois provedores convivendo, mentia em metade das
conversas. A conversa carrega `numero_provider`.

**O aviso e a escapatória são parte da regra, não enfeite.** Quando a caixa do
usuário difere da conversa, o composer avisa ANTES de digitar, nomeando os dois
números, e oferece um clique para responder pela caixa da conversa
(`pelaCaixaDaConversa`). O padrão continua sendo o número do usuário; a
escapatória existe para a decisão não virar parede — sem ela, quem tem número
próprio não responderia nenhuma conversa que não tenha nascido nele. Ela **zera
ao trocar de conversa**: deixar ligada mandaria a próxima pela caixa errada, sem
pedido e sem aviso (ele some quando ela está ativa).

**Quem é a caixa do usuário sai do SERVIDOR** (`canaisConectados(tenantId,
userId)` → `numeroDoUsuario`). A tela precisa saber por onde ELE fala, não de
quem é cada caixa da rede: mandar os vínculos todos ao navegador exporia a
estrutura da equipe para responder uma pergunta sobre uma pessoa só.

**Template pertence a uma WABA**, e o filtro é estrito. Dois números podem
compartilhar a mesma conta de negócio — por isso o escopo é a WABA, não o
número: escopar por número duplicaria o catálogo e faria submeter o mesmo nome
duas vezes à Meta, que recusa por colisão. Oferecer um template de outra conta
dá 404 no clique; lista vazia é melhor resposta.

**O catálogo SEGUE os números oficiais ligados** (2026-10-09, pedido do Heitor;
`lib/templates/catalogo.ts`). Sem número oficial ligado, a tela de templates
não mostra, não edita e não cria nada — e a lista só traz os das contas com
número ligado.
- **Ligar um número puxa da Meta tudo o que a conta dele tem**
  (`importarCatalogoDaWaba`, com o conteúdo): no cadastro pela Meta
  (`conectarWhatsAppPelaMeta`), ao ligar a caixa ou trocar a conta
  (`salvarNumeroWhatsApp`). Falha da Meta NÃO desfaz a conexão: vira aviso, e
  o "Sincronizar" da tela faz o mesmo caminho (status + os criados no painel).
- **Desligar ou remover tira DAQUI os templates da conta que ficou sem número
  ligado** (`limparCatalogosSemNumero`) — inclusive rascunhos. Na Meta nada se
  apaga (ligar de novo os traz); apagar na Meta é só o botão "Apagar" de um
  template. Dois números da mesma conta: desligar um não apaga nada.
- **"De qual número é"** é a conta: a lista mostra os números ligados da conta
  do template e filtra por número (pela conta dele); o template novo nasce na
  conta do número escolhido (com um só, ele). Toda conversa com a Meta sobre um
  template usa a credencial de um número ligado DA CONTA dele (`configDaWaba`),
  nunca "a config oficial da rede".
- **O importado que o sistema não envia entra marcado** (`nao_suportado`, o
  motivo; `lib/templates/importar.ts`): cabeçalho de mídia, variáveis
  numeradas, botão de telefone/código/link com variável, autenticação,
  carrossel. A tela o mostra só leitura (apaga-se, não se edita), e o inbox não
  o oferece nem o envia. Prova: `e2e/templates-por-numero.spec.ts` e
  `tests/templates-importar.test.ts`.

⚠️ **Credencial de integração não vai ao navegador** (2026-10-03). O que a
tela de integrações recebe passa por `mascararSegredos`
(`lib/integracoes/sem-segredo.ts`, lista FECHADA de chaves secretas, também
dentro de listas — o token de cada página do Messenger): o segredo guardado
vira o marcador `SEGREDO_GUARDADO`, e salvar com ele mantém o do banco
(`mesclarSegredos` em `salvarNumeroWhatsApp` e `saveAdsConfig`). Chave nova de
credencial entra na lista, senão volta para a tela.

⚠️ **O `config` de uma integração só grava as chaves do provedor**
(`CHAVES_DA_CONFIG` nas caixas, `CHAVES_DO_ADS` nos anúncios), e a
`baseUrl` tem de ser `https` e pública (`enderecoPublico`). O servidor
chama esse endereço: aceitar `127.0.0.1` ou `169.254.169.254` é dar a quem
tem `settings: MANAGE` um jeito de o app falar com a rede de dentro (SSRF).
`graphBase` (caixa oficial e `meta_ads`: envio, CAPI, campanhas, busca de
contas) troca o endereço da Graph API e é **costura de teste** — fica fora das listas de propósito, e quem remonta a
config campo a campo (`getAdsConfig`) precisa carregá-lo, senão o teste fala
com a Meta de verdade.

**Template só sai com variável que o sistema preenche** — com nome
(`{{nome}}`). O formato posicional da Meta (`{{1}}`) é recusado antes de
gravar: sairia com as chaves no texto do cliente.

⚠️ Os exports de `actions/uazapi-connection.ts` são **endpoints públicos**, e
recebem `numeroId`. Toda uma delas passa por `numeroDaRede()`, que confirma a
posse — sem isso, um id de outra rede entrega o QR code, desconecta e apaga a
instância paga de outra clínica.

### 9.8.1 WhatsApp oficial: coexistência × Cloud API

São dois jeitos de ligar o MESMO número à API da Meta, e a escolha é da
clínica porque a consequência é dela. Guardada em
`whatsapp_numbers.config.modo`; os textos moram em
`lib/whatsapp/modo-oficial.ts`, fora do componente, porque a explicação é
o que importa e precisa sobreviver a refação de tela.

- **Coexistência** — o aplicativo WhatsApp Business continua atendendo no
  celular e o sistema usa o mesmo número ao lado dele. As conversas e os
  contatos já existentes são trazidos na conexão. É o caminho de quem já atende
  pelo celular: nada para de funcionar no dia da conexão.
- **Cloud API** — o número migra para a API. O aplicativo **para** de funcionar
  com ele, e o histórico dele não vem junto. Voltar atrás exige desfazer a
  migração na Meta.

**O aviso da Cloud API fica na tela, em vermelho, antes de a pessoa escolher** —
não atrás de um link. É decisão que não se desfaz clicando.

**A conexão é pelo cadastro incorporado da Meta** (Embedded Signup, 2026-09-30;
o app do BellarisOS é Tech Provider). Botão "Conectar pela Meta" em
Configurações → WhatsApp → Oficial (`ConectarWhatsAppPelaMeta`): abre a janela
da Meta pelo SDK (`FB.login` com o `config_id` de `META_ES_CONFIG_ID`, lido no
servidor), e a escolha da tela vira o `featureType` —
`whatsapp_business_app_onboarding` na coexistência, nada na Cloud API.
- **A janela devolve duas coisas por dois canais**: o código (no `FB.login`,
  vale 30 s) e a conta + o número (postMessage `WA_EMBEDDED_SIGNUP`, só de
  `facebook.com`). A tela junta os dois e chama `conectarWhatsAppPelaMeta`.
- **O servidor não confia nos ids do navegador** (`lib/whatsapp/cadastro-incorporado.ts`):
  troca o código pelo token de negócio e confere COM ELE que o número é daquela
  conta (`/{waba}/phone_numbers`). Ids só com dígitos (vão para o caminho da URL).
- **A caixa é gravada (inativa) ANTES de inscrever o webhook e pedir
  sincronização**: o histórico da coexistência chega uma vez só, e sem caixa
  ele seria descartado. Depois: `subscribed_apps`; Cloud API → `register`
  com PIN de 6 dígitos (guardado em `config.pin`); coexistência → NÃO
  registra e pede `smb_app_data` (contatos, depois histórico — a Meta dá 24 h).
- A caixa do cadastro tem `config.conexao = 'cadastro_incorporado'`, sem
  `verifyToken`/`appSecret` (vale o do app, §9.8.0). A tela NÃO recebe o
  token nem o PIN (`listarNumerosWhatsApp`), e o formulário manual só liga e
  desliga essa caixa — gravar por cima apagaria a credencial. Trocar de conta
  é conectar de novo. O formulário manual continua, recolhido em "avançado",
  para a clínica com app PRÓPRIO na Meta.
- **Os webhooks da coexistência** (`lib/whatsapp/coexistencia.ts`; no painel da
  Meta, assinar `history`, `smb_app_state_sync` e `smb_message_echoes`):
  - `smb_message_echoes` — o que a clínica mandou PELO CELULAR: entra como
    saída, ao vivo (zera o "aguardando");
  - `history` — até 180 dias, em pedaços e fora de ordem: entra IMPORTADO
    (`messages.importada`) e LIDO. O gatilho `on_new_message` não deixa
    importada mais velha virar a última, nem contar não lida, nem mexer no
    "aguardando" (migration `20260930000025`);
  - `smb_app_state_sync` — a agenda do aparelho dá nome à PESSOA que está sem
    (ou com o número como nome); nome escrito pela equipe não é trocado.
  - **Nenhum dos três emite evento** (`resolveConversation(…, { semEventos })`,
    `insertMensagemDoAplicativo`): `conversa.iniciada` e
    `conversa.mensagem_recebida` disparariam a automação de boas-vindas para
    conversas de meses atrás.
- A Graph do cadastro em teste é `META_GRAPH_BASE_TESTE` (só no
  playwright.build.config e no workflow; porta fixa 3199). Prova:
  `e2e/whatsapp-cadastro-incorporado.spec.ts` — contra o build.

---

## O que nunca fazer aqui

```
❌ Perguntar "qual o WhatsApp desta rede?" — a pergunta é qual DESTES, e por quê
❌ Decidir janela de 24h ou botão de editar por escalar de rede em vez da caixa da conversa
❌ Medir a janela de 24h na conversa quando quem envia é outra caixa
❌ Gravar config de integração com chave fora da lista do provedor, ou baseUrl não pública (SSRF)
❌ Gravar mensagem de saída sem whatsapp_number_id (texto, template e mídia levam a caixa que enviou)
❌ Criar a caixa do cadastro incorporado com os ids que o navegador mandou sem conferir com o token (/{waba}/phone_numbers)
❌ Pedir à Meta a sincronização da coexistência antes de gravar a caixa (o histórico chega uma vez só)
❌ Importar histórico ou mensagem do aplicativo emitindo evento de conversa (dispara automação para o passado) ou sem importada = true
❌ Gravar o formulário manual por cima da caixa do cadastro incorporado (apaga o token da Meta)
❌ Falar com a Meta sobre um template pela "config oficial da rede" — é configDaWaba(template.waba_id)
❌ Ligar, desligar ou remover um número oficial sem acompanharCatalogos (o catálogo fica de outra conta)
❌ Apagar template NA META ao desligar um número (só daqui; na Meta é o "Apagar" do template)
❌ Oferecer ou enviar template com nao_suportado (a Meta recusa ou o cliente recebe {{1}})
❌ Pedir o estado da conexão gerenciada sem dizer QUAL caixa (era o "Adicionar número" que reabria a conectada) — null é conexão nova
❌ Mostrar "uazapi" à clínica (tela, aviso, erro que chega à tela) — é "WhatsApp Web", por nomeDoProvedor; o nome fica no código e nos dados
❌ E2E que cria instância gerenciada contra a uazapi real (cada uma é cobrada) — é a falsa, UAZAPI_BASE_URL na porta 3197
```
