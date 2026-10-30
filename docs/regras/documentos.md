# Termos e contratos

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.4.1 Termos e contratos (2026-09-30)

A rede monta (no editor, com variáveis) ou envia (PDF pronto, assinado como
está) os modelos de termo e contrato, e o cliente assina eletronicamente —
na clínica, no portal, por link ou no papel. Plano aprovado em 2026-09-29, em
seis fases, **todas no ar**: modelos; emissão pelo atendimento com
assinatura na clínica e no papel; checkout do plano; PDF assinado e
verificação pública; portal do cliente; link público. O desenho inteiro está no
DEVLOG ("Termos e contratos").

- **O documento é do PROCEDIMENTO** (decisão do Heitor): cada procedimento
  liga até UM termo (`procedures.consent_template_id`) e UM contrato
  (`contract_template_id`). No plano, o cliente assina um termo por
  procedimento distinto e UM **contrato de plano** da rede
  (`kind = 'CONTRATO_PLANO'`, no máximo um ativo — índice único). Sempre de
  novo: cada atendimento avulso e cada plano pede documentos novos.
- **Três tipos, cada um com as suas variáveis** (`lib/documentos/variaveis.ts`,
  catálogo FECHADO): o termo também serve ao plano, então não usa
  `agendamento.*`; o contrato do procedimento é o do avulso; só o contrato de
  plano usa `plano.*` e `pagamento.*`. Variável fora do tipo é recusada ao
  salvar — sairia em branco num documento assinado.
- **O editor é rico (Tiptap), mas o que se assina é a árvore NOSSA**
  (`lib/documentos/arvore.ts`, v2 — decisão do Heitor, 2026-09-29, que
  substituiu a marcação leve): fonte, tamanho, negrito/itálico/sublinhado/
  tachado, cor, realce, alinhamento, entrelinhas, títulos, listas, tabelas,
  imagens, cabeçalho/rodapé, quebra de página. A tela
  (`DocumentoRenderizado`) e o PDF (`lib/documentos/pdf/diagramacao.ts`)
  desenham a MESMA árvore, com as mesmas medidas (em pontos) e fontes.
  - **A porta única é o conversor** (`editor/converter.ts`): o JSON do editor
    vira árvore só com nó/marca/atributo conhecidos; o resto é ERRO (o JSON vem
    do navegador). Colado do Word é normalizado (fonte do Office → a livre
    equivalente, tamanho → o mais próximo da lista, cor só `#rrggbb`). O JSON
    do editor NUNCA vai para a tela como HTML.
  - A variável é interpolada sobre a árvore (vira texto puro, com o estilo que
    tinha no modelo).
  - A marcação leve de antes ainda vale (versões antigas, o contrato de plano
    semeado, E2E por `p_texto`): `editor/da-marcacao.ts` a converte para o
    MESMO JSON, e ela passa pelo mesmo conversor. A v1 gravada (array) se lê
    por `lerConteudo`/`deV1`.
  - **Fontes**: 12 famílias livres em `public/fontes-documento/` (as do Office
    não se embutem: Arimo = Arial, Tinos = Times, Carlito = Calibri, Cousine =
    Courier, Gelasio = Georgia). A tela as usa por `@font-face` (`doc-<id>`), o
    PDF as embute com `@pdf-lib/fontkit`, `subset: false` (o subset troca
    glifos). ⚠️ O TTF que a API do Google Fonts serve para Arimo, Carlito e
    Cousine QUEBRA o fontkit — vêm do repositório google/fonts
    (`scripts/baixar-fontes.mjs`); o teste embute os 48 arquivos.
  - **Imagens** moram em `modelos-de-documento/<rede>/imagens/<sha256>.<ext>`
    (endereçadas pelo conteúdo). A árvore guarda caminho + sha256 — o hash do
    documento cobre a imagem —; a tela recebe URLs temporárias à parte
    (`urlsDasImagens`), e o PDF confere o sha256 antes de desenhar.
  - `.ttf`/`.woff` ficam fora do matcher do proxy: a página pública do link
    carrega as fontes SEM sessão.
  - **A tela de edição** (`components/admin/editor-rico/`, carregada por
    `next/dynamic`): corpo, cabeçalho e rodapé são três editores Tiptap, numa
    folha com as medidas do documento. Cada nó do editor tem par no conversor
    — nó novo sem par é recusado ao salvar. A imagem sobe por
    `enviarImagemDoModelo` (PNG/JPEG pelo cabeçalho do arquivo, até 2 MB).
  - ⚠️ **O JSON do editor vai à action como cópia JSON pura**: o ProseMirror
    cria os `attrs` sem protótipo, e o React os manda como referência
    temporária — o servidor não lê nenhum campo ("Cannot access textAlign on
    the server").
  - ⚠️ **O foco volta ao texto na HORA** (`view.focus()` na barra): o `focus()`
    do Tiptap espera o próximo quadro, e o que se digitava logo depois de
    escolher numa lista ia para a própria lista.
- **Versão é retrato**: `documento_modelo_salvar` grava modelo + versão numa
  transação, e só abre versão nova quando o CONTEÚDO muda. Versão não se
  altera (gatilho); modelo não se apaga (desativa).
- **Modelos são `forms: MANAGE`** (Configurações → Documentos); colher a
  assinatura é o módulo `documents`; ligar ao procedimento é `procedures`.
  - **Exceção do checkout** (decisão do Heitor, 2026-10-20): quem RECEBE
    (`podeReceber`) colhe a assinatura do documento de um plano que está no
    checkout (`treatment_plan_id` de plano PROPOSED) — abrir, assinar na tela,
    no papel e montar de novo (`assertPodeColher`, `actions/documentos.ts`).
    O caixa da simulação de um dia de clínica travava ali. Fora do checkout,
    continua o módulo de Termos. Prova: `e2e/checkout-de-plano.spec.ts`.
- O banco recusa modelo de outra rede no procedimento (chave composta com
  `tenant_id`) e o tipo errado no campo (gatilho
  `trg_procedimento_modelos_do_tipo`).
- PDF enviado: cabeçalho `%PDF-` conferido (não o `type` do navegador), abre
  no `pdf-lib` sem senha, até 10 MB e 50 páginas; mora em
  `modelos-de-documento/<tenant>/<sha256>.pdf`.
- **O documento emitido é `issued_documents`** (`consent_terms` é legado). Nasce
  por GATILHO no agendamento (`trg_documentos_no_agendamento`: INSERT emite os de
  AGENDAMENTO; check-in, os de INICIO_ATENDIMENTO; cancelar/falta cancela os
  abertos; trocar o procedimento troca os documentos) — o agendamento nasce em
  cinco INSERTs. Agendamento de plano não emite (o plano tem os dele).
- **O gatilho só cria a linha (A_GERAR)**; o texto é montado pelo app
  (`lib/documentos/renderizar.ts` → `documento_registrar_render`), e toda tela
  que mostra um documento chama `garantirRenderizado` antes. Faltou dado
  obrigatório: INCOMPLETO, não assina.
- **A forma canônica é TEXTO** (`issued_documents.content`): jsonb reordenaria as
  chaves e o hash não bateria. O navegador calcula o SHA-256 dos bytes que
  recebeu; `documento_assinar` só aceita se bater com o gravado.
- **O bloqueio é gatilho** (`trg_documentos_bloqueiam_inicio`): nenhuma porta
  põe IN_PROGRESS com documento BLOQUEIA aberto. Dispensar (com motivo) cumpre.
- **Assinar é UMA função** para todos os canais (`documento_assinar`): trava,
  confere hash, grava a evidência (`document_signatures`, imutável, sem
  cascade) e o status numa transação. `termo.assinado` sai depois, em TS;
  `termo.emitido` sai do banco.
- ⚠️ **Releitura na mesma renderização: `abortSignal`.** O React memoriza
  `fetch` GET idênticos numa renderização — a releitura do documento depois de
  montá-lo devolvia a resposta velha. `lerDocumento` passa um sinal novo.
- A ficha do cliente lê a aba por `?aba=` (não `?tab=`).
- **Checkout do plano: Plano → Pagamento → Documentação → Agendamento.** O
  contrato de plano cita a forma de pagamento, então nasce depois dela
  (`prepararDocumentosDoPlano`, `lib/documentos/plano.ts`). O retrato do
  pagamento (`pagamentoNormalizado`, `lib/checkout/pagamento.ts`) fica em
  `issued_documents.payment_snapshot`; trocar o pagamento depois de assinar
  SUBSTITUI o contrato (`documento_substituir`).
- **O contrato do PROCEDIMENTO também cita o pagamento** (decisão do Heitor,
  2026-09-30): `pagamento.*` vale em CONTRATO e CONTRATO_PLANO. No avulso o
  pagamento só é recebido depois do atendimento, então a recepção o DEFINE
  antes da assinatura (`definirPagamentoDoContrato`, ficha e painel da sessão;
  o mesmo `PagamentoDoPlano` do checkout, guardado em `payment_snapshot`).
  - Sem retrato, o pagamento está "não combinado" — diferente de "no
    atendimento" (`{ forma: 'NADA_AGORA' }`): as variáveis ficam vazias e a
    obrigatória (`pagamento.forma`) deixa o contrato INCOMPLETO — não assina,
    não sai por link, e se BLOQUEIA trava o início do atendimento.
  - Troca até a assinatura (o texto e o hash são montados de novo); assinado,
    não muda.
  - O recebimento na recepção já vem com o meio combinado
    (`pagamentoCombinadoDoAtendimento`) — orienta, não trava.
- **A trava do checkout vem ANTES do dinheiro** (`recusaDosDocumentosDoPlano`
  em `checkoutTreatmentPlanInterno`): documento que BLOQUEIA aberto, ou contrato
  assinado para OUTRO pagamento, recusam. Ela EMITE antes de conferir — quem
  chama a action direto não escapa por "ainda não havia documento". O gatilho
  `trg_documentos_bloqueiam_plano` é a segunda linha (barra o status, mas o
  checkout não é transação única).
- **Toda rede nasce com o contrato de plano padrão** (`documentos_modelos_padrao`:
  migration para as de antes, `registerAction` para as novas). Sem CPF de
  propósito: o contrato de antes não o exigia.
- `consent_terms` é LEGADO: os assinados foram copiados para `issued_documents`
  (`moment = 'LEGADO'`, assinatura `identity_method = 'LEGADO'`) e o histórico da
  ficha e do portal lê `assinadosDoCliente`. Nada novo é gravado lá.
- **O PDF final** (`lib/documentos/pdf.ts`, `pdf-lib` + `qrcode`): o documento
  desenhado da MESMA árvore (ou o PDF enviado, como está), rodapé com o código
  em toda página e a página de evidências. Sai em `after()` depois de
  `documento_assinar`; o cron `documentos-pdf` recolhe o que falhar,
  reivindicando a linha (`documentos_pdf_reivindicar`, `skip locked`, 5
  tentativas). `documento_registrar_pdf` só grava uma vez. Texto passa por
  `limparParaWinAnsi` — o `pdf-lib` LANÇA com emoji no nome.
- **`/verificar` e `/verificar/[código]` são PÚBLICAS** (no proxy) e mostram
  status, rede, unidade, as INICIAIS do assinante e os dois SHA-256 — nunca CPF,
  nome completo, IP nem conteúdo. "Conferir um arquivo" calcula o hash no
  navegador. O PDF da equipe sai por `/api/documentos/[id]/pdf` (sessão +
  `documents: VIEW` + rede + unidade).
- **Portal do cliente** (`/[slug]/cliente/documentos`): o cliente vê o que pede a
  assinatura dele e os assinados, e assina com a SESSÃO como identidade
  (`assinarNoPortal`, `actions/documentos-portal.ts` — só documento DELE). A
  equipe manda por "Pedir no portal" (`pedirAssinaturaNoPortal`): push com
  texto GENÉRICO — o título pode dizer o procedimento, e o push aparece na tela
  de bloqueio. Cliente sem conta no portal: recusado, e a tela diz o caminho.
  Quem agenda pelo portal e tem documento a assinar vai direto para ele.
  O detalhe do agendamento no portal tem "Documentos deste atendimento"
  (J-63, `documentosDoAgendamento`): o título e a situação — "Falta a sua
  assinatura" (com "Assinar"), "Assinado em …" (com "Ver"), "Em preparação
  pela clínica", "Dispensado pela clínica". O que falta no cadastro e o
  motivo da dispensa ficam com a equipe. Prova:
  `e2e/portal-cliente-documentos-do-agendamento.spec.ts`.
- **Link público** (`/assinar/[token]`, rota pública; `gerarLinkDeAssinatura`
  na ficha): uso único, 7 dias, um ativo por documento (gerar outro revoga).
  - **Só o SHA-256 do token vai para o banco** (`document_sign_links`) — o
    link se mostra UMA vez; perdeu, gera outro.
  - Antes de ver o documento o cliente confirma o CPF, ou a data de nascimento
    se o cadastro não tem CPF (sem nenhum dos dois, o link não é gerado).
    Antes disso a página mostra só a clínica e "um documento".
  - A conferência e as contas moram no banco, com o link travado
    (`documento_link_abrir`): 5 erros revogam o link, 20 erros na hora param
    o IP. Devolve jsonb em vez de lançar — a tentativa errada tem de ficar
    gravada.
  - `/api/assinar/abrir` e `/api/assinar/assinar` se defendem pelo link;
    assinar confere a identidade DE NOVO, e `documento_assinar` consome o link
    na mesma transação.
  - `document_sign_links` e `document_link_attempts`: RLS ligada e ZERO
    políticas, como credencial.
  - ⚠️ **IP é o `X-Real-IP`** (a borda do Railway o escreve), não o primeiro
    do `x-forwarded-for`, que o cliente forja à vontade — trocar o cabeçalho a
    cada tentativa furaria o limite (`ipEAparelho`).
  - WhatsApp mínimo: mensagem pronta (genérica) + `wa.me`; não depende de
    caixa conectada nem da janela de 24h.
  - **O texto do link é UM** (`mensagemDoLink`, `lib/saudacao.ts`), o mesmo
    da ficha de pré-atendimento: saúda pelo nome SEM o tratamento
    (`nomeParaSaudar`: "Dona Ivone Becker" é "Olá, Ivone!"; só o tratamento,
    "Olá!") e concorda com o que se confirma — "o seu CPF", "a sua data de
    nascimento". Dizia "Olá, Dona! … confirme o seu data de nascimento" (D19
    da simulação de 2026-10-29). O `{{first_name}}` das campanhas e a
    saudação da home do portal usam o mesmo `nomeParaSaudar`. Prova:
    `tests/saudacao-da-cliente.test.ts`.
  - **Pela conversa do inbox é escolha da REDE**, desligada de nascença
    (`tenants.documentos_link_pela_conversa`, Configurações → Documentos;
    muda só quem tem `forms: MANAGE` e abrangência de rede). Ligada, a ficha
    ganha "Enviar pela conversa" (`enviarLinkPelaConversa`): gera um link
    NOVO e o manda por `enviarNaConversa` na conversa de WhatsApp aberta em
    que o cliente falou por último (`conversaDoCliente`: `client_id`, senão o
    telefone), pela caixa DA CONVERSA — nunca pelo número de quem clicou.
    Não exige `crm`: quem manda não lê a conversa. Janela de 24h fechada: não
    sai, e o link volta para copiar. Sem conversa: recusa ANTES de gerar
    (não revoga o link que existe).
    A mesma chave vale para a ficha de saúde (pré-atendimento, §9.4 —
    `enviarFichaPelaConversa`, 2026-10-21): a configuração diz os dois.
- **A tela de Documentos** (`/admin/documentos` e `/[slug]/documentos`, corpo
  em `app/_shared/documentos-emitidos.tsx`, menu Atendimento; pedido do
  Heitor, 2026-10-14): todo termo e contrato emitido no período, com a
  SITUAÇÃO — faltam dados, a enviar, enviado, assinado, dispensado,
  cancelado (o substituído só pelo filtro). A situação e os números são do
  banco (`documentos_emitidos*`, migration `20261014000002`): o status mais a
  trilha. "Enviado" = há `LINK_GERADO`, `NOTIFICADO_PORTAL` ou
  `LINK_ENVIADO_CONVERSA`; a coluna mostra o envio mais recente, o link
  valendo (ou vencido) e se o cliente abriu (`IDENTIDADE_OK`).
  - É só LEITURA (`documents: VIEW`); quem tem unidade fixa vê a dela. A
    janela do documento mostra a trilha (`trilhaDoDocumento`, sem o CPF de
    quem assinou), o PDF e "Abrir na ficha" — as ações ficam na ficha.
  - O A_GERAR da página é montado ao listar (`renderizarPendentes`), como na
    ficha: sem isso ele não saberia se falta dado.
  - Os rótulos da trilha são UM só (`lib/documentos/situacao.ts`), na tela e
    na página de evidências do PDF.
  - Canal de envio novo grava o seu evento em `issued_document_events` e
    entra na lista de envios da função — senão o documento fica "a enviar".
  - Prova: `e2e/documentos-painel.spec.ts`.
- **Os documentos emitidos seguem o prontuário "só os meus"** (decisão do
  Heitor, 2026-10-29). Com `medical_records` OWN, só os documentos das
  clientes que ela atende — um agendamento com ela, qualquer um, inclusive
  futuro (`clienteNoEscopo`, `lib/clientes/atendida-por.ts`, a regra do
  prontuário OWN):
  - a tela de Documentos e a ferramenta `documentos` do Copilot recortam no
    banco (`p_professional_id` em `documentos_emitidos_pagina`/`_resumo`,
    migration `20261029000901`; `profissionalDoRecorte`);
  - a ficha da cliente que ela não atende não lista os documentos nem os
    "Assinado: …" do histórico; a sessão de atendimento, idem;
  - pelo id: `documentoAoAlcance` (toda action de `actions/documentos.ts` —
    abrir, colher, papel, gerar link, pela conversa, revogar, pedir no portal,
    dispensar, montar de novo, a trilha), a tela `/documentos/[id]/assinar` e o
    PDF (`/api/documentos/[id]/pdf`) respondem como se o documento não
    existisse.
  - Sem o prontuário no cargo (NONE), o escopo não vale (CLAUDE.md §11): quem
    tem só os Termos vê todos. O checkout do plano (quem recebe) segue como
    estava. Prova: `e2e/documentos-so-os-meus.spec.ts`.
- O que os canais têm em comum mora em `lib/documentos/assinar.ts` (IP,
  assinante, o evento e o PDF depois de assinar), fora de `actions/`.
- O export da LGPD traz os termos e contratos na parte GERAL (sem dado
  clínico, por construção) e copia os PDFs assinados para o pacote.
- Prova: `e2e/documentos-modelos.spec.ts`, `e2e/documentos-atendimento.spec.ts`,
  `e2e/checkout-de-plano.spec.ts`, `e2e/documentos-verificacao.spec.ts`,
  `e2e/documentos-portal.spec.ts`, `e2e/documentos-link-publico.spec.ts`,
  `e2e/documentos-link-conversa.spec.ts`, `e2e/documentos-editor-rico.spec.ts` e
  `e2e/documentos-contrato-pagamento.spec.ts`.

---

## O que nunca fazer aqui

```
❌ Usar em termo/contrato variável fora do catálogo de lib/documentos/variaveis.ts, ou interpolar o TEXTO em vez da árvore
❌ Levar o JSON do editor (Tiptap) à tela ou ao PDF sem passar por converterDocumentoDoEditor (é a porta única do que se assina)
❌ Pôr fonte em documento que não esteja no catálogo e em public/fontes-documento (a tela e o PDF têm de desenhar a mesma)
❌ Alterar uma versão de modelo de documento ou apagar um modelo (edita → versão nova; o que não serve, desativa)
❌ Assinar documento fora de documento_assinar, ou emitir documento de agendamento fora do gatilho
❌ Guardar a forma canônica de um documento em jsonb (reordena as chaves e o hash não bate)
❌ Gravar o token do link de assinatura (só o SHA-256), ou contar tentativas do link fora de documento_link_abrir
```
