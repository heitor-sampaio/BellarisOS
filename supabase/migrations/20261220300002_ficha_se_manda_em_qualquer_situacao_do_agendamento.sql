-- D16 da 41ª simulação (FI-14: "'Enviar a ficha' está SEMPRE na janela do
-- agendamento, para quem tem a Agenda em Gerenciar"). A janela só mostrava o
-- bloco da ficha nos agendamentos em aberto, e o banco recusava abrir a ficha
-- pelo agendamento cancelado ou com falta ("O agendamento foi cancelado: a
-- ficha não se manda por ele."). A regra não exclui situação nenhuma: em
-- qualquer situação do agendamento (também no concluído, no cancelado e na
-- falta) a ficha se manda — decisão do Claude, 28/11, pela própria FI-14
-- ("sempre").
--
-- Troca de trecho no corpo VIVO de public.pre_atendimento_abrir_manual (com a
-- conferência da contagem), como em 20261130100007. O resto do corpo, a
-- segurança (security definer, search_path vazio) e as permissões ficam: o
-- create or replace guarda os grants.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
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
end $f$;

select pg_temp.trocar_no_corpo(
  'public.pre_atendimento_abrir_manual(uuid, uuid)'::regprocedure,
  array[$t$  if v_status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'O agendamento foi cancelado: a ficha não se manda por ele.' using errcode = 'check_violation';
  end if;
$t$],
  array[$t$  -- D16 da 41ª (FI-14): a ficha se manda em qualquer situação do agendamento.
$t$],
  array[1]
);

notify pgrst, 'reload schema';
