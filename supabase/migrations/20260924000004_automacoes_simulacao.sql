-- Ensaio: rodar a automação sem que nada aconteça de verdade.
--
-- É a resposta para "por que não disparou?" — a pergunta que toda ferramenta
-- destas recebe. Sem ensaio, conferir um fluxo significa provocar o fato real
-- e torcer: mandar a mensagem ao cliente para descobrir que a condição estava
-- invertida.
--
-- No ensaio as CONDIÇÕES são avaliadas de verdade, com o contexto de um fato
-- que realmente aconteceu; o que não acontece são os EFEITOS. É por isso que
-- ele responde a pergunta: o caminho percorrido é o mesmo, só não sai mensagem.
--
-- A coluna separa os dois no histórico. Sem ela, um ensaio contaria como
-- execução na lista de automações e faria a clínica achar que o fluxo rodou
-- sozinho — e, pior, entraria no teto de contatos por cliente do dia.

alter table public.automation_runs
  add column if not exists simulacao boolean not null default false;

comment on column public.automation_runs.simulacao is
  'Ensaio: o fluxo foi percorrido e as condições avaliadas, mas nenhuma ação aconteceu de verdade.';

-- A lista de execuções reais é o acesso comum; o ensaio é a exceção que se
-- procura de propósito. O índice parcial mantém a lista rápida sem pagar por
-- linhas que quase nunca são lidas em conjunto.
create index if not exists automation_runs_reais_idx
  on public.automation_runs (automation_id, created_at desc)
  where simulacao = false;
