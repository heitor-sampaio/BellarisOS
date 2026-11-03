-- r2-fin-02 (F13; o Heitor, 2026-11-03: "mudar solicitando confirmação antes
-- de desfazer"). "Marcar recebida" (a antecipação da parcela da operadora)
-- ganha o caminho de volta: a parcela ANTECIPADA volta a receber. Só a
-- antecipada — a que venceu vira recebida sozinha na data (a baixa é na
-- leitura) e não tem o que desfazer; a cancelada e a estornada também não.
-- A confirmação é da tela; aqui, a guarda do estado sob trava.

create or replace function public.recebivel_do_cartao_desfazer(p_tenant uuid, p_recebivel uuid, p_ator text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_r public.recebiveis_do_cartao%rowtype;
begin
  select * into v_r from public.recebiveis_do_cartao r where r.id = p_recebivel for update;
  if not found or v_r.tenant_id is distinct from p_tenant then
    raise exception 'Parcela não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_r.cancelada_em is not null or v_r.estornada_em is not null then
    raise exception 'Esta parcela foi cancelada no estorno da venda.' using errcode = 'P0001';
  end if;
  if v_r.vencimento <= now() then
    raise exception 'Esta parcela foi recebida na data do vencimento: não há o que desfazer.' using errcode = 'P0001';
  end if;
  if v_r.recebida_em is null then
    raise exception 'Esta parcela já está a receber.' using errcode = 'P0001';
  end if;
  update public.recebiveis_do_cartao
     set recebida_em = null, recebida_por = null
   where id = p_recebivel;
  return v_r.branch_id;
end $function$;

revoke execute on function public.recebivel_do_cartao_desfazer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.recebivel_do_cartao_desfazer(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
