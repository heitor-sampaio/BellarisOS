-- r4-f15-03 (F16; o Heitor, revisão das decisões da F15, 2026-11-03: "dividir
-- pelos procedimentos da sessão"). Na r3-f13-07 (migration 20261103001501) a
-- sessão de PLANO feita entrava no ranking de execução pela soma dos
-- procedimentos da sessão, INTEIRA no procedimento do atendimento: sessão
-- Botox R$ 800 + Preenchimento R$ 1.200, atendimento marcado "Botox" → Botox
-- R$ 2.000 e Preenchimento nada. Agora cada procedimento da sessão no plano
-- conta no SEU procedimento (Botox R$ 800, Preenchimento R$ 1.200, cada um na
-- sua categoria), no dia da sessão.
--
-- O que não muda: o ranking de PROFISSIONAIS (quem atendeu, R$ 2.000), o total
-- da tela (`receita_dos_atendimentos`), as EXECUÇÕES (seguem o atendimento: o
-- Botox +1, o Preenchimento 0) e o "Meu faturamento" (venda). Nada conta duas
-- vezes: a sessão vira uma linha por procedimento, e a soma é a mesma.
--
-- Como: o conjunto (receita paga do atendimento + sessão de pacote + unidade
-- pré-paga + sessão de plano) ganha a coluna `procedure_id` — nula nos três
-- primeiros (vale o procedimento do atendimento) e a do procedimento da sessão
-- no plano —, e as contas POR PROCEDIMENTO leem
-- `coalesce(t.procedure_id, <atendimento>.procedure_id)`. Nas mesmas quatro
-- funções: metrics_top_procedures, metrics_top_professionals,
-- metrics_relatorio (as três ocorrências) e
-- metrics_receita_por_categoria_de_procedimento. Troca de texto sobre o corpo
-- ATUAL da produção, conferindo quantas vezes cada trecho aparece.

create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
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

-- O conjunto, igual nas quatro: a coluna do procedimento, e a sessão de plano
-- em uma linha por procedimento dela.
create function pg_temp.conjunto_com_procedimento(p_fn regprocedure, p_vezes int, p_de_extra text[], p_para_extra text[], p_vezes_extra int[])
returns void language plpgsql as $f$
begin
  perform pg_temp.trocar_no_corpo(p_fn,
    array[
      E'select t.appointment_id, t.amount\n',
      E'coalesce(ps.preco, round(cp.price / greatest(cp.total_sessions, 1), 2)) as preco, ps.status::text as status\n',
      E'select u.appointment_id, u.preco, ''USED'' from public.procedure_sale_units u',
      E'-- r3-f13-07: a sessão do plano vendido, pela soma dos procedimentos dela.\n',
      E'select s.appointment_id, sum(sp.price), ''USED''\n',
      E'\n           group by s.appointment_id\n',
      E'select sx.appointment_id, sx.preco\n'
    ] || p_de_extra,
    array[
      E'select t.appointment_id, t.amount, null::uuid as procedure_id\n',
      E'coalesce(ps.preco, round(cp.price / greatest(cp.total_sessions, 1), 2)) as preco, ps.status::text as status, null::uuid as procedure_id\n',
      E'select u.appointment_id, u.preco, ''USED'', null::uuid from public.procedure_sale_units u',
      E'-- r3-f13-07 / r4-f15-03: a sessão do plano vendido, cada procedimento dela no SEU procedimento.\n',
      E'select s.appointment_id, sp.price, ''USED'', sp.procedure_id\n',
      E'\n',
      E'select sx.appointment_id, sx.preco, sx.procedure_id\n'
    ] || p_para_extra,
    array[p_vezes, p_vezes, p_vezes, p_vezes, p_vezes, p_vezes, p_vezes] || p_vezes_extra);
end
$f$;

-- O ranking de procedimentos do dashboard: o procedimento da sessão do plano.
select pg_temp.conjunto_com_procedimento(
  'public.metrics_top_procedures(uuid,uuid[],timestamptz,timestamptz,integer,uuid)', 1,
  array[
    E'select ap.procedure_id, sum(t.amount) as v',
    E'where ap.procedure_id is not null\n    group by ap.procedure_id\n'
  ],
  array[
    E'select coalesce(t.procedure_id, ap.procedure_id) as procedure_id, sum(t.amount) as v',
    E'where coalesce(t.procedure_id, ap.procedure_id) is not null\n    group by 1\n'
  ],
  array[1, 1]);

-- O de profissionais: só a coluna nova (quem atendeu leva a sessão inteira).
select pg_temp.conjunto_com_procedimento(
  'public.metrics_top_professionals(uuid,uuid[],timestamptz,timestamptz,integer,uuid)', 1,
  array[]::text[], array[]::text[], array[]::int[]);

-- Os Relatórios: a tabela por procedimento lê o procedimento da sessão; a por
-- profissional e o total, só a coluna nova.
select pg_temp.conjunto_com_procedimento(
  'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)', 3,
  array[E'join public.appointments a on a.id = t.appointment_id\n                    join public.procedures pr on pr.id = a.procedure_id'],
  array[E'join public.appointments a on a.id = t.appointment_id\n                    join public.procedures pr on pr.id = coalesce(t.procedure_id, a.procedure_id)'],
  array[1]);

-- A receita por categoria: a categoria de cada procedimento da sessão.
select pg_temp.conjunto_com_procedimento(
  'public.metrics_receita_por_categoria_de_procedimento(uuid,uuid[],timestamptz,timestamptz,uuid)', 1,
  array[E'join public.appointments a on a.id = t.appointment_id\n  join public.procedures pr on pr.id = a.procedure_id'],
  array[E'join public.appointments a on a.id = t.appointment_id\n  join public.procedures pr on pr.id = coalesce(t.procedure_id, a.procedure_id)'],
  array[1]);

notify pgrst, 'reload schema';
