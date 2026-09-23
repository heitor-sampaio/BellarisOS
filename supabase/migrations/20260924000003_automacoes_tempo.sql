-- Os gatilhos de TEMPO precisam de uma memória.
--
-- Um gatilho de agenda ("todo dia às 9h") é avaliado pelo cron a cada cinco
-- minutos. Sem registrar o último disparo, das 9:00 às 9:05 ele dispararia uma
-- vez por passagem do cron — e o "lembrete diário" chegaria em duplicata no
-- primeiro dia, em triplicata se alguém aumentasse a frequência do cron.
--
-- Fica em `automations` e não numa tabela à parte porque é um dado só, do
-- próprio fluxo, e lê-lo junto com o grafo poupa uma consulta por passagem.

alter table public.automations
  add column if not exists ultimo_disparo_agenda timestamptz;

comment on column public.automations.ultimo_disparo_agenda is
  'Quando o gatilho de agenda disparou pela última vez. Impede o cron de repetir dentro da mesma janela.';

-- O cron pergunta "quais automações de agenda estão ativas?" a cada cinco
-- minutos. Sem índice, isso é uma varredura da tabela inteira por passagem —
-- barato hoje, caro quando cada rede tiver dezenas de fluxos.
create index if not exists automations_agenda_idx
  on public.automations (tenant_id, status)
  where status = 'ATIVA';

-- Execução disparada por AGENDA não tem evento, e a de `buscar.clientes` é
-- filha de outra. A coluna diz de onde o run veio sem obrigar quem lê a
-- deduzir pela ausência de `evento_id`.
alter table public.automation_runs
  add column if not exists pai_id uuid references public.automation_runs(id) on delete set null;

comment on column public.automation_runs.pai_id is
  'Execução que gerou esta. Preenchido quando `buscar.clientes` abre uma execução por cliente.';

create index if not exists automation_runs_pai_idx
  on public.automation_runs (pai_id)
  where pai_id is not null;
