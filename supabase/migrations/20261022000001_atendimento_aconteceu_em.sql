-- D13 (decisão do Heitor, 2026-10-22): o atendimento conta quando ACONTECEU.
--
-- O eixo dos indicadores de serviço era `scheduled_at`, e o período em
-- andamento fecha em "agora": o atendimento concluído ANTES da hora marcada
-- (a cliente chegou cedo, o encaixe adiantou) ficava fora do dashboard, dos
-- relatórios e dos rankings até a hora marcada passar.
--
-- `aconteceu_em` é a hora marcada, ou a da conclusão quando ela veio ANTES.
-- O concluído DEPOIS (a profissional só clicou em "Finalizar" no dia
-- seguinte) continua no dia marcado: contar pela conclusão pura mudaria o
-- atendimento de dia — e de mês na virada.

alter table public.appointments
  add column if not exists aconteceu_em timestamptz
  generated always as (
    case when status = 'COMPLETED' and completed_at is not null and completed_at < scheduled_at
         then completed_at else scheduled_at end
  ) stored;

create index if not exists appointments_unidade_aconteceu_em on public.appointments (branch_id, aconteceu_em);

-- As funções de indicador trocam o eixo: toda referência a `a.scheduled_at`
-- (e `a2.`) vira `aconteceu_em`. Reescritas pelo próprio texto, e conferidas:
-- nenhuma pode sobrar com o eixo antigo.
do $$
declare
  f record;
  novo text;
begin
  for f in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'metrics_core', 'metrics_by_branch', 'metrics_relatorio', 'metrics_retention',
         'metrics_top_clients', 'metrics_top_procedures', 'metrics_top_professionals',
         'metrics_receita_por_categoria_de_procedimento', 'metrics_vendas',
         'metrics_clientes_para_reativar')
  loop
    novo := regexp_replace(f.def, '\m(a2?)\.scheduled_at\M', '\1.aconteceu_em', 'g');
    if novo = f.def then
      raise exception 'D13: % não tinha a.scheduled_at — conferir a função', f.proname;
    end if;
    if novo ~ 'scheduled_at' then
      raise exception 'D13: % ainda cita scheduled_at depois da troca', f.proname;
    end if;
    execute novo;
  end loop;
end $$;

notify pgrst, 'reload schema';
