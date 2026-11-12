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
- **O contrato de plano ativo se TROCA, não se desativa antes** (D-5, decisão
  do Heitor, 2026-10-29: "Fica o fluxo de trocar; sai o de criar outro e
  desativar o atual antes."). O contrato de plano novo nasce INATIVO quando a
  rede já tem um ativo (`documento_modelo_salvar`, migration
  `20261029001602`) — o texto nunca se perde —, e "Tornar ativo"
  (`tornarContratoDePlanoAtivo` → `documento_contrato_de_plano_ativar`)
  desliga o atual e liga o escolhido numa transação só. Ligar um contrato de
  plano por `definirModeloAtivo` passa pelo mesmo caminho. O índice único
  continua sendo a garantia. **Salvo inativo, a tela diz** (A8 da 6ª
  simulação, 2026-11-04: só a dica da seção dizia): "O contrato de plano “B”
  foi salvo inativo: a clínica já tem um ativo, e só um vale por vez. Para
  usar este, clique em “Tornar ativo”…" (`nasceuInativo` do salvar,
  `[data-contrato-inativo]`). Prova: `e2e/documentos-modelos.spec.ts`.
- **O documento da cliente sem CPF** (cli-09, revisão do Heitor de
  2026-11-02: "contrato sem documento da cliente vale menos"): `cliente.cpf`,
  sem CPF, é o passaporte (ou o RNE) com o tipo — "Passaporte CB1234567" —, e
  `cliente.documento` diz sempre o tipo ("CPF 123.456.789-01"). O termo da
  cliente estrangeira não fica INCOMPLETO por falta de CPF. A evidência da
  assinatura guarda e mostra o mesmo (`dadosDoAssinante`; no PDF,
  "Passaporte CB***67"). Sem nenhum dos dois, continua INCOMPLETO. Prova:
  `e2e/documentos-passaporte.spec.ts`, `tests/documentos-valores.test.ts`.
- **O responsável legal da menor assina o termo** (decisão 2 do Heitor, 7ª
  simulação, 2026-11-05: "concordo"). As variáveis `responsavel.nome`,
  `responsavel.cpf`, `responsavel.parentesco` e `responsavel.telefone` valem
  em todo tipo e são OPCIONAIS no catálogo (na adulta saem vazias), mas na
  MENOR de idade o nome e o CPF do responsável são obrigatórios
  (`variavelObrigatoria`, `renderizar.ts`): sem eles o termo fica INCOMPLETO
  ("Responsável legal · Nome do responsável…"), e o termo que BLOQUEIA já
  segura o início — e a Visão geral da ficha diz o que falta (A24). Quem
  assina é ELE: `quemAssina` (`lib/clients/menor.ts`) — o aceite, o "Conferi o
  documento de identidade de", a evidência (`document_signatures.signer_name`
  "Marta Lima, responsável legal de Beatriz Lima", `signer_document` o CPF
  dele; `dadosDoAssinante`) e a tela de assinar (`cliente.assinante`). A
  adulta, ou a menor ainda sem responsável, assina por si. Prova:
  `e2e/ficha-menor-de-idade.spec.ts`.
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
  - **A variável DIGITADA também é variável** (A9 da 9ª simulação, 2026-11-07;
    princípio 3): "{{cliente.nome}}" escrito à mão ficava literal na prévia e
    no documento — só o "Inserir variável" funcionava, e ele depende do cursor
    no lugar. O conversor (a porta única) troca, no texto, cada
    `{{grupo.campo}}` (com ou sem espaços dentro) pela variável, com o
    estilo do texto; a prévia, que usa o mesmo conversor, já mostra o valor de
    exemplo, e o catálogo do tipo vale como no "Inserir" (fora do tipo, recusada
    ao salvar). Chaves que não formam variável ("{{ Nome }}", "{{}}") são
    recusadas dizendo qual — como `chavesMalFormadas` na marcação. Prova:
    `tests/documentos-arvore.test.ts` ("A9 da 9ª").
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
  assinatura é o módulo `documents`; ligar ao procedimento é `procedures`. E
  os modelos são da REDE: quem tem unidade fixa não os cria nem muda (H7,
  2026-11-01; `recusaDaConfigDaClinica`, `plataforma.md`).
  - **Quem não colhe lê quem colhe** (D8 da 5ª simulação, 2026-11-01): com os
    Termos em Ver (o médico), o termo que bloqueia aparecia "Para assinar ·
    bloqueia" sem ação nenhuma. `TermosDoCliente` diz, havendo documento em
    aberto, "A assinatura é colhida pela recepção (quem tem os Termos em
    Gerenciar): na clínica, por link ou pelo app da cliente."
    (`data-quem-colhe`), na ficha e no atendimento. Decisão desta frente: só o
    texto, sem botão de "pedir à recepção" (não há para onde mandar o pedido
    além do aviso que a tela já dá). Prova: `e2e/permissoes-quem-so-ve.spec.ts`.
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
  **Confirmar não é o check-in** (D13 da 8ª simulação, 2026-11-06; migration
  `20261106003301`): o de INICIO_ATENDIMENTO nascia no "Confirmar
  agendamento", um resto de quando o check-in gravava CONFIRMED. Nasce na
  CHEGADA (ARRIVED) e, no início direto de Confirmado, ao iniciar. Os que já
  tinham nascido num confirmar ficaram (a emissão é idempotente). Prova:
  `e2e/documentos-atendimento.spec.ts`.
  **No início direto de Confirmado, o termo nasce ANTES da trava** (D7 da 9ª
  simulação, 2026-11-07; regressão da F33): a trava do início
  (`trg_documentos_bloqueiam_inicio`) emitia e recusava no MESMO update, e a
  transação desfazia a emissão — a recepção lia "Falta assinar: Termo… Colha a
  assinatura" e o termo não existia (a ficha dizia "Nenhum termo…"). Os dois
  caminhos que iniciam (`startAppointment` e o IN_PROGRESS de
  `updateAppointmentStatus`; o "Marcar chegada e iniciar" passa pelo check-in)
  emitem antes num passo próprio, gravado (`emitirDocumentosDoInicio`,
  `lib/documentos/inicio.ts`, o agendamento de plano fora); a trava segue sendo
  a segunda linha, e o termo fica para colher. Prova:
  `e2e/documentos-inicio-da-9.spec.ts` ("D7").
  **A janela do agendamento leva a colher** (A23 da 9ª): o termo que falta
  assinar tem "Colher assinatura" (`[data-colher-assinatura]`, a tela
  `/documentos/[id]/assinar` com a volta à agenda) para quem tem os Termos em
  Gerenciar; quem só vê, só a situação. Prova: o mesmo spec ("A23").
- **O texto concorda com o sexo da ficha** (A50 da 6ª simulação,
  2026-11-04: o termo dizia "fui informada(o)" ao Bruno, com o sexo
  cadastrado). Ao montar, o par "a(o)"/"o(a)" no fim de uma palavra — ou
  sozinho, "o(a) paciente" — vira a forma do sexo da ficha (F: "informada",
  "a paciente"; M: "informado", "o paciente"); sem o dado, ou "Outro", fica
  como a clínica escreveu (`concordarComOGenero`, `lib/documentos/concordancia.ts`,
  só no texto do MODELO, não no valor das variáveis — o `ajustar` de
  `interpolar`). O documento montado é o que se assina e o que o hash cobre.
  Prova: `tests/documentos-concordancia.test.ts`.
- **O gatilho só cria a linha (A_GERAR)**; o texto é montado pelo app
  (`lib/documentos/renderizar.ts` → `documento_registrar_render`), e toda tela
  que mostra um documento chama `garantirRenderizado` antes. Faltou dado
  obrigatório: INCOMPLETO, não assina.
- **A forma canônica é TEXTO** (`issued_documents.content`): jsonb reordenaria as
  chaves e o hash não bateria. O navegador calcula o SHA-256 dos bytes que
  recebeu; `documento_assinar` só aceita se bater com o gravado.
- **O bloqueio é gatilho** (`trg_documentos_bloqueiam_inicio`): nenhuma porta
  põe IN_PROGRESS com documento BLOQUEIA aberto. Dispensar (com motivo) cumpre.
- **A janela da agenda diz os documentos do agendamento** (A34 da 6ª
  simulação, 2026-11-04: só a sessão dizia, e a recepção descobria ao iniciar):
  `DocumentosDaJanela` (`[data-documentos-do-agendamento]`,
  `documentosDaJanela` em `actions/documentos-da-janela.ts`) lista o título e
  a situação — "Assinado", "Falta assinar · bloqueia o início", "Faltam dados
  do cadastro", "Em preparação" — sem o conteúdo, a quem vê a agenda, com o
  agendamento da rede, ao alcance da unidade e, no "só os meus", dela. Colher
  a assinatura é na sessão, na ficha e, desde a A23 da 9ª, pelo link da
  janela (acima). Prova:
  `e2e/agenda-janela-termo.spec.ts`.
- **Assinar é UMA função** para todos os canais (`documento_assinar`): trava,
  confere hash, grava a evidência (`document_signatures`, imutável, sem
  cascade) e o status numa transação. `termo.assinado` sai depois, em TS;
  `termo.emitido` sai do banco.
- **A tela de assinar tem UM gesto** (J-62, 2026-10-30): marcar "li e
  concordo", desenhar no quadro e "Assinar documento". O "Confirmar
  assinatura" do quadro saiu (`SignaturePad` entrega o desenho a cada traço,
  `onChange`, e "Limpar" o tira): era um segundo clique que não provava nada
  — o ato de assinar é o "Assinar documento", que leva o desenho, o texto do
  aceite e o SHA-256 do que se viu juntos a `documento_assinar`, como antes.
  Com o botão apagado, a tela diz o que falta ("Para assinar, falta marcar
  que leu e concorda e assinar no quadro."). Prova:
  `e2e/documentos-assinar-sem-passo-extra.spec.ts`.
- **"Entregar ao cliente" cobre a tela da equipe** (A40 da 5ª simulação: o
  menu, a busca e o usuário da equipe ficavam à vista de quem assinava no
  tablet). A tela da cliente (o documento, o aceite e a assinatura, e o
  "Devolva o aparelho à equipe") vai para a camada de cima do navegador
  (`TelaCheiaDaCliente`, um `<dialog>` com `showModal()` na tela inteira):
  o resto fica coberto e inerte, e o Esc não a fecha. No portal e no link
  ela já está na tela dela. Prova: `e2e/documentos-atendimento.spec.ts`.
  **Assinado no PAPEL, a tela fica com a equipe** (A46 da 7ª simulação,
  2026-11-05: depois de "Confirmar: o cliente assinou o papel" vinha "Devolva o
  aparelho à equipe"): o "Documento assinado" diz "Assinatura no papel
  registrada." (`[data-assinado-no-papel]`), sem a tela cheia da cliente; o
  "Devolva o aparelho" é só de quem assinou no aparelho entregue. Prova:
  `e2e/financeiro-atritos-da-7.spec.ts` ("A46").
- ⚠️ **Releitura na mesma renderização: `abortSignal`.** O React memoriza
  `fetch` GET idênticos numa renderização — a releitura do documento depois de
  montá-lo devolvia a resposta velha. `lerDocumento` passa um sinal novo.
- A ficha do cliente lê a aba por `?aba=` (não `?tab=`).
- **Checkout do plano: Plano → Pagamento → Documentação → Agendamento.** O
  contrato de plano cita a forma de pagamento, então nasce depois dela
  (`prepararDocumentosDoPlano`, `lib/documentos/plano.ts`). O retrato do
  pagamento (`pagamentoNormalizado`, `lib/checkout/pagamento.ts`) fica em
  `issued_documents.payment_snapshot`; trocar o pagamento depois de assinar
  SUBSTITUI o contrato (`documento_substituir`) — **e o checkout PERGUNTA
  antes** (A45 da 5ª simulação: virava SUBSTITUIDO calado, e quem operava só
  via "Colher assinatura" de novo): `prepararDocumentosDoCheckout` devolve
  `substituiContrato` ("O contrato "X" já foi assinado para outro pagamento
  (à vista no Pix)") e não troca nada; só com `{ substituirContrato: true }`
  (o "Substituir o contrato" da tela) substitui. "Manter o pagamento
  combinado" volta ao pagamento. Prova: `e2e/checkout-de-plano.spec.ts` ("A45").
  **Reabrir o checkout parte do pagamento ASSINADO** (A36 da 9ª simulação,
  2026-11-07; princípio 3): reabrir o checkout de um plano com o contrato já
  assinado (outra aba, outro dia) mostrava "Receber no atendimento" — o
  pagamento zerado — e o "Assinado" na documentação. Sem o passo guardado na
  aba (ou com ele ainda no passo do plano), o pagamento e o desconto vêm do
  retrato do contrato assinado (`contratoAssinadoDoPlano`,
  `lib/documentos/plano.ts`), e o passo do pagamento diz "O contrato “X” já foi
  assinado com este pagamento: À vista, no Pix. Mudar as condições pede um
  contrato novo: a cliente assina de novo." (`[data-contrato-assinado-com]`); se
  mudar, a pergunta do A45 segue valendo. Prova:
  `e2e/plano-atritos-da-9.spec.ts` ("A36").
  **O retrato vale ao ABRIR, não a cada refresh** (F46, a completa de
  2026-11-07): com o `contratoAssinado` nas dependências do efeito que relê o
  passo guardado, cada `router.refresh()` (assinar um documento chama um)
  trazia um objeto novo, o efeito rodava de novo, voltava ao Pagamento e
  remontava a documentação — o "Documento assinado" sumia e o mesmo documento
  reabria para assinar. O efeito roda uma vez por plano (`plan.id`). Prova:
  `e2e/checkout-de-plano.spec.ts` ("o caixa sem o módulo de Termos", que
  espera o refresh e confere que a tela ficou).
- **O contrato do plano sem o documento da cliente AVISA antes de emitir** (A35
  da 9ª simulação; princípio 2 — avisar, não recusar; o contrato padrão segue
  sem exigir o CPF): com um contrato de plano ativo na rede e a ficha sem CPF,
  passaporte nem RNE, o checkout diz no passo do plano e no do pagamento "O
  cadastro de Renata não tem CPF (nem passaporte ou RNE): o contrato do plano
  sai sem esse documento. Para incluir, complete o cadastro antes de ir para a
  documentação." com "Completar o cadastro" (`[data-contrato-sem-documento]`,
  `contratoSemDocumentoDaCliente`). O checkout segue. Prova: o mesmo spec ("A35").
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
  - **No "entrada + parcelas", o meio é da ENTRADA** (D5/D6 da 6ª simulação,
    2026-11-04): `pagamento.forma` diz "entrada de R$ 1.000,00 no cartão de
    crédito em 3x + 2 parcelas de R$ 1.700,00 com a clínica: R$ 1.700,00 em
    04/12/2026 e R$ 1.700,00 em 04/01/2027" — as parcelas são o crediário da clínica, não o cartão (dizia
    "+ 2 parcelas … no cartão de crédito"). `pagamento.metodo` é o meio da
    entrada (sem entrada, vazio). O retrato guarda as vezes da entrada quando
    passam de 1. Prova: `e2e/checkout-entrada-no-cartao.spec.ts`,
    `e2e/documentos-contrato-pagamento.spec.ts`.
  - **As parcelas do contrato são as GRAVADAS, cada uma com a data** (D2 e
    A42 da 7ª simulação, 2026-11-05; princípio 3): o contrato da Larissa
    dizia "3 parcelas de R$ 890,67" — a média, que soma R$ 2.672,01 — e o
    banco gravou 890,66 + 890,66 + 890,68. `valoresDoPagamento` divide pela
    MESMA conta dos lançamentos (`dividirEmParcelas`): `pagamento.forma` diz
    "3 parcelas (2x de R$ 890,66 + 1x de R$ 890,68) com a clínica: R$ 890,66
    em 05/12/2026, R$ 890,66 em 05/01/2027 e R$ 890,68 em 05/02/2027" (iguais:
    "2 parcelas de R$ 1.700,00 com a clínica: R$ 1.700,00 em … e R$ 1.700,00
    em …"; uma só, "1 parcela de R$ 300,00 com a clínica, com vencimento em
    05/12/2026"). O "a primeira em 06/12/2026" antes da lista saiu: repetia a
    data da primeira (A39 da 8ª simulação, 2026-11-06). E
    `pagamento.valor_parcela` "R$ 890,66 (a última, R$ 890,68)" — também no
    cartão em N vezes. Prova: `e2e/checkout-entrada-no-cartao.spec.ts`
    ("D2, A42"), `tests/checkout-parcelas-gravadas.test.ts`.
- **A trava do checkout vem ANTES do dinheiro** (`recusaDosDocumentosDoPlano`
  em `checkoutTreatmentPlanInterno`): documento que BLOQUEIA aberto, ou contrato
  assinado para OUTRO pagamento, recusam. Ela EMITE antes de conferir — quem
  chama a action direto não escapa por "ainda não havia documento". O gatilho
  `trg_documentos_bloqueiam_plano` é a segunda linha (barra o ACCEPTED que
  `plano_checkout` grava; o checkout é uma transação só desde a F67, C32 —
  a recusa do gatilho desfaz tudo).
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
  de bloqueio. Cliente sem conta no portal: recusado — e **a tela nem oferece**
  (A26 da 7ª simulação, 2026-11-05: o botão aparecia e só no clique dizia que
  ela não tem o app): sem login, "Pedir no portal" some dos Termos (a ficha e
  o atendimento, `temAcessoAoApp`) e a tela diz antes "Sem acesso ao app:
  colha na clínica, por link ou no papel." (`[data-sem-portal]`). Prova:
  `e2e/ficha-cadastro-atritos-da-7.spec.ts` ("A26").
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
  clientes que ela atende — um agendamento com ela NÃO CANCELADO, inclusive
  futuro (eq-02, 2026-11-02, migration `20261101000708`; `clienteNoEscopo`, `lib/clientes/atendida-por.ts`, a regra do
  prontuário OWN):
  - a tela de Documentos e a ferramenta `documentos` do Copilot recortam no
    banco (`p_professional_id` em `documentos_emitidos_pagina`/`_resumo`,
    migration `20261029000901`; `profissionalDoRecorte`);
  - a ficha da cliente que ela não atende não lista os documentos; a sessão
    de atendimento, idem. **A linha do tempo da ficha, sim** (doc-03, o
    Heitor em 2026-11-02: "o histórico não é dado clínico, é o histórico de
    ações feitas no cliente dentro do sistema"): o "Assinado: <título>"
    aparece a quem vê a ficha, sem o recorte — a linha leva só o título do
    modelo e o canal, nada do conteúdo. Nenhuma linha do histórico carrega
    conteúdo clínico (sem título de foto, sem texto de evolução);
  - pelo id: `documentoAoAlcance` (toda action de `actions/documentos.ts` —
    abrir, colher, papel, gerar link, pela conversa, revogar, pedir no portal,
    dispensar, montar de novo, a trilha), a tela `/documentos/[id]/assinar` e o
    PDF (`/api/documentos/[id]/pdf`) respondem como se o documento não
    existisse.
  - Sem o prontuário no cargo (NONE), o escopo não vale (CLAUDE.md §11): quem
    tem só os Termos vê todos. O checkout do plano (quem recebe) segue como
    estava. Prova: `e2e/documentos-so-os-meus.spec.ts`.
- **Os atritos dos termos da 11ª simulação** (2026-11-10; princípio 3):
  - **O termo tem a profissional** (A5: o termo de injetável saía com
    "Profissional responsável: ____"): `profissional.nome` ("Profissional que
    atende") vale no TERMO e no CONTRATO. No avulso é a do agendamento; no
    termo do PLANO, que não tem agendamento, a profissional do plano
    (`treatment_plans.professional_id`, sempre preenchido) — `dadosDoDocumento`.
    Continua obrigatória: sem ela, INCOMPLETO.
  - **O editor diz TODAS as variáveis erradas de uma vez** (A6: "{{paciente.nome}}",
    salvar, depois "{{data}}"): o conversor anota as chaves mal escritas em vez
    de parar na primeira, e `validarDocumentoDoEditor` junta na mesma mensagem
    as que não existem e as de outro tipo (`problemasDasVariaveis`).
  - **O número digitado no item da lista numerada sai uma vez** (A7: "2. 2.
    Compreendi…"): no conversor (a porta única), o item que começa com o
    PRÓPRIO número ("2. ", "2) ") o perde — a lista já o escreve; número
    diferente fica como foi escrito (`semONumeroDigitado`).
  - **O link de assinatura onde a assinatura é pedida** (A8: só a ficha tinha
    "Enviar link"; sair do checkout para pegá-lo reabria o checkout do início):
    a janela da agenda (`DocumentosDaJanela`, quem tem os Termos em Gerenciar,
    o documento PENDENTE) e o passo Documentação do checkout têm "Enviar link de
    assinatura" (`EnviarLinkDeAssinatura`, o mesmo `gerarLinkDeAssinatura` da
    ficha: uso único, 7 dias, gerar outro revoga). No checkout, quem RECEBE
    gera o link do documento do plano — a exceção de 2026-10-20 (`assertPodeColher`):
    o link é um jeito de colher.
  - **A janela diz o que falta no cadastro** (A9: "Faltam dados do cadastro ·
    bloqueia o início", e a Vera salvou o nascimento quando faltava o CPF):
    "Faltam dados: CPF · bloqueia o início", com "Completar o cadastro" (a aba
    Dados, a quem edita Clientes; `[data-completar-cadastro]`).
  - **O PDF de uma página com 521 KB** (A10) é a fonte inteira embutida
    (`subset: false`, Arimo regular e negrito ≈ 870 KB crus): o subset do
    `pdf-lib` troca glifos (acima). Ficou como está — encolher pede um subset
    que não troque glifo.
  - Prova: `e2e/documentos-atritos-da-11.spec.ts`, `tests/documentos-arvore.test.ts`
    ("A5", "A6", "A7 da 11ª").
- **A variável opcional que sai vazia se diz** (D6 da 12ª simulação, 2026-11-11;
  princípios 2 e 3 — avisar, nada se bloqueia): o contrato do plano no Visa 6x
  saiu assinado com "Entrada: , em 6 parcelas de R$ 105,00, primeiro vencimento
  em ." — a cláusula da dona juntava `pagamento.forma` (que já é a frase
  inteira) com as opcionais, vazias por desenho quando o pagamento não as tem.
  - O menu "Inserir variável" diz, junto de cada opcional, QUANDO ela sai vazia
    ("Valor da entrada (vazia sem entrada (à vista, cartão em vezes, a
    receber))"; `vaziaQuando` no catálogo, `rotuloNoMenu`), e a forma de
    pagamento diz que é a frase completa ("já diz a entrada, as parcelas e os
    vencimentos").
  - O passo Documentação do checkout — onde se colhe e se manda o link — diz,
    no contrato em aberto, quais saem vazias NESTE plano: "Neste plano saem
    vazias: Valor da entrada e Primeiro vencimento. Confira se o texto do
    contrato fica certo sem elas…" (`[data-variaveis-vazias]`, `avisoDasVazias`).
    A lista é a da montagem (`interpolar` devolve `vazias`;
    `garantirRenderizado` a passa ao documento que acabou de montar, sem gravar;
    `ResumoDeDocumento.vazias`).
  - Prova: `e2e/documentos-defeitos-da-12.spec.ts`, `tests/defeitos-da-12.test.ts` ("D6").
- **Os atritos dos termos da 12ª simulação** (2026-11-11; princípios 1, 2 e 3):
  - **O registro no conselho** (A13; princípio 1): "Registro no conselho
    (opcional)" no cadastro da pessoa da equipe (Adicionar membro e o lápis,
    nos dois portais; `users.registro_conselho`, migration `20261111006002`,
    só o servidor grava — `createTeamMember`/`updateTeamMember`), e a
    variável `profissional.registro` (OPCIONAL, em todo tipo: "vazia sem o
    registro no cadastro da profissional"), da mesma profissional de
    `profissional.nome` (`dadosDoDocumento`).
  - **A profissional no contrato de PLANO** (A14): `profissional.nome` vale em
    todo tipo — no contrato de plano, a profissional do plano
    (`treatment_plans.professional_id`), como no termo do plano (A5 da 11ª).
  - **"{{paciente.x}}" é a cliente, e o colado vira variável na hora** (A15;
    princípio 2: o texto veio de outro sistema): o grupo "paciente" é apelido de
    "cliente" (`nomeDaVariavel`, no conversor — a porta única —, e no editor).
    Colado ou digitado, "{{grupo.campo}}" vira o chip ali mesmo (as regras de
    colar e de digitar do nó `variavel`); antes só virava ao salvar.
  - **Sem o "Lugar da assinatura", a tela diz** (A15): o Ctrl+A/Delete o apagava
    calado. O editor diz "Sem o “Lugar da assinatura”: a assinatura da cliente vai
    no fim do documento…" (`[data-sem-assinatura]`) — a tela e o PDF já a
    punham no fim. Não bloqueia (princípio 2).
  - **O editor abre o que vai ser salvo** (A16): o "1. 1. Objeto" e o "8."
    vazio. `normalizarListasDoEditor` (`editor/converter.ts`, a regra do
    `semONumeroDigitado` da A7 da 11ª, mais o item vazio que sai) roda ao abrir
    o modelo no editor e ao gravar o JSON; o conversor também deixa o item vazio
    fora do documento.
  - **O Agendar diz o que falta no cadastro para o termo** (A17; a F55, A9 da
    11ª, levou o aviso à janela do agendamento, não ao Agendar): escolhidos a
    cliente e o procedimento, "“Termo do peeling” pede no cadastro: Data de
    nascimento · sem isso, não se inicia o atendimento." com "Completar o
    cadastro" (`[data-aviso-falta-no-cadastro]`, `faltaNoCadastroAoAgendar`,
    `actions/documentos-da-janela.ts`: as variáveis do cadastro, obrigatórias,
    da versão atual dos modelos ligados ao procedimento — a régua da montagem,
    `variavelObrigatoria` + `valoresDoDocumento`). Só aviso.
  - Prova: `e2e/documentos-atritos-da-12.spec.ts`, `tests/documentos-atritos-da-12.test.ts`.
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
❌ Gravar ou mostrar quem assina fora de quemAssina/dadosDoAssinante (a menor com responsável é assinada por ELE — decisão 2 da 7ª)
❌ Assinar documento fora de documento_assinar, ou emitir documento de agendamento fora do gatilho (a exceção é emitirDocumentosDoInicio, antes de iniciar — a mesma função do gatilho)
❌ Contar com a emissão feita DENTRO de uma trava que recusa no mesmo update: a recusa desfaz a emissão (D7 da 9ª) — emita antes, num passo gravado
❌ Guardar a forma canônica de um documento em jsonb (reordena as chaves e o hash não bate)
❌ Pôr nas dependências do efeito que relê o passo do checkout um objeto que vem do servidor (cada refresh traz um novo, e a tela volta ao Pagamento — F46)
❌ Gravar o token do link de assinatura (só o SHA-256), ou contar tentativas do link fora de documento_link_abrir
❌ Abrir no editor (ou gravar) o JSON do modelo sem normalizarListasDoEditor: a edição mostraria o que o documento não diz (A16 da 12ª)
```
