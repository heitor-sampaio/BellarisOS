-- O chamado ligado a uma autorização ou a uma sessão de suporte é da MESMA rede.
--
-- `suporte_autorizar` e `suporte_sessao_abrir` recebem o id do chamado de quem
-- chama; a chave estrangeira só garante que ele existe. Um gatilho confere a
-- rede nas duas tabelas — vale para as duas funções e para qualquer porta nova.

create or replace function private.suporte_chamado_da_rede()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.ticket_id is not null and not exists (
    select 1 from public.support_tickets t where t.id = new.ticket_id and t.tenant_id = new.tenant_id
  ) then
    raise exception 'O chamado não é desta rede.';
  end if;
  return new;
end $$;

drop trigger if exists trg_autorizacao_chamado_da_rede on public.support_grants;
create trigger trg_autorizacao_chamado_da_rede before insert or update of ticket_id on public.support_grants
  for each row execute function private.suporte_chamado_da_rede();

drop trigger if exists trg_sessao_chamado_da_rede on public.support_sessions;
create trigger trg_sessao_chamado_da_rede before insert or update of ticket_id on public.support_sessions
  for each row execute function private.suporte_chamado_da_rede();

notify pgrst, 'reload schema';
