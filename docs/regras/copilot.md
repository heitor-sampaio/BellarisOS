# Copilot — a secretária virtual

> Área nova (2026-10-08). O índice está no §9 do `CLAUDE.md`. As regras gerais
> — rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam lá e
> valem aqui.

O Copilot é um chat da EQUIPE da clínica, flutuando sobre todas as telas de
`/admin` e `/[slug]` (nunca no portal do cliente), para consultar e operar o
sistema conversando — texto, voz, imagem e documento. O motor é a OpenAI
(Responses API).

## Decisões do Heitor (2026-10-08)

- **Toda gravação passa por um cartão** com Confirmar/Cancelar. Consulta é livre.
- **Nada clínico vai à OpenAI**: nenhuma ferramenta lê prontuário, evolução,
  anamnese, foto clínica ou anotação clínica de plano. O prompt manda dizer que
  isso fica na tela, e o painel avisa para não mandar.
- **O máximo de módulos** já na primeira entrega: agenda, clientes, catálogo,
  indicadores, financeiro, estoque e CRM — lendo e gravando.
- **Cota mensal por rede**, no plano (`cotas.copilot`, tokens/mês; null = sem
  limite), editável no sistema; o consumo aparece no sistema e na Assinatura.

## Como é feito

- **Liberação** (`lib/copilot/disponivel.ts`): membro da equipe, o Copilot NO
  PLANO (o efetivo: plano ou adicional) — **sem plano não libera**, ao contrário
  das outras funcionalidades: ele custa por uso —, o Copilot NO CARGO, a
  `OPENAI_API_KEY` configurada e fora da sessão de suporte. A rota, as actions
  e o layout conferem o mesmo.
- **O cargo** (o módulo `copilot` da matriz, pedido do Heitor de 2026-10-08):
  Sem acesso, **Ver** (só as consultas: o modelo nem recebe as gravações) e
  **Gerenciar** (também as gravações — cada uma ainda exige o módulo dela). O
  plano diz se a REDE tem; o cargo, QUEM usa. Os cargos que já existiam
  ficaram em Gerenciar (menos o "Não definido"), para ninguém perder o que
  usava (migration `20261008000007`).
- **A rota `POST /api/copilot`** (SSE): sessão (401), Origin da clínica (403),
  plano, suporte, configuração, cota (429). Laço "modelo → ferramentas →
  modelo" de até 8 voltas (4 com anexo). Grava a fala, as chamadas (sem o id do
  item: com `store:false` a API recusa um `function_call` com id sem o
  raciocínio daquela vez) e a resposta; registra o uso.
- **O executor** (`lib/copilot/executor.ts`) é a trava ÚNICA:
  - o modelo só RECEBE as ferramentas que o cargo pode usar (`modulo`/`nivel`,
    `recurso`, `pode`);
  - a chamada é conferida de novo e validada por zod; rede e unidade vêm do
    `ctx`, nunca do modelo;
  - gravação PREPARA (`copilot_acoes`, 15 min) e só o Confirmar grava: reivindica
    a linha (pendente → executando numa escrita só), prepara DE NOVO e só grava
    se o resumo E o payload forem os mesmos do cartão (`canonico` — o jsonb
    reordena as chaves);
  - o Copilot age com o nome "Fulana (via Copilot)" nos eventos e no histórico.
- **As ferramentas** (`lib/copilot/ferramentas/`) chamam os MESMOS núcleos da
  tela: `createAppointmentCore`, `remarcarCore`/`cancelarCore`/`confirmarCore`
  (`lib/appointments/alteracoes.ts`), `garantirClienteRapido`, `atualizarClienteCore`
  (`lib/clients/atualizar.ts`), `lancarCore`/
  `marcarPagoCore` (`lib/financeiro/lancamento.ts`), `estoque_entrada`/
  `estoque_ajuste` (`lib/estoque/movimentos.ts`), `criarOportunidadeCore`/
  `moverEtapaCore` (`lib/crm/oportunidade.ts`), `checkinCore`, o acesso ao app
  (`lib/clients/acesso.ts`), `lib/metrics`.
- **Anexos** (`lib/copilot/anexos.ts`) são lidos no pedido e DESCARTADOS (a
  conversa guarda nome e tipo). Tipo pelo conteúdo. Imagem ≤ 5 MB (a foto
  grande é reduzida no navegador), PDF como arquivo, txt/csv como texto, voz
  transcrita (`OPENAI_MODELO_DE_VOZ`). docx/xlsx viram texto no servidor
  (`lib/copilot/documentos.ts`, um leitor de zip sem biblioteca); doc/xls
  antigos, não.
- **Texto do modelo** vira blocos React (`lib/copilot/texto.ts`), nunca HTML;
  link só para TELA interna (não `/api`, `/auth`…), sem prefetch.
- **Dados**: `copilot_conversas`, `copilot_mensagens`, `copilot_acoes`,
  `copilot_uso_mensal` — RLS sem política (só o servidor). Retenção
  (`/api/cron/copilot-retencao`): a conversa parada há 90 dias, e a mensagem
  e a ação de mais de 90 dias numa conversa em uso.
- **A cota conta TUDO que a OpenAI cobra**: cada volta (a completa pelo
  `usage`; a que falha ou cai no meio depois de aceita, por `estimarTokens`) e
  a transcrição da voz (`aoGastar`, `lib/copilot/openai.ts`). Pedido recusado
  antes (rede, 4xx/5xx) não conta.
- **O custo estimado** (2026-10-08): cada chamada calcula o custo em dólar
  pelo preço do modelo, de entrada e de saída (`custoEmDolar`,
  `packages/nucleo/src/lib/planos/custo-do-copilot.ts`, a tabela da página de
  preços da OpenAI) e soma em `copilot_uso_mensal.custo_usd` com os tokens
  (`copilot_registrar_uso`). Modelo fora da tabela: custo nulo ("—"), nunca
  um número inventado. O sistema mostra tudo em **Copilot** (`/copilot`): o
  mês por rede, a cota, o custo (US$ e R$ pela `COTACAO_DOLAR`) e os últimos
  meses.
- **O custo REAL** (2026-10-08): com `OPENAI_ADMIN_KEY` no serviço Sistema (a
  chave de administração da organização, só leitura), a aba lê a Costs API
  da OpenAI (`custoRealDaOpenai`, `packages/nucleo/src/lib/planos/custo-real-da-openai.ts`,
  guardada 1 h; o erro não é guardado) e mostra o real no destaque, com o
  estimado e a diferença. A OpenAI não sabe as redes: o real é RATEADO na
  proporção do custo estimado de cada uma (`ratearCusto`; sem estimado, pelos
  tokens ao preço médio), sobre todas as que usaram, as de teste também.
- **O resumo do cartão volta ao modelo com o CPF mascarado**
  (`resumoParaOModelo`); a pessoa vê inteiro no cartão. O que a equipe ANEXA
  vai inteiro à OpenAI — por isso o aviso fixo de não mandar material clínico,
  e a política de privacidade diz isso.

## Ferramenta nova

Entra em `lib/copilot/ferramentas/index.ts` e declara o que exige. Leitura:
`executar` devolve dados ENXUTOS (o modelo paga por token) e, se útil, um
cartão de links. Gravação: `preparar` (resolve nomes, confere alcance e
conflito, monta o resumo — sem nada que mude sozinho até o Confirmar, como um
saldo) e `efetivar` (o núcleo da tela). Teste no molde de
`e2e/copilot-gravacoes.spec.ts`, com a OpenAI falsa roteirizada.

## O E2E

`e2e/apoio/openai-falsa.ts` (porta 3196, `OPENAI_BASE_URL_TESTE` à força no
build e no CI): roteirizada (`roteiro`: chamar ferramentas ou responder texto),
registra o que chegou (`ferramentasOferecidas`, `saidasDeFerramenta`) e cobra a
regra real do raciocínio. `e2e/apoio/copilot.ts`: uma rede `[e2e]` com o plano
completo e o dono. Os specs `copilot-*` são COMPARTILHADOS (porta fixa).

## O que nunca fazer aqui

```
❌ Ferramenta que lê dado clínico (prontuário, evolução, anamnese, foto, anotação clínica)
❌ Ferramenta de gravação que grava no preparar (só o efetivar, depois do Confirmar)
❌ Rede ou unidade vindas dos argumentos do modelo (é o ctx)
❌ Ferramenta sem declarar módulo/nível/recurso/pode (o executor só confere o que é declarado)
❌ Gravar pelo Copilot por um caminho diferente do núcleo da tela
❌ Resumo de cartão com algo que muda sozinho até o Confirmar (saldo, "daqui a 2h")
❌ Renderizar o texto do modelo como HTML, ou link do modelo fora da lista de telas
❌ Guardar o anexo (áudio, foto, documento) — lido no pedido e descartado
❌ Mandar a chamada de ferramenta ao histórico com o id do item (a API recusa sem o raciocínio)
❌ Liberar o Copilot para rede sem plano (ele custa por uso)
❌ Criar exclusão/anonimização de cliente (LGPD) sem levar as conversas do Copilot que o citam (copilot_mensagens, copilot_acoes) — hoje não há exclusão, e a retenção de 90 dias é o limite
❌ Liberar o Copilot (ou uma gravação dele) sem conferir o módulo copilot do cargo (Ver / Gerenciar)
❌ Chamar a OpenAI (resposta, transcrição) sem somar o gasto na cota — também quando falha ou cai
❌ Trocar OPENAI_MODEL / OPENAI_MODELO_DE_VOZ sem o preço do modelo em custo-do-copilot.ts (o custo some da tela)
❌ Devolver ao modelo documento (CPF) que ele não precisa reler — o resumo vai por resumoParaOModelo
❌ E2E falando com a OpenAI real (é a falsa, porta 3196)
```
