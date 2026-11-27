-- D12 da 37ª simulação (plataforma:AD-19, AD-20; decisão do Claude, 27/11): o histórico do
-- estoque dizia "Brinde da fidelidade — Entrega de recompensa: Máscara de argila", sem a cliente,
-- e a venda diz "Venda — <cliente>". O motivo do movimento do brinde passa a dizer a quem foi:
-- "Entrega de recompensa: Máscara de argila — Rosilda Amorim". Só o texto de `notes` muda.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare d text := pg_get_functiondef(p_fn); i int; n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i]; end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

select pg_temp.trocar_no_corpo(
  'public.entregar_voucher_produto(uuid, uuid, uuid, text, jsonb)'::regprocedure,
  array[$t$'Entrega de recompensa: ' || v_v.name$t$],
  array[$t$'Entrega de recompensa: ' || v_v.name || coalesce(' — ' || (select c.name from public.clients c where c.id = v_v.client_id), '')$t$],
  array[1]
);

revoke execute on function public.entregar_voucher_produto(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.entregar_voucher_produto(uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
