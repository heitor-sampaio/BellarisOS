# Catálogo de regras — Clientes, CRM e inbox

Este é o catálogo das regras da área de Clientes, CRM e inbox que valem HOJE: o cadastro e a ficha da cliente, a lista de Clientes, as tags, o portal e o app da cliente (no que é dado e cadastro dela), a LGPD, as Importações, o contato, a conversa e o inbox, e as oportunidades, os funis e o quadro. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, ou "decisão do Claude". "Atribuída ao Heitor sem a fala" quer dizer que o texto diz que a decisão é dele, mas não traz a fala — está nas Perguntas. "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta. É um RASCUNHO para o Heitor revisar. Contagem: 144 regras (Clientes 26, Tags 13, Portal e app da cliente 14, LGPD 14, Importações 23, Contato, conversa e inbox 18, Oportunidades, funis e quadro 36), 15 perguntas e 27 divergências. Dos 332 números do rascunho, 4 ficaram fora do catálogo e 2 são de outra área (ver os apêndices); todos os outros estão num "Antes". A meta era ~140. O "só os meus" saiu em 23/11: nenhuma regra daqui o usa; o que os rascunhos ainda diziam com ele foi reescrito como a regra de hoje (Ver vê tudo, Gerenciar mexe em tudo, dentro da abrangência; quem quer só as suas usa o filtro de responsável).

## Clientes (CL)

### Documento, telefone e o "Novo cliente"

**CL-01.** O "Documento" da ficha tem tipo — CPF, Passaporte ou RNE — e a ficha tem um OU outro. O CPF é único na rede e conferido pelos dígitos verificadores (a sequência repetida, como 11111111111, é recusada) no cadastro, na aba Dados, no "Dar acesso ao app", no Copilot e na importação. O passaporte e o RNE são texto livre de 5 a 20 letras e números, em maiúsculas, e também não se repetem na rede.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:9-10`, `:83`
- Antes: KA-01, KA-02, KA-17

**CL-02.** A cliente de balcão: o "Novo cliente" pede só nome e telefone. E-mail, CPF e endereço são opcionais (se preenchidos, têm de ser válidos); o endereço fica em "Endereço (opcional)", com o mesmo preenchimento pelo CEP da aba Dados.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:63-65`
- Antes: KA-11, KA-12

**CL-03.** O telefone do Brasil tem 10 ou 11 dígitos, com o DDD (o 55 do WhatsApp é tirado ao conferir); número incompleto ou sem DDD é recusado — não se adivinha a cidade. Na ficha, o telefone se grava formatado, como "(48) 99000-0011" (o cadastro e a conversão da oportunidade, como o balcão); o formato do WhatsApp (55 + DDD + número, só dígitos) é o do contato. Toda tela o mostra formatado, seja qual for o formato gravado.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:86`, `:822-827`, `:1756`
- Antes: KA-18, KC-32, KC-33, KE-43

**CL-04.** O telefone de outro país começa com "+" e o código do país (8 a 15 dígitos, não o +55) e é guardado como foi escrito; sem o "+", o sistema não adivinha o país, e o campo do cadastro não o mascara. Vale em todo caminho de cadastro: o formulário, o "+ Agendar" com nome e telefone, o Copilot e a importação.
- Fonte: o Heitor, 2026-11-02: "a estrangeira também chega pelo agendar rápido e pelo Copilot"
- Onde: `docs/regras/crm-inbox.md:87-93`
- Antes: KA-19, KA-20

### A menor de idade

**CL-05.** Quando a cliente tem menos de 18 anos (pelo dia de Brasília), o cadastro e a aba Dados abrem "Responsável legal": nome, CPF (conferido pelos dígitos), parentesco e telefone. Só a ficha da menor guarda o responsável. Ele não é obrigatório: sem ele, a ficha e o atendimento avisam ("Menor de idade (16 anos), sem responsável legal no cadastro…"), mas nada é barrado.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-05: "concordo"
- Onde: `docs/regras/crm-inbox.md:39-47`, `:1761`
- Antes: KA-07, KA-08, KE-62

**CL-06.** A ficha da menor leva "Menor de idade" e a linha do responsável; a agenda (a grade e a janela nos dois portais, e a "Minha agenda" de quem atende) e a tela do atendimento mostram "Menor" e o responsável, ou a falta dele. O termo da menor cita o responsável legal e é assinado por ele.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-05: "concordo"
- Onde: `docs/regras/crm-inbox.md:49-55`
- Antes: KA-09, KA-10

### A ficha que já existe

**CL-07.** Antes de gravar, o cadastro confere se já há ficha ATIVA da rede com o mesmo CPF, o mesmo telefone, ou o mesmo nome com a mesma data de nascimento. Se há, nada se grava e a tela pergunta ("Já existe a ficha de X com este telefone."), com "Cadastrar mesmo assim" (vale para aquela ficha e se acumula — mãe e filha dividem número) e "Unificar com a ficha de X". Pelo CPF só há "Unificar" (o CPF é único), e o CPF de uma ficha ARQUIVADA é recusado, com o caminho da busca para achá-la.
- Fonte: o Heitor, 2026-11-03: "antes de gravar no banco, confere se já existe; se já existir, retorna avisando que já existe, perguntando se deseja cadastrar mesmo assim ou atualizar a ficha existente"
- Onde: `docs/regras/crm-inbox.md:101-126`
- Antes: KA-21, KA-22, KA-26

**CL-08.** O "Unificar" grava na ficha existente SÓ o que foi preenchido agora: o campo vazio não mexe no que ela tem, o preenchido toma o lugar, as observações se somam, as tags se juntam e o endereço só vai por cima se preenchido. Não troca o documento que ela já tem (um CPF diferente, um passaporte por outro, CPF por passaporte: recusado). A pergunta mostra antes como a ficha fica com TUDO o que o Unificar grava (o nome, o telefone, o e-mail, o documento e o nascimento sempre; o gênero, o endereço, as observações, as tags e o acesso ao app quando preenchidos; "O que ficou em branco aqui não muda na ficha."), acompanhando o que se digita; com outro documento na ficha, ela diz que o Unificar recusa antes do clique. O "Indicada por" e o responsável legal digitados no cadastro não vão para a ficha (a sugestão nº 108). Depois, liga o card ou a conversa de onde veio, abre a ficha e registra no Histórico ("Ficha unificada pelo cadastro · Alterou: e-mail · por <quem fez>"). Para as automações é uma alteração de dados; o que não mudou nada não dispara "dados alterados".
- Fonte: decisão do Claude; a prévia com tudo o que o Unificar grava: decisão do Claude, 26/11 (33ª simulação, D18), pelo princípio 3
- Onde: `docs/regras/crm-inbox.md:69`, `:113-141`, `:1760`, `:150-166`
- Antes: KA-23, KA-25, KA-28, KA-29, KE-63; antes de 26/11: a prévia dizia só o nome, o telefone e o e-mail, e o Unificar gravava também o CPF e o nascimento digitados

**CL-09.** O "Unificar" nunca muda o NOME da ficha; renomear é editando a ficha.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:118`
- Antes: KA-24

**CL-10.** A pergunta da ficha que já existe vale em todo caminho de cadastro: o formulário (e o do inbox), o "+ Agendar" com nome e telefone, o agendar pelo CRM (ali a ficha arquivada do telefone entra na mesma pergunta, com "Reativar a ficha de X") e o Copilot (o cartão troca o "Confirmar" pelas duas escolhas). Na importação, a prévia mostra "Completar a ficha de X" marcada e deixa desmarcar.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:130`
- Antes: KA-27

**CL-11.** O telefone de uma ficha ARQUIVADA pergunta primeiro: "Reativar a ficha de X" (a ficha volta como estava, com o histórico, ligada ao card ou à conversa de onde veio o cadastro; o que se digitou não é gravado) ou "É outra pessoa" (a resposta vale para aquele número).
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:183`
- Antes: KA-38

**CL-12.** As perguntas aparecem junto ao telefone assim que o número está completo, antes do clique, na ordem: a ficha arquivada → a ficha que já existe → a pessoa do CRM; a do nome com o nascimento só aparece no envio, e o envio confere tudo de novo. "Cadastrar" com uma pergunta sem resposta não envia: rola até ela e diz, junto do botão, o que falta e onde (só os botões que aparecem, com o nome que têm).
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:189-206`
- Antes: KA-39, KA-40, KA-41

**CL-13.** O cadastro grava uma vez: o mesmo envio que chega duas vezes é um cadastro só, e duas chegadas com o mesmo nome e telefone gravam a primeira e levam as outras à pergunta "Já existe a ficha de X". O erro do login chega à tela em português (a senha fraca da cliente é o documento, e a tela diz isso), e o formulário não se apaga com o erro nem com o aviso.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:217-227`
- Antes: KA-42, KA-43, KA-44

### A mesma pessoa do CRM

**CL-14.** Se o telefone digitado no cadastro é de uma pessoa do CRM que ainda não é cliente (com oportunidade, até a perdida que voltou, só com conversa, ou só vinda da Importação), a tela pergunta, a quem tem o CRM em Ver, "É a mesma pessoa do contato X?". O "Sim" diz antes o que muda no contato ("Com o Sim: o contato X passa a se chamar Y, com o e-mail Z."), grava no contato o nome e o e-mail da ficha e liga à ficha nova as oportunidades e conversas que quem cadastra alcança; a mais recente conta a conversão (o clique do anúncio, a API de Conversões) e as outras ficam ligadas e convertidas. "Não" cadastra sem ligar. Para quem não tem o CRM não há pergunta nem ligação; a ligação vem depois, quando quem tem o CRM agenda pelo card ("Agendar para a ficha de …", AG-15 do Atendimento). O "Cadastrar cliente" pela conversa (o painel do inbox) faz o mesmo que o "Sim": o contato recebe o nome e o e-mail da ficha, e a conversa, a lista e a busca passam a mostrar o nome da ficha (IN-06).
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele); quem não tem o CRM: decisão do Claude, 27/11 (35ª, Decisão C3); o cadastro pela conversa: decisão do Claude, 27/11 (D4 da 38ª), pela própria CL-14, pela IN-06 e pelo princípio 3 (uma pessoa, um dado)
- Onde: `docs/regras/crm-inbox.md:146-164`, `:213`, `:1070`
- Antes: KA-30, KA-31, KA-32, KA-33, KD-03

**CL-15.** Quem cadastra a partir do card da oportunidade ou da conversa não é perguntado (já disse quem é). A pessoa da oportunidade criada à mão no quadro também é achada pelo telefone no cadastro.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:162-164`
- Antes: KA-34, KA-35

### Indicação

**CL-16.** "Indicada por" liga a ficha a OUTRA ficha da rede, escolhida pela busca no Novo cliente, no Agendar com cliente nova e na aba Dados; a Visão geral diz "Indicada por: X" e "Indicou: Y (…)". Na importação, liga à ficha cujo nome bate com UMA só; senão guarda o texto e diz que não ligou.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:298-304`
- Antes: KA-58, KA-59

### A cliente é da rede: a lista

**CL-17.** A lista de Clientes é a da rede inteira nos dois portais: o portal de qualquer unidade lista todas as clientes da rede, sem filtro "Unidade", sem contador de ativas por unidade, sem a unidade na coluna esquerda e sem busca "fora da unidade".
- Fonte: o Heitor, 2026-11-13: "Não deve ter um filtro de unidade nem na lista nem no portal da unidade. Como o cliente pertence à clínica, a unidade, o portal da unidade vê todos os clientes."
- Onde: `docs/revisao.md:483`, `:504`, `docs/regras/crm-inbox.md:362`, `:517`, `:1710`
- Antes: KA-64, KA-65, KB-01, KB-02, KE-60, KF-09, KF-10, KF-11

**CL-18.** Pela mesma regra (a cliente é da rede), a "última visita" da lista é a da cliente na rede, contada em dias de calendário no relógio do portal ("Hoje", "Ontem", "N dias" não mudam no correr do dia; o "Reativar clientes" dos dashboards conta os dias sem vir pela mesma conta), a ficha não tem "Unidades que frequenta", e o histórico da oportunidade não registra troca de "Unidade".
- Fonte: decisão do Claude; os dias de calendário: decisão do Claude, 26/11 (33ª simulação, D9 e o arremate), pelo princípio 3 e pela FU-06 de Indicadores
- Onde: `docs/regras/crm-inbox.md:365-367`, `docs/revisao.md:1968`, `docs/regras/crm-inbox.md:434-446`
- Antes: KA-66, KB-03, KB-04, KF-12; antes de 26/11: a última visita e o "Reativar clientes" contavam blocos de 24 h

**CL-19.** "Novos clientes" só existe na rede, e o "Reativar" é sempre o da rede (não há "atendidas na unidade" nesses números).
- Fonte: o Heitor, 2026-11-18: "Só na rede"
- Onde: `docs/regras/crm-inbox.md:349-351`; `DEVLOG.md:2202`
- Antes: KA-67

**CL-20.** A lista filtra por Situação (Ativos, Novos, Arquivadas ou Aniversariantes de <mês> — escolha uma) e por Tags (várias); não há segmento fixo "VIP" nem selo "VIP" na linha: VIP é uma tag como as outras (o selo "Novo" é calculado, IM-20, não tag). "Arquivadas" é o nome da ação da ficha (era "Inativos"). "Aniversariantes de <mês>" mostra as ativas que fazem aniversário no mês corrente (no fuso da rede, FU-05 de Indicadores), em ordem de dia, com "Aniversário dia DD/MM", nos dois portais. As aniversariantes de hoje se acham nesse filtro, no card do dashboard e na condição "aniversário hoje" das automações: não há filtro fixo "de hoje". A lista não se exporta.
- Fonte: decisão do Claude; o "Arquivadas": princípio 3 (J-23 — o filtro tem o nome da ação da ficha); o selo "VIP": decisão do Claude, 27/11 (40ª simulação, D3), pela TG-01 e pela própria CL-20; as aniversariantes de hoje: decisão do Claude, 27/11 (40ª simulação, Time C), pelo princípio 7 (simples primeiro: a lista já ordena pelo dia); a exportação: decisão do Claude, 27/11 (40ª simulação, Time C) — nenhuma regra a pede (é a sugestão nº 171); o mês no fuso da rede: a FU-05 e o código (`apps/web/lib/clientes/aniversariantes.ts:20`, `partsInTZ(hoje, await fusoDaRede(tenantId)).month`) — o texto dizia "horário de Brasília" (corrigido em 27/11)
- Onde: `docs/regras/crm-inbox.md:443`, `:467`; `apps/web/components/branch/clients-sidebar.tsx:141-148`
- Antes: KB-05, KB-06

### A ficha

**CL-21.** A ficha é da rede: quem tem Clientes em Gerenciar edita os dados, as anotações e as tags e arquiva ou reativa a ficha de qualquer cliente da rede, mesmo cadastrada em outra unidade.
- Fonte: o Heitor, 2026-11-01 (H5): "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/crm-inbox.md:499`
- Antes: KB-23

**CL-22.** Quem abre a ficha vê a Visão geral e o Histórico inteiros — os atendimentos de todos que atenderam, os valores, o plano e o contrato. A ficha não se recorta por quem atende.
- Fonte: o Heitor, 2026-11-07: "ve tudo, só os meus não se aplica para visualização de clientes pq os clientes são da clinica, isso já foi decidido antes"
- Onde: `docs/regras/crm-inbox.md:481`
- Antes: KB-24

**CL-23.** As abas da ficha seguem a permissão: Prontuário com o Prontuário em Ver; Financeiro (os pagamentos e o crédito interno) com o Financeiro em Ver ou quem pode receber; Oportunidades com o CRM em Ver (e as oportunidades no plano), com todas as da cliente — se a leitura falha, diz "Não consegui ler as oportunidades desta cliente.". Os indicadores da Visão geral (LTV, ticket) ficam para todos. A aba que a pessoa não abre avisa em vez de cair calada em outra, e diz onde ela está ("Suas permissões não abrem a aba Prontuário desta ficha. Você está na Visão geral.").
- Fonte: decisão do Claude; o texto do aviso: decisão do Claude (16/11 — o aviso fala em permissão e diz onde a pessoa está, como o CU-08 das Configurações)
- Onde: `docs/regras/crm-inbox.md:484-486`, `:593-596`, `:1679`; `apps/web/lib/clients/aba-fechada.ts:6`
- Antes: KB-25, KB-26, KB-27, KE-39

**CL-24.** Quem tem Clientes só em Ver não cadastra nem edita: o inbox não oferece "Cadastrar cliente" nem o "Vender" de quem não tem ficha, o quadro não oferece o cadastro, e a ficha mostra a aba Dados e as anotações só para ler (sem "Salvar dados", sem "Dar acesso ao app", com a frase "Seu cargo só consulta o cadastro") e sem "Mais ações". Se tentar pela action, recebe a recusa.
- Fonte: o Heitor, 2026-11-01: "quem só pode ver só pode ver"
- Onde: `docs/regras/crm-inbox.md:581`, `:1762`
- Antes: KB-28, KE-61

**CL-25.** A Visão geral da ficha avisa o documento em aberto que o cadastro impede de assinar ("“Termo X” não pode ser assinado: falta no cadastro CPF.", com "Completar o cadastro") e as faltas da cliente ("Não compareceu 1 vez: a última em 02/11/2026 (Toxina).", com "Ver no Histórico"); o "Histórico de procedimentos" mostra só o que ela fez.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:573-577`
- Antes: KB-29, KB-30

### Arquivar

**CL-26.** Arquivar a cliente ("Mais ações" da ficha, com Clientes em Gerenciar) a tira das listas (Clientes, aniversariantes, reativar, a base ativa dos relatórios), mas não muda quantas clientes novas houve em nenhum período: ela sai do filtro "Novos" da lista, e o card "Novos clientes" do dashboard segue contando-a. A confirmação diz os agendamentos marcados dela daqui para a frente e que continuam na agenda (arquivar não os cancela). A busca universal acha a arquivada, com "Arquivada" e a ação "Reativar" (para quem tem Clientes em Gerenciar), e não oferece cadastrá-la de novo.
- Fonte: decisão do Claude; o filtro "Novos" e o card do dashboard: decisão do Claude, 27/11 (40ª simulação, Time C), pela própria CL-26 (o card é o indicador das fichas que entraram no período, e arquivar não desfaz o cadastro; a lista mostra as ativas, CL-17 e CL-20)
- Onde: `docs/regras/crm-inbox.md:474-475`, `:531-535`
- Antes: KB-31, KB-32, KB-33, KB-34

## Tags (TG)

**TG-01.** Tag é filtro personalizado da rede: ela cria com o nome que quiser e filtra por ela onde houver filtro. Nenhum nome de tag tem significado para o sistema: não existe tag de unidade, e nenhuma tela ou conta (o público das campanhas, o "Buscar clientes" das automações, as novas clientes, o "Reativar", a lista de Clientes, o "Agendar") lê uma tag como "a unidade da cliente". Nem o "VIP" tem sentido próprio: a lista de Clientes não lhe dá selo, e a tela do atendimento a mostra como as outras tags.
- Fonte: o Heitor, 2026-11-13: "não existem tags de unidade, existem tags, a rede cria a tag que quiser e usa elas como filtro depois, do que quiser, com nome que quiser. Não complica."; o "VIP": a mesma fala, aplicada na 40ª simulação (D3: o selo "VIP" na lista e o realce dela no atendimento)
- Onde: `docs/regras/crm-inbox.md:309`, `:1709`, `docs/revisao.md:397`, `:419`, `:1948`
- Antes: KA-61, KE-59, KF-02

**TG-02.** O sistema nunca põe tag sozinho: só a pessoa da equipe, na tela, ou a ação "Adicionar tag" de uma automação que a rede montou gravam tag. Nenhum agendamento marca "Unidade: X" (nem outra tag) na cliente, e nenhum gatilho, origem, unidade ou coluna da importação põe tag.
- Fonte: o Heitor, 2026-11-13: "O sistema não coloca tag nenhuma automaticamente em ninguém por nenhum motivo"
- Onde: `docs/regras/crm-inbox.md:1707`, `docs/revisao.md:382-383`, `:1948`, `:1952`
- Antes: KE-54, KF-01, KF-07

**TG-03.** A origem é a origem, não tag: a conversa que chega de anúncio, a oportunidade criada à mão e a coluna "Origem" da importação não viram tag.
- Fonte: o Heitor, 2026-11-13: "Sobre a origem sem virar tag, como eu já falei, o sistema não atribui tag automaticamente a nada nem ninguém em momento algum."
- Onde: `docs/revisao.md:403-406`, `:429`, `docs/regras/crm-inbox.md:352`
- Antes: KA-62, KF-03, KF-04

**TG-04.** A ação das automações se chama "Adicionar tag" e oferece qualquer tag registrada no sistema. Ao lado dela há "Remover tag", que tira da pessoa uma das tags cadastradas (sem a tag, o passo não faz nada e diz "O cliente não tinha esta tag."). O nome é do Heitor; o "Remover tag" é decisão do Claude (a auditoria das regras de 18/11 o trouxe de volta, lendo a fala como sobre o nome e pelo princípio 7) — ver a Q12.
- Fonte: o Heitor, 2026-11-13: "sobre a ação tag do cliente, essa ação ela deve se chamar só adicionar tag, tá? E aí ela permite que se adicione qualquer tag que tenha sido registrada no sistema, tá?"
- Onde: `docs/revisao.md:427-435`, `docs/regras/crm-inbox.md:357`, `docs/regras/automacoes.md:452-461`
- Antes: KA-63, KF-05, KF-06

**TG-05.** A rede nova nasce sem tag nenhuma: o catálogo começa vazio e a rede cria as dela.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-16: "Sim"
- Onde: `docs/revisao.md:423`, `docs/regras/crm-inbox.md:545`, `:1745`
- Antes: KA-60, KB-22, KE-56, KF-08

**TG-06.** As tags ficam em Configurações → Tags, nos dois portais. Criar, renomear e arquivar tag é só da Admin da rede; para os outros a aba diz "Esta configuração é só da Admin da rede.", e a ação é recusada.
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"; a tag da planilha entra no catálogo: o Heitor, 2026-11-27, R38: "Entra na lista: importar é a rede criando a tag (como está)"
- Onde: `docs/regras/crm-inbox.md:374-376`
- Antes: KB-10

**TG-07.** Há um catálogo só de tags, e a ficha, o cadastro, o painel do inbox, o card da oportunidade e as automações ("Pôr a tag", "Remover tag") oferecem as tags ativas dele para MARCAR; o público da campanha, que é filtro, oferece também as arquivadas que alguém tem (TG-14) — sem lista fixa, sem "as que estão em uso" e sem entrada livre: nenhuma tela cria tag ao marcar (criar é só em Configurações → Tags). A importação, sim: a tag da planilha que o catálogo não tem entra nele, porque importar é a rede criando a tag dela (Q11; R38). Cada nome é único na rede sem diferença de maiúsculas ("VIP" e "vip" são a mesma): marcar grava o nome do catálogo, desmarcar tira qualquer grafia, e o filtro acha a tag escrita de qualquer jeito.
- Fonte: decisão do Claude; o público da campanha como filtro: decisão do Claude, 26/11 (33ª simulação, Decisão D e o arremate), pela TG-14; a tag da planilha entra no catálogo: o Heitor, 2026-11-27, R38: "Entra na lista: importar é a rede criando a tag (como está)"
- Onde: `docs/regras/crm-inbox.md:383-388`, `:420-433`, `:1708`, `:1744`, `:622-640`
- Antes: KB-11, KB-12, KB-17, KE-55; antes de 26/11: a campanha oferecia só as ativas

**TG-08.** Arquivar uma tag a tira das opções de marcar (como filtro, ela segue enquanto alguém a tiver: TG-14); quem já a tem continua com ela, e a ficha a mostra marcada (assim como qualquer tag que a pessoa tenha fora do catálogo). Não existe apagar tag.
- Fonte: decisão do Claude; o filtro: decisão do Claude, 26/11 (33ª simulação, A6 e Decisão D)
- Onde: `docs/regras/crm-inbox.md:387`, `:528`, `:622-640`
- Antes: KB-13; antes de 26/11: "a tira das opções", e a Agenda, o quadro, o Financeiro e os Relatórios a tiravam também do filtro

**TG-09.** A tag é da PESSOA, e ela pode ter várias: uma lista só por pessoa, marcada na ficha, no painel do inbox ou no card, que vale em todo filtro (Clientes, inbox, quadro, campanhas, automações, Copilot, Financeiro, Agenda, Relatórios). O contato e a ficha dele têm as mesmas tags; a pessoa sem ficha tem as do contato. A oportunidade não tem tag própria: o card mostra e edita as da pessoa.
- Fonte: o Heitor, 2026-11-18: "a tag é da pessoa e pode ter mais de uma tag"
- Onde: `docs/regras/crm-inbox.md:398-408`, `:1159`, `:1720`
- Antes: KB-14, KB-15, KD-13, KE-53

**TG-10.** Quando a ficha e o contato se encontram ("Cadastrar cliente" do card, "É a mesma pessoa", a conversa da ficha, a ligação automática), as tags dos dois se juntam, sem repetir. Um contato que já é de outra ficha nunca é religado.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:414`
- Antes: KB-16

**TG-11.** Renomear uma tag troca o nome em todas as pessoas de uma vez; se o nome novo já existe, as duas viram uma (fica a que existia, sem repetir na pessoa). O fluxo de automação publicado que cita o nome antigo não é reescrito: a tela lista quais ajustar. O uso de cada tag, na aba Tags, conta pessoas (as fichas e os contatos sem ficha).
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:436-440`, `:1750`
- Antes: KB-18, KB-19, KB-20, KE-57

**TG-12.** O filtro de Tags é E em todo lugar: com duas tags marcadas, entra só quem tem as duas (lista de Clientes, quadro, inbox, Financeiro, Agenda, Relatórios, público das campanhas e "Buscar clientes" das automações). A prévia da campanha diz "Tags (todas)" com mais de uma.
- Fonte: o Heitor, 2026-11-19: "Quem tem TODAS (E)"
- Onde: `docs/regras/crm-inbox.md:447`, `:1725`
- Antes: KB-21, KE-58

**TG-13.** Quem tem Clientes em Gerenciar seleciona clientes na lista (uma a uma ou "Todas da lista", as do filtro) e marca nelas uma tag do catálogo, até 200 por vez: muda só quem ainda não a tem, e as outras tags de cada uma ficam.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:460`
- Antes: KB-07

**TG-14.** Como FILTRO, a tag arquivada segue oferecida em toda tela que filtra por tag enquanto alguém a tiver — a lista de Clientes, o inbox, a Agenda, o quadro, o Financeiro (também as Comissões), os Documentos, os Relatórios e o público da campanha —, todas pela mesma lista de opções: as tags ativas mais as arquivadas que alguém tem. Ela só sai das opções de MARCAR (TG-08). A arquivada que ninguém mais tem não aparece no filtro.
- Fonte: decisão do Claude, 26/11 (33ª simulação, Decisão D) — pela regra das Tags do Heitor (CLAUDE.md §1, 2026-11-13: "onde tiver for passível de filtro, um dos filtros que ela pode usar são as tags") e pelo princípio 3: o mesmo filtro não pode existir numa tela e sumir na outra (A6 da 33ª: arquivada a "Noiva 2027", com três clientes marcadas, ela ficava no filtro de Clientes e do inbox e sumia da Agenda, do quadro, do Financeiro e dos Relatórios); o público da campanha: decisão do Claude, 26/11 (33ª simulação, arremate)
- Onde: `docs/regras/crm-inbox.md:622-640`; TG-08, TG-09, TG-12; `apps/web/components/shared/filtro-de-tags.tsx`, `apps/web/lib/tags/`
- Antes: (nova, 26/11)

## Portal e app da cliente (PO)

**PO-01.** Só a rede cria o acesso da cliente ao portal e ao app (não há cadastro pela própria cliente): o login é o e-mail, e a senha inicial é o CPF (só os números) ou, sem CPF, o número do passaporte ou do RNE como está na ficha — provisória, trocada no primeiro acesso. A tela de login e o aviso do acesso criado dizem qual é. Vale no cadastro, na aba Dados e no Copilot, e também para a ficha da menor.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Concordo"; a menor: decisão do Claude, 27/11 (36ª, Decisão E) — nenhuma regra proíbe (a CL-06 cobre o termo assinado pelo responsável)
- Onde: `docs/regras/crm-inbox.md:18`, `docs/revisao.md:1483`, `:1503`
- Antes: KA-03, KF-31

**PO-02.** Sem documento nenhum (nem CPF, nem passaporte, nem RNE), a cliente não ganha acesso ao app, e a tela diz por quê ("precisa do e-mail e de um documento (CPF, passaporte ou RNE)").
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-05: "concordo"
- Onde: `docs/regras/crm-inbox.md:29`
- Antes: KA-04

**PO-03.** O acesso só nasce se quem cadastra marcar "Criar o acesso ao app", que só se marca com o e-mail e o documento; sem a caixa, nenhum login nasce. Depois, a aba Dados dá o acesso, com o e-mail e o documento já salvos. Criado o acesso, a tela confirma o login, a senha inicial e que ela é trocada no primeiro acesso (em texto neutro), e a ficha mostra o selo "Tem acesso ao app".
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:70-75`
- Antes: KA-13, KA-14, KA-15

**PO-04.** Quem já tem conta no BellarisOS (cliente de outra rede) recebe a ficha nova na MESMA conta só se o documento bate: o mesmo CPF ou, sem CPF, o mesmo passaporte/RNE (tipo e número). Com outro documento, o mesmo e-mail é recusado: a ficha nova com CPF diz "Este e-mail já tem uma conta no BellarisOS com outro CPF. Confira o e-mail e o CPF da cliente."; sem CPF, "Este e-mail já tem uma conta no BellarisOS com outro documento. Confira o e-mail e o documento da cliente.".
- Fonte: decisão do Claude; as duas frases: decisão do Claude, 27/11 (36ª, A6) — a do CPF é a mais precisa (`apps/web/lib/clients/acesso.ts`, `RECUSA`)
- Onde: `docs/regras/crm-inbox.md:31`
- Antes: KA-05

**PO-05.** A mesma pessoa, cliente de várias redes, tem um login só, com uma ficha em cada rede, e escolhe a rede num seletor na entrada. Cada ficha é da sua rede, e a LGPD (pedido, exportação) é por ficha — cada rede responde pelos dados dela.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Concordo"
- Onde: `docs/regras/crm-inbox.md:58`, `docs/revisao.md:1484`, `:1503`
- Antes: KA-06, KF-32

**PO-06.** No Perfil, a cliente vê os dados dela, troca a senha e tem a parte da LGPD. Ela nunca vê o prontuário nem as anotações da equipe.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Concordo"
- Onde: `docs/revisao.md:1494-1496`, `:1503`
- Antes: KF-33, KF-34

**PO-07.** O portal e o app da cliente não dizem "clínica" ("Crédito na clínica", "Telefone da clínica", "A clínica enviou um documento", os avisos no celular).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "Concordo"
- Onde: `docs/revisao.md:1500`, `:2147`
- Antes: KF-35

**PO-08.** O portal fala com a pessoa pelo sexo da ficha: "Bem-vinda" (F), "Bem-vindo" (M) e, sem sexo ou "Outro", "Boas-vindas". O que a equipe diz à cliente é neutro ("Tudo certo!", não "Obrigada!"); texto do portal no feminino fixo é defeito.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:231-233`
- Antes: KA-45, KA-46

**PO-09.** O fim da home do portal mostra o cartão "A unidade", da unidade do ENDEREÇO: nome, endereço, telefone, horário e os botões WhatsApp e Ligar (sem nenhum dado, o cartão não aparece; o cadastro da unidade avisa que, em branco, vale o telefone da rede). "Falar com a equipe" abre o WhatsApp com a mensagem pronta, a do plano proposto ou a do agendamento.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:237`, `:246-250`
- Antes: KA-47, KA-49, KA-50

**PO-10.** O WhatsApp do cartão "A unidade" é o número CONECTADO (o ativo com a unidade do endereço, senão o padrão da rede; sem nenhum, o telefone da unidade ou o da rede), para a conversa cair no inbox; o "Ligar" é sempre o telefone.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:241`
- Antes: KA-48

**PO-11.** No plano, cada sessão "A agendar" diz quem marca — "A agendar · pelo app" ou "A agendar · quem marca é a equipe" — e o resumo separa as duas: "Sessão N: agende pelo app em “Agendar” (faz parte do seu plano)." e "Sessão N: quem marca é a equipe — fale com ela para escolher o dia.".
- Fonte: princípio 3
- Onde: `docs/regras/crm-inbox.md:263`; `apps/web/lib/plano-de-tratamento/textos.ts:108-112`
- Antes: KA-51

**PO-12.** A sessão do plano ACEITO se agenda pelo app mesmo com o procedimento fora do "Permitir auto agendamento"; só a sessão de procedimento INATIVO fica com a equipe.
- Fonte: o Heitor, 2026-11-13: "se for uma sessão de plano ou pacote, pode agendar"
- Onde: `docs/regras/crm-inbox.md:273`
- Antes: KA-52

**PO-13.** No app: o "Confirmar" avisa antes quando o horário fica dentro do prazo de alteração da rede (o agendamento continua permitido); com duas ou mais unidades, o próximo agendamento do Início e cada atendimento do Histórico dizem a unidade; o atendimento já feito, à espera de que a cliente o confirme, fica no Início em "Como foram os seus atendimentos?" (que é opcional está na dica "Sobre a avaliação"); no Histórico a nota dada se lê ("4/5"), o botão diz que é opcional ("Confirmar e avaliar (opcional)"), e a nota do procedimento tem nome próprio ("Procedimento: <nome>").
- Fonte: princípio 3; o título "Como foram os seus atendimentos?": decisão do Claude (A56 da 12ª — "Aguardando sua confirmação" se lia como confirmar presença)
- Onde: `docs/regras/crm-inbox.md:279-293`; `apps/web/app/[slug]/cliente/home/page.tsx:370-376`; `apps/web/components/client-portal/historico-tabs.tsx:177`
- Antes: KA-53, KA-54, KA-55, KA-56

**PO-14.** O documento que o sistema de login recusa como senha (o curto demais para a senha mínima, como um RNE curto, e o que a proteção contra senha vazada recusa: o passaporte, o RNE ou o CPF fácil de adivinhar) não impede o acesso: o login nasce com uma senha aleatória forte que ninguém recebe (provisória), a ficha é ligada, e a cliente recebe o e-mail "Defina sua senha" — o caminho do "Esqueci a senha". A tela diz isso a quem cadastrou ("… enviamos para esse e-mail o link para criar a senha."). Nesse caso a senha inicial NÃO é o documento: entrar com ele é recusado, e a cliente entra depois de criar a senha pelo e-mail.
- Fonte: o Heitor, 2026-11-24, à R1 da 27ª simulação: "E-mail para criar a senha" (registrada em `docs/regras/crm-inbox.md:44-45`); o texto do aviso: o Heitor, 26/11 (página de perguntas, R02): "enviamos para esse e-mail o link para criar a senha"
- Onde: `docs/regras/crm-inbox.md:42-52`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## LGPD (LG)

**LG-01.** O titular só pode pedir a exportação dos dados: o sistema não registra pedido de eliminação. A cliente pede a eliminação pelo contato da rede, que responde à mão.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-11 (H15, opção a): "não agora"
- Onde: `docs/regras/crm-inbox.md:599`
- Antes: KB-35

**LG-02.** Pelo app, revogar o consentimento e pedir a exclusão continuam como estão.
- Fonte: o Heitor (decisão 3 sobre a 8ª simulação, sem data no texto): "mantem do jeito que tá"
- Onde: `docs/regras/crm-inbox.md:694-695`
- Antes: KC-03

**LG-03.** A página pública /privacidade não promete eliminação automática: diz que ela é feita sob pedido, pelo contato da rede, respeitando as guardas legais (prontuário 20 anos, fiscal 5 anos), e diz como pedir e os prazos.
- Fonte: princípio 3
- Onde: `docs/regras/crm-inbox.md:604`
- Antes: KB-36

**LG-04.** A cliente pede a exportação no portal (perfil). O pacote sai em PDF (para ler) e JSON (portabilidade), e o download vale por 30 dias. Cada cliente tem no máximo um pedido em aberto.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:615-624`
- Antes: KB-37, KB-38

**LG-05.** O pedido diz o prazo, igual no portal e na aba LGPD da rede: em preparo, "costuma ficar pronto em poucos minutos"; com o prontuário esperando liberação, "Responder até DD/MM/AAAA (15 dias do pedido)", o prazo da LGPD. Depois da decisão sobre o prontuário, a aba diz quando ele foi liberado ou negado e que o pacote novo fica pronto em poucos minutos. Negado o prontuário, o pacote também se refaz, sem ele (dizendo que não foi liberado), e a aba diz que "o pacote novo, sem o prontuário, fica pronto em poucos minutos".
- Fonte: decisão do Claude; o negar refaz o pacote: decisão do Claude, 26/11 (33ª simulação, D2), pela LG-05 e pela LG-07
- Onde: `docs/regras/crm-inbox.md:682-685`, `:856-866`
- Antes: KC-01, KC-02; antes de 26/11: negado, o pacote seguia o pronto, que dizia "em análise — quando ela decidir, um pacote novo"

**LG-06.** O prontuário só entra no pacote se a cliente pediu e se quem tem o Prontuário em Gerenciar o libera, na aba LGPD (sem precisar de Clientes em Ver: liberar e negar pedem o Prontuário em Gerenciar, e só ele); liberar pede confirmação (ele vai para a cliente), que aparece abaixo do botão. Depois de liberado, o pacote é gerado de novo, com a parte clínica. Negar também refaz o pacote, sem a parte clínica (LG-05); só o liberar registra o acesso ao prontuário. A cliente não é avisada no sino quando o pacote refeito fica pronto (a sugestão nº 107).
- Fonte: decisão do Claude; o negar: decisão do Claude, 26/11 (33ª simulação, D2); sem precisar de Clientes em Ver: decisão do Claude, 27/11 (39ª simulação, D2), pela própria LG-06 e pela LG-08
- Onde: `docs/regras/crm-inbox.md:696`, `:709`, `:856-866`
- Antes: KC-04, KC-06; antes de 26/11: só o liberar refazia o pacote

**LG-07.** Quando o prontuário fica fora, o pacote e o resumo do pedido dizem por quê (não foi pedido, está em análise, não foi liberado) ou, no pacote gerado pela equipe sem o prontuário (LG-10), "gerado pela equipe sem o prontuário", sem mandar a cliente fazer um pedido novo (decisão do Claude, 27/11, 35ª D10); liberado, dizem que está incluído. Enquanto está em análise, o pedido segue em andamento: o perfil diz "Parte geral pronta" e "Prontuário em análise", deixa baixar a parte geral, não oferece "Solicitar meus dados", e um segundo pedido é recusado.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:700`, `:723`
- Antes: KC-05, KC-10

**LG-08.** A aba LGPD existe nos dois portais (quem tem só unidades abre a da unidade) e mostra no nome quantos pedidos esperam: "LGPD (n)". A lista de pedidos pede Clientes em Ver; quem não tem lê na aba o porquê. O pedido com prontuário avisa também quem tem o Prontuário em Gerenciar (é quem libera), e a aba abre para essa pessoa; o menu mostra Configurações a ela. Sem Clientes em Ver, quem tem o Prontuário em Gerenciar vê na aba os pedidos com o prontuário esperando a decisão, com o Liberar e o Negar da parte do prontuário — só isso; o resto dos pedidos continua pedindo Clientes em Ver.
- Fonte: decisão do Claude; os pedidos com prontuário para quem tem o Prontuário em Gerenciar sem Clientes em Ver: decisão do Claude, 27/11 (39ª simulação, D2), pela LG-06 e pela própria LG-08 (o aviso chamava quem não conseguia decidir)
- Onde: `docs/regras/crm-inbox.md:610-612`, `:711-712`
- Antes: KB-39, KB-40, KC-07, KC-08

**LG-09.** O pedido feito pelo app avisa no sino quem responde — quem tem Clientes em Gerenciar e a Admin da rede; com o prontuário no pacote, também quem tem o Prontuário em Gerenciar (é quem o libera) — com o prazo e o "Abrir" da aba LGPD (a da unidade principal, para quem tem só unidades). A Visão geral da ficha mostra o pedido: o em aberto, com "responder até …"; o entregue nos últimos 30 dias, com "o pacote já está no app dela"; a quem responde, o link para a aba LGPD.
- Fonte: decisão do Claude; quem é avisado: a revisão de 24/11 (Q09 desta área — quem responde é quem tem Clientes em Gerenciar, porque a cliente é da rede)
- Onde: `docs/regras/crm-inbox.md:641-645`, `:665-673`; `apps/web/lib/lgpd/aviso-do-pedido.ts:22-45`
- Antes: KB-41, KB-42

**LG-10.** Quem tem Clientes em Gerenciar exporta os dados da cliente pela ficha ("Mais ações" → "Exportar dados (LGPD)"): o mesmo pacote, preparado em segundo plano, com o download na janela (link de 10 minutos); o pedido fica registrado com quem o fez, e não aparece nos pedidos da cliente no app nem na Visão geral. O prontuário só entra com o Prontuário em Gerenciar (o pedido já nasce liberado e o acesso ao prontuário fica registrado; baixar o pacote com prontuário pede o mesmo). A sessão de suporte não exporta.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:625-636`
- Antes: KB-43, KB-44, KB-45, KB-46

**LG-11.** O pacote é legível para a titular: em português, com as situações por extenso, a unidade pelo nome e os valores em número, sem id nem nome de coluna, e com o último acesso dela ao app. Leva o plano de tratamento com total, sessões, procedimentos e valores (sem a anotação de quem atende; o cancelado com o dia, o valor que valeu e o que saiu), as comunicações com dia e hora, e os dados cadastrais com o responsável legal da menor e o documento estrangeiro de quem não tem CPF.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:651-672`, `:714`
- Antes: KB-47, KB-48, KB-50, KC-09

**LG-12.** A parte geral leva o histórico da ficha de saúde (quando foi mandada, completa ou confirmação, a situação, quando e por onde foi respondida). O prontuário liberado leva as perguntas e respostas da ficha (com o nome "Ficha de saúde"), no JSON e no PDF — também a ficha que a equipe preencheu no atendimento, sem repetir a que já veio por um pedido respondido —, cada atendimento com as anotações feitas depois de concluir e as versões substituídas pelo "Editar registro" (quem corrigiu e quando), as fotos (inclusive a foto clínica anexada) e os insumos que saíram do estoque nele (produto, quantidade e lote). Cada foto vai no pacote para a cliente abrir (o arquivo ou o link para baixá-lo, como os outros anexos), não só a contagem; e a ficha de saúde aparece uma vez só (não de novo como anamnese geral).
- Fonte: decisão do Claude; a ficha do prontuário no PDF: decisão do Claude, 26/11 (33ª simulação, D3), pela própria LG-12 e pelo princípio 3; as fotos abertas e a ficha uma vez só: decisão do Claude, 27/11 (39ª simulação, D14), pela própria LG-12
- Onde: `docs/regras/crm-inbox.md:663-669`, `:728-745`, `:798-806`
- Antes: KB-49, KC-11, KC-12, KC-13; antes de 26/11: a ficha que a equipe preenche no atendimento ia só ao JSON, e o PDF dizia "Nenhuma ficha de saúde respondida"

**LG-13.** O pacote da LGPD nunca é entregue incompleto: se uma parte da exportação falha, ele não sai.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1712`
- Antes: KE-64

**LG-14.** No app, o "Meus dados" diz numa linha que a eliminação dos dados e a revogação do consentimento se pedem à rede, pelo nome dela. Não há botão para isso: o sistema não registra esses pedidos (LG-01), e a rede responde à mão.
- Fonte: decisão do Claude, 25/11 (o Heitor revisa), pelo princípio 7 e pela LG-01; o nome da rede: a Q06 (o CA1, "Concordo") (A23 da 29ª simulação: a cliente procurou no app onde pedir a exclusão e a revogação)
- Onde: a regra entra em `docs/regras/crm-inbox.md` com a correção da A23 (25/11); o "Meus dados" do app (`apps/web/components/client-portal/data-request-card.tsx`)
- Antes: (sem número: A23 da 29ª simulação)

**LG-15.** O pedido de eliminação que chega pelo contato da rede (LG-01) se responde à mão, e arquivar a ficha (CL-26) é o que a tela oferece para isso: arquivar não é eliminar. A ficha sai das listas e segue achável pela busca da topbar, com "Arquivada"; as guardas legais ficam (o prontuário por 20 anos, o fiscal por 5: LG-03); e os documentos assinados seguem válidos no /verificar. O arquivar não pede motivo, então nada registra que ele foi a resposta a um pedido de eliminação (a sugestão nº 106).
- Fonte: decisão do Claude, 26/11 (33ª simulação, Decisão B) — pela LG-01 e pela LG-14 (a eliminação é sob pedido, sem botão) e pela CL-26 (B11 da 33ª: a cliente "ligou e pediu" para apagar, e quem tem Clientes em Gerenciar arquivou a ficha; está certo, e não é defeito)
- Onde: (ainda não está em `docs/regras/crm-inbox.md`; o sistema já faz isso, visto na 33ª simulação); LG-01, LG-03, LG-14, CL-26
- Antes: (nova, 26/11)

## Importações (IM)

### Quem importa e onde

**IM-01.** O importador de planilha (CSV) fica em Configurações → Importações, nos dois portais; saiu de Clientes e de Oportunidades.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:752-753`
- Antes: KC-14

**IM-02.** Só a Admin da rede importa. A aba Importações aparece para quem tem Clientes ou o CRM em Gerenciar, mas para quem não é a Admin da rede diz "Esta configuração é só da Admin da rede.". O atalho "Importar planilha" da lista de Clientes só aparece para quem importa clientes.
- Fonte: o Heitor, 2026-11-18: "só pela conta admin"
- Onde: `docs/regras/crm-inbox.md:756`, `:768-774`, `:944`
- Antes: KC-15, KC-16

**IM-03.** A ficha importada é da rede e nasce sem unidade: sem a coluna "Pacote de antes", a importação não pergunta unidade nenhuma. Com ela, o passo das colunas pergunta a "Unidade dos pacotes de antes" (vale para as linhas sem unidade) e oferece a coluna "Unidade (dos pacotes de antes)"; com uma unidade só, a tela só informa qual é.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:776`, `:810`, `:1021`
- Antes: KC-17, KC-28

**IM-04.** O histórico das Importações também é só da Admin da rede: ler as "Importações anteriores" (com o placar), acompanhar, retomar e baixar o relatório enquanto ele vale. As Importações são configuração da rede toda, e o relatório traz dados pessoais.
- Fonte: a revisão de 24/11 (Q10 desta área), pela regra da configuração da rede: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin" (CLAUDE.md §11)
- Onde: `docs/regras/crm-inbox.md:929`, `:1036`; `apps/web/tests/importacao-historico-so-da-admin.test.ts`
- Antes: KC-18, KC-50

### O destino e os campos

**IM-05.** O destino se escolhe a cada importação: em *clientes* entra a ficha (pede Clientes em Gerenciar); em *contatos do CRM* entra só a pessoa, com nome, telefone, e-mail, rede social e tags (pede o CRM em Gerenciar). Só se oferece o destino do módulo que a pessoa tem.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:760`, `:784`
- Antes: KC-19

**IM-06.** Criar oportunidade no funil é opcional e pede o CRM em Gerenciar e as oportunidades no plano. Não duplica: quem já tem oportunidade aberta no mesmo funil não ganha outra, e a que existe não é alterada. Pôr como responsável outra pessoa (na tela ou pela coluna da planilha) só vale para quem pode trocar o responsável; para os outros, a tela não oferece a coluna e a importação a recusa.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:787-800`
- Antes: KC-20, KC-21

**IM-07.** Se vai ter oportunidade se decide no passo 1, antes das colunas; com ela entram os campos do card (origem, valor estimado, observações, procedimento de interesse, etapa, responsável e UTM), e a etapa e o responsável da linha valem mais que os da tela. Com mais de um funil, o campo é "Funil e etapa", agrupado por funil, só de funil ativo. A coluna "Tags da oportunidade" é lida junto com a de Tags (a tag é da pessoa), e a rede social não fica na ficha: no destino clientes ela só vai para o card.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:791-817`, `:1046`
- Antes: KC-22, KC-24, KC-25, KC-29

**IM-08.** A origem da linha é procurada nas origens da rede e depois nos apelidos ("facebook" é Meta Ads); desconhecida vira "Outro", não erro. A origem não vira tag: com oportunidade, é a origem da oportunidade; sem oportunidade, não há coluna de origem.
- Fonte: o Heitor, 2026-11-13: "Sobre a origem sem virar tag, como eu já falei, o sistema não atribui tag automaticamente a nada nem ninguém em momento algum."
- Onde: `docs/regras/crm-inbox.md:794`, `:863`, `docs/revisao.md:428`
- Antes: KC-23, KC-42

**IM-09.** A importação só recusa a linha impossível: a ficha sem nome ou sem telefone válido, o contato sem telefone e sem e-mail válidos, ou a linha repetida na planilha. Um campo ilegível (CPF, e-mail, datas, gênero, CEP, UF, situação, responsável legal, ou valor, etapa, responsável e procedimento do card) ou citado pelo nome sem achar um só (comparado sem acento nem maiúscula) vira aviso: a linha entra sem ele e diz por quê. A prévia e o resultado mostram as recusadas e as que entraram com aviso.
- Fonte: princípio 2
- Onde: `docs/regras/crm-inbox.md:804`, `:907`, `:1736`
- Antes: KC-26, KC-48, KE-66

**IM-10.** De quem já existe, só se completa o que está vazio (inclusive as datas e o responsável legal) e as tags se juntam: as da planilha se somam às que a ficha já tem, sem tirar nenhuma, também na linha que completa a ficha. Nada do que a rede tem é trocado, então importar de novo é seguro. A coluna de situação (ativo/inativo) só vale para quem é criado agora.
- Fonte: decisão do Claude; a tag na linha que completa a ficha: decisão do Claude, 26/11 (31ª simulação) — quem põe a tag é a rede, na planilha, e a prévia mostra a coluna mapeada (IM-16): não é o sistema pondo tag sozinho
- Onde: `docs/regras/crm-inbox.md:809`, `:833`, `:1010`
- Antes: KC-27, KC-35

### O arquivo, o telefone e quem já existe

**IM-11.** O arquivo é CSV em UTF-8 ou Windows-1252, separado por ponto e vírgula, vírgula ou tabulação, até 5 MB e 10 mil linhas; a coluna de cada campo é sugerida pelo cabeçalho, e vale o arquivo escolhido antes de a tela terminar de carregar. O servidor confere cada linha pela regra da prévia. Quem já existe se acha assim: a cliente pelo CPF, senão pela ficha sem CPF com o mesmo telefone; o contato pelo telefone exato, senão pelo e-mail; o celular com e sem o nono dígito.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:762`, `:818`, `:829-834`
- Antes: KC-30, KC-31, KC-34, KC-36

**IM-12.** A prévia diz o que vai acontecer: quem cada linha encontra na rede e por quê ("completa a ficha de X (o mesmo CPF)"), a linha que repete o telefone de outra, quem entra sem telefone e as colunas que ficaram em "Não importar". O botão diz o que entra ("Importar 10 linhas: 9 contatos novos, 1 linha junta com outra"; só "Importar N linhas" quando todas são novas), com o ponto do milhar ("1.235"). A prévia mostra o destino de CADA linha ("ficha nova", "completa a ficha de X (o mesmo CPF)", "junta com a linha N", "contato novo, sem telefone"), pela mesma conta do botão; a lista abre com 10 e cresce de 50 em 50 ("Mostrar mais").
- Fonte: princípio 3; o destino de cada linha: decisão do Claude, 26/11 (33ª simulação, A13), pelo princípio 3; o ponto do milhar: decisão do Claude, 27/11 (40ª simulação, A1 e D13)
- Onde: `docs/regras/crm-inbox.md:839`, `:850`, `:877`, `:1236-1246`
- Antes: KC-37, KC-39, KC-43; antes de 26/11: a prévia mostrava só as três primeiras linhas, sem o destino

**IM-13.** Quando a ficha sem CPF seria completada pelo telefone, a prévia mostra "Completar a ficha de X": marcada se o nome da linha casa com o da ficha, desmarcada se não casa. Desmarcada, a linha vira ficha nova; marcada, completa a ficha. Pelo mesmo CPF, a linha sempre junta.
- Fonte: o Heitor, 25/11: "Vem desmarcada, a não ser que o nome case"
- Onde: `docs/regras/crm-inbox.md:844-849`
- Antes: KC-38

**IM-14.** O contato entra só com o telefone, só com o e-mail ou com os dois (a oportunidade vai para essa pessoa); a linha sem nenhum é recusada, e a ficha exige o telefone. Nos contatos, o telefone repetido junta as linhas numa pessoa só: a segunda completa o que ficou vazio e junta as tags, mas ficam o nome e o e-mail da primeira, e a prévia avisa qual e-mail se perde.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:854-873`
- Antes: KC-40, KC-41

**IM-15.** Nas fichas, duas linhas com o mesmo telefone e nomes diferentes mostram a caixa "Juntar Karina com Bianca", desmarcada: cada linha vira uma ficha, com o mesmo telefone; marcada, só completa a ficha da primeira (o Heitor, 25/11: "Vem desmarcada, a não ser que o nome case"). Linhas com o mesmo nome são "Repetida na planilha" e recusadas. Nos contatos não há escolha: um telefone é uma pessoa, e a prévia diz qual nome fica e orienta importar como clientes quando forem duas pessoas.
- Fonte: princípios 1 e 3; a caixa desmarcada: o Heitor, 25/11
- Onde: `docs/regras/crm-inbox.md:866`, `:883-891`
- Antes: KC-44, KC-45

### O que nasce e o que a tela conta

**IM-16.** A cliente nova da importação vem só com as tags da planilha, ganha a conta de fidelidade e nasce sem acesso ao portal (o acesso se cria na ficha). A importação de clientes não cria contato do CRM: a ficha se liga à pessoa quando a conversa começar.
- Fonte: decisão do Claude; a tag da planilha entra no catálogo: o Heitor, 2026-11-27, R38: "Entra na lista: importar é a rede criando a tag (como está)"
- Onde: `docs/regras/crm-inbox.md:899`
- Antes: KC-46

**IM-17.** A importação não dispara automação nenhuma (uma planilha não vira mil mensagens de boas-vindas).
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:904`, `:1735`
- Antes: KC-47, KE-65

**IM-18.** O relatório ("Baixar o relatório", CSV com Linha; Nome; Situação; Motivo) traz as recusadas e as que entraram com aviso, com a linha da planilha, e vale 7 dias, também quando a importação falha. O placar soma o total de linhas, com "com aviso" como parte das que entraram, e os números vão com o ponto do milhar ("1.250 linhas"). No fim, a importação diz onde estão os importados (Clientes, o quadro do funil, ou "Contatos do CRM" na busca), e a linha que juntou com quem já existe diz em quem entrou e o que ficou de fora.
- Fonte: princípio 3; o ponto do milhar: decisão do Claude, 27/11 (40ª simulação, D13), como no botão (IM-12)
- Onde: `docs/regras/crm-inbox.md:925-947`, `:1042`
- Antes: KC-49, KC-51, KC-52, KC-53

**IM-19.** A importação roda em segundo plano: interrompida, "Tentar de novo" continua de onde parou; se o envio do arquivo falha no meio, a importação inteira é apagada (não se importa meio arquivo em silêncio); uma falha passageira ao gravar o andamento é tentada mais duas vezes antes de virar "Falhou".
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1024`
- Antes: KC-54

### A migração de outro sistema

**IM-20.** A coluna "Cliente desde" (aceita "03/2021" e "2019") vale: a ficha, o cabeçalho do atendimento e o pacote LGPD mostram "Cliente desde" por ela (sem ela, a data do cadastro), e a ficha que já era cliente antes de um mês não conta como cliente nova dele, nem no selo "Novo" (calculado, não tag). Sem essa coluna, a prévia avisa que as fichas novas contam como novas a partir de hoje — também quando a coluna está na planilha e ficou em "Não importar".
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-06: "concordo"; a coluna em "Não importar": decisão do Claude, 27/11 (40ª simulação, D11), pela própria IM-20
- Onde: `docs/regras/crm-inbox.md:955-984`, `:1738-1739`
- Antes: KC-55, KC-56, KC-59, KE-68

**IM-21.** A "Última visita" de antes do sistema não vira atendimento (nem agendamento, prontuário, receita ou comissão). Ela conta onde a tela pergunta quando a cliente veio por último ("Reativar clientes", o público "sem retorno" das campanhas, a "Última visita" da lista), valendo a mais recente entre ela e a do sistema; a ficha que só a tem, sem "Cliente desde", conta como cliente de antes.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-06: "concordo"
- Onde: `docs/regras/crm-inbox.md:972-979`, `:1737`
- Antes: KC-57, KC-58, KE-67

**IM-22.** A coluna "Pacote de antes" ("procedimento; total; usadas", com valor de referência e validade opcionais, vários separados por "|") cria o pacote trazido de fora na unidade da linha ou na da tela; só se oferece a quem tem o Financeiro em Gerenciar, não traz o mesmo pacote duas vezes e deixa de fora, com o motivo, o que não se entende e o acima de 32.767 sessões (o limite do registro; sem o teto de 200 de antes — o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; o número é decisão do Claude). A prévia mostra o formato e as três primeiras linhas e avisa quantos pacotes estão sem valor de referência (neles a comissão de execução em percentual é R$ 0 — a de R$ fixo por sessão é paga — e eles não entram na receita). O Histórico do app mostra o que veio de antes ("Antes do sistema — 5 sessões de…"), sem virar atendimento.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-06: "concordo"
- Onde: `docs/regras/crm-inbox.md:989-1013`
- Antes: KC-60, KC-61, KC-63

**IM-23.** O responsável legal da planilha só é gravado na menor, pelo nascimento que a ficha passa a ter; na adulta aparece o aviso "Responsável legal não gravado". A menor que fica sem responsável é avisada na prévia e no resultado, mas não é barrada.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-06: "concordo"
- Onde: `docs/regras/crm-inbox.md:1004`
- Antes: KC-62

## Contato, conversa e inbox (IN)

### A pessoa, a conversa e a ficha

**IN-01.** A pessoa é o "Contato" e o card no funil é a "Oportunidade": são coisas diferentes, e a mesma pessoa pode ter várias oportunidades ao longo da vida. A palavra "lead" não aparece em nenhum texto que se lê (tela, aviso, erro, linha do tempo, relatório, importação, atribuição de anúncio, Copilot).
- Fonte: o Heitor, 2026-11-13: "leads e oportunidades sao entidades diferentes, pq lead é a pessoa, a pessoa pode ao longo da vida ter varias oportunidades ligadas ela, não?"
- Onde: `docs/revisao.md:838-842`, `:878`, `docs/regras/crm-inbox.md:1051`, `:1731`
- Antes: KD-01, KE-46, KF-13, KF-14

**IN-02.** São quatro coisas: o contato (a pessoa, um por rede), as conversas dela (uma por canal e caixa), as oportunidades dela (várias) e a ficha de cliente (no máximo uma por pessoa na rede). O contato não vira cliente sozinho: a ficha só nasce quando alguém cadastra. O contato sem conversa e sem oportunidade (o importado sem card) aparece na busca universal em "Contatos do CRM", e abri-lo cria a oportunidade dele no quadro.
- Fonte: o Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/revisao.md:849`, `:881`, `docs/regras/crm-inbox.md:1074`, `:1120`, `:1142`
- Antes: KD-04, KD-05, KD-10, KF-16

**IN-03.** A mesma pessoa falando por dois números ou dois canais é um contato só sempre que há um identificador em comum (o telefone ou o do canal); dois telefones só são a mesma pessoa com o número inteiro igual, nunca por terminarem igual. Sem identificador em comum (Instagram e WhatsApp), a pessoa pode ter dois contatos, os dois ligados à mesma ficha. O contato sabe a ficha dele e, ligado a uma, não é religado a outra.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1083`, `:1123-1135`, `:1755`
- Antes: KD-06, KD-09, KE-44

**IN-04.** A conversa que chega pelo telefone de exatamente UMA ficha ativa da rede se liga sozinha a essa ficha (e o contato também), e as tags se juntam; com zero ou duas ou mais fichas no mesmo telefone, não liga e fica para a equipe. Só o telefone conta (nem e-mail nem nome), e o contato que já é de outra ficha nunca é religado.
- Fonte: o Heitor, 2026-11-18: "sim, liga sozinha quando bater com uma ficha só"
- Onde: `docs/regras/crm-inbox.md:1090-1098`, `:1721-1722`
- Antes: KD-07, KE-51

**IN-05.** E-mail e rede social são da pessoa: a importação os grava no contato (só se estiver vazio), mesmo sem oportunidade, e o painel do inbox os mostra e edita; a oportunidade tem a sua cópia, editada no card, e uma não muda a outra. O "Cadastrar cliente" do inbox vem com o e-mail da pessoa e, sem ele, com o da oportunidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1146-1152`
- Antes: KD-11, KD-12

**IN-06.** Nome e telefone são da pessoa. Editar no painel do inbox ou no card leva o NOME à pessoa, a todas as conversas e oportunidades dela; o TELEFONE vai à pessoa, às conversas com o mesmo número antigo ou sem número (conversa com outro número é outro WhatsApp dela) e a todas as oportunidades, cada uma registrando o de → para na linha do tempo. Renomear a ficha (aba Dados ou Copilot) leva o nome às pessoas ligadas. A tela mostra o nome da PESSOA, não a cópia guardada na conversa; o telefone da conversa é o destino dela.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1640-1660`
- Antes: KE-40, KE-41, KE-42

**IN-07.** A atribuição do anúncio é da conversa: guarda o último anúncio pelo qual a pessoa voltou naquela conversa (não existe "primeira origem" do contato). O anúncio de uma cliente (o que vai com a compra para a API de Conversões) é o da conversa mais recente que TEM anúncio.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1178-1183`, `:1726`
- Antes: KD-14, KD-15, KE-52

### A fila e o painel

**IN-08.** O inbox junta numa fila só as conversas de WhatsApp (os números da rede), Instagram e Messenger, com filtros por número, responsável, etapa, tags e não lidas. No menu, o CRM fica em Vendas → Inbox e Oportunidades; o funil e as origens se montam em Configurações.
- Fonte: o Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/revisao.md:847`, `:852`, `:881`
- Antes: KF-17, KF-30

**IN-09.** A fila do inbox é de CONVERSAS: a mesma pessoa em duas caixas são duas linhas, cada uma com o nome da caixa quando a rede tem mais de uma. As conversas da pessoa se juntam no painel, não na fila.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:1213`, `:1718`
- Antes: KD-20, KE-50

**IN-10.** A fila carrega de 30 em 30 e busca a próxima leva ao chegar no fim; filtro, busca e as opções dos menus de filtro alcançam a rede inteira, não só as conversas carregadas. A contagem "N aguardando resposta" também: é a das conversas ao alcance da pessoa (as caixas do cargo, IN-15), contada no servidor, não a das carregadas. Quando chega mensagem nova, recarrega a mesma quantidade, com os filtros de agora. Na conversa, os separadores de dia seguem o dia de Brasília.
- Fonte: decisão do Claude; a contagem do "aguardando": decisão do Claude, 27/11 (D6 da 38ª), pela própria IN-10 e pelo princípio 3
- Onde: `docs/regras/crm-inbox.md:1190-1199`, `:1261`
- Antes: KD-16, KD-17, KD-18, KD-27

**IN-11.** O filtro "Número de WhatsApp" mostra as conversas de um ou de vários números ao mesmo tempo (as escolhas se acumulam), incluindo o número removido, cujas conversas continuam no inbox.
- Fonte: o Heitor (r3-f14-11, sem data no texto): "a recepção que cuida de dois números vê os dois juntos"
- Onde: `docs/regras/crm-inbox.md:1203`
- Antes: KD-19

**IN-12.** No inbox se responde com texto, anexo, resposta rápida (cada pessoa tem as suas) e, fora das 24 horas, com modelo do WhatsApp oficial.
- Fonte: o Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/revisao.md:854`, `:881`
- Antes: KF-18

**IN-13.** Ao lado da conversa fica o painel da pessoa: nome, telefone, e-mail, rede social, tags, as oportunidades, as outras conversas dela (só as das caixas que o cargo vê; clicar abre aquela) e os botões "Agendar", "Cadastrar cliente" e "Nova conversa".
- Fonte: o Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/revisao.md:856`, `:881`, `docs/regras/crm-inbox.md:1219`
- Antes: KF-19, KD-21

**IN-14.** O inbox não se recorta por dono: quem tem o CRM em Ver vê as conversas de todas as caixas que o cargo vê. Quem quer ver só as suas usa o filtro de responsável (no inbox e no quadro).
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem, no crm acho que não se aplica diretamente e talvez o melhor caminho seja pelo filtro de dono da oportunidade, quem quer ver só as oportunidades que é dono, aplica o filtro"
- Onde: `docs/regras/crm-inbox.md:1270`, `docs/revisao.md:1293`, `:2216`
- Antes: KD-29, KF-25

**IN-15.** Quais números de WhatsApp o cargo vê no inbox é do cargo: todos (o padrão) ou só os números a que a pessoa está ligada. Sem número ligado, ela não vê WhatsApp nenhum; conversa sem caixa (Instagram, Messenger) aparece sempre. Ligar a pessoa a um número decide por onde ela envia; esta escolha decide o que ela vê.
- Fonte: o Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/regras/crm-inbox.md:1273`, `docs/revisao.md:866`, `:881`
- Antes: KD-30, KF-27

**IN-16.** Se der erro ao conferir o que a pessoa pode ver, o inbox não mostra nada (nunca tudo). A conversa fora do alcance (sem o CRM em Ver ou de caixa que o cargo não vê) também não abre pelo endereço ou pelo id: o sistema responde como se ela não existisse.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1280-1281`
- Antes: KD-31, KD-32

**IN-17.** O "Vender" do inbox leva ao PDV.
- Fonte: decisão do Claude
- Onde: `docs/revisao.md:870`, `:1981`
- Antes: KF-29

**IN-18.** A resposta que não saiu não é resposta. A mensagem enviada pela rede que o provedor não aceitou fica na conversa como "Não enviada", com o motivo em português (WM-06 do catálogo de WhatsApp), o "Tentar de novo" e o número por onde tentou sair (WL-06). Ela não tira a conversa do "aguardando" nem conta como 1ª resposta: a conversa segue aguardando desde a mensagem da cliente, e a 1ª resposta conta quando uma mensagem é de fato aceita pelo provedor (também a do "Tentar de novo" que dá certo, no momento em que dá certo). A não enviada também não conta como a última da conversa: a prévia da lista e a "Última interação" contam só o que saiu ou chegou (ou a prévia a marca como não enviada, como a bolha). A mensagem que não saiu é UMA na conversa: o "Tentar de novo" e o reenvio automático de uma automação reenviam a mesma mensagem, sem bolha nova a cada tentativa; a execução da automação registra cada tentativa.
- Fonte: decisão do Claude, 26/11 (32ª simulação, Decisão A); a prévia, a "Última interação" e o reenvio automático: decisão do Claude, 27/11 (D2, A6 e A7 da 38ª), pela própria IN-18 e pelo princípio 3 — pelo princípio 3: a fila não pode dizer que respondeu quem não recebeu nada (D2 da 32ª: a resposta falhada tirava a conversa do "aguardando" e contava como 1ª resposta); o "Tentar de novo": o Heitor, 26/11, página de perguntas (R11): "Está no escopo: o botão 'Tentar de novo' na bolha que não saiu"
- Onde: `docs/regras/crm-inbox.md`, "Correções de 26/11 no inbox e no CRM" ("A resposta que não saiu não conta" e "'Tentar de novo' na bolha que não saiu"); WL-06, WM-06 e WH-07 do catálogo de WhatsApp; `apps/web/components/admin/crm-inbox.tsx`, `apps/web/lib/inbox/reenviar.ts`, `apps/web/actions/inbox.ts` (`reenviarMensagem`)
- Estado: implementada (26/11; prova `tests/inbox-tentar-de-novo.test.ts`, `e2e/mensagens-saida.spec.ts`)
- Antes: (nova, 26/11)

## Oportunidades, funis e quadro (OP)

### A oportunidade e quem mexe nela

**OP-01.** O quadro mostra um funil por vez, com as etapas em colunas; o card se arrasta de etapa, e o menu "…" move de etapa ou de funil. O card tem responsável, origem (da lista da rede), valor, procedimentos, "Retornar em" com o que fazer, observações e a linha do tempo (inclusive o que a cliente ligada fez); dele se agenda, se vai para a conversa e se marca ganho ou perdido (com motivo da lista da rede).
- Fonte: o Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/revisao.md:859-860`, `:881`
- Antes: KF-20, KF-21

**OP-02.** O gesto de virar cliente tem um nome só, nos dois portais e no inbox: o botão "Cadastrar cliente" abre "Cadastrar como cliente" (nunca "Converter"), para quem tem Clientes em Gerenciar.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "pode ser"
- Onde: `docs/regras/crm-inbox.md:1064-1066`, `:1732`, `docs/revisao.md:879`, `:2062`
- Antes: KD-02, KE-47, KF-15

**OP-03.** Mover os cards, criar e editar oportunidades é de quem tem o CRM em Gerenciar. Quando duas pessoas movem o mesmo card ao mesmo tempo, as duas mudanças se gravam em ordem no histórico e vale a última, sem aviso; cada tela mostra a etapa final no sinal seguinte.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele); os dois movimentos ao mesmo tempo: decisão do Claude, 27/11 (35ª, Decisão C1)
- Onde: `docs/regras/crm-inbox.md:1411`
- Antes: KE-02

**OP-04.** Toda ação sobre uma oportunidade (inclusive fora do CRM, como agendar ou cadastrar cliente a partir do card) pede o CRM em Ver e as oportunidades no plano; Clientes em Gerenciar sozinho não dá acesso a card nem a conversa.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1292`
- Antes: KD-34

**OP-05.** A oportunidade é da PESSOA, não da conversa: o inbox, o card, o histórico e a checagem de duplicata olham as oportunidades do contato, e o card mostra a atividade de todas as conversas dela. A oportunidade nova de quem já tem ficha nasce ligada ao contato dessa ficha; a criada à mão se liga à pessoa da conversa de origem, senão à do telefone, senão nasce uma pessoa nova (o telefone nacional digitado vira o do WhatsApp, com o 55; o com "+" fica como veio).
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1102`, `:1226-1232`
- Antes: KD-08, KD-22, KD-23

**OP-06.** A "Nova oportunidade" com o telefone de uma ficha ativa pergunta, junto ao telefone e antes do clique, "Este telefone é da ficha de X. É a mesma pessoa?" ("de uma cliente da rede", sem o nome, para quem não tem Clientes em Ver). "Sim, é ela" liga à ficha; "Não, é outra pessoa" nasce sem ficha; sem resposta, "Criar oportunidade" não envia e diz o que falta. A pessoa que veio da busca não é perguntada.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:171-179`
- Antes: KA-36, KA-37

**OP-07.** A oportunidade não se apaga: a que não vai adiante é marcada perdida, e não há botão nem ação de apagar; o histórico dela fica. A pessoa que tem oportunidade também não se apaga.
- Fonte: o Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/revisao.md:864`, `:881`, `docs/regras/crm-inbox.md:1265-1266`, `:1730`
- Antes: KD-28, KE-45, KF-23

### O responsável

**OP-08.** O dono da oportunidade se chama "Responsável" em toda tela e no histórico, nunca "Dono". A oportunidade nasce com quem a cria como responsável (a janela já abre com ele, e a escolha da pessoa não é trocada pelo que chega depois); o campo lista os membros ativos da rede e "Sem responsável", e o card mostra as iniciais.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:1314-1320`, `:1741`
- Antes: KD-36, KD-37, KD-38, KE-48

**OP-09.** Quem tem o CRM em Gerenciar troca o responsável de qualquer oportunidade ao alcance; quem não tem e tenta não muda nada. A troca, pela tela ou pela automação "Definir responsável", só aceita membro ativo da rede, e a linha do tempo diz de quem para quem.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem"
- Onde: `docs/regras/crm-inbox.md:1330-1333`, `:1742`, `docs/revisao.md:1287`, `:2214`
- Antes: KD-39, KD-40, KE-49, KF-26

**OP-10.** Ao desativar um membro, o sistema oferece repassar as oportunidades abertas dele a outra pessoa com o CRM (qualquer uma da rede, mesmo a de uma unidade só: a oportunidade é da rede) ou deixá-las "Sem responsável"; o padrão é não repassar, e a janela diz antes o que fica com ele. O filtro "Responsável" do quadro marca "(inativo)" quem foi desativado e ainda responde por algum card.
- Fonte: princípio 6; quem é de uma unidade só: decisão do Claude, 27/11 (36ª, Decisão B), pelo `leadAoAlcance` (a rede e o CRM)
- Onde: `docs/regras/crm-inbox.md:1337`
- Antes: KD-41

### Funis e etapas

**OP-11.** Montar o funil é só da Admin da rede: criar, renomear, reordenar, arquivar e apagar funis e etapas, o funil padrão, a cor e o desfecho da etapa, os motivos de perda e as origens. Para mais ninguém aparece o "Configurar funis" (nem no quadro nem na busca universal), e o quadro diz: "Funis e etapas são da rede toda: quem muda é a Admin da rede."
- Fonte: o Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin"
- Onde: `docs/regras/crm-inbox.md:1406-1418`, `:1523`
- Antes: KE-01, KE-03

**OP-12.** A rede nova nasce com um funil com as etapas Novo, Em contato, Avaliação, Em negociação, Agendado, Fechado e Perdido; as redes que já existiam não mudaram.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele)
- Onde: `docs/regras/crm-inbox.md:1372-1374`
- Antes: KD-47

**OP-13.** O funil criado na janela abre selecionado, com as etapas iniciais (Novo, Em andamento, Ganho e Perdido), e diz que se podem renomear, remover ou acrescentar. O quadro abre no funil do endereço; sem ele, no último escolhido NESTE navegador; sem ele, no padrão — e, se o padrão está vazio, no primeiro funil com oportunidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1423-1428`
- Antes: KE-04, KE-06

**OP-14.** O campo "Etapa" da janela da oportunidade lista só as etapas do funil do card; mudar de funil é pelo "Mover para outro funil" do menu do card. A etapa aberta nova ("+ Etapa") entra antes das de fechamento (Ganho/Perdido); a de fechamento nova vai para o fim; arrastar continua mudando a ordem.
- Fonte: princípio 7
- Onde: `docs/regras/crm-inbox.md:1361-1366`
- Antes: KD-45, KD-46

**OP-15.** Toda exclusão de etapa pergunta antes ("Excluir a etapa “X”? Não dá para desfazer."). Etapa ou funil com oportunidades não se exclui, e a pergunta já diz isso ("Mova-as para outra etapa no quadro antes de excluir."); nela, "Mover as N para [etapa]" leva as oportunidades a outra etapa do mesmo funil (a perdida não é oferecida), e, movidas todas, volta o "Excluir a etapa". Arquivar um funil com oportunidades abertas também pergunta antes, e não recusa: diz quantas ficam abertas nele e que elas saem do quadro e dos relatórios (FO-02 dos Indicadores; e da busca, BA-04) até o funil ser reativado ("Reativar funil").
- Fonte: princípio 3; arquivar o funil com oportunidades abertas: decisão do Claude, 25/11 (o Heitor revisa), por esta regra (a etapa com oportunidades pergunta) e pelo princípio 7; arquivar é da Admin da rede (OP-11), e por isso não se recusa (A3 da 30ª simulação: as oportunidades saíam do quadro e dos relatórios em silêncio, 13 no banco e 11 na tela)
- Onde: `docs/regras/crm-inbox.md:1442-1453`; a pergunta do arquivar entra em `docs/regras/crm-inbox.md` com a correção da A3 (25/11); `apps/web/components/branch/crm-stage-settings.tsx` (o botão "Arquivar funil")
- Antes: KE-08, KE-10, KE-11

**OP-16.** Tirar do funil a ÚLTIMA etapa de perda (excluir ou mudar o desfecho) avisa, não recusa: "Este funil fica sem etapa de perda…", com "Excluir mesmo assim" / "Mudar mesmo assim".
- Fonte: princípio 2
- Onde: `docs/regras/crm-inbox.md:1437`
- Antes: KE-09

### O quadro

**OP-17.** O quadro tem um resumo e o filtro "Já é cliente / Ainda não é cliente", que olha só se a oportunidade tem ficha ligada (não a etapa nem o ganho/perdido). A conversão do resumo é das oportunidades na etapa de ganho sobre as do funil (abertas, ganhas e perdidas), e ele diz essa base; sem etapa de ganho, "—". O "N perdidos" leva à coluna dos perdidos.
- Fonte: o Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/revisao.md:865`, `:881`, `docs/regras/crm-inbox.md:1346`, `:1616`
- Antes: KF-24, KD-42, KE-37

**OP-18.** O filtro de período tem "Personalizado" (De/Até), que só filtra ao aplicar e compara o dia da criação no fuso do negócio. Com filtro que esconde cards, o quadro diz o recorte ("Mostrando 2 de 3 oportunidades: os números do topo são do funil inteiro."); com filtro que não esconde nenhum, não há recorte a dizer, e o "Limpar N" já diz que há filtro. A idade do card ("hoje", "ontem", "há N dias") conta dias do calendário de Brasília.
- Fonte: princípio 3; o filtro que não esconde card: decisão do Claude, 28/11 (41ª simulação, Decisão 8), pela própria OP-18
- Onde: `docs/regras/crm-inbox.md:1355-1358`, `:1628`
- Antes: KD-43, KD-44, KE-38

**OP-19.** O card se ganha ou perde sem rolar até as colunas de desfecho: o menu tem "Marcar como ganho (Fechado)" e "Marcar como perdido (Perdido)", e arrastando aparece "Soltar em Fechado / Soltar em Perdido". O menu tem também "Mover para a etapa" (as outras etapas abertas; recusado, o card volta e a tela diz por quê) e "Agendar".
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1633`, `:1683`
- Antes: KE-17, KE-18

### O card não anda sozinho

**OP-20.** Nenhum fato (agendar, concluir o atendimento, pagar, conversa nova, cadastrar cliente) muda a etapa. Quem move é a pessoa (arrastar, painel do inbox, janela, Copilot a pedido dela) ou uma automação que a rede ligou ("Mover de etapa", "Marcar ganho/perdido"). Agendar só registra na linha do tempo; quem quiser o movimento usa o modelo de automação "Agendou: o card muda de etapa".
- Fonte: o Heitor, 2026-11-03: "nenhum card se movimenta sozinho, toda e qualquer automação deve ser feita através dos módulos de automações"
- Onde: `docs/regras/crm-inbox.md:1383-1394`, `docs/revisao.md:864`
- Antes: KD-48, KF-22

**OP-21.** Mover à mão uma oportunidade de um jeito que dispararia automação ligada pergunta antes: "Mover dispara a automação “X”. Disparar?". "Sim" move e dispara; "Não" move e registra o movimento, sem rodar a automação; fechar a janela não move. Vale em todo jeito de mover pela tela (arrastar, "Mover as N", o menu do card, "Mover para outro funil", o painel do inbox, a etapa no modal); indo para a perdida, vem antes do "Por que perdeu?".
- Fonte: o Heitor, 2026-11-17: "se mover os cards manualmente dispararia automacoes, perguntar se deseja disparar ou nao" (e, 2026-11-18: "Também ao arrastar um")
- Onde: `docs/regras/crm-inbox.md:1459-1467`
- Antes: KE-12, KE-13

**OP-22.** O Copilot, ao mover a pedido da pessoa, também pergunta ("Disparar" ou "Não disparar"); se uma automação passou a disparar entre o cartão e o "Confirmar", ele não move e pede para refazer. Só as próprias automações movem sem perguntar.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1479`
- Antes: KE-14

**OP-23.** A pergunta só cita a automação que de fato dispararia: ligada, que reage àquele movimento (ou ao ganho/perda) e cujo gatilho casa com o funil, a etapa de destino e os filtros (no "Mover as N", basta uma casar). Sem as Automações no plano, na sessão de suporte ou com o card já na etapa, não pergunta. Mudar a etapa pelo modal conta como movimento para a automação.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1488-1497`
- Antes: KE-15, KE-16

### Ganho, perda, origem e compra

**OP-24.** Levar a oportunidade à etapa perdida pela tela (arraste, painel do inbox, modal) pergunta "Por que perdeu?": um motivo da lista da rede e uma observação opcional; sem motivo, não grava, e o botão diz "Escolha o motivo da perda" (não fica apagado). A janela diz de qual oportunidade é (nome, procedimentos e, com mais de um funil, o funil).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "o resto fica como está"
- Onde: `docs/regras/crm-inbox.md:1502`, `:1528-1536`, `docs/revisao.md:863`, `:881`
- Antes: KE-19, KE-25, KE-26

**OP-25.** A lista de motivos de perda é da rede, em Configurar funis → "Motivos de perda"; desativar tira da escolha sem apagar. A rede nova nasce com Preço, Sem retorno, Fechou com a concorrência, Sem horário que sirva, Desistiu e Outro ("Outro" sempre por último). Relatórios → Comercial → "Motivos de perda" conta as perdas pela data em que foram perdidas, no período, da rede inteira, e o quadro filtra por "Motivo da perda".
- Fonte: princípio 1
- Onde: `docs/regras/crm-inbox.md:1504`, `:1517`, `:1530-1534`
- Antes: KE-20, KE-23

**OP-26.** O Copilot e as automações levam à perdida sem perguntar o motivo: conta como "Sem motivo" no relatório. Sair da etapa perdida apaga o motivo, a observação e a data da perda (a linha do tempo guarda o histórico). O card perdido diz o motivo ("Perdida: Preço"; sem motivo, "sem motivo informado").
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1512-1520`
- Antes: KE-21, KE-22, KE-24

**OP-27.** As origens da oportunidade são uma lista da rede, em Configurar funis → "Origens das oportunidades"; desativar tira da escolha sem apagar. A rede nasce com Meta Ads, Google Ads, Orgânico, Instagram, Indicação, WhatsApp, Telefone, Site, Evento e Outro. O modal, o painel do inbox, o Copilot e a importação oferecem as da rede; a origem do anúncio continua vindo da atribuição.
- Fonte: princípio 1
- Onde: `docs/regras/crm-inbox.md:1542-1547`
- Antes: KE-27

**OP-28.** O card diz o próximo agendamento marcado da cliente ligada ("Agendado 06/11 10:30").
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1564`
- Antes: KE-28

**OP-29.** Quando a cliente ligada COMPROU depois de a oportunidade nascer e o card segue aberto, o card diz "Comprou Pacote X. A oportunidade segue aberta." com "Mover para Fechado". É só sugestão: quem move é a pessoa, no botão.
- Fonte: o Heitor, 2026-11-02: "não existe movimento automático padrão nos funis; caso queiram, podem fazer isso através do módulo de automações com as regras que quiserem…"
- Onde: `docs/regras/crm-inbox.md:1564-1573`
- Antes: KE-29

**OP-30.** Para o CRM, "comprou" é o pacote vendido (não o trazido de fora), o pré-pago e o plano no PRIMEIRO recebimento — não no aceite. O card da cliente que comprou mostra o valor VENDIDO ("R$ 8.400,00 vendido": o pacote menos o cancelado, o pré-pago, os procedimentos vendidos do plano menos o cancelado), não o preço do procedimento de interesse.
- Fonte: o Heitor, 2026-11-18: "Uma coisa só foi vendida se foi paga."
- Onde: `docs/regras/crm-inbox.md:1568-1571`, `:1689`
- Antes: KE-30, KE-31

**OP-31.** "Marque o ganho" é um modelo das Automações, que nasce desligado: quando a cliente ligada compra com a oportunidade aberta e criada antes, avisa quem cuida dela — uma vez por oportunidade e por compra. Nada fora das Automações manda esse aviso.
- Fonte: o Heitor, 2026-11-03: "nenhum card se movimenta sozinho, toda e qualquer automação deve ser feita através dos módulos de automações"
- Onde: `docs/regras/crm-inbox.md:1394`, `:1596`
- Antes: KE-32

### O lembrete de retorno

**OP-32.** A oportunidade tem "Lembrete de retorno": "Retornar em" (o dia) e "O que fazer no retorno", na "Nova oportunidade" e na edição. O quadro diz "Retornar 12/11", "Retornar hoje" (em aviso) ou "Retorno atrasado (10/11)". No card ganho ou perdido, o lembrete não fica em destaque, como o sino não avisa (OP-33).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "o resto fica como está"; o card ganho ou perdido sem destaque: decisão do Claude, 27/11 (35ª, Decisão C2), pela OP-33 e pelo princípio 3
- Onde: `docs/regras/crm-inbox.md:1577`, `docs/revisao.md:861`, `:881`
- Antes: KE-35

**OP-33.** No dia do retorno, o RESPONSÁVEL recebe aviso no sino ("Retorno de hoje: X" a partir das 7h de Brasília, ou "Retorno atrasado: X (10/11)"), com "Abrir", que leva ao card. Um aviso por dia marcado (trocar a data vale de novo); card ganho ou perdido não avisa; sem responsável, ninguém é avisado. O lembrete nunca move o card. O aviso sai pela rotina de hora em hora: o retorno marcado antes das 7h chega na primeira passada das 7h; o marcado depois, na passada seguinte (até 1 h).
- Fonte: decisão do Claude; a hora em que o aviso chega: decisão do Claude, 27/11 (36ª, Decisão D)
- Onde: `docs/regras/crm-inbox.md:1575-1610`
- Antes: KE-36

### Agendar e conversar pelo CRM

**OP-34.** O card (nos dois portais) e o painel do inbox têm "Agendar", com a mesma janela: vem com o nome e o telefone da oportunidade, já com o primeiro procedimento de interesse que a unidade oferece (sem interesse, a avaliação da unidade; a tela diz de onde veio, e a pessoa troca à vontade), a ficha nasce ligada ao card, o agendamento conta como comercial e a linha do tempo registra. Agendar pelo CRM pede o CRM em Gerenciar e a Agenda em Gerenciar: quem não marca horário na Agenda não marca pelo CRM.
- Fonte: princípio 3
- Onde: `docs/regras/crm-inbox.md:1242-1247`, `:1671`
- Antes: KD-24, KD-25, KE-33

**OP-35.** O "Agendar" do inbox e do card escolhe a unidade numa caixa de seleção simples: com duas ou mais unidades ela vem vazia ("Selecione a unidade…"); com uma, já vem escolhida e a caixa nem aparece. As unidades são as da pessoa (com "A rede inteira", todas as ativas), nos dois portais: quem tem duas ou mais tem a caixa também no portal da unidade, e não fica presa à unidade do endereço. A tag não escolhe unidade.
- Fonte: o Heitor, 2026-11-13: "coloca uma caixa de seleção para a unidade, simples."; as unidades da pessoa nos dois portais: decisão do Claude, 28/11 (41ª simulação, D2), pela própria OP-35
- Onde: `docs/revisao.md:472`, `:870`, `:1959`, `docs/regras/crm-inbox.md:369`, `:1252`
- Antes: KA-68, KB-09, KD-26, KF-28

**OP-36.** O "Abrir a conversa" do card abre a mais recente entre as conversas que o cargo vê; se a pessoa só tem conversas de números que o cargo não vê, a tela diz isso e não abre nem cria outra. Sem conversa com a pessoa e sem WhatsApp conectado na rede, "Ir para a conversa" não cria conversa: diz "Ainda não há conversa com X, e a rede não tem um WhatsApp conectado…", com o caminho.
- Fonte: decisão do Claude
- Onde: `docs/regras/crm-inbox.md:1286`, `:1621`
- Antes: KD-33, KE-34

**OP-37.** O valor estimado da oportunidade recusa só o ilegível, o negativo e o que o registro não guarda — acima de R$ 9.999.999.999,99 ("No máximo 9.999.999.999,99 reais (o limite do registro).") —, na janela (criar e editar) e no núcleo que o Copilot e a importação chamam.
- Fonte: o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."; o limite (o tipo da coluna, numeric(12,2)) é decisão do Claude, 25/11
- Onde: `docs/regras/crm-inbox.md` ("Correções de 25/11 no card e nos funis"); `apps/web/lib/crm/valor-do-card.ts`
- Antes: o erro do banco, em inglês

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Fica na página só a Q12 (a automação pode tirar uma tag?): a sua fala de 13/11 aceita as duas leituras. As outras se resolveram por uma regra dele, um princípio ou a lógica do contexto; cada uma diz como, no começo. Revisão de 25/11 (o Heitor, 24/11: "Em teoria não é pra ter pergunta de regra e de escopo, as regras já foram definidas e o escopo também."): a Q12 foi decidida pelo Claude, pelos princípios, para o Heitor revisar.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Clientes — escritas como decisão sua, sem a sua fala: confirma?** CL-01 (o documento com tipo CPF, Passaporte ou RNE, `crm-inbox.md:10`); CL-02 e PO-03 (a cliente de balcão e o acesso só com a caixa marcada, "2026-10-21, decisão do Heitor", `:63-76`); CL-04 (o telefone de outro país com "+", frente de cadastro de 29/10, `:87-92` — a sua fala de 02/11 só diz que a estrangeira chega também pelo agendar rápido e pelo Copilot); CL-09 (o "Unificar" nunca muda o nome, `:118`); CL-14 (perguntar "É a mesma pessoa do contato X?" e ligar no "Sim", `:146` — e o texto diz que perguntar só a quem tem o CRM, ligar só o que a pessoa alcança e converter só a mais recente são do Claude, "para revisar"); CL-16 (o "Indicada por", 10/11, `:298-304`, inclusive o que a importação faz quando o nome não bate com uma ficha só — o único "sim" seu é o "1 - sim" de 10/11 sobre a indicação que premia, `docs/regras/fidelidade.md:332`; o vínculo veio junto); CL-19 ("Novos clientes" só na rede e "Reativar" sempre da rede, 18/11, `:349-351`).

Q02. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Portal — escritas como decisão sua, sem a sua fala: confirma?** PO-05, a parte da LGPD por ficha (`crm-inbox.md:58`; CLAUDE.md §5 diz "decisão do Heitor" — o seu "Concordo" de 13/11 cobre o login único e o seletor); PO-10 (o WhatsApp do cartão "A unidade" ser o número conectado, por-03 de 02/11, `:241`).

Q03. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Importações — escritas como decisão sua, sem a sua fala: confirma?** IM-01 (o importador em Configurações → Importações, "pedido do Heitor", `crm-inbox.md:752-753`); IM-13 ("Completar a ficha de X" marcado e desmarcável, cli-07 de 02/11, `:844-849`); IM-14 (o contato que entra só com o e-mail e o telefone repetido que junta numa pessoa só, D-10 de 29/10, `:854-863`).

Q04. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **CRM — escritas como decisão sua, sem a sua fala: confirma?** IN-09 (a fila é por conversa, uma linha por caixa, "por decisão do Heitor, vendo um caso real", `crm-inbox.md:1214`); OP-03 (mover os cards e criar e editar oportunidades com o CRM em Gerenciar, D-1 de 29/10, `:1406-1413`); OP-08 ("Responsável", nunca "Dono": "o mesmo conceito não pode ter dois nomes", `:1315`); OP-12 (as sete etapas do funil da rede nova, "Em negociação" em 21/10, `:1374`). OP-07 (oportunidade não se apaga, 28/09 sem fala, `:1266`) ficou com o seu "o resto fica como está" de 13/11, que aprovou o levantamento com essa linha (`docs/revisao.md:864`).

Q05. **Resolvida na revisão de 24/11:** O nome "Contato" é decisão do Claude e fica. — *Era:* **IN-01 — quem escolheu os nomes?** `docs/revisao.md:842-843` diz "Escolha do nome: 'contato e oportunidade'", sem dizer de quem. A sua fala de 13/11 separa a pessoa da oportunidade; foi você que escolheu "Contato" para a pessoa?

Q06. **Resolvida na revisão de 24/11:** O seu "Concordo" (CA1) vence: o NOME da rede no lugar de "clínica". O que foi feito ("Seu crédito", "a equipe") é defeito a corrigir. — *Era:* **PO-07 — "clínica" no portal:** você aprovou ("Concordo", `docs/revisao.md:1498-1502`) trocar "clínica" pelo NOME da rede ("Crédito na Estética Bella"). O que ficou registrado como feito (`docs/revisao.md:2147`) é outra coisa: "Seu crédito", "fale com a equipe", "Telefone: …", "A equipe enviou um documento". Qual dos dois vale?

Q07. **Resolvida na revisão de 24/11:** A H15 (11/11, "não agora") é mais nova que a decisão 3 da 8ª simulação (registrada em 06/11): o app só pede a exportação; a eliminação é pelo contato da rede. — *Era:* **LG-01 × LG-02 — a exclusão pelo app:** em 11/11 (H15, "não agora") o sistema deixou de registrar pedido de eliminação (`crm-inbox.md:599`); a sua decisão 3 sobre a 8ª simulação ("mantem do jeito que tá", sem data, `:694-695`) diz que revogar o consentimento e pedir a exclusão pelo app "continuam como estão". O app ainda tem "pedir a exclusão"? E pode dar a data da decisão 3?

Q08. **Resolvida na revisão de 24/11:** Ver vê, Gerenciar mexe: a lista de pedidos abre com Clientes em Ver; responder ao pedido pede Clientes em Gerenciar (como o código já faz). — *Era:* **LG-08 — Ver ou Gerenciar na aba LGPD?** A lista de pedidos pede Clientes em Ver (`crm-inbox.md:712`), mas o levantamento de Configurações diz que "cada aba pede o módulo dela em Gerenciar" (`docs/revisao.md:1373-1374`). Qual nível abre a aba?

Q09. **Resolvida na revisão de 24/11:** "A rede toda com Configurações em Gerenciar" é o critério de antes de 18/11. O aviso vai a quem responde ao pedido: Clientes em Gerenciar (a cliente é da rede). Defeito a corrigir. — *Era:* **LG-09 — quem é avisado do pedido:** o aviso vai a quem tem Configurações em Gerenciar "da rede toda" e à Admin da rede (`crm-inbox.md:641`), mas a aba LGPD existe também no portal da unidade (`:612`, D8 da 25ª, mais nova). Quem tem Configurações em Gerenciar só numa unidade também deve ser avisado, já que responde pela aba da unidade?

Q10. **Resolvida na revisão de 24/11:** As Importações estão na configuração da rede toda (CLAUDE.md §11): a tela inteira, o histórico e o relatório, é só da Admin da rede. Defeito a corrigir. — *Era:* **IM-04 — o histórico das importações:** importar é só da Admin da rede, mas ler as "Importações anteriores", retomar e baixar o relatório (que traz dados pessoais) pedem só o módulo do destino (`crm-inbox.md:929-931`, `:1036-1037`). Quem tem Clientes ou o CRM em Gerenciar e não é a Admin da rede deve ver o histórico e baixar o relatório, ou isso também é só da Admin?

Q11. **Resolvida na revisão de 24/11:** Quem importa é a Admin da rede, a mesma que cria as tags: a tag da planilha é a rede criando a tag dela, não o sistema pondo tag sozinho (princípio 2). A importação cria a tag. Confirmada pelo Heitor, 2026-11-27 (R38): "Entra na lista: importar é a rede criando a tag (como está)". — *Era:* **TG-07 — a tag da planilha que não está no catálogo:** nenhuma tela cria tag e criar é só em Configurações → Tags, mas `crm-inbox.md:428` diz que o catálogo "cresce" com toda tag gravada por quem pode marcar. Na Importação, uma tag da planilha que ainda não existe deve ser criada ou recusada?

Q12. **Decidida pelo Claude, 25/11 (o Heitor revisa):** Fica o "Remover tag", como o sistema faz hoje. A fala de 13/11 é sobre o NOME da ação ("deve se chamar só adicionar tag"); o princípio 7 ("simplificar não é reduzir funcionalidade") não tira um recurso que existia, e o princípio 1 deixa a rede decidir: o fluxo é ela que monta e liga, então tirar a tag pelo fluxo não é o sistema mexendo em tag sozinho. `docs/regras/automacoes.md:464` registra uma confirmação sua de 18/11, noite ("automacao pode tirar tag"), que não está no DEVLOG — por isso a decisão não se apoia nela. Nada muda no código. — *Era:* **TG-04 — a automação pode TIRAR uma tag?** A sua fala de 13/11 diz que a ação "deve se chamar só adicionar tag". Em 14/11 o Claude leu isso como "só adiciona" e tirou o "remover"; em 18/11 a auditoria das regras leu a fala como sobre o NOME e, pelo princípio 7 ("simplificar não é reduzir funcionalidade"), trouxe o "Remover tag" de volta — é o que o sistema faz hoje (`docs/regras/automacoes.md:452-461`). Qual vale?

Q13. **Resolvida na revisão de 24/11:** A revisão (CR2) decidiu "Cadastrar como cliente" nos dois lugares: o botão é defeito de texto. — *Era:* **OP-02 — "Cadastrar cliente" ou "Cadastrar como cliente"?** A revisão decidiu "Cadastrar como cliente" nos dois lugares (`docs/revisao.md:879`, `:2062`, com o "pode ser" na tabela sem o seu nome ao lado); `crm-inbox.md:1064-1066` diz que o botão é "Cadastrar cliente" e a janela é "Cadastrar como cliente". Qual é o texto do botão? E o "pode ser" é mesmo a sua resposta?

Q14. **Resolvida na revisão de 24/11:** O retorno é um lembrete que a própria pessoa marcou no card: não se move sozinho e não é automação. Fica. — *Era:* **OP-33 — o aviso do retorno:** ele sai de um cron, sempre ligado, para todas as redes (`crm-inbox.md:1582-1595`), por decisão do Claude. Mas você disse em 03/11 que "toda e qualquer automação deve ser feita através dos módulos de automações" (`:1394`), e o "Marque o ganho", que saía do mesmo cron, virou modelo desligado por isso (`:1596`). O aviso do retorno fica como está ou vira um modelo das Automações?

Q15. **Resolvida na revisão de 24/11:** A fala está no documento; a data que falta não muda a regra. — *Era:* **IN-11 — fala sem data:** A fala "a recepção que cuida de dois números vê os dois juntos" (r3-f14-11) não tem data: pode dar?

## Divergências

O texto de `docs/regras/` (ou da própria revisão) contra a decisão mais nova — para corrigir o texto depois.

- PO-01, PO-03: `docs/regras/crm-inbox.md:70` diz que a caixa "Criar o acesso ao app" "só se marca com os dois" (e-mail e CPF), e `:72` que o aviso diz "senha inicial = CPF"; `:18-29` (05/11, "concordo") decidiu que o documento do acesso é o CPF ou, sem ele, o passaporte/RNE, e que o aviso diz qual é.
- PO-12: `docs/regras/crm-inbox.md:259-262` diz que, com procedimento que não está no app (o laser), "quem marca é a equipe"; `:273` (PT3, 13/11) decidiu que a sessão do plano aceito vai pelo app mesmo assim, e só a de procedimento inativo fica com a equipe.
- TG-05: `docs/regras/crm-inbox.md:305-307` diz que `CLIENT_TAGS` "virou só as oito com que a rede nova nasce"; `docs/revisao.md:423` (T5, 16/11) decidiu que a rede nova nasce sem tag nenhuma (`crm-inbox.md:545` e `:1745` já dizem isso).
- TG-05: `docs/regras/crm-inbox.md:545` põe na boca do Heitor a pergunta "tiro e deixo o catálogo começar vazio?", que foi do Claude; a fala dele é só "Sim" (`docs/revisao.md:423`).
- CL-19: `docs/regras/crm-inbox.md:334-336` ("vale o FATO: a cliente atendida naquela unidade"), `:341-348` (T1, as novas clientes e o "Reativar" por "atendidas na unidade") e `:1709` ("a cliente nesta unidade" é a atendida nela) ficaram velhos com `:349-351` (24ª, 18/11: "Novos clientes" só na rede) e com `docs/regras/indicadores.md:1397`, que já risca a regra (ver Q06).
- CL-06: `docs/regras/crm-inbox.md:52-53` diz "o bloco da 'Minha agenda' da profissional" — nome de cargo como se fosse fixo (CLAUDE.md §1, 13/11); devia dizer "de quem atende".
- TG-07: `docs/regras/crm-inbox.md:390` explica o defeito antigo como "quem não tem 'A rede inteira' criava tag da rede"; desde 18/11 criar tag é só da Admin da rede (`:376`).
- IM-09: `docs/regras/crm-inbox.md:804-806` diz que unidade, etapa, responsável ou procedimento citados pelo nome e não achados (ou ambíguos) recusam a linha; a D2 de 06/11 (`:907-917`, princípio 2) decidiu que viram aviso e a linha entra sem eles.
- IM-02: `docs/revisao.md:1377-1378` (levantamento de Configurações, 13/11) diz que "a configuração da rede toda é de quem é da rede (H7)"; desde 18/11 é só da Admin da rede (CLAUDE.md §11, `crm-inbox.md:771-772`). É retrato de antes, não regra.
- IM-02: `docs/regras/crm-inbox.md:774` diz que o "Importar planilha" da lista de Clientes "só aparece para ela" (a Admin da rede); `:944-946` diz "para quem importa clientes: Clientes em Gerenciar e a Admin da rede". Lido como "as duas juntas" concordam; lido como "uma ou outra", o segundo está velho.
- OP-07: `docs/regras/crm-inbox.md:1268-1269` diz que o histórico da oportunidade "é append-only pela sessão (ler e acrescentar)"; desde 19/11 a sessão nunca grava (CLAUDE.md §4: "Qualquer gravação que não passa pela validação do backend ta errada e é uma brecha de segurança").
- IN-14, OP-09: `docs/revisao.md:866-869` ("Com 'só os meus', a rede escolhe se segue a PESSOA ou a CONVERSA"; "Trocar o responsável é de quem tem o CRM em Gerenciar com 'todos'") e `:2063` ("Mantém: … o 'só os meus' pela pessoa ou pela conversa") ficaram velhos com `:1293` e SM3 (`:2216`, 23/11). `crm-inbox.md:1270` e `:1330` já estão certos; a revisão registra a troca em `:1298`, mas o texto de `:2063` não foi riscado.
- OP-11: `docs/regras/crm-inbox.md:1406-1413` descreve a régua como "Configurações em Gerenciar (mais o CRM em Ver)", e `:1547` "Configurações em Gerenciar" para as origens; a decisão de 18/11 (`:1415`, CLAUDE.md §11) é só a Admin da rede. O parágrafo se corrige em `:1415`, mas o começo dele segue com a régua velha.
- (sem número; o inbox vazio): `docs/regras/crm-inbox.md:1531-1533` diz que o inbox vazio dá o atalho de ligar o WhatsApp "só para quem tem Configurações em Gerenciar" e que os outros leem "Peça a quem tem as Configurações em Gerenciar…"; ligar o WhatsApp é integração, só da Admin da rede (18/11, CLAUDE.md §11). Não entrou como regra.
- OP-02: `docs/regras/crm-inbox.md:1064-1066` e `:1732` dizem que o botão é "Cadastrar cliente" e abre "Cadastrar como cliente"; `docs/revisao.md:879` e `:2062` (CR2) decidiram "Cadastrar como cliente" nos dois (ver Q19).
- (sem número; o crédito interno): `docs/regras/crm-inbox.md:556` (o crédito interno) está no meio das regras de tags e de Clientes; é regra de `vendas-financeiro.md` (§9.6) e não entrou aqui.
- TG-09: `docs/revisao.md:439-441` deixou para a revisão de Clientes "onde mais a tag pode ser marcada além da pessoa", e a seção Clientes (`:479-511`) não responde; a resposta está só em `docs/regras/crm-inbox.md:398-401` (18/11: a tag é da pessoa). A revisão não fecha a pendência (ver Q18).
- CL-19: a frase do "FATO" (`docs/regras/crm-inbox.md:334-336`) ficou sem uso: a cliente é da rede (CLAUDE.md §5) e "Novos clientes" e o "Reativar" são só da rede; o texto devia sair (decisão do Claude, pela regra "a cliente é da rede").
- PO-12: `docs/regras/crm-inbox.md:273` fala só da sessão do plano; a fala do Heitor no PT3 diz "plano ou pacote" — o texto devia dizer os dois.
- IM-03: a H8 de 11/11 ("escolher se aquilo pertence a uma unidade", `docs/regras/crm-inbox.md:769-771`) é mais velha que a ficha da rede sem unidade (18/11, CLAUDE.md §5); a regra é a nova (a ficha importada nasce sem unidade; só os pacotes de antes pedem unidade), e a frase da H8 devia dizer que vale só para isso.
- IM-22: a coluna "Pacote de antes" se oferece a quem tem o Financeiro em Gerenciar (`docs/regras/crm-inbox.md:994-996`); desde 18/11 só a Admin da rede importa, e a condição do Financeiro ficou sem efeito no texto.
- TG-10, IN-04: juntar as tags do contato às da ficha ao ligar (`docs/regras/crm-inbox.md:1098`, `:414`) não é o sistema pôr tag: a tag é da PESSOA (o Heitor, 18/11), e contato e ficha são a mesma pessoa. O texto devia dizer isso.
- OP-08: `docs/regras/crm-inbox.md:1276` e `docs/revisao.md:2216` chamam o filtro do inbox de "o dono"; a tela já diz "Responsável" (`components/admin/inbox-filtros.tsx:409`). Só o texto está velho.
- OP-25: "Motivos de perda" da rede inteira (`docs/regras/crm-inbox.md:1518`) está certo — a oportunidade é da pessoa, e a pessoa é da rede; o texto devia dizer por quê.
- IM-22: `docs/regras/crm-inbox.md:1020` diz que o pacote de antes sem valor de referência "não geram comissão de execução (R$ 0)"; o item 11 das correções da auditoria (18/11, `docs/regras/comissoes.md:380-387`) decidiu que o R$ fixo por sessão é pago e só o percentual fica R$ 0. A tela já diz certo (`components/branch/importador-de-contatos.tsx:374`, `:477`); só o texto está velho.
- TG-04: `docs/revisao.md:434-435` ainda diz "a ação só adiciona; o modo 'remover' sai" (leitura do Claude de 14/11); a auditoria das regras (18/11, `docs/regras/automacoes.md:452-461`) trouxe o "Remover tag" de volta, e é o que o sistema faz. A Q12 foi decidida pelo Claude em 25/11: fica o "Remover tag" (o `docs/revisao.md:434-435` é que está velho).
- LG-02, LG-14 (TEXTO): a LG-02 ("Pelo app, revogar o consentimento e pedir a exclusão continuam como estão", a decisão 3 da 8ª) lê como se o app tivesse os dois gestos. O app não tem nenhum: a exclusão saiu com a H15 (Q07), e o app não tem gesto de revogar (`apps/web/app/[slug]/cliente/`, `apps/web/components/client-portal/`). "Como estão" é: os dois se pedem à rede, e o app passa a dizer isso (LG-14). O texto da LG-02 devia dizer isso.

## Ficou fora do catálogo

Detalhe de tela sem decisão de produto, texto exato, ou implementação.

- KA-16: o CPF digitado que já é o da própria ficha mostra "É o CPF já salvo nesta ficha." em texto neutro (texto da tela).
- KB-08: a cliente cadastrada, editada, importada ou com tag nova aparece na lista na hora (atualização da tela, implementação).
- KE-05: na janela dos funis, clicar no nome de um funil o seleciona (atalho de tela).
- KE-07: Enter grava o nome da etapa e do funil, Esc desfaz, a linha diz "Salvo" (comportamento do campo).

## É de outra área

- KA-57: a conta de pontos da cliente nasce com a ficha (fidelidade — `docs/regras/fidelidade.md`).
- KD-35: no cargo, Relatórios em "Ver" pede ao menos uma aba marcada (tela de Cargos — `docs/regras/plataforma.md` / `indicadores.md`).
