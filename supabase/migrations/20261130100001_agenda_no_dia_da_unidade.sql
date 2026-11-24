-- D5 da 26ª simulação: no consolidado, o agendamento cai no dia da UNIDADE dele.
--
-- A regra é a F62 do Heitor ("deixa a clinica configurar o seu fuso"; em
-- docs/regras/indicadores.md: "O dia é o da unidade no consolidado: cada
-- lançamento cai no dia do relógio da unidade dele"). A Rede Mimosa tem o
-- Setor Bueno (UTC−3) e Cuiabá Centro (UTC−4). Duas avaliações às 23:30 de
-- 18/11, uma em cada: a de Cuiabá é 00:30 de 19/11 em Brasília. A rede (fuso
-- do recorte: o de Brasília, porque os fusos são diferentes) montava UMA janela,
-- a do dia de Brasília, e a de Cuiabá saía do "Hoje" da rede — a rede dizia 2
-- com Cuiabá 2 e o Bueno 1 (Relatórios → Agenda, e o "Hoje" do dashboard).
--
-- A janela do período continua a do fuso do recorte (`resolvePeriod`). O que
-- muda: o limite que é a VIRADA de um dia nesse relógio (o início às 00:00, o
-- fim às 23:59:59) vale, para o agendamento de uma unidade de outro fuso, na
-- mesma hora da parede no relógio DELA — o 18/11 de Cuiabá vai das 00:00 às
-- 23:59 de Cuiabá. O limite que não é virada de dia (o "até agora" do
-- dashboard, o período anterior de mesma duração decorrida) fica como está:
-- "agora" é o mesmo instante em todo relógio. Com todas as unidades no mesmo
-- fuso, nada muda.
--
-- Onde: os agendamentos do núcleo (`metrics_core`), os quatro trechos de
-- agenda de `metrics_relatorio` (o status do período da Visão geral e da aba
-- Agenda, o dia da semana — que passa a ser o do relógio da unidade —, a
-- origem e a agenda por unidade) e o "por unidade" (`metrics_by_branch`), para
-- a soma das unidades fechar com o total. Ficam com a janela única, como
-- estavam: o dinheiro (`metrics_receitas_pagas` e o que parte dele) e as
-- execuções ligadas à receita (Procedimentos, Profissionais).
--
-- As assinaturas do núcleo e do relatório são as com `p_tags` (a 20261125100002,
-- que vem antes desta). Troca de trechos no corpo vivo, com a conferência da
-- contagem (recriar de uma cópia desfaria consertos).
--
-- Índice: o filtro largo (±3 h, a maior distância entre os fusos do Brasil:
-- Noronha UTC−2, Rio Branco UTC−5) segue usando `appointments_unidade_aconteceu_em`;
-- a régua exata vem depois.

create or replace function public.metrics_no_dia_da_unidade(
  p_instante timestamptz, p_branch uuid, p_from timestamptz, p_to timestamptz, p_fuso_do_recorte text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when u.fuso = r.fuso then p_instante between p_from and p_to
    else p_instante between
      (case when (p_from at time zone r.fuso)::time = time '00:00'
            then (p_from at time zone r.fuso) at time zone u.fuso else p_from end)
      and
      (case when (p_to at time zone r.fuso)::time >= time '23:59:59'
            then (p_to at time zone r.fuso) at time zone u.fuso else p_to end)
  end
  from (select public.fuso_da_unidade(p_branch) as fuso) u,
       (select coalesce(p_fuso_do_recorte, 'America/Sao_Paulo') as fuso) r
$$;

revoke execute on function public.metrics_no_dia_da_unidade(timestamptz, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.metrics_no_dia_da_unidade(timestamptz, uuid, timestamptz, timestamptz, text) to service_role;

create or replace function pg_temp.trocar_no_corpo_z26(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

-- O núcleo: os agendamentos (`appt`).
select pg_temp.trocar_no_corpo_z26(
  'public.metrics_core(uuid,uuid[],timestamptz,timestamptz,uuid,text[])'::regprocedure,
  array[E'where a.aconteceu_em >= p_from\n      and a.aconteceu_em <= p_to'],
  array[E'where a.aconteceu_em between p_from - interval \'3 hours\' and p_to + interval \'3 hours\'\n      and public.metrics_no_dia_da_unidade(a.aconteceu_em, a.branch_id, p_from, p_to, (select public.fuso_do_recorte(p_tenant, p_branch_ids)))'],
  array[1]);

-- Os relatórios: os quatro trechos de agenda (status, dia da semana, origem, por unidade).
select pg_temp.trocar_no_corpo_z26(
  'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid,text[])'::regprocedure,
  array[
    $t$where a.branch_id = any (unidades) and a.aconteceu_em between p_from and p_to$t$,
    -- O dia da semana também é o do relógio da unidade (o sábado 23:30 de Cuiabá não é domingo).
    $t$extract(dow from a.aconteceu_em at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)))$t$
  ],
  array[
    $t$where a.branch_id = any (unidades) and a.aconteceu_em between p_from - interval '3 hours' and p_to + interval '3 hours' and public.metrics_no_dia_da_unidade(a.aconteceu_em, a.branch_id, p_from, p_to, (select public.fuso_do_recorte(p_tenant, p_branch_ids)))$t$,
    $t$extract(dow from a.aconteceu_em at time zone public.fuso_da_unidade(a.branch_id))$t$
  ],
  array[4, 1]);

-- O "por unidade": a janela da rede (o fuso comum das ativas), cada agendamento no dia da unidade dele.
select pg_temp.trocar_no_corpo_z26(
  'public.metrics_by_branch(uuid,timestamptz,timestamptz)'::regprocedure,
  array[$t$a.aconteceu_em between p_from and p_to$t$],
  array[$t$(a.aconteceu_em between p_from - interval '3 hours' and p_to + interval '3 hours' and public.metrics_no_dia_da_unidade(a.aconteceu_em, a.branch_id, p_from, p_to, (select public.fuso_do_recorte(p_tenant, null))))$t$],
  array[7]);

notify pgrst, 'reload schema';
