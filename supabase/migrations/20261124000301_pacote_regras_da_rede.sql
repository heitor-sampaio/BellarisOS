-- Itens 8 e 9 da auditoria das regras (2026-11-18): duas regras do pacote
-- passam a ser da REDE (decisões do Claude pelo princípio 1, "a rede decide";
-- do pacote vencido, o Heitor respondeu em 18/11: "configuração da rede").
-- O padrão de cada uma é o comportamento de antes.
--
-- 8. `pacote_crediario_libera` (padrão true — A41 da 11ª: libera e avisa):
--    desligada, a sessão do pacote com dinheiro em aberto não se liga a
--    agendamento nenhum (agendar, o app, o "Abater do pacote") até o pacote
--    estar pago. O app confere em `conferirCredito`; aqui é a segunda linha.
-- 9. `pacote_vencido_cancela` (padrão false — o vencido não se cancelava):
--    ligada, o pacote vencido se cancela pela conta de sempre
--    (`pacote_cancelar_devolvendo`, só a trava do vencido muda).

alter table public.tenants
  add column if not exists pacote_crediario_libera boolean not null default true,
  add column if not exists pacote_vencido_cancela  boolean not null default false;

comment on column public.tenants.pacote_crediario_libera is
  'O pacote vendido no crediário libera as sessões antes de quitado (padrão). Desligado, a sessão com valor em aberto não se agenda até o pacote estar pago.';
comment on column public.tenants.pacote_vencido_cancela is
  'O pacote vencido se cancela (com a devolução de sempre). Padrão: não se cancela.';

-- 8. A trava da sessão: só quando ela se LIGA a um agendamento (de livre a ligada).
create or replace function private.pacote_sessao_liberada()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rede    uuid;
  v_libera  boolean;
  v_aberto  numeric;
begin
  if new.appointment_id is null or old.appointment_id is not null then
    return new;
  end if;
  select b.tenant_id, coalesce(t.pacote_crediario_libera, true)
    into v_rede, v_libera
    from public.client_packages cp
    join public.branches b on b.id = cp.branch_id
    join public.tenants t on t.id = b.tenant_id
   where cp.id = new.client_package_id;
  if coalesce(v_libera, true) then
    return new;
  end if;
  select coalesce(sum(m.em_aberto), 0) into v_aberto
    from public.metrics_em_aberto_dos_pacotes(v_rede, array[new.client_package_id]) m;
  if v_aberto > 0 then
    raise exception 'Este pacote ainda tem % em aberto, e a rede libera as sessões do pacote no crediário só depois de pago. O que falta se recebe no PDV.',
      private.reais_no_texto(v_aberto) using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke execute on function private.pacote_sessao_liberada() from public, anon, authenticated;

drop trigger if exists trg_pacote_sessao_liberada on public.package_sessions;
create trigger trg_pacote_sessao_liberada
  before update of appointment_id on public.package_sessions
  for each row execute function private.pacote_sessao_liberada();

-- 9. O vencido se cancela quando a rede quer (pacote_vencido_cancela). Só a
-- trava muda: a definição viva é lida e a condição ganha a opção da rede.
do $do$
declare
  v_def  text := pg_get_functiondef('public.pacote_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    'if v_cp.expires_at is not null and v_cp.expires_at < now() then' || chr(10)
      || '    raise exception ''Este pacote venceu em %: as sessões que sobraram não se devolvem.'',',
    'if v_cp.expires_at is not null and v_cp.expires_at < now()' || chr(10)
      || '     and not coalesce((select t.pacote_vencido_cancela from public.tenants t where t.id = p_tenant), false) then' || chr(10)
      || '    raise exception ''Este pacote venceu em %: as sessões que sobraram não se devolvem. Cancelar o pacote vencido é uma opção da rede, em Configurações → Geral.'',');
  if v_novo = v_def then
    raise exception 'pacote_cancelar_devolvendo: a trava do vencido não foi encontrada';
  end if;
  execute v_novo;
end $do$;

notify pgrst, 'reload schema';
