# Eventos de domínio e automações

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.9 Eventos de domínio e automações

Toda ação relevante do sistema vira um fato em `domain_events` — 47 eventos
nomeados pela **intenção** (`agendamento.nao_compareceu`), catálogo tipado em
`packages/types/src/eventos.ts`. As automações assinam essa corrente.

- **O emissor mora em `lib/events/`, fora de `actions/`.** Todo export de um
  arquivo `'use server'` vira endpoint público, e um gravador exposto assim
  deixaria qualquer cliente forjar a corrente que dispara as automações. Vale
  igual para o motor: em `actions/automacoes.ts` só entra LEITURA.
- **Acrescentar nome ao catálogo sem emissor quebra o teste** — de propósito:
  catálogo prometendo evento que ninguém emite faz a automação ser montada e
  nunca disparar.
- **Retenção de 30 dias.** A corrente é uma janela, não arquivo: automação que
  precise olhar mais para trás consulta o dado de negócio.
- **Eventos clínicos não carregam conteúdo clínico**, e o contexto da automação
  também não hidrata prontuário. A automação avisa que a ficha chegou; quem
  precisa do conteúdo abre o prontuário, com a permissão que ele exige.
- `pagamento.*`, `estoque.*`, `comissao.liberada` e `comissao.paga` saem de GATILHO ou função no banco (`origem: 'banco'`, sem
  ator), porque esses fatos nascem em cinco ou seis lugares do código e
  instrumentar um a um é garantir esquecer o próximo.
- **Campanha ≠ automação.** Campanha é disparo em massa por público; automação
  é reação a um fato. São dois produtos, e nada migra de um para o outro.
- **A fila do motor é `automation_runs`**, no Postgres — não há broker no
  projeto. O disparo é imediato (`after()`); o cron recolhe o que espera, o que
  falhou e o que é de tempo.
  - ⚠️ **Tirar trabalho da fila exige REIVINDICAR a linha**, não só selecionar.
    `retomarPendentes` faz isso com um compare-and-swap em `tentativas`
    (`.eq('tentativas', lido)`) que, na MESMA escrita, põe o run em `rodando`
    (só se ainda estiver `esperando`/`falhou`). Sem tirar da fila, a passagem
    que lesse DEPOIS da reivindicação via o run ainda esperando, com a
    tentativa já somada, e o CAS dela também passava (2026-09-30). E
    `dispararAgendas` com um em
    `ultimo_disparo_agenda`: quem escreve primeiro leva, e quem não muda linha
    nenhuma passa adiante. Sem isso, duas passagens concorrentes do cron —
    normal, porque o serviço roda de 5 em 5 minutos e uma fila grande passa
    disso — executam o MESMO run duas vezes. Num aviso é ruído; numa ação de
    mensagem é o cliente recebendo a mesma coisa duas vezes.
- **O gatilho de tempo tem duas famílias**: intervalo (`minutos`, `horas`, conta
  a partir do último disparo) e relógio (`diaria`/`semanal`/`mensal`, num
  horário do dia). Cada uma usa o seu campo — `intervalo` ou `hora` — e o outro
  não vai para o grafo. **O piso do intervalo é `INTERVALO_MINIMO_MIN` (5 min),
  que é o ritmo do cron**: prometer menos é prometer o que o relógio não
  entrega. Quem controla a repetição é `automations.ultimo_disparo_agenda`, e a
  marca é gravada ANTES de executar, conferindo quantas linhas mudou.
- **Cada salvamento deixa um retrato em `automation_versions`** (os últimos 30).
  Voltar para uma versão **carrega** o fluxo dela no editor e não grava nada —
  salvar continua sendo explícito, e o retrato de onde se veio permanece. O
  histórico é append-only: restaurar gera a versão seguinte, nunca apaga.
- **Três travas contra o anel**: origem `'automacao'`, `profundidade` com teto
  de 3, e índice único `(automation_id, evento_id)`. Ação de automação que
  emite evento **passa a profundidade adiante** — sem isso, um grafo em anel
  manda mensagem ao cliente em laço.
- **Tudo se propaga.** O contexto da execução carrega o payload do gatilho
  (`evento.dados.*`) e **o que cada passo deixou** (`passos.<nome do passo>.*`);
  qualquer node à frente lê os dois, em condição ou em `{{variável}}`.
  - O **nome do passo** (`NoDoGrafo.nome`) é a chave — por isso ele é único no
    grafo e a validação recusa nome repetido ou referência a passo que não é
    antecessor. Renomear depois de citar quebra a referência, e é o validador
    que avisa.
  - **O que cada node produz se declara em `DADOS_DO_NO`**, e o que cada evento
    carrega em `CAMPOS_DO_EVENTO` (`packages/types`). Node ou evento sem
    entrada ali funciona, mas fica invisível para quem monta o fluxo — que é o
    mesmo erro mudo do gatilho que nunca dispara.
  - A tela soma a essas listas os campos **vistos no último fato real**
    (`amostraDoEvento`): `dados` tem índice livre e nenhum catálogo cobre tudo.
  - **Renomear um passo reescreve quem o citava** (`renomearPasso`). A troca é
    por segmento inteiro: renomear "Mandar mensagem" não pode mexer no que cita
    "Mandar mensagem 2".
- **Campo de condição aceita EXPRESSÃO**, não só caminho — decisão do Heitor em
  2026-09-24, que abriu o "condição é construtor, não linguagem" original. A
  lista de campos continua sendo o caminho normal da tela; a expressão é a saída
  para o que ela não cobre.
  - `lib/automacoes/expressao.ts` é o avaliador: analisador próprio, **sem
    `eval` e sem `new Function`**. O texto vem do banco e roda no servidor
    dentro do motor — ali um `new Function` seria execução remota de código a um
    `update` de distância. Funções só as da lista fechada; `__proto__`,
    `constructor` e `prototype` não são navegáveis.
  - **Expressão quebrada devolve vazio, não derruba o run** — parar um fluxo no
    meio dos efeitos por um erro de digitação seria pior. Quem reclama é o
    validador, antes de ativar.
  - Toda leitura de campo passa por `valorDoCampo`, e toda hidratação por
    `caminhosDoCampo`: ler à mão com `lerCaminho` volta a ignorar expressões, e
    o texto sai vazio sem nada explicar.
- **A oportunidade de um fato de CONVERSA vem da conversa** (`contexto.ts`,
  `oportunidadeDaConversa`): os eventos de conversa não carregam `leadId`, então
  o motor usa a ligada à thread (`conversations.lead_id`) e, sem ela, a aberta
  mais recente da PESSOA. Até 2026-09-27 mover etapa, desfecho, responsável e
  anotar num fluxo de "mensagem recebida" terminavam sempre em "sem
  oportunidade" — e o editor oferecia os quatro.
- O node guarda o desfecho em português (`ganho`/`perdido`); a etapa, no
  código do banco (`WON`/`LOST`). Comparar os dois direto nunca acha etapa.
- Prova de ponta a ponta: `e2e/mensagens-saida.spec.ts` — webhook real →
  automação → resposta pela caixa falsa + os quatro efeitos no card.

---

## O que nunca fazer aqui

```
❌ Avaliar expressão de automação com eval/new Function (o texto vem do banco)
```
